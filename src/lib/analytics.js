// Product analytics (PostHog). Tracks WHICH features get used — never message
// contents, emails, or anything sensitive. Users are identified by uid only.
// The key below is PostHog's public write-only project token — it can submit
// events but never read data or touch billing, and is designed to ship in apps.
// Dashboard: https://us.posthog.com (project "Prova", id 509741).
import PostHog from 'posthog-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LogBox, Platform } from 'react-native';

// customStorage (below) stops PostHog's recurring expo-file-system writes, but
// its one-time distinctId migration on a fresh install still pokes that
// deprecated API once — the call is caught and harmless, yet it flashes an
// on-screen deprecation box. Silence just that one third-party message; real
// warnings are untouched.
if (Platform.OS !== 'web' && LogBox && LogBox.ignoreLogs) {
  LogBox.ignoreLogs([/Method \w+ imported from "expo-file-system" is deprecated/]);
}

// PostHog prefers expo-file-system for its event queue, but SDK 54 made that
// package's top-level methods (readAsStringAsync/writeAsStringAsync) THROW at
// runtime — so every queue write failed and it spammed a deprecation warning.
// Hand it AsyncStorage instead (a plain key→string store, which is exactly what
// PostHog falls back to when expo-file-system isn't present). PostHogRNStorage
// only ever calls getItem/setItem on this object.
const posthogStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
};

let posthog = null;
try {
  posthog = new PostHog('phc_BKRbkxDDcGLrdq65MHsjsGVusPGPk2oYECmSiughmRME', {
    host: 'https://us.i.posthog.com',
    customStorage: posthogStorage,
  });
} catch (e) { /* e.g. web build — analytics silently off */ }

// Every call is fire-and-forget and swallowed on failure — analytics must
// never break or slow the app.
export function track(event, props) {
  try { posthog && posthog.capture(event, props); } catch (e) { /* ignore */ }
}

// Tie events to the account (uid only — no email) with a few useful traits.
export function identifyUser(uid, { role, instrument, level } = {}) {
  try { posthog && posthog.identify(uid, { role: role || 'unknown', instrument: instrument || null, level: level || null }); } catch (e) { /* ignore */ }
}

// On logout/account deletion, detach the identity from this device.
export function resetAnalytics() {
  try { posthog && posthog.reset(); } catch (e) { /* ignore */ }
}
