// Control of the NATIVE launch screen (expo-splash-screen), separate from the
// animated IntroSplash that plays once React is up.
//
// The plugin was configured in app.json but nothing ever called it, so the
// native splash auto-hid the instant React rendered its first frame — which is
// earlier than the intro's WebView paints. For those few frames the bare root
// view showed through, and an unpainted root view is white: the white square
// around the brand mark at launch.
//
// So: hold the native splash, and only drop it once the intro reports it has
// been laid out. The timeout is the important half — if that signal never
// arrives (the maintenance screen renders instead of the intro, say), the
// splash must still come down or the app looks frozen at launch.
import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

const FALLBACK_MS = 2500;

let held = false;
let released = false;
let fallback = null;

export function holdNativeSplash() {
  if (Platform.OS === 'web' || held) return;
  held = true;
  SplashScreen.preventAutoHideAsync().catch(() => {});
  fallback = setTimeout(hideNativeSplash, FALLBACK_MS);
}

export function hideNativeSplash() {
  if (Platform.OS === 'web' || released) return;
  released = true;
  if (fallback) { clearTimeout(fallback); fallback = null; }
  SplashScreen.hideAsync().catch(() => {});
}
