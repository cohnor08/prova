import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';

// Drop an in-app notification into another user's inbox — surfaces under the
// bell on their Today tab. Rules allow any signed-in user to create, only the
// owner to read/manage.
//
// Types the app knows how to render:
//   'gig_invite'    data: { name, date, time, fromUid, fromName } — Accept/Decline
//   'task_assigned' data: { taskTitle }
export function sendNotification(uid, { type, title, body, data }) {
  return addDoc(collection(db, 'users', uid, 'inbox'), {
    type,
    title,
    body: body || '',
    data: data || {},
    read: false,
    createdAt: new Date().toISOString(),
  });
}
