import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

// Look somebody up by email — and pick the RIGHT one when more than one
// document carries that address.
//
// This exists because of a real failure: a gig invite went to a user document
// created months earlier that had no login behind it, while the account the
// person actually uses got nothing. Every caller was doing `snap.docs[0]`, and
// Firestore returns equality matches ordered by document ID, so the duplicate
// won purely because its id sorted first.
//
// Duplicates happen — a doc left behind when an account is deleted and the
// address is reused, a half-finished signup, a migration. The lookup has to
// survive them rather than silently deliver to a dead record.
//
// We can't see Firebase Auth from the client, so "real" is judged on what a
// live account leaves behind: it has been through onboarding, it has a name,
// it has practised, and it is the more recent one.
function liveliness(u) {
  let score = 0;
  if (u.onboardingComplete === true) score += 8;
  if ((u.username || '').trim()) score += 4;
  if ((u.totalMinutes || 0) > 0 || (u.provaScore || 0) > 0) score += 3;
  if (u.role) score += 1;
  return score;
}

// → { uid, ...data } | null
export async function findUserByEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return null;
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', clean)));
  if (snap.empty) return null;

  const candidates = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  if (candidates.length === 1) return candidates[0];

  return candidates.sort((a, b) => {
    const d = liveliness(b) - liveliness(a);
    if (d !== 0) return d;
    // Tie-break on recency — the newer record is the one still in use.
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  })[0];
}
