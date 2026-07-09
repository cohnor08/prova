import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';

// Programs = an ordered list of packs (one per week) a teacher assigns ONCE;
// each week's tasks then release automatically. There's no server, so the
// teacher's app is the "cron": whenever they open it, advancePrograms() releases
// any weeks that have come due. All writes stay within what the rules allow —
// the teacher writes only the student's `assignedTasks` and their own doc.

const WEEK_MS = 7 * 86400000;

// Turn a pack task template into a live assignedTask for a recipient.
function toAssigned(t, { teacherUid, programId, programName, weekIndex, cls, idSuffix }) {
  return {
    title: t.title,
    description: t.description || '',
    youtube: t.youtube || '',
    song: '',
    dueDate: null,
    durationMin: t.durationMin || 0,
    completed: false,
    assignedAt: new Date().toISOString(),
    teacherUid,
    programId,
    programName,
    programWeek: weekIndex + 1,
    ...(cls || {}),
    id: `${programId}_w${weekIndex + 1}_${idSuffix}`,
  };
}

// How many weeks of a program should be released by now (1-based, capped).
export function dueWeek(startDate, totalWeeks) {
  const start = startDate ? new Date(startDate).getTime() : Date.now();
  return Math.min(totalWeeks, Math.floor((Date.now() - start) / WEEK_MS) + 1);
}

// Build the assignedTask objects for a range of weeks [fromWeek, toWeek).
export function tasksForWeeks(ap, fromWeek, toWeek, teacherUid) {
  const out = [];
  for (let w = fromWeek; w < toWeek; w++) {
    (ap.weeks[w] || []).forEach((t, ti) => {
      out.push(toAssigned(t, {
        teacherUid,
        programId: ap.programId,
        programName: ap.name,
        weekIndex: w,
        cls: ap.classId ? { classId: ap.classId, className: ap.className } : null,
        idSuffix: `${(ap.recipientUid || '').slice(0, 5)}_${ti}`,
      }));
    });
  }
  return out;
}

// Release any newly-due weeks for every program this teacher has assigned.
// Safe to call often (idempotent via `weeksAssigned`).
export async function advancePrograms(teacherUid) {
  if (!teacherUid) return;
  let meSnap;
  try { meSnap = await getDoc(doc(db, 'users', teacherUid)); } catch (e) { return; }
  const assigned = Array.isArray(meSnap.data()?.assignedPrograms) ? meSnap.data().assignedPrograms : [];
  if (assigned.length === 0) return;

  let changed = false;
  const next = [];
  for (const ap of assigned) {
    const weeks = ap.weeks || [];
    const due = dueWeek(ap.startDate, weeks.length);
    const have = ap.weeksAssigned || 0;
    if (due > have && ap.recipientUid) {
      const tasks = tasksForWeeks(ap, have, due, teacherUid);
      if (tasks.length) {
        try {
          await updateDoc(doc(db, 'users', ap.recipientUid), { assignedTasks: arrayUnion(...tasks) });
          next.push({ ...ap, weeksAssigned: due });
          changed = true;
          continue;
        } catch (e) { /* leave this one for next time */ }
      }
    }
    next.push(ap);
  }
  if (changed) {
    try { await updateDoc(doc(db, 'users', teacherUid), { assignedPrograms: next }); } catch (e) { /* ignore */ }
  }
}
