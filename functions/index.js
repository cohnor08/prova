const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const API_URL = 'https://api.anthropic.com/v1/messages';

// Per-user daily limits
const RATE_LIMITS = {
  generatePracticePlan: 3,
  adjustSessionFromRating: 10,
};

async function checkRateLimit(uid, action) {
  const today = new Date().toISOString().split('T')[0];
  const ref = db.doc(`rateLimits/${uid}/actions/${action}`);
  const limit = RATE_LIMITS[action];

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const count = data.date === today ? (data.count || 0) : 0;

    if (count >= limit) {
      throw new HttpsError(
        'resource-exhausted',
        `Daily limit reached (${limit} per day). Try again tomorrow.`
      );
    }

    tx.set(ref, { date: today, count: count + 1 });
  });
}

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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new HttpsError('internal', `Claude API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } finally {
    clearTimeout(timeout);
  }
}

// Allowed values for input validation
const ALLOWED_INSTRUMENTS = new Set(['Guitar', 'Bass']);
const ALLOWED_LEVELS = new Set(['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite']);
const ALLOWED_DAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const ALLOWED_RATINGS = new Set(['too_easy', 'just_right', 'too_hard']);

function validateProfile(p) {
  if (!ALLOWED_INSTRUMENTS.has(p.instrument)) throw new HttpsError('invalid-argument', 'Invalid instrument');
  if (!ALLOWED_LEVELS.has(p.level)) throw new HttpsError('invalid-argument', 'Invalid level');
  if (!Array.isArray(p.availableDays) || p.availableDays.length === 0 || !p.availableDays.every(d => ALLOWED_DAYS.has(d)))
    throw new HttpsError('invalid-argument', 'Invalid availableDays');
  if (typeof p.dailyDuration !== 'number' || p.dailyDuration < 5 || p.dailyDuration > 240)
    throw new HttpsError('invalid-argument', 'dailyDuration must be 5–240 minutes');
  if (!Array.isArray(p.goals) || p.goals.length > 10 || p.goals.some(g => typeof g !== 'string' || g.length > 100))
    throw new HttpsError('invalid-argument', 'Invalid goals');
  if (!Array.isArray(p.skills) || p.skills.length > 10 || p.skills.some(s => typeof s !== 'string' || s.length > 100))
    throw new HttpsError('invalid-argument', 'Invalid skills');
}

exports.generatePracticePlan = onCall(
  { region: 'us-central1', secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 180, memory: '256MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

    const uid = request.auth.uid;
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

    const text = await callClaude(ANTHROPIC_API_KEY.value(), prompt, 4000);
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  }
);

exports.adjustSessionFromRating = onCall(
  { region: 'us-central1', secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: '256MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

    const uid = request.auth.uid;
    await checkRateLimit(uid, 'adjustSessionFromRating');

    const { sessions, rating, feedback } = request.data;

    if (!ALLOWED_RATINGS.has(rating)) throw new HttpsError('invalid-argument', 'Invalid rating');
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

    const text = await callClaude(ANTHROPIC_API_KEY.value(), prompt, 1000);
    return JSON.parse(text);
  }
);
