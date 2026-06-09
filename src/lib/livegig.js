import {
  doc, setDoc, deleteDoc, collection, query, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { auth, db, ignorePermissionDenied } from './firebase';

// The public web page the audience scans into (Firebase Hosting default domain).
export const GIG_BASE_URL = 'https://prova-583c9.web.app';

export function gigRequestUrl(gigId) {
  return `${GIG_BASE_URL}/?g=${gigId}`;
}

function newGigId() {
  // Short, readable code so the QR/URL stays small.
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Publishes a live gig so the audience can see the setlist and request songs.
// Returns the gigId, or null if it couldn't be created.
export async function startLiveGig(setlist, tipLink) {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const gigId = newGigId();
  const songs = (setlist?.songs || []).map((s) => ({
    title: s.title || '', artist: s.artist || '',
  }));
  await setDoc(doc(db, 'liveGigs', gigId), {
    ownerUid: uid,
    name: setlist?.name || "Tonight's set",
    songs,
    tipLink: tipLink || '',
    active: true,
    createdAt: serverTimestamp(),
  });
  return gigId;
}

// Ends the gig (audience page shows "show ended").
export async function endLiveGig(gigId) {
  if (!gigId) return;
  await deleteDoc(doc(db, 'liveGigs', gigId)).catch(() => {});
}

// Streams incoming requests; calls back with an array of { title, artist }.
export function watchGigRequests(gigId, cb) {
  const q = query(collection(db, 'liveGigs', gigId, 'requests'), orderBy('ts', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => d.data()));
  }, ignorePermissionDenied);
}
