import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { onSnapshot, doc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5000);
    let firestoreUnsub = null;

    const authUnsub = onAuthStateChanged(auth, (firebaseUser) => {
      clearTimeout(timeout);
      if (firebaseUser) {
        setUser(firebaseUser);
        firestoreUnsub = onSnapshot(doc(db, 'users', firebaseUser.uid), (snap) => {
          setOnboardingComplete(snap.data()?.onboardingComplete === true);
          setLoading(false);
        });
      } else {
        setUser(null);
        setOnboardingComplete(false);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      authUnsub();
      if (firestoreUnsub) firestoreUnsub();
    };
  }, []);

  return { user, onboardingComplete, setOnboardingComplete, loading };
}
