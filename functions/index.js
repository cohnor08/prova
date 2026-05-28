const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

// ─── Rate limits ──────────────────────────────────────────────────────────────
// Each action has a daily cap on both requests AND tokens consumed.
// Tokens are tracked using the actual usage reported by the Claude API,
// so one expensive prompt costs proportionally more quota.
const RATE_LIMITS = {
  generatePracticePlan:   { requests: 3,  tokens: 60000 },
  adjustSessionFromRating: { requests: 10, tokens: 15000 },
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
async function callClaude(apiKey, prompt, maxTokens) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

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
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new HttpsError('internal', `Claude API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      text: data.content[0].text,
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
  { ...BASE_OPTIONS, timeoutSeconds: 180, memory: '256MiB' },
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
  "description": "What to do and how",
  "duration": number_in_minutes,
  "category": "warmup" | "technique" | "theory" | "ear_training" | "repertoire" | "improvisation"
}

Rules:
- Total session durations must equal the daily practice time exactly
- Be very specific (e.g. "A minor pentatonic, positions 1–3 at 60bpm" not "practice scales")
- Always start with a warmup
- Match difficulty to the user's level
- Only include sessions for available days, set others to null

Return only valid JSON, no markdown fences, no explanation.`;

    let result;
    try {
      result = await callClaude(ANTHROPIC_API_KEY.value(), prompt, 4000);
    } catch (err) {
      await writeUsageLog(uid, 'generatePracticePlan', {
        tokensIn: 0, tokensOut: 0,
        durationMs: Date.now() - startTime,
        success: false, errorType: 'claude_error',
        appCheckPresent,
      });
      throw err;
    }

    const plan = JSON.parse(
      result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    );

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
