import {
  collection, doc, addDoc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// chatId is always the two UIDs sorted and joined — same result from either
// side and from any screen (peer DMs and teacher↔student all share one thread).
export function makeChatId(a, b) {
  return [a, b].sort().join('_');
}

// Given a chatId and my uid, return the other participant's uid.
export function otherUidFromChatId(chatId, myUid) {
  return chatId.split('_').find((u) => u !== myUid);
}

// Marks the chat as read up to now for this user, so the other participant can
// see "Read" under the messages they sent. Stored as a lastRead map on the
// chat doc, keyed by uid.
export async function markChatRead(chatId, uid) {
  await setDoc(
    doc(db, 'chats', chatId),
    { lastRead: { [uid]: serverTimestamp() } },
    { merge: true },
  );
}

// Returns 'Read' | 'Sent' for one of MY messages, given the other user's
// lastRead value (a Firestore Timestamp or ms number) and the message's own
// timestamp. Used to render the receipt under the last sent message.
export function receiptStatus(message, otherReadAt) {
  const toMs = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : (typeof v === 'number' ? v : null));
  const readMs = toMs(otherReadAt);
  const msgMs = toMs(message.timestamp) ?? (typeof message.ts === 'number' ? message.ts : null);
  return readMs != null && msgMs != null && readMs >= msgMs ? 'Read' : 'Sent';
}

// Ensures a thread exists in BOTH participants' conversation lists without
// sending a message — used to auto-create the teacher↔student chat the moment
// they're linked, so it shows up in Messages before anyone has said anything.
// Only writes a side that doesn't already have the conversation, so it never
// clobbers a real thread's last message / ordering.
export async function ensureChatThread({ aUid, aEmail, bUid, bEmail }) {
  const chatId = makeChatId(aUid, bUid);
  const aRef = doc(db, 'userChats', aUid, 'conversations', chatId);
  const bRef = doc(db, 'userChats', bUid, 'conversations', chatId);
  const [aSnap, bSnap] = await Promise.all([getDoc(aRef), getDoc(bRef)]);
  const seed = { chatId, lastMessage: '', lastMessageAt: serverTimestamp(), lastSenderUid: '' };
  const writes = [];
  if (!aSnap.exists()) writes.push(setDoc(aRef, { ...seed, otherUid: bUid, otherEmail: bEmail || '' }));
  if (!bSnap.exists()) writes.push(setDoc(bRef, { ...seed, otherUid: aUid, otherEmail: aEmail || '' }));
  if (writes.length) await Promise.all(writes);
  return chatId;
}

// Sends a message and updates both participants' conversation lists so the
// thread shows up in everyone's Messages views regardless of where it started.
export async function sendChatMessage({ chatId, senderUid, senderEmail, otherUid, otherEmail, text, media }) {
  const trimmed = (text || '').trim();
  const hasMedia = !!(media && media.url);
  if (!trimmed && !hasMedia) return;

  await addDoc(collection(db, 'chats', chatId, 'messages'), {
    senderUid,
    text: trimmed,
    ...(hasMedia ? { mediaUrl: media.url, mediaType: media.type || 'image' } : {}),
    timestamp: serverTimestamp(),
  });

  const preview = hasMedia ? (media.type === 'video' ? '🎥 Video' : '📷 Photo') : trimmed;
  const meta = {
    chatId,
    lastMessage: preview,
    lastMessageAt: serverTimestamp(),
    lastSenderUid: senderUid,
  };
  await Promise.all([
    setDoc(
      doc(db, 'userChats', senderUid, 'conversations', chatId),
      { ...meta, otherUid, otherEmail: otherEmail || '' },
      { merge: true },
    ),
    setDoc(
      doc(db, 'userChats', otherUid, 'conversations', chatId),
      { ...meta, otherUid: senderUid, otherEmail: senderEmail || '' },
      { merge: true },
    ),
  ]);
}
