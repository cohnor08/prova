import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

const functions = getFunctions(app, 'us-central1');

export async function generatePracticePlan(userProfile) {
  const fn = httpsCallable(functions, 'generatePracticePlan', { timeout: 180000 });
  const result = await fn(userProfile);
  return result.data;
}

export async function adjustSessionFromRating(sessions, rating, feedback) {
  const fn = httpsCallable(functions, 'adjustSessionFromRating', { timeout: 60000 });
  const result = await fn({ sessions, rating, feedback: feedback || null });
  return result.data;
}
