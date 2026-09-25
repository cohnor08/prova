import { collection, addDoc, doc, getDoc, updateDoc, query, where, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { sendNotification } from './inbox';
import { moveOccurrence, dayLabel, timeLabel } from './lessonSchedule';

// "Can't make Thursday" without the texting. A student asks; the teacher
// accepts or declines with one tap; accepting moves (or cancels) just that one
// occurrence on the teacher's calendar and tells the student.
//
// lessonRequests/{id}:
//   { teacherUid, studentUid, studentName, lessonId, date, time,
//     newDate | null, newTime | null,   // null = "just cancel this one"
//     note, status: 'pending' | 'accepted' | 'declined' | 'withdrawn',
//     createdAt, answeredAt? }
// Rules: only the student creates (pending, for a teacher they're linked to);
// only the teacher answers; the student may withdraw while it's pending.

export const whenLabel = (ds, time) => `${dayLabel(ds)}${time ? ` · ${timeLabel(time)}` : ''}`;

export async function requestLessonChange({ teacherUid, student, lesson, date, newDate, newTime, note }) {
  const name = student.name || 'Your student';
  const req = {
    teacherUid,
    studentUid: student.uid,
    studentName: name,
    lessonId: lesson.id,
    date,
    time: lesson.time || '',
    newDate: newDate || null,
    newTime: newDate ? (newTime || lesson.time || '') : null,
    note: (note || '').trim().slice(0, 300),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  const ref = await addDoc(collection(db, 'lessonRequests'), req);
  sendNotification(teacherUid, {
    type: 'lesson_request',
    title: `${name} can't make ${whenLabel(date, req.time)}`,
    body: req.newDate ? `Asks to move it to ${whenLabel(req.newDate, req.newTime)}` : 'Asks to cancel this one',
    data: { requestId: ref.id },
  }).catch(() => {});
  return ref.id;
}

export function withdrawLessonRequest(id) {
  return updateDoc(doc(db, 'lessonRequests', id), { status: 'withdrawn' });
}

// Teacher side. Accepting rewrites the teacher's own lessons array (read fresh
// so a calendar edit made elsewhere isn't lost), then answers the request.
export async function answerLessonRequest(teacherUid, req, accept) {
  if (accept) {
    const snap = await getDoc(doc(db, 'users', teacherUid));
    const lessons = Array.isArray(snap.data()?.lessons) ? snap.data().lessons : [];
    const next = moveOccurrence(lessons, req);
    await updateDoc(doc(db, 'users', teacherUid), { lessons: next });
  }
  await updateDoc(doc(db, 'lessonRequests', req.id), {
    status: accept ? 'accepted' : 'declined',
    answeredAt: new Date().toISOString(),
  });
  const was = whenLabel(req.date, req.time);
  sendNotification(req.studentUid, {
    type: 'lesson_reply',
    title: accept
      ? (req.newDate ? `Lesson moved to ${whenLabel(req.newDate, req.newTime)}` : `${was} lesson cancelled`)
      : `Your lesson stays ${was}`,
    body: accept ? 'Your teacher said yes.' : "Your teacher couldn't change this one.",
    data: { requestId: req.id },
  }).catch(() => {});
}

// Live list, newest first. `field` is 'teacherUid' or 'studentUid'.
export function watchLessonRequests(field, uid, cb) {
  const q = query(collection(db, 'lessonRequests'), where(field, '==', uid));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
  }, () => cb([]));
}
