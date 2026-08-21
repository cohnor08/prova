const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const functionsV1 = require('firebase-functions/v1');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const YOUTUBE_API_KEY = defineSecret('YOUTUBE_API_KEY');
// Resend (https://resend.com) sends the automated weekly parent reports. Raw REST
// (no SDK) to match the rest of this file. Set with:
//   firebase functions:secrets:set RESEND_API_KEY
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
// Sender identity for parent emails. `onboarding@resend.dev` works immediately in
// Resend's test mode BUT only delivers to the Resend account owner's own address —
// swap this for an address on a verified domain (e.g. reports@prova.app) to email
// real parents. Change it here once the domain is verified in Resend.
const REPORT_FROM = 'Prova <onboarding@resend.dev>';
// When the automated weekly run fires. App Engine cron syntax; change freely.
const REPORT_SCHEDULE = 'every sunday 17:00';
const REPORT_TIMEZONE = 'America/New_York';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
// Sonnet for tasks that need genuinely specific, reasoned output (practice plans,
// setlists). Haiku tends to default to generic phrasing for these.
const MODEL_SMART = 'claude-sonnet-4-6';

// Cached song plans expire after this long, so stale plans eventually regenerate
// and the songPlans collection can't grow without bound. expiresAt is a Firestore
// Timestamp so a native TTL policy on songPlans.expiresAt can delete expired docs.
const SONG_PLAN_TTL_DAYS = 180;

// ─── Rate limits ──────────────────────────────────────────────────────────────
// Each action has a daily cap on both requests AND tokens consumed.
// Tokens are tracked using the actual usage reported by the Claude API,
// so one expensive prompt costs proportionally more quota.
const RATE_LIMITS = {
  generatePracticePlan:   { requests: 15, tokens: 250000 },
  adjustSessionFromRating: { requests: 10, tokens: 15000 },
  // The weekly "week in review" re-plan. Capped per week (like song plans) since
  // it's meant to run roughly once every 7 days per user.
  refreshWeeklyPlan:      { requests: 3, tokens: 250000, period: 'week' },
  generateSetlist:        { requests: 15, tokens: 40000 },
  // Song-learning plans are capped PER WEEK (not per day) for both teacher and
  // personal accounts. A cache hit on songPlans/{key} never reaches the limiter,
  // so popular songs are effectively free after the first generation.
  generateSongPlan:       { requests: 5, tokens: 80000, period: 'week' },
  // YouTube search doesn't use Claude tokens — `tokens` is just a guard rail that
  // never trips (we never record tokens for it). The real cost control is the
  // ytSearches/{key} cache: a repeated query never reaches the YouTube API or the
  // limiter. `requests` caps how many NEW (uncached) searches one user can trigger
  // per day, protecting the project's shared 10k-unit/day YouTube quota.
  searchYouTube:          { requests: 40, tokens: 1 },
  // Conversational AI coach ("Ask Prova"). Daily cap — it's a chat so several
  // questions a day is normal, but bounded to keep Claude spend in check.
  askProva:               { requests: 30, tokens: 60000 },
  // Manual "email parents now" button. Doesn't use Claude tokens (tokens:1 never
  // trips, like searchYouTube) — `requests` caps how many manual send bursts one
  // teacher can trigger per day so the button can't be used to spam email.
  sendParentReportsNow:   { requests: 10, tokens: 1 },
};

// Returns the bucket key for an action's rate-limit period. Daily actions key on
// the UTC date; weekly actions key on the Monday (UTC) of the current week, so a
// weekly counter resets at the week boundary instead of every day.
function periodKeyFor(action) {
  const period = (RATE_LIMITS[action] && RATE_LIMITS[action].period) || 'day';
  const now = new Date();
  if (period === 'week') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dow = d.getUTCDay();                 // 0=Sun … 6=Sat
    d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow)); // back to Monday
    return 'w' + d.toISOString().split('T')[0];
  }
  return now.toISOString().split('T')[0];
}

// Check request count atomically; token ceiling is checked non-transactionally
// before the call and then the actual usage is written after.
// Give a request back. Used when we charged for a generation and then chose
// not to give the user a plan (an unknown song), so a refusal never costs one
// of their five weekly slots. Best-effort: never let this fail the request.
async function refundRateLimit(uid, action) {
  try {
    const ref = db.doc(`rateLimits/${uid}/actions/${action}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() || {};
      if (data.date !== periodKeyFor(action)) return;   // period rolled over
      tx.set(ref, { ...data, requests: Math.max(0, (data.requests || 0) - 1) });
    });
  } catch (e) { /* non-fatal */ }
}

async function checkRateLimit(uid, action) {
  const key = periodKeyFor(action);
  const span = (RATE_LIMITS[action].period === 'week') ? 'Weekly' : 'Daily';
  const again = (RATE_LIMITS[action].period === 'week') ? 'next week' : 'tomorrow';
  const ref = db.doc(`rateLimits/${uid}/actions/${action}`);
  const limits = RATE_LIMITS[action];

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const fresh = data.date !== key;
    const requests = fresh ? 0 : (data.requests || 0);
    const tokens   = fresh ? 0 : (data.tokens   || 0);

    if (requests >= limits.requests) {
      throw new HttpsError(
        'resource-exhausted',
        `${span} limit reached (${limits.requests}). Try again ${again}.`
      );
    }
    if (tokens >= limits.tokens) {
      throw new HttpsError(
        'resource-exhausted',
        `${span} usage limit reached. Try again ${again}.`
      );
    }

    tx.set(ref, { date: key, requests: requests + 1, tokens });
  });
}

// Add actual token usage after a successful Claude call.
async function recordTokenUsage(uid, action, tokensUsed) {
  const key = periodKeyFor(action);
  const ref = db.doc(`rateLimits/${uid}/actions/${action}`);
  await ref.set(
    { tokens: admin.firestore.FieldValue.increment(tokensUsed), date: key },
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
    const key = periodKeyFor(action);
    const snap = await db.doc(`rateLimits/${uid}/actions/${action}`).get();
    const data = snap.data() || {};
    if (data.date !== key) return;

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
      // Surface Anthropic's actual error so failures are diagnosable (a 400 with
      // "credit balance is too low" reads very differently from a real bad
      // request). Logged in full; truncated in the client-facing message.
      let detail = '';
      try { detail = await response.text(); } catch (_) {}
      console.error('Claude API error', response.status, detail);
      throw new HttpsError('internal', `Claude API error: ${response.status} ${detail}`.slice(0, 400));
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
      // Haiku 4.5 builds a valid, specific weekly plan in ~12-15s (vs ~35s-2min
      // on the smart model) at a fraction of the cost — verified structurally.
      result = await callClaude(ANTHROPIC_API_KEY.value(), prompt, 12000, MODEL, 220000);
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

// ─── Song verification ────────────────────────────────────────────────────────
// "Do NOT invent songs" in a prompt is a request, not a guarantee: setlists came
// back with songs that don't exist and real songs credited to the wrong artist.
// So every suggestion is checked against Apple's catalogue before it is returned.
// Anything with no match is dropped; a real song with the wrong artist is
// corrected rather than thrown away.

// Normalise for comparison: strip accents, "feat." tails, "(2011 Remaster)" and
// "- Live" suffixes, and punctuation — the same song is spelled a dozen ways.
const songStrip = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\b(feat|ft|featuring)\b[\s\S]*$/g, '')
  .replace(/[([][^)\]]*(remaster|remix|live|version|edit|mono|stereo|deluxe|mix|radio|single|album|explicit|bonus|anniversary|unplugged|acoustic|session|riff|intro|solo|bassline)[^)\]]*[)\]]/g, '')
  .replace(/\s-\s.*(remaster|live|version|edit|mix|single|unplugged|acoustic).*$/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const songNorm = (s) => songStrip(s).replace(/^(the|a|an)\s+/, '');

// 1 is identical. Containment scales with how much of the longer string the
// shorter one covers, so "Creep" is not accepted as "Negative Creep".
function songSimilar(a, b) {
  a = songNorm(a); b = songNorm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return 0.5 + 0.4 * (Math.min(a.length, b.length) / Math.max(a.length, b.length));
  }
  const aw = new Set(a.split(' ')), bw = new Set(b.split(' '));
  let hit = 0;
  for (const w of aw) if (bw.has(w)) hit++;
  return hit / Math.max(aw.size, bw.size);
}

const TITLE_MATCH = 0.85;
const ARTIST_MATCH = 0.6;

// Searching a title alone surfaces karaoke and tribute records alongside the
// original, and taking one of those as the answer would replace a correct
// artist with "The Karaoke Crew". Prefer the plain studio recording.
const JUNK_TITLE = /\b(karaoke|tribute|cover|instrumental|backing track|made popular by|in the style of)\b/i;
const VARIANT_TITLE = /\b(live|remaster|remastered|remix|demo|acoustic|radio edit|edit|version|mix)\b/i;

function recordingPenalty(r) {
  const title = String(r.trackName || '');
  const album = String(r.collectionName || '');
  const artist = String(r.artistName || '');
  let p = 0;
  if (JUNK_TITLE.test(title) || JUNK_TITLE.test(album) || JUNK_TITLE.test(artist)) p += 1.5;
  if (VARIANT_TITLE.test(title)) p += 0.35;
  return p;
}
const VERIFY_BUDGET_MS = 15000;   // well inside the 60s function timeout
const VERIFY_CONCURRENCY = 5;

// 25 rather than a handful: for an album track Apple ranks the artist's hits
// above the actual title match, so "Aeroplane · Red Hot Chili Peppers" is not
// in the first few results for its own name and artist.
async function itunesSearch(term, signal) {
  const url = 'https://itunes.apple.com/search?media=music&entity=song&limit=25&term='
    + encodeURIComponent(term);
  const res = await fetch(url, { signal });
  // Apple answers an HTML error page when you go over its ~20 calls/minute.
  if (res.status === 403 || res.status === 429) { const e = new Error('rate-limited'); e.rateLimited = true; throw e; }
  if (!res.ok) throw new Error('itunes ' + res.status);
  const text = await res.text();
  if (!text.trim().startsWith('{')) { const e = new Error('not-json'); e.rateLimited = true; throw e; }
  return JSON.parse(text).results || [];
}

// Confirm a title/artist pair against Apple's catalogue.
//
// It only ever confirms — it never substitutes a different artist. Apple's
// search cannot tell "the model credited the wrong artist" apart from "this is
// a deep cut Apple ranks below more popular songs of the same name": searching
// "Wonderwall Coldplay" and "Aeroplane Red Hot Chili Peppers" both return that
// artist's hits and no track of that title, yet the first is wrong and the
// second is real. Rewriting the credit on that evidence would sometimes invent
// a wrong one, so anything unconfirmed is dropped instead. Over-generating the
// setlist is what pays for the occasional real song lost that way.
//
// → { status: 'ok' | 'unknown', title, artist }
async function verifyOneSong(title, artist, signal) {
  const pick = (results) => {
    let best = null, bestScore = -Infinity;
    results.forEach((r, i) => {
      const ts = songSimilar(r.trackName, title);
      if (ts < TITLE_MATCH) return;
      const as = artist ? songSimilar(r.artistName, artist) : 1;
      if (as < ARTIST_MATCH) return;
      const score = ts * 2 + as - recordingPenalty(r) - i * 0.01;
      if (score > bestScore) { bestScore = score; best = r; }
    });
    return best;
  };

  // Pass 1 — the title with the artist the model claimed.
  let hit = pick(await itunesSearch(`${title} ${artist || ''}`.trim(), signal));
  // Pass 2 — the title alone, in case Apple ranked the artist's hits above the
  // track actually being asked about. Still only looking for the same pair.
  if (!hit && artist) hit = pick(await itunesSearch(title, signal));

  return hit
    ? { status: 'ok', title: hit.trackName, artist: hit.artistName }
    : { status: 'unknown' };
}

// Verifies a list of { title, artist, note }. Returns the songs worth keeping
// plus a count of what happened, for the usage log.
//
// Apple rate-limits, and a setlist is worth more than a perfectly verified one:
// if the catalogue can't be reached the songs pass through untouched. The only
// thing that removes a song is Apple actively not having it.
const DROP = Symbol('drop');

async function verifySongs(songs) {
  const stats = { checked: 0, dropped: 0, skipped: 0 };
  // undefined = never reached, DROP = Apple doesn't have it, object = keep.
  const out = new Array(songs.length);
  const deadline = Date.now() + VERIFY_BUDGET_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_BUDGET_MS);
  let stop = false;
  let next = 0;

  const worker = async () => {
    for (;;) {
      if (stop) return;
      const i = next++;
      if (i >= songs.length) return;
      const s = songs[i];
      if (Date.now() > deadline) { stop = true; return; }
      try {
        const v = await verifyOneSong(s.title, s.artist, controller.signal);
        stats.checked++;
        if (v.status === 'unknown') { stats.dropped++; out[i] = DROP; }
        // Same recording, Apple's spelling of it.
        else out[i] = { ...s, title: v.title, artist: v.artist };
      } catch (err) {
        // Rate limit or network trouble: stop checking and keep the rest.
        if (err.rateLimited || err.name === 'AbortError') stop = true;
        out[i] = s;
        stats.skipped++;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(VERIFY_CONCURRENCY, songs.length) }, worker));
  } finally {
    clearTimeout(timer);
  }

  const kept = [];
  for (let i = 0; i < songs.length; i++) {
    if (out[i] === DROP) continue;
    if (out[i] === undefined) stats.skipped++;   // budget ran out before this one
    kept.push(out[i] === undefined ? songs[i] : out[i]);
  }
  return { songs: kept, stats };
}

// ─── generateSetlist ──────────────────────────────────────────────────────────
// Builds an ordered gig setlist from a description of the gig. Prioritises songs
// already in the user's library, then fills the rest with well-known suggestions
// that fit the setting and audience. Every song is checked against Apple's
// catalogue before it goes back to the client.
exports.generateSetlist = onCall(
  { ...BASE_OPTIONS, timeoutSeconds: 60, memory: '256MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

    const uid = request.auth.uid;
    const appCheckPresent = !!request.app;
    const startTime = Date.now();

    await checkRateLimit(uid, 'generateSetlist');

    // FREE LAUNCH (Apple 3.1.1): no plan gate — AI setlists are free for all.
    // The rate limit above still caps cost. Re-add the Personal check with IAP.

    const { instrument, level, setting, audience, vibe, artists, songCount, library } = request.data;

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
    if (artists !== undefined && artists !== null && (typeof artists !== 'string' || artists.length > 300))
      throw new HttpsError('invalid-argument', 'Inspiration artists too long (max 300 chars)');
    if (typeof songCount !== 'number' || songCount < 3 || songCount > 30)
      throw new HttpsError('invalid-argument', 'songCount must be 3–30');
    if (!Array.isArray(library) || library.length > 200)
      throw new HttpsError('invalid-argument', 'Invalid library');
    const libList = library
      .filter(s => s && typeof s.title === 'string')
      .slice(0, 200)
      .map(s => `- ${s.title}${s.artist ? ` — ${s.artist}` : ''}`)
      .join('\n');

    // When inspiration artists are named, guarantee they actually appear:
    // at least 25% of the set must be songs BY those artists (min 2).
    const artistQuota = artists ? Math.max(2, Math.round((Number(songCount) || 10) * 0.25)) : 0;

    // Ask for more than we need. Every song is checked against Apple's
    // catalogue afterwards and anything unconfirmed is removed, so the surplus
    // is what keeps a verified set from coming back short.
    const askCount = Math.min(38, songCount + 8);

    const prompt = `You are Prova, an expert live-music director helping a ${instrument} player plan a gig setlist.

THE GIG (this is what matters most — the setlist must clearly match it):
- Setting: ${setting}
- Audience: ${audience}
- Desired genres / vibe: ${vibe || 'not specified — infer the most fitting genre and energy from the setting and audience'}
- Inspiration artists: ${artists || 'none given'}${artistQuota ? ` — you MUST include at least ${artistQuota} song${artistQuota === 1 ? '' : 's'} performed BY these exact artists (real, well-known tracks of theirs), and use their style to steer the rest` : ''}
- Player skill level: ${level}
- Number of songs wanted: ${askCount}

Songs already in the player's library:
${libList || '(library is empty)'}

How to choose the songs:
1. The gig's genres, vibe, setting, audience and any inspiration artists are the PRIMARY drivers. First decide the genre and energy this gig calls for (e.g. a country gig → country songs; a high-energy Friday-night bar → upbeat crowd-pleasers; "house like KETTAMA, Fred again.." → modern house/electronic in that style). If inspiration artists are given, AT LEAST ${artistQuota || 0} of the ${askCount} songs MUST be real songs performed by those named artists themselves — spread them through the set where they fit the energy curve — and the remaining songs should match their style, era and energy closely. Two gigs with different descriptions MUST produce clearly different setlists.
2. Pick the best widely-recognised, real songs that fit that genre and vibe. Every entry must be a real commercially released recording that exists on Apple Music and Spotify, with the artist who actually performed it — every title and artist pairing is checked against Apple's catalogue after you answer, and anything that does not exist is deleted from the setlist. If you are not certain a song is real and that you have the right artist, leave it out and pick one you are certain of. Never invent a title, and never guess an artist.
3. HARD GENRE GATE: every song must belong to the gig's genre. A song from the wrong genre must NOT appear — no exceptions for famous songs, crowd-pleasers, or songs from the player's library. Example: for a house/electronic gig, rock and acoustic classics like "Hotel California" or "Wonderwall" are WRONG answers. It is better to include zero library songs than one that breaks the genre. Only include a library song when it genuinely belongs to this gig's genre.
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
      result = await callClaude(ANTHROPIC_API_KEY.value(), prompt, 2600);
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

    // Check every suggestion against Apple's catalogue, then trim back to the
    // number asked for — the model was told to over-generate precisely so that
    // dropping the invented ones still leaves a full set.
    let verifyStats = null;
    if (Array.isArray(setlist.songs)) {
      const clean = setlist.songs.filter(s => s && typeof s.title === 'string' && s.title.trim());
      const { songs: verified, stats } = await verifySongs(clean);
      verifyStats = stats;
      setlist.songs = verified.slice(0, songCount);
    }

    Promise.all([
      recordTokenUsage(uid, 'generateSetlist', result.tokensIn + result.tokensOut),
      writeUsageLog(uid, 'generateSetlist', {
        tokensIn: result.tokensIn, tokensOut: result.tokensOut,
        durationMs: Date.now() - startTime,
        success: true,
        appCheckPresent,
        ...(verifyStats ? { verified: verifyStats } : {}),
      }),
      flagAbuseIfNeeded(uid, 'generateSetlist', result.tokensIn + result.tokensOut),
    ]).catch(() => {});

    return setlist;
  }
);

// ─── generateSongPlan ─────────────────────────────────────────────────────────
// Builds an ordered, step-by-step plan for learning ONE song on a given
// instrument. Results are cached globally in songPlans/{key} keyed on
// instrument+title+artist, so the same song is only ever generated once and
// later requests (by anyone) return the cache for free — without touching the
// per-user weekly rate limit.
function songPlanKey(instrument, title, artist) {
  const norm = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  // v3: scope is now chords + simple tabs only, and the model returns
  // {known:false} rather than guessing at a song it doesn't know. Bump the
  // version on every material prompt change — otherwise cached answers written
  // under the OLD rules keep being served for their full 180-day TTL.
  return `v3__${norm(instrument)}__${norm(title)}__${norm(artist) || 'unknown'}`;
}

exports.generateSongPlan = onCall(
  { ...BASE_OPTIONS, timeoutSeconds: 120, memory: '256MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

    const uid = request.auth.uid;
    const appCheckPresent = !!request.app;
    const startTime = Date.now();

    const { instrument, title, artist, tuning: userTuning } = request.data || {};

    // ── Validate input ──
    if (!ALLOWED_INSTRUMENTS.has(instrument))
      throw new HttpsError('invalid-argument', 'Invalid instrument');
    if (typeof title !== 'string' || title.trim().length === 0 || title.length > 120)
      throw new HttpsError('invalid-argument', 'Song title must be 1–120 characters');
    if (artist !== undefined && artist !== null && (typeof artist !== 'string' || artist.length > 120))
      throw new HttpsError('invalid-argument', 'Artist too long (max 120 chars)');
    // Optional: the player already knows the tuning (they can read it off a tab
    // or their own guitar). If they tell us, it beats anything the model recalls.
    if (userTuning !== undefined && userTuning !== null && (typeof userTuning !== 'string' || userTuning.length > 60))
      throw new HttpsError('invalid-argument', 'Tuning too long (max 60 chars)');

    const cleanTitle  = title.trim();
    const cleanArtist = (artist || '').trim();
    // Neutralise prompt-injection / JSON-breaking characters before user text is
    // interpolated into the prompt (PR #21 review). The generated plan is cached
    // world-readable in songPlans, so what we send must be inert: no control
    // chars, backticks, quotes or backslashes survive into the prompt.
    const promptSafe = (s) => s
      .replace(/[\u0000-\u001f\u007f`]/g, ' ')
      .replace(/["\\]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    const safeTitle  = promptSafe(cleanTitle);
    const safeArtist = promptSafe(cleanArtist);
    const cleanTuning = (userTuning || '').trim();
    const safeTuning  = promptSafe(cleanTuning);
    // A user-supplied tuning changes the plan, so it must change the cache key —
    // otherwise the first person's standard-tuning plan is served to everyone.
    const key = songPlanKey(instrument, cleanTitle, cleanArtist) + (safeTuning ? `__t-${safeTuning.toLowerCase().replace(/[^a-z0-9]+/g, '')}` : '');
    const cacheRef = db.doc(`songPlans/${key}`);

    // ── Cache hit: return for free, don't count against the weekly limit ──
    // An entry past its expiresAt (or a legacy one without it) counts as a miss,
    // so it regenerates and is rewritten with a fresh TTL stamp.
    const cached = await cacheRef.get();
    if (cached.exists) {
      const exp = cached.data().expiresAt;
      if (exp && exp.toDate() > new Date()) {
        return { ...cached.data(), cached: true };
      }
    }

    // ── Cache miss: this is a real generation, so it costs quota ──
    await checkRateLimit(uid, 'generateSongPlan');

    const prompt = `You are Prova, an expert ${instrument} teacher building a step-by-step plan for a student to learn ONE specific song from scratch.

THE SONG:
- Title: ${safeTitle}
- Artist: ${safeArtist || 'unknown — infer the most likely well-known version'}
- Instrument: ${instrument}
${safeTuning
  ? `- Tuning: ${safeTuning} — THE STUDENT SUPPLIED THIS. Treat it as fact, and write every fret/shape for THIS tuning, not standard.`
  : '- Tuning: not supplied — work it out (see the TUNING rules below).'}

TUNING AND CAPO (get this right or the whole plan is wrong):
Many songs are NOT in standard tuning. Drop D, half-step-down, open tunings and one-off altered tunings are extremely common, and a plan written in standard tuning for a song that isn't is useless — every fret number is wrong.
- Work out the tuning BEFORE the steps, and put it in the "tuning" field (e.g. "Standard (E A D G B E)", "Drop D (D A D G B E)", "D A D F# B E").
- If the song uses ANYTHING other than standard tuning, or a capo, then STEP 1 MUST be tuning/capo setup — tell the student exactly which strings to move and in which direction, in plain words.
- If you are not certain of the tuning, say so: set "confidence" to "low", put your best guess in "tuning" and add "(check a tab to confirm)" to it. NEVER silently default to standard tuning.

HONESTY ABOUT WHAT YOU KNOW (the most important rule here):
Only teach a song you genuinely know. A confidently wrong chord chart teaches someone the wrong song and destroys their trust in the app — that is far worse than admitting you do not know it.
If you are not genuinely confident you know THIS recording — its chords, its structure, its tuning — then DO NOT write a plan. Return exactly this instead, and nothing else:
{"known": false}
Be strict with yourself: "I have heard of this artist" is not knowing the song. If you would be guessing at the chords, return {"known": false}.
If you DO know it, return the full plan below with "known": true.

Break learning this song into an ORDERED sequence of practice steps that ramp from easiest to full-speed performance. A good sequence looks like: learn the core chords/notes → the shapes/fingerings → the strumming/picking or groove → each section (intro, verse, chorus, bridge, solo) → transitions between sections → play along slowly → bring it up to full tempo. Adapt to what THIS song actually needs (e.g. a riff-based song leads with the riff; a fingerstyle song leads with the pattern).

Each step must be SPECIFIC but written SIMPLY. Name the real chords, frets, strings, and BPM — but say it in plain, everyday words a total beginner understands. "Practice the chorus" is too vague; "Play the chorus chords C, G, Am, F — one slow strum on each, at 70 BPM" is specific AND easy to read.

WHAT YOU MAY TEACH (deliberately limited — stay inside this):
Prova teaches songs at the level of CHORDS and SIMPLE TABS. Nothing more ambitious.
- Chords: name the shape (e.g. Am, Cadd9) and, where it helps, which strings are actually played.
- Simple tabs: short single-note riffs or lines as STRING + FRET in order, e.g. "6th string: 0-0-3-5". Keep them to a few notes.
- Fingerpicking: describe the pattern in words (which finger takes which string, in what order). Do not attempt to notate it.
- Do NOT attempt solos, complex lead lines, note-for-note transcription, or anything that really needs proper notation. If a section is beyond chords and a simple riff, say so plainly and tell the student to slow the recording down and learn it by ear, or ask their teacher.
Match the instruction to how the part is really played — if a song is built on a riff, the riff is step one, not "learn the chords".

WRITING STYLE (the student may be a complete beginner — this is the most important part):
- Plain, everyday English. Short sentences. Warm and encouraging.
- No music jargon unless you explain it in a couple of plain words right there, e.g. "downstrokes (strum downward)".
- Keep every line short and skimmable — never a wall of text.
- Talk TO the student ("Place your first finger on..."), not about the song.

Return a JSON object with this exact structure:
{
  "known": true,
  "title": "${safeTitle}",
  "artist": "${safeArtist}",
  "instrument": "${instrument}",
  "overview": "one simple, friendly sentence about the song and how hard it is to learn (max 140 chars)",
  "tuning": "the tuning this song is played in, low string to high (e.g. 'Standard (E A D G B E)' or 'Drop D (D A D G B E)')",
  "capo": "capo position as plain text (e.g. 'No capo' or 'Capo 2nd fret')",
  "known": true,
  "steps": [
    {
      "title": "short, plain step name (max 40 chars)",
      "summary": "ONE short, simple sentence in plain words — what you'll do in this step",
      "tasks": [ "one short, clear instruction with the exact chords/frets/BPM", "another short one" ],
      "targetBpm": 90,
      "yt": "a YouTube SEARCH PHRASE to find a helpful tutorial for this step (never a URL)"
    }
  ]
}

Rules:
- 5 to 8 steps, ordered easiest → full performance.
- 2 to 4 tasks per step, each ONE short line a beginner can follow.
- Keep it specific (real chords, frets, BPM) but always phrased simply and plainly.
- "targetBpm" is optional — include it only where a tempo target makes sense (omit for pure chord-learning steps).
- "yt" is a search phrase like "${safeTitle} ${instrument} chords tutorial", never a link.
- "tuning" and "capo" are REQUIRED. If the tuning is anything but standard, step 1 is the tuning step.
- Never state a tuning you are unsure of. If you know the song but not its tuning, write "Standard (E A D G B E) — check a tab to confirm" and make that clear.
- Return only valid JSON, no markdown fences, no explanation.`;

    let result;
    try {
      result = await callClaude(ANTHROPIC_API_KEY.value(), prompt, 4000, MODEL_SMART, 110000);
    } catch (err) {
      await writeUsageLog(uid, 'generateSongPlan', {
        tokensIn: 0, tokensOut: 0,
        durationMs: Date.now() - startTime,
        success: false, errorType: 'claude_error',
        appCheckPresent,
      });
      throw err;
    }

    let plan;
    try {
      const raw = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      plan = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    } catch (err) {
      await writeUsageLog(uid, 'generateSongPlan', {
        tokensIn: result.tokensIn, tokensOut: result.tokensOut,
        durationMs: Date.now() - startTime,
        success: false, errorType: 'parse_error',
        appCheckPresent,
      });
      throw new HttpsError('internal', 'Could not build a plan for that song. Try again.');
    }

    // ── The model says it doesn't know this song ──────────────────────────────
    // Return that as a first-class answer rather than a half-guessed plan. We
    // refund the weekly slot (being told "I don't know" shouldn't cost one of
    // five) and deliberately do NOT cache it — the next model version may well
    // know the song, and a cached refusal would outlive its own reason for
    // 180 days.
    if (plan.known === false) {
      await refundRateLimit(uid, 'generateSongPlan');
      Promise.all([
        recordTokenUsage(uid, 'generateSongPlan', result.tokensIn + result.tokensOut),
        writeUsageLog(uid, 'generateSongPlan', {
          tokensIn: result.tokensIn, tokensOut: result.tokensOut,
          durationMs: Date.now() - startTime,
          success: true, errorType: 'unknown_song',
          appCheckPresent,
        }),
      ]).catch(() => {});
      return { known: false, title: cleanTitle, artist: cleanArtist, instrument, cached: false };
    }

    // Stamp ids/order on the steps so the client can track per-step progress.
    const steps = (Array.isArray(plan.steps) ? plan.steps : []).map((s, i) => ({
      id: `${i}`,
      title: String(s.title || `Step ${i + 1}`).slice(0, 60),
      summary: String(s.summary || '').slice(0, 400),
      tasks: Array.isArray(s.tasks) ? s.tasks.filter(t => typeof t === 'string').slice(0, 8) : [],
      targetBpm: (typeof s.targetBpm === 'number' && s.targetBpm > 0) ? Math.round(s.targetBpm) : null,
      yt: typeof s.yt === 'string' ? s.yt.slice(0, 120) : '',
    }));

    if (steps.length === 0) {
      throw new HttpsError('internal', 'Could not build a plan for that song. Try again.');
    }

    const record = {
      key,
      title: cleanTitle,
      artist: cleanArtist,
      instrument,
      overview: String(plan.overview || '').slice(0, 160),
      // A user-supplied tuning always wins over the model's guess.
      tuning: cleanTuning ? cleanTuning.slice(0, 60) : String(plan.tuning || '').slice(0, 60),
      capo: String(plan.capo || '').slice(0, 40),
      known: true,
      tuningFromUser: !!cleanTuning,
      steps,
      model: MODEL_SMART,
      createdAt: new Date().toISOString(),
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + SONG_PLAN_TTL_DAYS * 24 * 60 * 60 * 1000)),
    };

    await cacheRef.set(record);

    Promise.all([
      recordTokenUsage(uid, 'generateSongPlan', result.tokensIn + result.tokensOut),
      writeUsageLog(uid, 'generateSongPlan', {
        tokensIn: result.tokensIn, tokensOut: result.tokensOut,
        durationMs: Date.now() - startTime,
        success: true,
        appCheckPresent,
      }),
      flagAbuseIfNeeded(uid, 'generateSongPlan', result.tokensIn + result.tokensOut),
    ]).catch(() => {});

    return { ...record, cached: false };
  }
);

// ─── askProva ─────────────────────────────────────────────────────────────────
// Conversational AI coach. The student asks a free-text playing question and Prova
// answers like a friendly, expert guitar/bass teacher: short, concrete, encouraging.
exports.askProva = onCall(
  { ...BASE_OPTIONS, timeoutSeconds: 60, memory: '256MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

    const uid = request.auth.uid;
    const appCheckPresent = !!request.app;
    const startTime = Date.now();

    const { question, instrument, level, history } = request.data || {};

    if (typeof question !== 'string' || question.trim().length === 0 || question.length > 500)
      throw new HttpsError('invalid-argument', 'Question must be 1–500 characters');

    // Neutralise control chars before interpolating any user text into the prompt.
    const clean = (s, max) => String(s || '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);

    const safeQuestion = clean(question, 500);
    const inst = ALLOWED_INSTRUMENTS.has(instrument) ? instrument : 'Guitar';
    const lvl = (typeof level === 'string') ? clean(level, 40) : '';

    // Last few turns for context (capped to keep tokens bounded).
    const turns = (Array.isArray(history) ? history : [])
      .filter((m) => m && typeof m.text === 'string')
      .slice(-6)
      .map((m) => `${m.role === 'prova' ? 'Prova' : 'Student'}: ${clean(m.text, 600)}`)
      .join('\n');

    await checkRateLimit(uid, 'askProva');

    const prompt = `You are Prova, a warm, encouraging expert ${inst} teacher chatting with ${lvl ? `a ${lvl.toLowerCase()} ` : 'a '}${inst.toLowerCase()} player inside their practice app.

Answer their question like a great one-on-one teacher:
- Be concrete and specific to ${inst}: name actual chords, frets, strings, fingerings, BPM targets or techniques where relevant.
- Give clear, doable steps — something they can try in their next practice session.
- Keep it concise: a few short sentences or a short list. No walls of text, no markdown headers.
- Be encouraging and human. Never say you are an AI or a language model.
- If the question isn't about music, playing, practice, gear or motivation, gently steer them back to their playing.
${turns ? `\nConversation so far:\n${turns}\n` : ''}
Student: ${safeQuestion}
Prova:`;

    let result;
    try {
      result = await callClaude(ANTHROPIC_API_KEY.value(), prompt, 800, MODEL, 55000);
    } catch (err) {
      await writeUsageLog(uid, 'askProva', {
        tokensIn: 0, tokensOut: 0,
        durationMs: Date.now() - startTime,
        success: false, errorType: 'claude_error',
        appCheckPresent,
      });
      throw err;
    }

    const answer = (result.text || '').trim();
    if (!answer) throw new HttpsError('internal', 'No answer — try rephrasing.');

    Promise.all([
      recordTokenUsage(uid, 'askProva', result.tokensIn + result.tokensOut),
      writeUsageLog(uid, 'askProva', {
        tokensIn: result.tokensIn, tokensOut: result.tokensOut,
        durationMs: Date.now() - startTime,
        success: true,
        appCheckPresent,
      }),
      flagAbuseIfNeeded(uid, 'askProva', result.tokensIn + result.tokensOut),
    ]).catch(() => {});

    return { answer };
  }
);

// ─── searchYouTube ────────────────────────────────────────────────────────────
// Turns a search phrase into real, embeddable YouTube videos so the app can show
// thumbnails + play them in-app instead of bouncing the user to a search page.
//
// Cost control (YouTube gives the whole project ~10,000 quota units/day and each
// search costs 100 units → ~100 NEW searches/day across ALL users):
//   1. Results are cached forever in ytSearches/{key} keyed by the normalised
//      query. A repeated phrase is served from Firestore for free and never hits
//      the YouTube API or the per-user rate limit.
//   2. On a cache miss we charge the per-user daily request cap (abuse guard).
function ytCacheKey(q) {
  return String(q || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

exports.searchYouTube = onCall(
  { region: 'us-central1', secrets: [YOUTUBE_API_KEY], invoker: 'public', timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
    const uid = request.auth.uid;

    const { q, max } = request.data || {};
    if (typeof q !== 'string' || q.trim().length === 0)
      throw new HttpsError('invalid-argument', 'Search query is required');
    if (q.length > 150)
      throw new HttpsError('invalid-argument', 'Search query too long (max 150 chars)');

    const query = q.trim();
    const maxResults = Math.min(Math.max(parseInt(max, 10) || 6, 1), 10);
    const key = ytCacheKey(query);

    // ── Cache hit: free, no quota, no rate limit ──
    const cacheRef = db.doc(`ytSearches/${key}`);
    const cached = await cacheRef.get();
    if (cached.exists) {
      const data = cached.data() || {};
      return { results: (data.results || []).slice(0, maxResults), cached: true };
    }

    // ── Cache miss: a real YouTube API call, so it costs the user a request ──
    await checkRateLimit(uid, 'searchYouTube');

    const url = 'https://www.googleapis.com/youtube/v3/search'
      + '?part=snippet&type=video&videoEmbeddable=true&safeSearch=moderate'
      + `&maxResults=${maxResults}`
      + `&q=${encodeURIComponent(query)}`
      + `&key=${YOUTUBE_API_KEY.value()}`;

    let payload;
    try {
      const res = await fetch(url);
      payload = await res.json();
      if (!res.ok) {
        // YouTube returns 403 when the daily quota is exhausted.
        const reason = payload?.error?.errors?.[0]?.reason || '';
        if (res.status === 403 && /quota/i.test(reason)) {
          throw new HttpsError('resource-exhausted', "Today's video search limit was reached. Try again tomorrow.");
        }
        console.error('YouTube API error', res.status, JSON.stringify(payload?.error || {}).slice(0, 300));
        throw new HttpsError('internal', 'Could not search videos right now.');
      }
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('YouTube fetch failed', err?.message);
      throw new HttpsError('internal', 'Could not reach YouTube. Try again.');
    }

    const results = (Array.isArray(payload.items) ? payload.items : [])
      .map((it) => ({
        videoId: it?.id?.videoId || '',
        title: String(it?.snippet?.title || '').slice(0, 200),
        channel: String(it?.snippet?.channelTitle || '').slice(0, 120),
        thumbnail: it?.snippet?.thumbnails?.medium?.url || it?.snippet?.thumbnails?.default?.url || '',
      }))
      .filter((r) => r.videoId);

    // Cache even an empty result set so a dud query doesn't burn quota on repeat.
    await cacheRef.set({ query, key, results, createdAt: new Date().toISOString() });

    return { results, cached: false };
  }
);

// ─── refreshWeeklyPlan ────────────────────────────────────────────────────────
// The "week in review" re-plan: takes the user's profile + a week of per-session
// feedback (difficulty taps + optional notes) and returns a NEW weekly plan that
// visibly responds to it, plus a short human summary of what changed and why.
exports.refreshWeeklyPlan = onCall(
  { ...BASE_OPTIONS, timeoutSeconds: 300, memory: '256MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

    const uid = request.auth.uid;
    const appCheckPresent = !!request.app;
    const startTime = Date.now();

    await checkRateLimit(uid, 'refreshWeeklyPlan');

    const { profile, feedback } = request.data || {};
    validateProfile(profile || {});
    if (!Array.isArray(feedback) || feedback.length === 0)
      throw new HttpsError('invalid-argument', 'No feedback to learn from');
    if (feedback.length > 100)
      throw new HttpsError('invalid-argument', 'Too much feedback');

    const { instrument, level, goals, skills, availableDays, dailyDuration } = profile;

    // Condense the week's feedback into readable lines for the prompt.
    const fbLines = feedback.slice(0, 60).map((f) => {
      const diff = f?.difficulty ? String(f.difficulty).replace('_', ' ') : 'no rating';
      const note = f?.note ? ` — note: "${String(f.note).slice(0, 200)}"` : '';
      return `- "${String(f?.title || 'session').slice(0, 80)}" (${String(f?.category || 'general')}): ${diff}${note}`;
    }).join('\n');

    const prompt = `You are Prova, a world-class ${instrument} practice coach. You are revising this player's weekly practice plan for NEXT week based on how THIS week actually went.

Player profile:
- Instrument: ${instrument}
- Level: ${level}
- Goals: ${goals.join(', ')}
- Skills to focus on: ${skills.join(', ')}
- Available days: ${availableDays.join(', ')}
- Daily practice time: ${dailyDuration} minutes

What they told you about this week's sessions (their difficulty rating + any notes):
${fbLines}

Use this feedback to ADAPT next week:
- Sessions rated "too easy" → make that skill harder / faster / more advanced next week.
- Sessions rated "too hard" → ease off: slower tempo, smaller chunks, more foundational.
- Notes asking for more/less of something, or expressing boredom/enjoyment → shift the mix toward what they want and their goals.
- Where feedback is sparse, progress gently rather than guessing.
- Keep foundational technique even if they under-rate its relevance — you are the expert.

Return a JSON object with EXACTLY this structure:
{
  "changeSummary": "1-2 short sentences, written TO the player, plainly stating what you changed and why, referencing their feedback (max 240 chars). e.g. 'You breezed through your scale work and asked for more improv, so I bumped tempos and added two improv sessions.'",
  "weeklyPlan": {
    "monday": { "sessions": [...] }, "tuesday": { "sessions": [...] }, "wednesday": { "sessions": [...] },
    "thursday": { "sessions": [...] }, "friday": { "sessions": [...] }, "saturday": { "sessions": [...] }, "sunday": { "sessions": [...] }
  }
}
For days the player is NOT available, set that day to null.
Each session object:
{
  "id": "unique_string",
  "title": "Exercise name",
  "description": "ONE terse sentence, max ~160 chars, with exact strings/frets/fingerings/BPM/reps so a ${level} player can do it from the description alone.",
  "duration": number_in_minutes,
  "category": "warmup" | "technique" | "theory" | "ear_training" | "repertoire" | "improvisation",
  "reference": "a YouTube SEARCH PHRASE (never a URL) for a tutorial of this exercise"
}
Rules: total durations per available day must equal ${dailyDuration}; always start each day with a warmup; only include sessions for available days; match difficulty to the adaptation above.
Return only valid JSON, no markdown fences, no explanation.`;

    let result;
    try {
      // Haiku 4.5 builds a valid, specific weekly plan in ~12-15s (vs ~35s-2min
      // on the smart model) at a fraction of the cost — verified structurally.
      result = await callClaude(ANTHROPIC_API_KEY.value(), prompt, 12000, MODEL, 220000);
    } catch (err) {
      await writeUsageLog(uid, 'refreshWeeklyPlan', {
        tokensIn: 0, tokensOut: 0, durationMs: Date.now() - startTime,
        success: false, errorType: 'claude_error', appCheckPresent,
      });
      throw err;
    }

    let out;
    try {
      let s = (result.text || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const first = s.indexOf('{');
      const last = s.lastIndexOf('}');
      if (first !== -1 && last > first) s = s.slice(first, last + 1);
      out = JSON.parse(s);
    } catch (parseErr) {
      console.error('Weekly re-plan parse failed', { stopReason: result.stopReason, len: (result.text || '').length });
      await writeUsageLog(uid, 'refreshWeeklyPlan', {
        tokensIn: result.tokensIn, tokensOut: result.tokensOut, durationMs: Date.now() - startTime,
        success: false, errorType: 'parse_error', appCheckPresent,
      });
      throw new HttpsError('internal', 'Could not build your new plan. Try again.');
    }

    if (!out || !out.weeklyPlan || typeof out.weeklyPlan !== 'object')
      throw new HttpsError('internal', 'Could not build your new plan. Try again.');

    Promise.all([
      recordTokenUsage(uid, 'refreshWeeklyPlan', result.tokensIn + result.tokensOut),
      writeUsageLog(uid, 'refreshWeeklyPlan', {
        tokensIn: result.tokensIn, tokensOut: result.tokensOut, durationMs: Date.now() - startTime,
        success: true, appCheckPresent,
      }),
      flagAbuseIfNeeded(uid, 'refreshWeeklyPlan', result.tokensIn + result.tokensOut),
    ]).catch(() => {});

    return {
      changeSummary: String(out.changeSummary || 'Your plan has been refreshed based on this week.').slice(0, 300),
      weeklyPlan: out.weeklyPlan,
    };
  }
);

// ─── Automated weekly parent reports ────────────────────────────────────────────
// Every week Prova emails each parent a branded summary of their child's practice,
// with zero teacher effort. The teacher collects parent emails on the Parent
// Contacts page (users/{teacherUid}.parentEmails = { studentUid: 'parent@email' }).
// This mirrors the data the client-side sendParentReport compiles for its PDF, but
// composes the HTML server-side and delivers it by email via Resend.

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function nameFor(u) {
  if (!u) return 'Someone';
  if (u.username && u.username.trim()) return u.username.trim();
  if (u.name && u.name.trim()) return u.name.trim();
  if (u.email) return String(u.email).split('@')[0];
  return 'Someone';
}

// Same rule as the client liveStreak(): a stored streak only counts if the last
// session was today or yesterday. Computed in UTC on the server (a day of skew vs
// the student's local midnight is acceptable for a weekly email).
function liveStreak(u) {
  const streak = u.streak || 0;
  if (streak <= 0 || !u.lastSessionDate) return 0;
  const last = new Date(u.lastSessionDate).toDateString();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  return last === today || last === yesterday ? streak : 0;
}

// Compile one student's weekly report and return { subject, html }. `teacher` is the
// teacher's full user doc (carries the attendance map + name); no extra read needed.
async function buildStudentReport(student, teacher) {
  // Last 14 daily logs → minutes keyed by their (UTC) date key, matching how
  // sessionHistory logs are stored.
  const logsSnap = await db
    .collection('sessionHistory').doc(student.uid).collection('logs')
    .orderBy('date', 'desc').limit(14).get();
  const logMap = {};
  logsSnap.forEach((d) => { logMap[d.id] = d.data().totalMinutes || 0; });

  const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(); dt.setUTCHours(0, 0, 0, 0); dt.setUTCDate(dt.getUTCDate() - i);
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    days.push({ label: DOW[dt.getUTCDay()], mins: logMap[key] || 0 });
  }
  const weekMins = days.reduce((s, d) => s + d.mins, 0);
  const daysPracticed = days.filter((d) => d.mins > 0).length;
  const maxMins = Math.max(1, ...days.map((d) => d.mins));

  const name = nameFor(student);
  const streak = liveStreak(student);
  const assigned = Array.isArray(student.assignedTasks) ? student.assignedTasks.length : 0;
  const done = Array.isArray(student.assignedTasks) ? student.assignedTasks.filter((t) => t.completed).length : 0;
  const h = Math.floor(weekMins / 60); const m = weekMins % 60;
  const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;

  // Lesson attendance / marks / latest note from the teacher's attendance map
  // (recorded on the lesson calendar) over the last ~term.
  let attPct = null, avgMark = null, missed = 0, note = null;
  const att = teacher.attendance && typeof teacher.attendance === 'object' ? teacher.attendance : {};
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 91);
  const cutoffYmd = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  let present = 0, late = 0, absent = 0, markSum = 0, markCount = 0, latestNoteDate = '';
  Object.values(att).forEach((r) => {
    if (!r || r.studentUid !== student.uid || (r.date || '') < cutoffYmd) return;
    if (r.status === 'present') present++;
    else if (r.status === 'late') late++;
    else if (r.status === 'absent') absent++;
    if (r.mark) { markSum += r.mark; markCount++; }
    if (r.note && (r.date || '') >= latestNoteDate) { note = r.note; latestNoteDate = r.date || ''; }
  });
  const denom = present + late + absent;
  const attended = present + late;
  if (denom > 0) { missed = absent; attPct = Math.round((attended / denom) * 100); }
  if (markCount > 0) avgMark = (markSum / markCount).toFixed(1);

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Everything below is EMAIL-SAFE HTML: table layout + inline styles on every
  // element, no <style> block, no flexbox. Desktop clients (Outlook & friends)
  // strip <style> and don't do flex, which collapsed the old design into bare
  // stacked text. No background colours are set anywhere so the report sits on
  // the client's own light/dark background (forced dark fills get inverted by
  // dark-mode mail apps); text inherits the client's colour, secondary text
  // uses a mid-tone that reads on both. Cards are borders only.
  const FONT = "font-family:-apple-system,'SF Pro Display',Helvetica,Arial,sans-serif;";
  const MID = 'color:#7A8AAD;';     // secondary text — legible on white AND black
  const BORDER = 'border:1px solid #2A3A5C;border-radius:16px;';
  const CHART_H = 96;               // px height of the tallest possible bar

  // Bars get server-computed PIXEL heights (an email can't do flex-grow).
  const barCells = days.map((d) => {
    const h = d.mins > 0 ? Math.max(6, Math.round((d.mins / maxMins) * CHART_H)) : 3;
    return `<td align="center" valign="bottom" style="height:${CHART_H}px;padding:0 4px;"><div style="width:100%;max-width:34px;height:${h}px;background-color:#3B82F6;background:linear-gradient(180deg,#3B82F6,#22D3EE);border-radius:5px;font-size:0;line-height:0;">&nbsp;</div></td>`;
  }).join('');
  const barLabels = days.map((d) => `<td align="center" style="${FONT}padding-top:8px;font-size:11px;font-weight:700;${MID}">${d.label}</td>`).join('');
  // When there's no practice all week, an empty chart box is confusing — show a
  // clear message instead (and this "quiet week" is itself the signal to a parent).
  const chartInner = weekMins > 0
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${barCells}</tr><tr>${barLabels}</tr></table>`
    : `<div style="${FONT}font-size:14px;${MID}text-align:center;padding:38px 0;">No practice logged this week yet</div>`;

  // Stat cards, paired into 2-across table rows with 12px gutters.
  const stats = [
    [timeStr, 'Practiced this week'],
    [`${daysPracticed}/7`, 'Days practiced'],
    [`${streak} 🔥`, 'Day streak'],
    [`${done}/${assigned}`, 'Tasks completed'],
  ];
  if (attPct != null) stats.push([`${attPct}%`, `Lessons attended${missed ? ` · ${missed} missed` : ''}`]);
  if (avgMark != null) stats.push([`${avgMark}/5 ⭐`, 'Average lesson mark']);
  const statCell = (s) => s
    ? `<td width="47%" valign="top" style="${BORDER}padding:16px 18px;"><div style="${FONT}font-size:24px;font-weight:800;">${s[0]}</div><div style="${FONT}font-size:13px;${MID}padding-top:5px;">${s[1]}</div></td>`
    : '<td width="47%"></td>';
  const statRows = [];
  for (let i = 0; i < stats.length; i += 2) {
    if (i > 0) statRows.push('<tr><td height="12" colspan="3" style="font-size:0;line-height:0;">&nbsp;</td></tr>');
    statRows.push(`<tr>${statCell(stats[i])}<td width="12" style="font-size:0;">&nbsp;</td>${statCell(stats[i + 1])}</tr>`);
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"></head>
<body style="margin:0;padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;"><tr><td style="padding:36px 24px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="${FONT}font-size:16px;font-weight:800;letter-spacing:2px;">PROVA<span style="color:#3B82F6;">.</span></td>
<td align="right" style="${FONT}font-size:12px;${MID}">${escHtml(today)}</td>
</tr></table>

<div style="${FONT}font-size:27px;font-weight:800;letter-spacing:-0.4px;line-height:1.15;padding-top:26px;">${escHtml(name)}'s practice report</div>
<div style="${FONT}font-size:14px;${MID}padding-top:7px;">This week · ${escHtml(student.level || 'Beginner')} ${escHtml(student.instrument || 'Guitar')}</div>

<div style="${FONT}font-size:11px;font-weight:700;letter-spacing:1px;${MID}text-transform:uppercase;padding:28px 0 10px;">Minutes practiced each day</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${BORDER}"><tr><td style="padding:16px;">${chartInner}</td></tr></table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">${statRows.join('')}</table>

${note ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;${BORDER}"><tr><td style="padding:16px 20px;"><div style="${FONT}font-size:16px;font-style:italic;">“${escHtml(note)}”</div><div style="${FONT}font-size:13px;${MID}padding-top:7px;">— ${escHtml(nameFor(teacher))}</div></td></tr></table>` : ''}

<div style="${FONT}font-size:12px;${MID}text-align:center;padding-top:32px;">Sent with Prova · your child's music practice coach</div>

</td></tr></table>
</td></tr></table>
</body></html>`;

  return { subject: `${name}'s practice report — this week`, html };
}

// Deliver one email through Resend's REST API.
async function sendReportEmail({ to, subject, html, apiKey }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REPORT_FROM, to: [to], subject, html }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`resend ${resp.status}: ${body.slice(0, 300)}`);
  }
  return resp.json().catch(() => ({}));
}

// Send every parent report for one teacher. `opts.overrideEmail` redirects ALL
// emails to one address (for testing); `opts.onlyStudentUid` limits to one student.
async function sendReportsForTeacher(teacher, apiKey, opts = {}) {
  const parentEmails = teacher.parentEmails && typeof teacher.parentEmails === 'object' ? teacher.parentEmails : {};
  const entries = Object.entries(parentEmails);
  let sent = 0, skipped = 0, failed = 0;
  for (const [studentUid, rawEmail] of entries) {
    if (opts.onlyStudentUid && studentUid !== opts.onlyStudentUid) continue;
    const parentEmail = (opts.overrideEmail || String(rawEmail || '')).trim();
    if (!parentEmail || !parentEmail.includes('@')) { skipped++; continue; }
    try {
      const studentSnap = await db.collection('users').doc(studentUid).get();
      if (!studentSnap.exists) { skipped++; continue; }
      const student = { uid: studentUid, ...studentSnap.data() };
      // Only ever report on your own linked students.
      if (student.teacherUid && student.teacherUid !== teacher.uid) { skipped++; continue; }
      const { subject, html } = await buildStudentReport(student, teacher);
      await sendReportEmail({ to: parentEmail, subject, html, apiKey });
      sent++;
    } catch (e) {
      console.error('[parent-report] failed for student', studentUid, e.message);
      failed++;
    }
  }
  return { sent, skipped, failed, total: entries.length };
}

// Whether an auto-report batch is due for a teacher, given their chosen cadence
// and when the last batch went out. The job wakes WEEKLY, so 'weekly' is always
// due; longer cadences gate on elapsed days since the last send. Anything else
// (including the default/unset value) is 'off' — auto-send is opt-in.
function autoReportDue(cadence, lastAutoReportAt) {
  if (cadence === 'weekly') return true;
  const last = lastAutoReportAt ? new Date(lastAutoReportAt).getTime() : 0;
  const days = last ? (Date.now() - last) / 86400000 : Infinity;
  if (cadence === 'fortnightly') return days >= 13;   // ~every 2nd weekly run
  if (cadence === 'monthly') return days >= 27;        // ~every 4th weekly run
  return false;                                        // 'off' / unknown
}

// Weekly automated run. Each teacher opts in and picks a cadence (reportCadence
// on their user doc — default off). After a batch, records lastAutoReportAt and
// drops a notification in the teacher's own inbox so they know it went out.
exports.sendWeeklyParentReports = onSchedule(
  {
    schedule: REPORT_SCHEDULE,
    timeZone: REPORT_TIMEZONE,
    secrets: [RESEND_API_KEY],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const apiKey = RESEND_API_KEY.value();
    if (!apiKey) { console.error('[parent-report] RESEND_API_KEY not set — skipping run'); return; }
    const teachersSnap = await db.collection('users').where('role', '==', 'teacher').get();
    let teachers = 0, sent = 0, skipped = 0, failed = 0;
    for (const t of teachersSnap.docs) {
      const teacher = { uid: t.id, ...t.data() };
      if (!teacher.parentEmails || Object.keys(teacher.parentEmails).length === 0) continue;
      // FREE LAUNCH: no Studio gate — auto reports available to all teachers.
      const cadence = teacher.reportCadence || 'off';   // opt-in: unset = off
      if (!autoReportDue(cadence, teacher.lastAutoReportAt)) continue;
      teachers++;
      const r = await sendReportsForTeacher(teacher, apiKey);
      sent += r.sent; skipped += r.skipped; failed += r.failed;

      const nowIso = new Date().toISOString();
      await t.ref.set({ lastAutoReportAt: nowIso, lastAutoReportCount: r.sent }, { merge: true }).catch(() => {});
      if (r.sent > 0) {
        await db.collection('users').doc(t.id).collection('inbox').add({
          type: 'reports_sent',
          title: 'Parent reports sent',
          body: `${r.sent} report${r.sent === 1 ? '' : 's'} emailed to parents`,
          data: { count: r.sent },
          read: false,
          createdAt: nowIso,
        }).catch(() => {});
      }
    }
    console.log(`[parent-report] weekly run: ${teachers} teachers due, ${sent} sent, ${skipped} skipped, ${failed} failed`);
  },
);

// Teacher-triggered "send now" — powers the Parent Contacts "Email parents now"
// button and lets a report be tested on demand without waiting for Sunday.
// data: { studentUid?: string, testEmail?: string }
exports.sendParentReportsNow = onCall(
  { secrets: [RESEND_API_KEY], timeoutSeconds: 180 },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Please sign in.');
    const apiKey = RESEND_API_KEY.value();
    if (!apiKey) throw new HttpsError('failed-precondition', 'Email is not set up yet.');

    const meSnap = await db.collection('users').doc(uid).get();
    const teacher = { uid, ...(meSnap.data() || {}) };
    if (teacher.role !== 'teacher') throw new HttpsError('permission-denied', 'Teachers only.');
    // FREE LAUNCH: no Studio gate — parent reports free for all teachers.

    // Cap manual sends per teacher per day so the button can't be used to spam.
    await checkRateLimit(uid, 'sendParentReportsNow');

    const testEmail = typeof request.data?.testEmail === 'string' ? request.data.testEmail.trim() : '';
    const studentUid = typeof request.data?.studentUid === 'string' ? request.data.studentUid : '';

    const r = await sendReportsForTeacher(teacher, apiKey, {
      onlyStudentUid: studentUid || null,
      overrideEmail: testEmail || null,
    });
    return r;
  },
);

// ─── Admin: full account deletion ───────────────────────────────────────────────
// Powers the admin panel's "Delete account & data" button — honours the privacy
// policy's deletion promise in one shot: chats (both sides), history, limits,
// logs, profile (incl. inbox subcollection), Storage uploads, and finally the
// auth user. Locked to the founders' UIDs (mirror of the panel + firestore.rules).
const ADMIN_UIDS = [
  '0ZC25xoENxWUcyLYAmDjSAiuCEQ2', // Ethan
];

exports.adminDeleteUser = onCall({ timeoutSeconds: 300 }, async (request) => {
  if (!request.auth || !ADMIN_UIDS.includes(request.auth.uid))
    throw new HttpsError('permission-denied', 'Admins only.');
  const uid = String(request.data?.uid || '').trim();
  if (!uid) throw new HttpsError('invalid-argument', 'uid required.');
  if (ADMIN_UIDS.includes(uid))
    throw new HttpsError('failed-precondition', 'Refusing to delete an admin account.');

  const report = { chatsDeleted: 0, collectionsDeleted: 0, storagePrefixes: 0 };

  // 1-to-1 chats: find them via the user's conversation index, delete each
  // thread (messages included) and the other participant's index entry.
  try {
    const convs = await db.collection('userChats').doc(uid).collection('conversations').get();
    for (const c of convs.docs) {
      const chatId = c.id;
      try { await db.recursiveDelete(db.collection('chats').doc(chatId)); report.chatsDeleted++; } catch (e) { /* best effort */ }
      const other = chatId.split('_').find((p) => p && p !== uid);
      if (other) {
        try { await db.collection('userChats').doc(other).collection('conversations').doc(chatId).delete(); } catch (e) { /* best effort */ }
      }
    }
  } catch (e) { /* best effort */ }

  // Root docs + all their subcollections (users/{uid} includes the inbox).
  for (const col of ['userChats', 'sessionHistory', 'rateLimits', 'usageLogs', 'users']) {
    try { await db.recursiveDelete(db.collection(col).doc(uid)); report.collectionsDeleted++; } catch (e) { /* best effort */ }
  }

  // Uploaded media (proof clips, resource photos).
  const bucket = admin.storage().bucket('prova-583c9.firebasestorage.app');
  for (const prefix of [`chatMedia/proof_${uid}/`, `chatMedia/resource_${uid}/`]) {
    try { await bucket.deleteFiles({ prefix }); report.storagePrefixes++; } catch (e) { /* best effort */ }
  }

  // Finally the login itself.
  try {
    await admin.auth().deleteUser(uid);
  } catch (e) {
    if (e.code !== 'auth/user-not-found')
      throw new HttpsError('internal', 'Data removed but auth deletion failed: ' + e.message);
  }
  return { ok: true, ...report };
});

// ─── cleanupDeletedUser ───────────────────────────────────────────────────────
// Delete an account's Firestore document whenever its login goes away.
//
// The in-app "Delete account" flow already removes the document before the
// login, so this is not about that path. It's about every other way an account
// disappears — deleted from the Firebase console, removed by an admin, cleaned
// up by a script. Those only touch Auth, and the users/{uid} document is left
// behind for ever.
//
// Those leftovers are not harmless. A stale document keeps the person's email
// in the users collection, so looking somebody up by address returns two rows:
// the account they actually sign into, and a record nobody can read. A gig
// invite was delivered to one of these and simply never arrived — the client
// took the first match, and Firestore orders equality matches by document id.
//
// v1 API on purpose: Auth delete triggers have no v2 equivalent. It runs
// happily alongside the v2 functions in this file.
exports.cleanupDeletedUser = functionsV1.auth.user().onDelete(async (user) => {
  const ref = admin.firestore().doc(`users/${user.uid}`);
  try {
    // Sub-collections (inbox) don't go with the parent — remove them first.
    const inbox = await ref.collection('inbox').listDocuments();
    await Promise.all(inbox.map((d) => d.delete()));
    await ref.delete();
    console.log(`cleanupDeletedUser: removed users/${user.uid} (${user.email || 'no email'})`);
  } catch (err) {
    console.error(`cleanupDeletedUser: failed for ${user.uid}`, err);
  }
});

// ─── pushOnInboxWrite ─────────────────────────────────────────────────────────
// Turn an in-app notification into a real one on the person's lock screen.
//
// Everything in users/{uid}/inbox already renders under the bell — gig invites,
// assigned tasks, lesson notes. But the bell only speaks to someone who has
// already opened Prova, which meant a gig invite could sit unread for days.
// This fires on the same write, so the phone buzzes whether the app is open,
// backgrounded or closed.
//
// Triggering on the inbox rather than adding a send() call at each site is
// deliberate: every notification the app already knows how to create gets push
// for free, and a new type can never forget to.
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

exports.pushOnInboxWrite = functionsV1.firestore
  .document('users/{uid}/inbox/{noteId}')
  .onCreate(async (snap, context) => {
    const { uid } = context.params;
    const note = snap.data() || {};

    const userSnap = await admin.firestore().doc(`users/${uid}`).get();
    const tokens = Object.keys(userSnap.data()?.pushTokens || {});
    if (!tokens.length) return;   // never signed in on a device, or denied push

    const messages = tokens.map((to) => ({
      to,
      sound: 'default',
      title: note.title || 'Prova',
      body: note.body || '',
      // The app reads this on tap to open the right screen — see
      // NotificationsScreen for the types it knows how to render.
      data: { type: note.type || 'default', noteId: context.params.noteId, ...(note.data || {}) },
    }));

    let receipts = [];
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'accept-encoding': 'gzip, deflate' },
        body: JSON.stringify(messages),
      });
      const json = await res.json();
      receipts = Array.isArray(json?.data) ? json.data : [];
    } catch (err) {
      console.error('pushOnInboxWrite: send failed', err);
      return;
    }

    // Prune tokens Expo tells us are dead — app deleted, device wiped. Left
    // alone they accumulate for ever and every future send wastes a slot on
    // them. DeviceNotRegistered is the only error that means "gone"; the rest
    // are transient and must not cost someone their registration.
    const dead = receipts
      .map((r, i) => (r?.status === 'error' && r?.details?.error === 'DeviceNotRegistered'
        ? tokens[i] : null))
      .filter(Boolean);

    if (dead.length) {
      const updates = {};
      dead.forEach((t) => { updates[`pushTokens.${t}`] = admin.firestore.FieldValue.delete(); });
      await admin.firestore().doc(`users/${uid}`).update(updates).catch(() => {});
      console.log(`pushOnInboxWrite: pruned ${dead.length} dead token(s) for ${uid}`);
    }
  });
