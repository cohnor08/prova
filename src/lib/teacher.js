// Teacher ↔ student linking.
//
// The link is stored on the STUDENT as `teacherUids` (+ legacy `teacherUid`;
// the teacher finds their students by querying for them). Joining is a
// request the teacher approves — see requestTeacherByCode below.

import {
  doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, onSnapshot,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { track } from './analytics';
import { callFunction } from './claude';
import { sendNotification } from './inbox';
import { displayName } from './displayName';

// Avoid ambiguous characters (0/O, 1/I) so codes are easy to read out loud.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateTeacherCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// Ensure the teacher has a join code, creating one once if missing. Returns it.
export async function ensureTeacherCode(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const existing = snap.data()?.teacherCode;
  if (existing) return existing;
  const code = generateTeacherCode();
  await updateDoc(ref, { teacherCode: code });
  return code;
}

// A student's teachers, as an array (migrates the legacy single teacherUid).
export function teacherIdsOf(userData = {}) {
  const arr = Array.isArray(userData.teacherUids) ? userData.teacherUids : [];
  if (userData.teacherUid && !arr.includes(userData.teacherUid)) return [userData.teacherUid, ...arr];
  return arr;
}

// Student asks to join a teacher by their join code. Since 2026-09-26 this
// does NOT connect them: it creates joinRequests/{student}_{teacher} (pending)
// and the teacher approves it from their Students page. The link itself is
// written server-side by answerJoinRequest — rules stop a student adding a
// teacher to their own doc. Asking again after a decline re-opens the same
// request. Returns the teacher's { uid, name }.
export async function requestTeacherByCode(student, rawCode) {
  track('student_join_requested');
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) throw new Error('Enter your teacher’s code.');
  const snap = await getDocs(query(collection(db, 'users'), where('teacherCode', '==', code)));
  if (snap.empty) throw new Error('No teacher found with that code. Double-check it.');
  const teacher = snap.docs[0];
  if (teacher.id === student.uid) throw new Error("That's your own code.");
  const d = teacher.data();
  const name = d.username || d.email?.split('@')[0] || 'your teacher';
  if (teacherIdsOf(student).includes(teacher.id)) throw new Error("You're already connected to this teacher.");
  const ref = doc(db, 'joinRequests', `${student.uid}_${teacher.id}`);
  const existing = await getDoc(ref).catch(() => null);
  const prev = existing?.exists() ? existing.data() : null;
  if (prev?.status === 'pending') throw new Error(`You've already asked ${name} — waiting for them to accept.`);
  const fields = {
    status: 'pending',
    createdAt: new Date().toISOString(),
    studentName: displayName(student),
    studentEmail: student.email || auth.currentUser?.email || '',
    instrument: student.instrument || '',
    level: student.level || '',
  };
  if (prev) await updateDoc(ref, fields);
  else await setDoc(ref, { ...fields, studentUid: student.uid, teacherUid: teacher.id });
  sendNotification(teacher.id, {
    type: 'join_request',
    title: `${fields.studentName} wants to join your studio`,
    body: 'Accept or decline them on your Students page.',
    data: { studentUid: student.uid },
  }).catch(() => {});
  return { uid: teacher.id, name };
}

export function withdrawJoinRequest(studentUid, teacherUid) {
  return updateDoc(doc(db, 'joinRequests', `${studentUid}_${teacherUid}`), { status: 'withdrawn' });
}

// Live join requests. field: 'studentUid' (a student's own) or 'teacherUid'
// (everyone asking to join this teacher). Pending only; oldest first.
export function watchJoinRequests(field, uid, cb) {
  const q = query(collection(db, 'joinRequests'), where(field, '==', uid), where('status', '==', 'pending'));
  return onSnapshot(q, (s) => cb(s.docs.map((x) => ({ id: x.id, ...x.data() }))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))), () => cb([]));
}

// Teacher: accept or decline one or many. Server-side (answerJoinRequest).
export async function answerJoinRequests(studentUids, accept) {
  const r = await callFunction('answerJoinRequest', { studentUids, accept });
  return r || { done: 0 };
}

// Disconnect ONE teacher. Removes them from teacherUids and, if they were the
// primary, promotes another (or clears it). Owner write.
export async function unlinkTeacher(studentUid, teacherId) {
  const ref = doc(db, 'users', studentUid);
  const cur = (await getDoc(ref)).data() || {};
  const nextUids = teacherIdsOf(cur).filter((x) => x !== teacherId);
  const update = { teacherUids: nextUids };
  if (cur.teacherUid === teacherId) update.teacherUid = nextUids[0] || null;
  await updateDoc(ref, update);
  return nextUids;
}

// Every student connected to this teacher — via the legacy `teacherUid` OR the
// `teacherUids` array — merged and de-duplicated. Returns an array of
// { uid, ...data }.
export async function queryMyStudents(uid) {
  const [a, b] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('teacherUid', '==', uid))),
    getDocs(query(collection(db, 'users'), where('teacherUids', 'array-contains', uid))),
  ]);
  const map = new Map();
  for (const d of [...a.docs, ...b.docs]) map.set(d.id, { uid: d.id, ...d.data() });
  return [...map.values()];
}
