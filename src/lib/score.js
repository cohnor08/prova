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

// Named ranks themed on a musician's journey — far more motivating than
// "Tier 37". Early ranks come fast (quick dopamine hits to hook new players),
// then the gaps stretch out so the top ranks feel genuinely earned. `min` is
// the Prova Score needed to reach that rank.
export const RANKS = [
  { name: 'First Note',       min: 0,      emoji: '🎵', color: '#9CA3AF' },
  { name: 'Bedroom Strummer', min: 300,    emoji: '🎸', color: '#A1887F' },
  { name: 'Open Mic',         min: 800,    emoji: '🎤', color: '#CD7F32' },
  { name: 'Garage Band',      min: 1800,   emoji: '🚐', color: '#B08D57' },
  { name: 'Local Gig',        min: 3500,   emoji: '🍺', color: '#C0C0C0' },
  { name: 'Soundcheck',       min: 6000,   emoji: '🔊', color: '#B0C4DE' },
  { name: 'Headliner',        min: 10000,  emoji: '⭐', color: '#FFD700' },
  { name: 'Touring Act',      min: 16000,  emoji: '🚌', color: '#FFC107' },
  { name: 'Chart Climber',    min: 25000,  emoji: '📈', color: '#4FC3F7' },
  { name: 'Platinum',         min: 40000,  emoji: '💿', color: '#E5E4E2' },
  { name: 'Virtuoso',         min: 60000,  emoji: '🎼', color: '#7C4DFF' },
  { name: 'Maestro',          min: 90000,  emoji: '👑', color: '#AB47BC' },
  { name: 'Legend',           min: 130000, emoji: '🔥', color: '#FF5722' },
  { name: 'Hall of Fame',     min: 200000, emoji: '🏆', color: '#10B981' },
];

// Resolve a score to its rank + progress toward the next one. There's always a
// "next rank" to chase until the very top, where isMax flips on.
export function scoreRank(score) {
  const s = Math.max(0, Math.round(score || 0));
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (s >= RANKS[i].min) idx = i;
  const rank = RANKS[idx];
  const next = RANKS[idx + 1] || null;
  const into = s - rank.min;
  const span = next ? next.min - rank.min : 1;
  return {
    ...rank,
    index: idx,
    next,
    isMax: !next,
    into,
    toNext: next ? next.min - s : 0,
    progress: next ? into / span : 1,
  };
}

// Thousands separators (Hermes doesn't reliably do toLocaleString formatting).
export const formatScore = (n) =>
  String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
