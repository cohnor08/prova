// Prova Score — an ever-increasing, XP-style number. It only ever goes UP, so
// players always feel like they're earning and want to come back.
//
// Points are BANKED at the moment a session is completed (see TodayScreen),
// not recomputed from current stats. That's deliberate: the current streak
// resets, so a recomputed score could fall — which would kill the whole point.
// Banking each session's points means the total is permanent.

export const POINTS_PER_MIN   = 2;   // 1 hour of practice = 120 pts
export const SESSION_BONUS    = 50;  // flat reward just for finishing a session
export const STREAK_DAY_BONUS = 10;  // × your current streak day — long streaks pay more

const QUALITY_BONUS = { just_right: 30, too_hard: 20, too_easy: 15 };

// Points earned for completing ONE session right now. The streak term means a
// 20-day streak session is worth far more than a day-1 one — so the longer your
// streak, the more it stings to break it (that's the hook).
export function sessionPoints(minutes, streakDay, rating) {
  return Math.round(
    (minutes || 0) * POINTS_PER_MIN
    + SESSION_BONUS
    + (streakDay || 0) * STREAK_DAY_BONUS
    + (QUALITY_BONUS[rating] || 0),
  );
}

// For users who practised before the score field existed, estimate a starting
// total from their lifetime stats (historical per-session streaks are lost, so
// we approximate with the current streak + last rating). Used once, then the
// banked total takes over.
export function backfillScore(u = {}) {
  return Math.round(
    (u.totalMinutes || 0) * POINTS_PER_MIN
    + (u.totalSessions || 0) * SESSION_BONUS
    + (u.streak || 0) * STREAK_DAY_BONUS
    + (QUALITY_BONUS[u.lastSessionRating] || 0),
  );
}

// The score to show / rank by: the banked total once it exists, else the backfill.
export function displayScore(u = {}) {
  return typeof u.provaScore === 'number' ? u.provaScore : backfillScore(u);
}

// Tiers give a sense of progress on an unbounded number: every TIER_SIZE points
// is a new tier, so there's always a "next tier" to chase.
export const TIER_SIZE = 1000;
export function scoreTier(score) {
  const s = Math.max(0, Math.round(score));
  const tier = Math.floor(s / TIER_SIZE) + 1;
  const into = s % TIER_SIZE;
  return { tier, into, toNext: TIER_SIZE - into, progress: into / TIER_SIZE };
}

// Thousands separators (Hermes doesn't reliably do toLocaleString formatting).
export const formatScore = (n) =>
  String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
