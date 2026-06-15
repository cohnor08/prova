const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
// Sonnet for tasks that need genuinely specific, reasoned output (practice plans,
// setlists). Haiku tends to default to generic phrasing for these.
const MODEL_SMART = 'claude-sonnet-4-6';

// ─── Rate limits ──────────────────────────────────────────────────────────────
// Each action has a daily cap on both requests AND tokens consumed.
// Tokens are tracked using the actual usage reported by the Claude API,
// so one expensive prompt costs proportionally more quota.
const RATE_LIMITS = {
  generatePracticePlan:   { requests: 15, tokens: 250000 },
  adjustSessionFromRating: { requests: 10, tokens: 15000 },
  generateSetlist:        { requests: 15, tokens: 40000 },
};

// Check request count atomically; token ceiling is checked non-transactionally
// before the call and then the actual usage is written after.
async function checkRateLimit(uid, action) {
  const today = new Date().toISOString().split('T')[0];
  const ref = db.doc(`rateLimits/${uid}/actions/${action}`);
  const limits = RATE_LIMITS[action];

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const fresh = data.date !== today;
    const requests = fresh ? 0 : (data.requests || 0);
    const tokens   = fresh ? 0 : (data.tokens   || 0);

    if (requests >= limits.requests) {
      throw new HttpsError(
        'resource-exhausted',
        `Daily request limit reached (${limits.requests}/day). Try again tomorrow.`
      );
    }
    if (tokens >= limits.tokens) {
      throw new HttpsError(
        'resource-exhausted',
        'Daily usage limit reached. Try again tomorrow.'
      );
    }

    tx.set(ref, { date: today, requests: requests + 1, tokens });
  });
}

// Add actual token usage after a successful Claude call.
async function recordTokenUsage(uid, action, tokensUsed) {
  const today = new Date().toISOString().split('T')[0];
  const ref = db.doc(`rateLimits/${uid}/actions/${action}`);
  await ref.set(
    { tokens: admin.firestore.FieldValue.increment(tokensUsed), date: today },
    { merge: true }
  );
}

// ─── Usage logging ────────────────────────────────────────────────────────────
// Writes a log entry per request (no prompt content — user privacy).
// Also maintains daily aggregate stats for admin monitoring.
async function writeUsageLog(uid, action, { tokensIn, tokensOut, durationMs, success, errorType, appCheckPresent }) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const tokensTotal = tokensIn + tokensOut;

  await Promise.all([
    // Per-user request history
    db.collection(`usageLogs/${uid}/requests`).add({
      action,
      model: MODEL,
      tokensIn,
      tokensOut,
      tokensTotal,
      durationMs,
      success,
      errorType: errorType || null,
      appCheckPresent,
      timestamp: now.toISOString(),
    }),

    // Daily aggregate — query this in Firestore console to monitor spend
    db.doc(`adminStats/${today}`).set({
      totalRequests:  admin.firestore.FieldValue.increment(1),
      totalTokensIn:  admin.firestore.FieldValue.increment(tokensIn),
      totalTokensOut: admin.firestore.FieldValue.increment(tokensOut),
      totalTokens:    admin.firestore.FieldValue.increment(tokensTotal),
      successCount:   admin.firestore.FieldValue.increment(success ? 1 : 0),
      errorCount:     admin.firestore.FieldValue.increment(success ? 0 : 1),
      lastUpdated: now.toISOString(),
    }, { merge: true }),
  ]);
}

// ─── Abuse detection ──────────────────────────────────────────────────────────
// Flags users whose token usage for one action exceeds 2× the daily limit in
// a single day (e.g. hitting the cap repeatedly via concurrent requests).
async function flagAbuseIfNeeded(uid, action, tokensUsed) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const snap = await db.doc(`rateLimits/${uid}/actions/${action}`).get();
    const data = snap.data() || {};
    if (data.date !== today) return;

    const limit = RATE_LIMITS[action].tokens;
    if ((data.tokens || 0) + tokensUsed > limit * 2) {
      await db.collection('adminAlerts').add({
        uid,
        action,
        reason: 'token_cap_exceeded_2x',
        tokensToday: (data.tokens || 0) + tokensUsed,
        limit,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (_) {
    // Abuse detection is best-effort — never let it block the main response.
  }
}

// ─── Claude API call ──────────────────────────────────────────────────────────
// Returns { text, tokensIn, tokensOut } so callers can track actual spend.
async function callClaude(apiKey, prompt, maxTokens, model = MODEL, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new HttpsError('internal', `Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const textBlock = Array.isArray(data.content)
      ? data.content.find(b => b.type === 'text')
      : null;
    return {
      text: textBlock?.text || '',
      stopReason: data.stop_reason || null,
      tokensIn:  data.usage?.input_tokens  || 0,
      tokensOut: data.usage?.output_tokens || 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Input validation ─────────────────────────────────────────────────────────
const ALLOWED_INSTRUMENTS = new Set(['Guitar', 'Bass']);
const ALLOWED_LEVELS      = new Set(['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite']);
const ALLOWED_DAYS        = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const ALLOWED_RATINGS     = new Set(['too_easy', 'just_right', 'too_hard']);

function validateProfile(p) {
  if (!ALLOWED_INSTRUMENTS.has(p.instrument))
    throw new HttpsError('invalid-argument', 'Invalid instrument');
  if (!ALLOWED_LEVELS.has(p.level))
    throw new HttpsError('invalid-argument', 'Invalid level');
  if (!Array.isArray(p.availableDays) || p.availableDays.length === 0 || !p.availableDays.every(d => ALLOWED_DAYS.has(d)))
    throw new HttpsError('invalid-argument', 'Invalid availableDays');
  if (typeof p.dailyDuration !== 'number' || p.dailyDuration < 5 || p.dailyDuration > 240)
    throw new HttpsError('invalid-argument', 'dailyDuration must be 5–240 minutes');
  if (!Array.isArray(p.goals) || p.goals.length > 10 || p.goals.some(g => typeof g !== 'string' || g.length > 100))
    throw new HttpsError('invalid-argument', 'Invalid goals');
  if (!Array.isArray(p.skills) || p.skills.length > 10 || p.skills.some(s => typeof s !== 'string' || s.length > 100))
    throw new HttpsError('invalid-argument', 'Invalid skills');
}

// ─── Shared function config ───────────────────────────────────────────────────
const BASE_OPTIONS = {
  region: 'us-central1',
  secrets: [ANTHROPIC_API_KEY],
  invoker: 'public',
  // enforceAppCheck: true  ← enable once App Check is configured in the app
};

// ─── generatePracticePlan ─────────────────────────────────────────────────────
exports.generatePracticePlan = onCall(
  { ...BASE_OPTIONS, timeoutSeconds: 300, memory: '256MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

    const uid = request.auth.uid;
    // request.app is non-null only when the client sends a valid App Check token.
    // Log its presence now; flip enforceAppCheck above to block unverified clients.
    const appCheckPresent = !!request.app;
    const startTime = Date.now();

    await checkRateLimit(uid, 'generatePracticePlan');
    validateProfile(request.data);

    const { instrument, level, goals, skills, availableDays, dailyDuration } = request.data;

    const prompt = `You are Prova, a world-class music practice coach. Generate a structured weekly practice plan for a ${instrument} player.

User Profile:
- Instrument: ${instrument}
- Level: ${level}
- Goals: ${goals.join(', ')}
- Skills to focus on: ${skills.join(', ')}
- Available days: ${availableDays.join(', ')}
- Daily practice time: ${dailyDuration} minutes

Generate a JSON response with this exact structure:
{
  "weeklyPlan": {
    "monday": { "sessions": [...] },
    "tuesday": { "sessions": [...] },
    "wednesday": { "sessions": [...] },
    "thursday": { "sessions": [...] },
    "friday": { "sessions": [...] },
    "saturday": { "sessions": [...] },
    "sunday": { "sessions": [...] }
  }
}

For days the user is NOT available, set the value to null instead of an object.

Each session object:
{
  "id": "unique_string",
  "title": "Exercise name",
  "description": "Exact, physical, step-by-step instructions — see the specificity rules below",
  "duration": number_in_minutes,
  "category": "warmup" | "technique" | "theory" | "ear_training" | "repertoire" | "improvisation",
  "reference": "a YouTube SEARCH PHRASE (not a URL) the player can look up to see this exact exercise demonstrated"
}

SPECIFICITY RULES — these are the most important rules. A ${level} player must be able to do the exercise from the description ALONE, without already knowing it:
- Name the exact notes, strings, and fret numbers. Write tab-style where useful, e.g. "low E string: 0-3-5, 0-3-6-5".
- For chords, give the full fingering by string and fret, e.g. "G major = low-E 3rd fret, A 2nd fret, high-E 3rd fret" — never just "play a G chord".
- For scales/licks, give the starting string + fret and the position, e.g. "A minor pentatonic position 1, starting low-E 5th fret".
- Always give a concrete tempo in BPM and a rep count or duration, e.g. "loop at 70 BPM for 3 min" or "10 clean reps".
- ${instrument === 'Bass' ? 'This is a BASS player — use bass strings (E A D G), bass-appropriate notes and basslines.' : 'This is a GUITAR player — use guitar chord shapes and all 6 strings (E A D G B e).'}
- Reference real, well-known songs/riffs by name where they fit (e.g. "the riff from Smoke on the Water"), so the player can recognise it.

The "reference" field: write a specific YouTube search phrase that would surface a tutorial for THIS exercise, e.g. "G to C chord change beginner guitar lesson" or "A minor pentatonic position 1 guitar". Do NOT invent a URL or a channel name — just the search phrase.

This is the REQUIRED level of detail for a description — match it (do not copy it verbatim):
"On the low E string play frets 1-2-3-4 with index-middle-ring-pinky, one note per click at 60 BPM, then move that same 1-2-3-4 shape across to the A, D, G, B and high-E strings and back. Keep every note clean and even — 3 min."
A BAD description (never write like this): "Warm up your fingers" / "Practice some chords" / "Work on the A minor scale".
HARD LIMIT: keep EVERY description to ONE sentence, maximum ~160 characters — exact and physical but terse. Never write two sentences or a paragraph; long descriptions will be rejected.

Other rules:
- Total session durations must equal the daily practice time exactly
- Always start with a warmup
- Match difficulty to the user's level
- Only include sessions for available days, set others to null

Return only valid JSON, no markdown fences, no explanation.`;

    let result;
    try {
      result = await callClaude(ANTHROPIC_API_KEY.value(), prompt, 12000, MODEL_SMART, 220000);
    } catch (err) {
      await writeUsageLog(uid, 'generatePracticePlan', {
        tokensIn: 0, tokensOut: 0,
        durationMs: Date.now() - startTime,
        success: false, errorType: 'claude_error',
        appCheckPresent,
      });
      throw err;
    }

    let plan;
    try {
      let s = (result.text || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      // If the model wrapped the JSON in any prose, slice to the outermost object.
      const first = s.indexOf('{');
      const last = s.lastIndexOf('}');
      if (first !== -1 && last > first) s = s.slice(first, last + 1);
      if (!s) throw new Error('empty response');
      plan = JSON.parse(s);
    } catch (parseErr) {
      console.error('Plan parse failed', {
        stopReason: result.stopReason,
        textLen: (result.text || '').length,
        snippet: (result.text || '').slice(0, 120),
      });
      await writeUsageLog(uid, 'generatePracticePlan', {
        tokensIn: result.tokensIn, tokensOut: result.tokensOut,
        durationMs: Date.now() - startTime,
        success: false, errorType: 'parse_error',
        appCheckPresent,
      });
      throw new HttpsError(
        'internal',
        result.stopReason === 'max_tokens'
          ? 'The plan was too long to finish. Please try again.'
          : 'The AI response was incomplete. Please try again.'
      );
    }

    // Fire-and-forget post-call accounting (never blocks the response)
    Promise.all([
      recordTokenUsage(uid, 'generatePracticePlan', result.tokensIn + result.tokensOut),
      writeUsageLog(uid, 'generatePracticePlan', {
        tokensIn: result.tokensIn, tokensOut: result.tokensOut,
        durationMs: Date.now() - startTime,
        success: true,
        appCheckPresent,
      }),
      flagAbuseIfNeeded(uid, 'generatePracticePlan', result.tokensIn + result.tokensOut),
    ]).catch(() => {}); // Logging failures must never crash the function

    return plan;
  }
);

// ─── adjustSessionFromRating ──────────────────────────────────────────────────
exports.adjustSessionFromRating = onCall(
  { ...BASE_OPTIONS, timeoutSeconds: 60, memory: '256MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

    const uid = request.auth.uid;
    const appCheckPresent = !!request.app;
    const startTime = Date.now();

    await checkRateLimit(uid, 'adjustSessionFromRating');

    const { sessions, rating, feedback } = request.data;

    if (!ALLOWED_RATINGS.has(rating))
      throw new HttpsError('invalid-argument', 'Invalid rating');
    if (!Array.isArray(sessions) || sessions.length === 0 || sessions.length > 20)
      throw new HttpsError('invalid-argument', 'Invalid sessions');
    if (feedback !== null && feedback !== undefined && (typeof feedback !== 'string' || feedback.length > 500))
      throw new HttpsError('invalid-argument', 'Feedback too long (max 500 chars)');

    const prompt = `You are Prova, a music practice coach. A user just completed a practice session.

Session completed:
${JSON.stringify(sessions, null, 2)}

Rating: ${rating} (too_easy / just_right / too_hard)
Feedback: "${feedback || 'None'}"

Return an adjusted JSON array of session objects for next time. Same structure as input. Make harder if too_easy, easier if too_hard, slightly progress if just_right.

Return only a valid JSON array, no markdown.`;

    let result;
    try {
      result = await callClaude(ANTHROPIC_API_KEY.value(), prompt, 1000);
    } catch (err) {
      await writeUsageLog(uid, 'adjustSessionFromRating', {
        tokensIn: 0, tokensOut: 0,
        durationMs: Date.now() - startTime,
        success: false, errorType: 'claude_error',
        appCheckPresent,
      });
      throw err;
    }

    const adjusted = JSON.parse(result.text);

    Promise.all([
      recordTokenUsage(uid, 'adjustSessionFromRating', result.tokensIn + result.tokensOut),
      writeUsageLog(uid, 'adjustSessionFromRating', {
        tokensIn: result.tokensIn, tokensOut: result.tokensOut,
        durationMs: Date.now() - startTime,
        success: true,
        appCheckPresent,
      }),
      flagAbuseIfNeeded(uid, 'adjustSessionFromRating', result.tokensIn + result.tokensOut),
    ]).catch(() => {});

    return adjusted;
  }
);

// ─── generateSetlist ──────────────────────────────────────────────────────────
// Builds an ordered gig setlist from a description of the gig. Prioritises songs
// already in the user's library, then fills the rest with well-known suggestions
// that fit the setting and audience.
exports.generateSetlist = onCall(
  { ...BASE_OPTIONS, timeoutSeconds: 60, memory: '256MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

    const uid = request.auth.uid;
    const appCheckPresent = !!request.app;
    const startTime = Date.now();

    await checkRateLimit(uid, 'generateSetlist');

    const { instrument, level, setting, audience, vibe, songCount, library } = request.data;

    // ── Validate input ──
    if (!ALLOWED_INSTRUMENTS.has(instrument))
      throw new HttpsError('invalid-argument', 'Invalid instrument');
    if (!ALLOWED_LEVELS.has(level))
      throw new HttpsError('invalid-argument', 'Invalid level');
    if (typeof setting !== 'string' || setting.trim().length === 0 || setting.length > 300)
      throw new HttpsError('invalid-argument', 'Setting must be 1–300 characters');
    if (typeof audience !== 'string' || audience.trim().length === 0 || audience.length > 300)
      throw new HttpsError('invalid-argument', 'Audience must be 1–300 characters');
    if (vibe !== undefined && vibe !== null && (typeof vibe !== 'string' || vibe.length > 300))
      throw new HttpsError('invalid-argument', 'Vibe too long (max 300 chars)');
    if (typeof songCount !== 'number' || songCount < 3 || songCount > 30)
      throw new HttpsError('invalid-argument', 'songCount must be 3–30');
    if (!Array.isArray(library) || library.length > 200)
      throw new HttpsError('invalid-argument', 'Invalid library');
    const libList = library
      .filter(s => s && typeof s.title === 'string')
      .slice(0, 200)
      .map(s => `- ${s.title}${s.artist ? ` — ${s.artist}` : ''}`)
      .join('\n');

    const prompt = `You are Prova, an expert live-music director helping a ${instrument} player plan a gig setlist.

THE GIG (this is what matters most — the setlist must clearly match it):
- Setting: ${setting}
- Audience: ${audience}
- Desired vibe / genre: ${vibe || 'not specified — infer the most fitting genre and energy from the setting and audience'}
- Player skill level: ${level}
- Number of songs wanted: ${songCount}

Songs already in the player's library:
${libList || '(library is empty)'}

How to choose the songs:
1. The gig's genre, vibe, setting and audience are the PRIMARY drivers. First decide the genre and energy this gig calls for (e.g. a country gig → country songs; a high-energy Friday-night bar → upbeat crowd-pleasers). Two gigs with different descriptions MUST produce clearly different setlists.
2. Pick the best widely-recognised, real songs that fit that genre and vibe. Do NOT invent songs.
3. Only include a library song if it GENUINELY fits the gig's genre and vibe — never force-fit library songs just because they're in the library. If a library song doesn't suit the gig, leave it out. The library is a tiebreaker, not a constraint.
4. Match difficulty to a ${level} player where possible, but prioritise fit to the gig.

Order them to shape the night: open with something that draws this audience in, build energy through the middle, and finish on a strong closer.

Return a JSON object with this exact structure:
{
  "name": "a short, catchy name that reflects this gig's vibe (max 40 chars)",
  "songs": [
    { "title": "Song title", "artist": "Artist name", "note": "its role, e.g. 'Opener — warm, familiar' (max 60 chars)" }
  ]
}

Return only valid JSON, no markdown fences, no explanation.`;

    let result;
    try {
      result = await callClaude(ANTHROPIC_API_KEY.value(), prompt, 2000);
    } catch (err) {
      await writeUsageLog(uid, 'generateSetlist', {
        tokensIn: 0, tokensOut: 0,
        durationMs: Date.now() - startTime,
        success: false, errorType: 'claude_error',
        appCheckPresent,
      });
      throw err;
    }

    const setlist = JSON.parse(
      result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    );

    Promise.all([
      recordTokenUsage(uid, 'generateSetlist', result.tokensIn + result.tokensOut),
      writeUsageLog(uid, 'generateSetlist', {
        tokensIn: result.tokensIn, tokensOut: result.tokensOut,
        durationMs: Date.now() - startTime,
        success: true,
        appCheckPresent,
      }),
      flagAbuseIfNeeded(uid, 'generateSetlist', result.tokensIn + result.tokensOut),
    ]).catch(() => {});

    return setlist;
  }
);
