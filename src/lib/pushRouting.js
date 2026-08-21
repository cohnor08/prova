// Where a tapped push should land.
//
// Without this, tapping a gig-invite banner opens Prova on whatever screen you
// left it on, and the invite you tapped is nowhere in sight — which is worse
// than no notification, because it looks broken.
//
// Kept separate from App.js because the tap can arrive before the navigator
// has mounted (a notification that launched the app from cold). The ref is set
// by App.js when the navigator is ready; anything that arrives first is held
// and replayed.
import { useEffect } from 'react';
import { createNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';

export const navigationRef = createNavigationContainerRef();

let pending = null;

// Every push routes to the bell — it renders each type properly, including
// Accept/Decline on gig invites, and it marks things read. Deep-linking each
// type to its own screen would drop that.
//
// The bell hangs off a different tab per role: students have it under Today,
// teachers under Home. Rather than plumb the role in here, ask the navigator
// which tab it actually has — the wrong guess is a silent no-op that looks
// like the notification did nothing.
function go() {
  if (!navigationRef.isReady()) return false;
  try {
    const names = navigationRef.getRootState()?.routeNames || [];
    const tab = names.includes('Today') ? 'Today' : names.includes('Home') ? 'Home' : null;
    if (!tab) return false;      // still on the auth stack — nothing to open
    navigationRef.navigate(tab, { screen: 'Notifications' });
    return true;
  } catch {
    return false;
  }
}

export function onNavigatorReady() {
  if (pending && go()) pending = null;
}

export function usePushTaps() {
  useEffect(() => {
    // Cold start: the app was launched BY the notification, so there's no
    // listener event to catch — the tap is waiting to be collected.
    Notifications.getLastNotificationResponseAsync()
      .then((res) => { if (res) { pending = true; onNavigatorReady(); } })
      .catch(() => {});

    // Warm: tapped while the app was already running or backgrounded.
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      if (!go()) pending = true;
    });
    return () => sub.remove();
  }, []);
}
