import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { onSnapshot, doc, updateDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../lib/firebase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 8000);
    let firestoreUnsub = null;

    const authUnsub = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(timeout);
      // Tear down any listener from a previous session before (re)subscribing,
      // so signing out doesn't leave a listener attached that then fails with
      // permission-denied once the user is no longer authenticated.
      if (firestoreUnsub) { firestoreUnsub(); firestoreUnsub = null; }
      if (firebaseUser) {
        setUser(firebaseUser);

        // Check AsyncStorage first so the app loads instantly without waiting for Firestore
        const cached = await AsyncStorage.getItem(`onboarding_${firebaseUser.uid}`);
        if (cached === 'true') {
          setOnboardingComplete(true);
          setLoading(false);
        }

        // Firestore listener keeps the value fresh (e.g. after completing onboarding on another device)
        firestoreUnsub = onSnapshot(doc(db, 'users', firebaseUser.uid), async (snap) => {
          const data = snap.data() || {};
          const isComplete = data.onboardingComplete === true;
          setOnboardingComplete(isComplete);
          setRole(data.role || null);
          if (isComplete) {
            await AsyncStorage.setItem(`onboarding_${firebaseUser.uid}`, 'true');
          }
          // Normalize email to lowercase so teacher-by-email search always works.
          // Only run on fresh server data (not cache) to avoid spurious writes on reconnect.
          if (!snap.metadata.fromCache && data.email && data.email !== data.email.toLowerCase()) {
            updateDoc(doc(db, 'users', firebaseUser.uid), { email: data.email.toLowerCase() })
              .catch((err) => console.warn('Email normalise failed:', err));
          }
          setLoading(false);
        }, (err) => {
          // permission-denied is expected briefly during sign-out — ignore it.
          if (err.code !== 'permission-denied') console.warn('User snapshot error:', err);
        });
      } else {
        setUser(null);
        setOnboardingComplete(false);
        setRole(null);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      authUnsub();
      if (firestoreUnsub) firestoreUnsub();
    };
  }, []);

  return { user, onboardingComplete, setOnboardingComplete, role, loading };
}
