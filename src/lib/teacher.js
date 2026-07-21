// Teacher ↔ student linking.
//
// The link is stored on the STUDENT as `teacherUid` (the teacher finds their
// students by querying for it). The join-code flow below is student-initiated,
// so it needs no special Firestore rules — the student only writes their own doc.

import {
  doc, getDoc, updateDoc, collection, query, where, getDocs,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { track } from './analytics';
import { ensureChatThread } from './chat';
import { TEACHER_FREE_STUDENT_LIMIT } from './entitlements';

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

// Student links to a teacher by their join code. A student can be connected to
// MULTIPLE teachers: the link is added to `teacherUids` (and `teacherUid` stays
// as the "primary"/first teacher for backward compatibility). Owner write —
// always allowed. Returns the teacher's name.
export async function linkTeacherByCode(studentUid, rawCode) {
  track('student_linked');
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) throw new Error('Enter your teacher’s code.');
  const snap = await getDocs(query(collection(db, 'users'), where('teacherCode', '==', code)));
  if (snap.empty) throw new Error('No teacher found with that code. Double-check it.');
  const teacher = snap.docs[0];
  if (teacher.id === studentUid) throw new Error("That's your own code.");
  const d = teacher.data();
  const cur = (await getDoc(doc(db, 'users', studentUid))).data() || {};
  const already = teacherIdsOf(cur);
  if (already.includes(teacher.id)) throw new Error("You're already connected to this teacher.");
  // FREE LAUNCH (Apple 3.1.1): no student cap — re-add with the Studio paywall.
  const nextUids = [...already, teacher.id];
  const update = { teacherUids: nextUids };
  if (!cur.teacherUid) update.teacherUid = teacher.id; // first teacher = primary
  await updateDoc(doc(db, 'users', studentUid), update);
  // Auto-create the chat thread so it appears in the student's Messages right away.
  try {
    await ensureChatThread({
      aUid: studentUid,
      aEmail: auth.currentUser?.email || '',
      bUid: teacher.id,
      bEmail: d.email || '',
    });
  } catch (e) { /* non-fatal — chat just won't be pre-seeded */ }
  return { uid: teacher.id, name: d.username || d.email?.split('@')[0] || 'your teacher' };
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
