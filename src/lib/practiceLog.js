// Shared "real practice happened" accounting.
//
// The app has two kinds of practice: the student's own plan sessions (closed
// out by Today's finalizeDay, which writes minutes/streak/logs) and everything
// else — teacher-assigned task laps, learn-a-song steps. The "everything else"
// used to award points only, so a student who did all their assigned work
// still showed "0m practiced · dead streak" on the parent report, the Progress
// charts and the teacher's Practice Pulse. These helpers let those flows feed
// the same stats.
import { doc, setDoc, increment } from 'firebase/firestore';
import { db } from './firebase';

// Streak + lastSessionDate updates for "practised just now" — the same
// today/yesterday rule finalizeDay uses, so applying both in either order on
// the same day never double-increments: once today is stamped, the streak
// simply holds.
export function practiceStreakUpdates(u = {}) {
  const todayStr = new Date().toDateString();
  const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
  const lastStr = u.lastSessionDate ? new Date(u.lastSessionDate).toDateString() : null;
  const streak = lastStr === todayStr
    ? (u.streak || 1)
    : lastStr === yesterdayStr ? (u.streak || 0) + 1 : 1;
  return { streak, lastSessionDate: new Date().toISOString() };
}

// Add minutes to today's sessionHistory log (the source for the Progress
// charts, teacher heatmaps and the parent report). Same UTC date key and
// merge+increment shape as finalizeDay; deliberately does NOT touch
// sessionCount (that still means "plan days closed out"). Best-effort.
export function logPracticeMinutes(uid, mins, category) {
  if (!uid || !mins) return Promise.resolve();
  const dateKey = new Date().toISOString().split('T')[0];
  return setDoc(doc(db, 'sessionHistory', uid, 'logs', dateKey), {
    date: dateKey,
    totalMinutes: increment(mins),
    categories: { [category]: increment(mins) },
  }, { merge: true }).catch(() => {});
}
