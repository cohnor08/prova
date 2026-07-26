// Prova's free/paid split, in one place.
//
// ─── MASTER SWITCH ──────────────────────────────────────────────────────────
// PAYWALL_ENABLED gates EVERYTHING here. While it's false (the free launch),
// every check below returns "allowed" and the app sells nothing — behaviour is
// identical to today. Flip it to true ONLY when:
//   1. the real Apple IAP / RevenueCat purchase flow is wired, AND
//   2. the free version is already approved and live.
// Because of this switch, the whole paywall branch can be merged safely without
// changing anything users see — nothing activates until we deliberately turn it
// on. See prova-monetization-plan in memory for the full plan.
export const PAYWALL_ENABLED = false;

import { Alert } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { track } from './analytics';

// ─── Limits (decided 2026-07-26) ────────────────────────────────────────────
export const TEACHER_FREE_STUDENT_LIMIT = 3;
export const FREE_GAME_ROUNDS_PER_DAY = 1;
export const ASK_PROVA_FREE_PER_DAY = 2;
export const ASK_PROVA_PAID_PER_DAY = 25;

// ─── Entitlement checks ─────────────────────────────────────────────────────
// These read the plan fields on the user doc. After a purchase, RevenueCat's
// active entitlement is mirrored onto the user doc (role 'personal' / teacherPlan
// 'pro'), so these keep working unchanged. While PAYWALL_ENABLED is false they
// short-circuit to "entitled" for everyone.

export const isPersonal = (u) =>
  !PAYWALL_ENABLED || (!!u && (u.role === 'personal' || (u.planType || '').startsWith('personal')));

export const isProTeacher = (u) =>
  !PAYWALL_ENABLED || (!!u && u.teacherPlan === 'pro');

// May this account start another mini-game round today? counterField is the
// per-game daily counter on the user doc ('earTraining' | 'fretGame' | …).
// Fails OPEN — a network hiccup must never lock a paying user out.
export async function allowGameRound(counterField) {
  if (!PAYWALL_ENABLED) return true;
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return true;
    const u = (await getDoc(doc(db, 'users', uid))).data() || {};
    if (isPersonal(u) || u.role === 'teacher') return true;
    const today = new Date().toISOString().split('T')[0];
    const c = u[counterField] || {};
    const played = c.date === today ? (c.rounds || 0) : 0;
    return played < FREE_GAME_ROUNDS_PER_DAY;
  } catch (e) {
    return true;
  }
}

// How many Ask Prova questions may this user send per day?
// Paid (Personal / any teacher) get the higher cap; free get the taste.
export function askProvaDailyLimit(u) {
  if (!PAYWALL_ENABLED) return Infinity;
  const paid = isPersonal(u) || isProTeacher(u) || u?.role === 'teacher';
  return paid ? ASK_PROVA_PAID_PER_DAY : ASK_PROVA_FREE_PER_DAY;
}

// May this account send another Ask Prova message today? Fails OPEN.
// Reads the user's daily counter (askProvaUsage: { date, count }).
export async function allowAskProva() {
  if (!PAYWALL_ENABLED) return true;
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return true;
    const u = (await getDoc(doc(db, 'users', uid))).data() || {};
    const limit = askProvaDailyLimit(u);
    if (limit === Infinity) return true;
    const today = new Date().toISOString().split('T')[0];
    const c = u.askProvaUsage || {};
    const used = c.date === today ? (c.count || 0) : 0;
    return used < limit;
  } catch (e) {
    return true;
  }
}

// ─── Upsell prompts ─────────────────────────────────────────────────────────
// Shown when a free user taps a locked feature. Both route to the in-app
// Paywall screen — NEVER to email or an external link (that's what Apple 3.1.1
// rejected). No-ops while PAYWALL_ENABLED is false (features never lock, so
// these never fire anyway).

export function personalUpsell(navigation, message) {
  if (!PAYWALL_ENABLED) return;
  track('upsell_shown', { plan: 'personal' });
  Alert.alert('Prova Personal', message, [
    { text: 'Not now', style: 'cancel' },
    { text: 'See Personal', onPress: () => { try { navigation?.navigate('Paywall'); } catch (e) {} } },
  ]);
}

// Tolerant of both call styles so existing callers keep working:
//   studioUpsell(navigation, message)  ← preferred (routes to Paywall)
//   studioUpsell(message)              ← legacy (shows the prompt, no route)
// TODO(paywall wiring): give TeacherScreen/TeacherHomeScreen `navigation` and
// pass it here, plus register the 'Paywall' route, so "See Studio" navigates.
export function studioUpsell(navigation, message) {
  if (!PAYWALL_ENABLED) return;
  if (typeof navigation === 'string') { message = navigation; navigation = null; }
  track('upsell_shown', { plan: 'studio' });
  const buttons = [{ text: 'Not now', style: 'cancel' }];
  if (navigation) {
    buttons.push({ text: 'See Studio', onPress: () => { try { navigation.navigate('Paywall'); } catch (e) {} } });
  }
  Alert.alert('Prova Studio', message, buttons);
}
