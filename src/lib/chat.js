import {
  collection, doc, addDoc, setDoc, serverTimestamp,
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

// Sends a message and updates both participants' conversation lists so the
// thread shows up in everyone's Messages views regardless of where it started.
export async function sendChatMessage({ chatId, senderUid, senderEmail, otherUid, otherEmail, text }) {
  const trimmed = text.trim();
  if (!trimmed) return;

  await addDoc(collection(db, 'chats', chatId, 'messages'), {
    senderUid,
    text: trimmed,
    timestamp: serverTimestamp(),
  });

  const meta = {
    chatId,
    lastMessage: trimmed,
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
