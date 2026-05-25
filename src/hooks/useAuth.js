import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const key = `onboarding_${firebaseUser.uid}`;
        const cached = await AsyncStorage.getItem(key);
        if (cached === 'true') {
          setOnboardingComplete(true);
        } else {
          // Firestore fallback handles multi-device and first install after data already exists
          try {
            const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
            const isComplete = snap.data()?.onboardingComplete === true;
            setOnboardingComplete(isComplete);
            if (isComplete) await AsyncStorage.setItem(key, 'true');
          } catch {
            setOnboardingComplete(false);
          }
        }
      } else {
        setUser(null);
        setOnboardingComplete(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, onboardingComplete, setOnboardingComplete, loading };
}
