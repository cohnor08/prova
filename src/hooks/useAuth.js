import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../lib/firebase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const cached = await AsyncStorage.getItem(`onboarding_${firebaseUser.uid}`);
        setOnboardingComplete(cached === 'true');
      } else {
        setUser(null);
        setOnboardingComplete(false);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return { user, onboardingComplete, loading };
}
