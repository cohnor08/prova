import { auth } from './firebase';

const FUNCTIONS_BASE = 'https://us-central1-prova-583c9.cloudfunctions.net';

async function callFunction(name, data, timeoutMs = 120000) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');

  // Manually fetch ID token — httpsCallable doesn't do this reliably in React Native
  const idToken = await user.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      // Firebase callable protocol wraps payload in { data: ... }
      body: JSON.stringify({ data }),
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Server error ${response.status}: ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Bad response (${response.status}): ${text.slice(0, 200)}`);
    }

    if (json.error) {
      throw new Error(json.error.message || `Function error: ${response.status}`);
    }

    return json.result;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generatePracticePlan(userProfile) {
  return callFunction('generatePracticePlan', userProfile, 240000);
}

export async function adjustSessionFromRating(sessions, rating, feedback) {
  return callFunction('adjustSessionFromRating', { sessions, rating, feedback: feedback || null }, 60000);
}

// Generate an ordered gig setlist. `gig` = { instrument, level, setting,
// audience, vibe, songCount, library }. Returns { name, songs: [{title, artist, note}] }.
export async function generateSetlist(gig) {
  return callFunction('generateSetlist', gig, 60000);
}

// Generate (or fetch the cached) step-by-step plan for learning ONE song.
// `song` = { instrument, title, artist }. Returns
// { key, title, artist, instrument, overview, steps: [{id,title,summary,tasks,targetBpm,yt}], cached }.
// Cache hits are free and don't count against the weekly limit.
export async function generateSongPlan(song) {
  return callFunction('generateSongPlan', song, 120000);
}

// Weekly "week in review" re-plan. `profile` = the usual plan inputs, `feedback`
// = this week's per-session ratings/notes. Returns { changeSummary, weeklyPlan }.
export async function refreshWeeklyPlan(profile, feedback) {
  return callFunction('refreshWeeklyPlan', { profile, feedback }, 240000);
}

// Ask the AI coach a free-text playing question. `history` = prior
// [{ role:'user'|'prova', text }] turns for context. Returns { answer }.
export async function askProva({ question, instrument, level, history }) {
  return callFunction('askProva', { question, instrument, level, history }, 60000);
}

// Email this week's parent report now (teacher only). Reports also send
// automatically every week; this is the on-demand "send now" / test path.
// opts: { studentUid? } to send just one, { testEmail? } to redirect all to one
// address for testing. Returns { sent, skipped, failed, total }.
export async function sendParentReportsNow(opts = {}) {
  return callFunction('sendParentReportsNow', {
    studentUid: opts.studentUid || null,
    testEmail: opts.testEmail || null,
  }, 120000);
}
