// When a teacher's task shows on a student's Today list, and which ones have
// moved to Past tasks. Mirrored in web/webapp/index.html (onTodayList /
// pastTasks) — keep the two in step.
//
// A finished task leaves Today, with two exceptions: one finished EARLY stays,
// ticked, until its due date has passed, and one the student brought back from
// Past tasks (`revived`) stays until they finish it again. An unfinished task
// never leaves, however late it is. `revived` lives on the student's copy only;
// `completed` stays true, so the teacher's view of what was done never changes.

const dayStart = (v) => new Date(v).setHours(0, 0, 0, 0);

export const dueNotPassed = (t) => !!t?.dueDate && dayStart(t.dueDate) >= dayStart(Date.now());

export const onTodayList = (t) => !t?.completed || !!t.revived || dueNotPassed(t);

// Done as far as the student's list is concerned — a brought-back task is open again.
export const isDoneForStudent = (t) => !!t?.completed && !t.revived;

// Newest first: by due date, else by when it was set.
export function pastTasks(tasks) {
  return (Array.isArray(tasks) ? tasks : [])
    .filter((t) => t && !onTodayList(t))
    .sort((p, q) => new Date(q.dueDate || q.assignedAt || 0) - new Date(p.dueDate || p.assignedAt || 0));
}

// Bring a past task back to Today, or put it away again.
export function setRevived(tasks, taskId, on) {
  return (Array.isArray(tasks) ? tasks : []).map((t) => {
    if (t.id !== taskId) return t;
    if (on) return { ...t, revived: true };
    const { revived, ...rest } = t;
    return rest;
  });
}
