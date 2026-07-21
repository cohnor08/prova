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

// ─── FREE LAUNCH (Apple 3.1.1) ───────────────────────────────────────────────
// The App Store requires that any purchasable digital content be sold through
// Apple In-App Purchase. Until the real IAP paywall ships, the app sells NOTHING:
// every account is fully unlocked and there are zero purchase surfaces. The tier
// helpers below are deliberately switched OFF — they report "entitled" for
// everyone and the upsell prompts are no-ops. The real gating logic is kept in
// git history and re-enabled alongside the StoreKit paywall.

export const isPersonal = (_u) => true;

export const isProTeacher = (_u) => true;

// Free-launch: everyone may play unlimited mini-game rounds.
export async function allowGameRound(_counterField) {
  return true;
}

// Free-launch: no upsell prompts (they were the "upgrade" / "email us to
// upgrade" surfaces Apple flagged). No-ops until IAP ships.
export function personalUpsell(_navigation, _message) {}

export function studioUpsell(_message) {}
