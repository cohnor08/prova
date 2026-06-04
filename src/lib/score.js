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

// Prestige ladder — 7 tiers split into III/II/I divisions, topped by Legend.
// Early divisions are close together (rank up after a session or two for quick
// wins); the gaps stretch out near the top so high ranks feel earned. `min` is
// the Prova Score needed to reach that rank.
export const RANKS = [
  { name: 'Bronze I',       min: 0,     emoji: '🥉', color: '#CD7F32' },
  { name: 'Bronze II',      min: 200,   emoji: '🥉', color: '#CD7F32' },
  { name: 'Bronze III',     min: 450,   emoji: '🥉', color: '#CD7F32' },
  { name: 'Silver I',       min: 800,   emoji: '🥈', color: '#BFC1C2' },
  { name: 'Silver II',      min: 1200,  emoji: '🥈', color: '#BFC1C2' },
  { name: 'Silver III',     min: 1700,  emoji: '🥈', color: '#BFC1C2' },
  { name: 'Gold I',         min: 2400,  emoji: '🥇', color: '#FFD700' },
  { name: 'Gold II',        min: 3200,  emoji: '🥇', color: '#FFD700' },
  { name: 'Gold III',       min: 4200,  emoji: '🥇', color: '#FFD700' },
  { name: 'Platinum I',     min: 5500,  emoji: '🔷', color: '#3FC1C9' },
  { name: 'Platinum II',    min: 7000,  emoji: '🔷', color: '#3FC1C9' },
  { name: 'Platinum III',   min: 9000,  emoji: '🔷', color: '#3FC1C9' },
  { name: 'Diamond I',      min: 11500, emoji: '💎', color: '#5AC8FA' },
  { name: 'Diamond II',     min: 14500, emoji: '💎', color: '#5AC8FA' },
  { name: 'Diamond III',    min: 18000, emoji: '💎', color: '#5AC8FA' },
  { name: 'Master I',       min: 22000, emoji: '🟣', color: '#9B59B6' },
  { name: 'Master II',      min: 27000, emoji: '🟣', color: '#9B59B6' },
  { name: 'Master III',     min: 33000, emoji: '🟣', color: '#9B59B6' },
  { name: 'Grandmaster I',  min: 40000, emoji: '⚔️', color: '#E74C3C' },
  { name: 'Grandmaster II', min: 50000, emoji: '⚔️', color: '#E74C3C' },
  { name: 'Grandmaster III',min: 62000, emoji: '⚔️', color: '#E74C3C' },
  { name: 'Legend',         min: 80000, emoji: '🏆', color: '#FFA000' },
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
