// Prova's free/paid split, in one place (added 2026-07-14).
//
// STUDENTS — 'Personal' = role 'personal' (what the paywall checkout sets) or
// a personal_* planType. Personal unlocks: AI setlists, unlimited mini-game
// rounds. Free keeps: teacher tasks, daily challenge, Prova chat (rate-
// limited server-side), manual setlist building, 1 game round per day.
//
// TEACHERS — 'Studio' = teacherPlan 'pro' (no billing yet: flipped from the
// admin panel; existing teachers were grandfathered to pro). Studio unlocks:
// unlimited students (free caps at TEACHER_FREE_STUDENT_LIMIT), automated
// parent report emails, Practice Pulse + one-tap nudges.
//
// Server-enforced where it costs money (generateSetlist, parent reports);
// client checks everywhere else, consistent with the app's trust model.
import { Alert } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { track } from './analytics';

export const TEACHER_FREE_STUDENT_LIMIT = 3;
export const FREE_GAME_ROUNDS_PER_DAY = 1;

export const isPersonal = (u) =>
  !!u && (u.role === 'personal' || (u.planType || '').startsWith('personal'));

export const isProTeacher = (u) => !!u && u.teacherPlan === 'pro';

// May this account start another mini-game round today? counterField is the
// per-game daily counter on the user doc ('earTraining' | 'fretGame').
// Fails OPEN — a network hiccup must never lock a paying user out.
export async function allowGameRound(counterField) {
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

export function personalUpsell(navigation, message) {
  track('upsell_shown', { plan: 'personal' });
  Alert.alert('Prova Personal', message, [
    { text: 'Not now', style: 'cancel' },
    { text: 'See Personal', onPress: () => { try { navigation?.navigate('Paywall'); } catch (e) {} } },
  ]);
}

export function studioUpsell(message) {
  track('upsell_shown', { plan: 'studio' });
  Alert.alert(
    'Prova Studio',
    `${message}\n\nStudio upgrades are handled personally while we're in early access — email cehthoanprova@gmail.com and we'll set you up.`,
    [{ text: 'OK' }]
  );
}
