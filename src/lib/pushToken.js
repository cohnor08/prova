// Register this device for push, and keep the token on the user's doc.
//
// Everything in src/lib/notifications.js is scheduled ON the device, so it can
// only fire for things the phone already knows about — a reminder at 7pm, a
// streak saver. Nothing the SERVER learns can reach someone: a gig invite sat
// in the bell inbox until they happened to open Prova. Push is the missing
// half, and it's what lets the app say anything at all to a closed app.
//
// Tokens live at users/{uid}.pushTokens as a map keyed by the token itself:
//
//   pushTokens: { 'ExponentPushToken[xxx]': { platform, updatedAt } }
//
// A map rather than an array because one person legitimately has several
// devices, and because a map lets the sender delete a single dead token by
// key without reading the document first.
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { doc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from './firebase';

const projectId =
  Constants?.expoConfig?.extra?.eas?.projectId ??
  Constants?.easConfig?.projectId;

// → the token string, or null. Never throws: failing to register for push must
// not break signing in.
export async function registerPushToken(uid) {
  if (!uid) return null;
  // A simulator can't receive push, and asking there just fails noisily.
  if (!Device.isDevice) return null;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    // Deliberately does NOT request permission. That's asked for once, in
    // context, by ensureNotificationPermission — a permission dialog on launch
    // with no explanation is how people tap Don't Allow for ever.
    if (status !== 'granted') return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    if (!token) return null;

    await setDoc(doc(db, 'users', uid), {
      pushTokens: {
        [token]: {
          platform: Platform.OS,
          updatedAt: new Date().toISOString(),
        },
      },
    }, { merge: true });

    return token;
  } catch {
    return null;
  }
}

// Drop this device's token on sign-out, so the next person to use the phone
// doesn't get the last person's notifications.
export async function unregisterPushToken(uid) {
  if (!uid || !Device.isDevice) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    if (!token) return;
    await updateDoc(doc(db, 'users', uid), { [`pushTokens.${token}`]: deleteField() });
  } catch { /* best effort — a stale token is pruned on first send failure */ }
}
