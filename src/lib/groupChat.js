import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// A class group chat is one shared thread for a teacher's class. Unlike the
// 1:1 DMs (chatId = sorted uid pair), there are N participants, so it lives in
// its own `groupChats/{groupId}` collection with a `memberUids` array. Members
// find their groups with a `where('memberUids','array-contains', me)` query.
//
// It is an ANNOUNCEMENTS channel: only the owning teacher can post; students
// can only react. memberUids ALWAYS includes the teacher: [teacherUid, ...uids].

// Quick reactions students can leave on a teacher's post.
export const GROUP_REACTIONS = ['👍', '🔥', '❤️', '👏', '🎸'];

// Teachers may create several groups (per class, or an ad-hoc pick), so each
// creation gets a unique id rather than a class-derived one.
function newGroupId(teacherUid) {
  return `g_${teacherUid}_${Date.now()}`;
}

// Create a class group chat owned by the teacher. memberUids gets the teacher
// folded in automatically. Returns the new groupId.
export async function createGroupChat({ teacherUid, name, studentUids, classId }) {
  const groupId = newGroupId(teacherUid);
  const memberUids = [...new Set([teacherUid, ...(studentUids || [])])];
  await setDoc(doc(db, 'groupChats', groupId), {
    teacherUid,
    classId: classId || null,
    name: (name || 'Class').trim(),
    memberUids,
    createdAt: serverTimestamp(),
    lastMessage: '',
    lastMessageAt: serverTimestamp(),
    lastSenderUid: '',
  });
  return groupId;
}

// Update a group's name and/or roster (teacher only).
export async function updateGroupChat(groupId, { name, studentUids, teacherUid }) {
  const patch = {};
  if (typeof name === 'string') patch.name = name.trim();
  if (studentUids) patch.memberUids = [...new Set([teacherUid, ...studentUids])];
  if (Object.keys(patch).length) await updateDoc(doc(db, 'groupChats', groupId), patch);
}

// Delete a group chat (teacher only). Removing the parent doc makes the thread
// unreadable for everyone — it stops showing up in the members' lists.
export async function deleteGroupChat(groupId) {
  await deleteDoc(doc(db, 'groupChats', groupId));
}

// Teacher posts a message. senderName is stored so the bubble can be labelled
// without a per-uid lookup, and the preview fields bump the thread to the top.
export async function sendGroupMessage({ groupId, senderUid, senderName, text }) {
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  await addDoc(collection(db, 'groupChats', groupId, 'messages'), {
    senderUid,
    senderName: senderName || '',
    text: trimmed,
    reactions: {},
    timestamp: serverTimestamp(),
  });
  await updateDoc(doc(db, 'groupChats', groupId), {
    lastMessage: trimmed,
    lastMessageAt: serverTimestamp(),
    lastSenderUid: senderUid,
  });
}

// Toggle my reaction on a message. `current` is the message's existing reactions
// map ({ emoji: [uids] }); we compute the next map and write only that field
// (the security rules allow any member to change ONLY `reactions`).
export async function toggleReaction({ groupId, messageId, emoji, uid, current }) {
  const reactions = {};
  // Deep-copy so we never mutate the live snapshot.
  Object.keys(current || {}).forEach((k) => { reactions[k] = [...(current[k] || [])]; });
  const list = reactions[emoji] || [];
  if (list.includes(uid)) {
    const next = list.filter((u) => u !== uid);
    if (next.length) reactions[emoji] = next; else delete reactions[emoji];
  } else {
    reactions[emoji] = [...list, uid];
  }
  await updateDoc(doc(db, 'groupChats', groupId, 'messages', messageId), { reactions });
}
