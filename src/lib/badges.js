// Badge engine — computes the stats snapshot badges are judged on, and awards
// newly earned badges (persisted to the user doc so they never un-earn, e.g.
// streak badges survive a broken streak).
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { BADGES } from '../constants/badges';
import { track } from './analytics';

export function badgeStats(u = {}) {
  const tasks = Array.isArray(u.assignedTasks) ? u.assignedTasks : [];
  const songs = Array.isArray(u.learningSongs) ? u.learningSongs : [];
  return {
    streak: u.streak || 0,
    totalMinutes: u.totalMinutes || 0,
    totalSessions: u.totalSessions || 0,
    provaScore: u.provaScore || 0,
    tasksCompleted: tasks.filter((t) => t.completed || (t.timesCompleted || 0) > 0).length,
    songSteps: songs.reduce((n, s) => n + ((s.steps || []).filter((st) => st.done).length), 0),
    goalsCompleted: (Array.isArray(u.personalGoals) ? u.personalGoals : []).filter((g) => g.done).length,
  };
}

// Returns the list of freshly earned badges (already persisted). The caller
// should merge `badges` into local state and celebrate.
export async function awardNewBadges(uid, userData) {
  const earned = userData?.badges || {};
  const stats = badgeStats(userData);
  const fresh = BADGES.filter((b) => !earned[b.id] && b.check(stats));
  if (fresh.length === 0) return [];
  const now = new Date().toISOString();
  const patch = {};
  fresh.forEach((b) => { patch[`badges.${b.id}`] = now; });
  try {
    await updateDoc(doc(db, 'users', uid), patch);
  } catch (e) {
    return []; // never block anything on badges
  }
  fresh.forEach((b) => track('badge_earned', { id: b.id }));
  return fresh;
}
