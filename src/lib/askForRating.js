// Ask for an App Store rating — at a moment the person is actually pleased.
//
// Rating Prova today means leaving the app, finding it on the App Store, and
// tapping through to a review box. Almost nobody does that when they're happy;
// they do it when they're annoyed. Two weeks after launch the count was zero.
// StoreReview puts Apple's own star sheet on top of the app instead, so it's
// one tap and they never leave.
//
// iOS allows AT MOST 3 prompts per user per year and silently ignores the rest,
// so the timing matters more than the code. Every rule below exists to spend
// those three asks on people who'll answer well:
//
//   · a 7-day streak, not a finished session — anyone can finish one session,
//     a week straight means it's working for them
//   · never in the first few days, before there's anything to judge
//   · never twice within 90 days, so one user can't burn the yearly allowance
//   · never after something went wrong (see markSomethingWentWrong)
//
// What we deliberately don't do: offer points for rating. Apple rejects apps
// that incentivise reviews.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { track } from './analytics';

const LAST_ASKED = 'prova:rating:lastAsked';
const TROUBLE_AT = 'prova:rating:trouble';

const DAY = 86400000;
const MIN_DAYS_SINCE_INSTALL = 3;
const MIN_DAYS_BETWEEN_ASKS = 90;
const QUIET_AFTER_TROUBLE_MS = 10 * 60 * 1000;   // 10 minutes
const STREAK_TRIGGER = 7;

// Call when an upload fails, a save errors, the AI can't be reached — anything
// the person just watched go wrong. Asking "enjoying Prova?" ninety seconds
// after a failure is how you earn a one-star review.
export async function markSomethingWentWrong() {
  try { await AsyncStorage.setItem(TROUBLE_AT, String(Date.now())); } catch {}
}

// → true if the sheet was requested. Never throws: a rating prompt must not be
// able to break the thing that triggered it.
export async function maybeAskForRating({ streak = 0, createdAt = null } = {}) {
  try {
    if (!(await StoreReview.isAvailableAsync())) return false;
    if (!(await StoreReview.hasAction())) return false;      // user disabled it

    if (streak < STREAK_TRIGGER) return false;

    const now = Date.now();

    // Too new to have an opinion worth recording.
    if (createdAt) {
      const age = now - new Date(createdAt).getTime();
      if (Number.isFinite(age) && age < MIN_DAYS_SINCE_INSTALL * DAY) return false;
    }

    const last = Number(await AsyncStorage.getItem(LAST_ASKED)) || 0;
    if (last && now - last < MIN_DAYS_BETWEEN_ASKS * DAY) return false;

    const trouble = Number(await AsyncStorage.getItem(TROUBLE_AT)) || 0;
    if (trouble && now - trouble < QUIET_AFTER_TROUBLE_MS) return false;

    // Written BEFORE the request: if the sheet shows and the app is killed
    // mid-prompt, the ask still counts. Better to skip one than to nag.
    await AsyncStorage.setItem(LAST_ASKED, String(now));
    await StoreReview.requestReview();

    // iOS never reports whether the sheet appeared or what they chose, so this
    // records that we ASKED — not that anyone rated.
    track('rating_prompt_shown', { streak });
    return true;
  } catch {
    return false;
  }
}
