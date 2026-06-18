// Teacher ↔ student linking.
//
// The link is stored on the STUDENT as `teacherUid` (the teacher finds their
// students by querying for it). The join-code flow below is student-initiated,
// so it needs no special Firestore rules — the student only writes their own doc.

import {
  doc, getDoc, updateDoc, collection, query, where, getDocs,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { ensureChatThread } from './chat';

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

// Student links to a teacher by their join code. Writes the student's own
// `teacherUid` (owner write — always allowed). Returns the teacher's name.
export async function linkTeacherByCode(studentUid, rawCode) {
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) throw new Error('Enter your teacher’s code.');
  const snap = await getDocs(query(collection(db, 'users'), where('teacherCode', '==', code)));
  if (snap.empty) throw new Error('No teacher found with that code. Double-check it.');
  const teacher = snap.docs[0];
  if (teacher.id === studentUid) throw new Error("That's your own code.");
  await updateDoc(doc(db, 'users', studentUid), { teacherUid: teacher.id });
  const d = teacher.data();
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
