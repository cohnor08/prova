// The NATIVE launch screen (expo-splash-screen) is the whole intro now — the
// brand mark on #171A21, held for a beat, then faded into the app. There is no
// JS animation on top of it any more.
//
// Two things have to be true for that to look deliberate:
//
//   * It must not disappear the instant React renders. Left alone,
//     expo-splash-screen hides on the first frame, which is far too quick to
//     read as anything, and it briefly uncovered the root view.
//   * It must not wait on the app being ready either, or a warm start would
//     flash past and a cold start would sit there for seconds. So the app says
//     "ready" and we hold anyway until MIN_VISIBLE_MS has passed.
//
// The failsafe is the important half: if "ready" never arrives (a crash on
// boot, the maintenance screen, a failed auth restore) the splash still comes
// down rather than leaving the app looking frozen at launch.
import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

const MIN_VISIBLE_MS = 1000;   // how long the mark sits there
const FADE_MS = 350;
const FAILSAFE_MS = 6000;

let shownAt = 0;
let held = false;
let released = false;
let failsafe = null;

export function holdNativeSplash() {
  if (Platform.OS === 'web' || held) return;
  held = true;
  shownAt = Date.now();
  SplashScreen.preventAutoHideAsync().catch(() => {});
  // Cross-fade out rather than cutting straight to the app.
  SplashScreen.setOptions?.({ duration: FADE_MS, fade: true });
  failsafe = setTimeout(() => hideNativeSplash(true), FAILSAFE_MS);
}

// `force` skips the minimum hold — only the failsafe uses it.
export function hideNativeSplash(force = false) {
  if (Platform.OS === 'web' || released) return;
  const waited = Date.now() - shownAt;
  if (!force && waited < MIN_VISIBLE_MS) {
    setTimeout(() => hideNativeSplash(), MIN_VISIBLE_MS - waited);
    return;
  }
  released = true;
  if (failsafe) { clearTimeout(failsafe); failsafe = null; }
  SplashScreen.hideAsync().catch(() => {});
}
