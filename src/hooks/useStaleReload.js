// Restart the app when it comes back after a long spell in the background.
//
// Leaving Prova open and returning hours later left every screen showing
// whatever it loaded last time: yesterday's plan, a stale streak, an old
// leaderboard. Screens refetch on focus, but the tab you were already on
// doesn't re-focus when the app resumes, so nothing re-read.
//
// Coming back after a short break should be instant, so this only fires past
// STALE_MS. A reload also applies any OTA update fetched in the meantime,
// which is how a fix reaches someone who never fully quits the app.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { isAppBusy } from '../lib/appBusy';

// 30 minutes: long enough that a reload is never a surprise mid-use, short
// enough that "I opened it this morning and it's still on yesterday" can't
// happen.
const STALE_MS = 30 * 60 * 1000;

export function useStaleReload(enabled = true) {
  const backgroundedAt = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const sub = AppState.addEventListener('change', async (next) => {
      if (next === 'background' || next === 'inactive') {
        // 'inactive' also fires for a notification shade or an incoming call,
        // so only start the clock once — don't let a brief blip reset it.
        if (backgroundedAt.current == null) backgroundedAt.current = Date.now();
        return;
      }
      if (next !== 'active') return;

      const since = backgroundedAt.current;
      backgroundedAt.current = null;
      if (since == null || Date.now() - since < STALE_MS) return;
      // Practising with the phone face-down for half an hour is normal use —
      // never restart out from under an open session.
      if (isAppBusy()) return;

      try {
        // In development the JS is served by Metro and reloadAsync throws.
        if (__DEV__) return;
        await Updates.reloadAsync();
      } catch {
        // Reloading is a nicety — never let a failure here break resuming.
      }
    });

    return () => sub.remove();
  }, [enabled]);
}
