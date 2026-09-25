// When lessons happen, and what a teacher needs to know walking into one.
//
// Shared word-for-word with the web apps (scripts/sync-shared.cjs mirrors this
// file into web/shared/), so the phone, Studio and the student web app agree
// on which days a lesson lands on. There used to be eight hand-written copies
// of that rule; a moved lesson would have shown in some and not others. Keep
// it free of imports — that's what lets it be shared.
//
// Lesson shape (users/{teacherUid}.lessons[]):
//   { id, studentUid, studentName, date: 'YYYY-MM-DD', time: 'HH:MM', note,
//     repeat: 'weekly' | 'none',
//     skip?: ['YYYY-MM-DD'],                 // weekly dates that don't happen (moved or cancelled once)
//     movedFrom?: { lessonId, date } }       // a one-off made by moving another lesson
//
// Lesson notes live on the teacher's `attendance` map, keyed
// `${lessonId}__${date}` → { status, mark, note, studentUid, studentName, date, attachments }.

const pad2 = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = String(s || '').split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };

export function occursOn(lesson, ds) {
  if (!lesson || !lesson.date) return false;
  if (Array.isArray(lesson.skip) && lesson.skip.includes(ds)) return false;
  if (lesson.repeat === 'weekly') {
    return ds >= lesson.date && parseYmd(ds).getDay() === parseYmd(lesson.date).getDay();
  }
  return lesson.date === ds;
}

// A lesson's start as a Date (local time).
export function lessonStart(ds, time) {
  const d = parseYmd(ds);
  const [h, m] = String(time || '').split(':').map(Number);
  if (!isNaN(h)) d.setHours(h, m || 0, 0, 0);
  return d;
}

// Every lesson from `from` onward for `days` days, soonest first. A lesson that
// started under an hour ago still counts — it's the one happening now.
export function upcomingLessons(lessons, from = new Date(), days = 28) {
  const out = [];
  const cutoff = from.getTime() - 60 * 60000;
  for (let i = 0; i < days; i++) {
    const d = new Date(from); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i);
    const ds = ymd(d);
    (lessons || []).forEach((l) => {
      if (!occursOn(l, ds)) return;
      const at = lessonStart(ds, l.time);
      if (at.getTime() >= cutoff) out.push({ lesson: l, date: ds, at });
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

// "4:00 PM" from "16:00"
export function timeLabel(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (isNaN(h)) return hhmm || '';
  return `${(h % 12) || 12}:${pad2(m || 0)} ${h >= 12 ? 'PM' : 'AM'}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "Today" / "Tomorrow" / "Thu 2 Oct"
export function dayLabel(ds, now = new Date()) {
  const today = ymd(now);
  const t = new Date(now); t.setDate(t.getDate() + 1);
  if (ds === today) return 'Today';
  if (ds === ymd(t)) return 'Tomorrow';
  const d = parseYmd(ds);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// "in 25 min" / "in 3 hr" / "now" — only meaningful for today.
export function startsIn(at, now = new Date()) {
  const mins = Math.round((at - now) / 60000);
  if (mins <= 0) return 'now';
  if (mins < 60) return `in ${mins} min`;
  return `in ${Math.round(mins / 60)} hr`;
}

// Move ONE occurrence of a lesson (or cancel it: no newDate). A weekly lesson
// keeps its other weeks — only that date is skipped. The new time is a
// one-off, so accepting "can we do Friday this week" never rewrites the series.
export function moveOccurrence(lessons, { lessonId, date, newDate, newTime }, newId) {
  const src = (lessons || []).find((l) => l.id === lessonId);
  if (!src) return lessons || [];
  let next = src.repeat === 'weekly'
    ? lessons.map((l) => (l.id === lessonId ? { ...l, skip: [...new Set([...(l.skip || []), date])] } : l))
    : lessons.filter((l) => l.id !== lessonId);
  if (newDate) {
    next = [...next, {
      id: newId || `${Date.now()}`,
      studentUid: src.studentUid,
      studentName: src.studentName,
      date: newDate,
      time: newTime || src.time,
      note: src.note || '',
      repeat: 'none',
      movedFrom: { lessonId, date },
    }];
  }
  return next;
}

// Times the teacher is already teaching on a day — shown to a student picking
// a new slot, without saying who with.
export function busyTimes(lessons, ds, exceptLessonId) {
  return (lessons || [])
    .filter((l) => l.id !== exceptLessonId && occursOn(l, ds))
    .map((l) => l.time)
    .filter(Boolean)
    .sort();
}

// Everything worth knowing walking into a lesson, from what's already stored:
// the last lesson's note, practice since then, how the tasks set since then
// went, and any proof videos to watch. No AI and nothing invented.
//   logs: { 'YYYY-MM-DD': minutes } — the student's sessionHistory (UTC keys)
export function lessonPrep({ lesson, date, student, teacherUid, attendance, logs }) {
  const uid = student && student.uid;
  const past = Object.entries(attendance || {})
    .map(([key, rec]) => ({ key, ...(rec || {}) }))
    .filter((r) => r.studentUid === uid && r.date && r.date < date)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = past[0] || null;
  // Practice counts from the day after the last lesson; with no lesson on
  // record, the last seven days.
  let since;
  if (last) since = last.date;
  else { const d = parseYmd(date); d.setDate(d.getDate() - 7); since = ymd(d); }

  let minutes = 0, days = 0;
  Object.entries(logs || {}).forEach(([k, m]) => {
    const n = Number(m) || 0;
    if (k > since && k <= date && n > 0) { minutes += n; days += 1; }
  });

  const mine = (Array.isArray(student && student.assignedTasks) ? student.assignedTasks : [])
    .filter((t) => !t.teacherUid || t.teacherUid === teacherUid);
  const sinceIso = parseYmd(since).toISOString();
  const tasks = mine
    .filter((t) => !t.completed || (t.completedAt || t.assignedAt || '') >= sinceIso)
    .slice(-6)
    .map((t) => {
      const mins = Math.round((t.practicedSec || 0) / 60);
      return {
        title: t.title || 'Task',
        done: !!t.completed,
        minutes: mins,
        state: t.completed ? 'done' : mins > 0 ? 'started' : 'untouched',
      };
    });
  const proofs = mine
    .filter((t) => t.proofUrl && (!t.proofAt || t.proofAt >= sinceIso))
    .map((t) => ({ title: t.title || 'Task', url: t.proofUrl, type: t.proofType || 'video' }));

  return {
    lastLesson: last ? { date: last.date, note: last.note || '', status: last.status || null, mark: last.mark || null } : null,
    since,
    minutes,
    days,
    tasks,
    proofs,
    lessonNote: (lesson && lesson.note) || '',
  };
}
