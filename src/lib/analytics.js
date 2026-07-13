// Product analytics (PostHog). Tracks WHICH features get used — never message
// contents, emails, or anything sensitive. Users are identified by uid only.
// The key below is PostHog's public write-only project token — it can submit
// events but never read data or touch billing, and is designed to ship in apps.
// Dashboard: https://us.posthog.com (project "Prova", id 509741).
import PostHog from 'posthog-react-native';

let posthog = null;
try {
  posthog = new PostHog('phc_BKRbkxDDcGLrdq65MHsjsGVusPGPk2oYECmSiughmRME', {
    host: 'https://us.i.posthog.com',
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
