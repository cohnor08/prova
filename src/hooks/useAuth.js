import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { registerPushToken } from '../lib/pushToken';
import { onSnapshot, doc, updateDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../lib/firebase';
import { identifyUser, resetAnalytics } from '../lib/analytics';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [role, setRole] = useState(null);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [loading, setLoading] = useState(true);
  // Whether we have REAL profile data (not a guess from the cache, not an
  // empty offline snapshot). App.js refuses to show onboarding until this is
  // true — sending someone who has an account back to "pick your instrument"
  // is the one wrong screen we must never flash.
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => { setProfileLoaded(true); setLoading(false); }, 8000);
    let firestoreUnsub = null;
    let profileTimeout = null;

    const authUnsub = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(timeout);
      if (profileTimeout) { clearTimeout(profileTimeout); profileTimeout = null; }
      // Tear down any listener from a previous session before (re)subscribing,
      // so signing out doesn't leave a listener attached that then fails with
      // permission-denied once the user is no longer authenticated.
      if (firestoreUnsub) { firestoreUnsub(); firestoreUnsub = null; }
      if (firebaseUser) {
        // Hold the splash until we KNOW whether onboarding is done — deciding
        // off the stale `false` here flashed the instrument picker for a moment
        // on every fresh login to an existing account (and the wrong role's
        // flow, since role hadn't loaded either).
        setLoading(true);
        setProfileLoaded(false);
        setUser(firebaseUser);
        // Register this device for push. Fire-and-forget: it needs permission
        // that may not have been granted yet, and sign-in must never wait on
        // (or fail because of) a notification token.
        registerPushToken(firebaseUser.uid);
        // Don't hang forever if Firestore is unreachable — fall through after
        // 8s (worst case = the old behavior).
        profileTimeout = setTimeout(() => { setProfileLoaded(true); setLoading(false); }, 8000);

        // Check AsyncStorage first so the app loads instantly without waiting for Firestore
        const [cached, cachedRole] = await Promise.all([
          AsyncStorage.getItem(`onboarding_${firebaseUser.uid}`),
          AsyncStorage.getItem(`role_${firebaseUser.uid}`),
        ]);
        if (cached === 'true') {
          setOnboardingComplete(true);
          // The role decides which tab bar is built, so restore it with the
          // same breath — going in without it gave a teacher the student tabs
          // for as long as the profile took to arrive.
          if (cachedRole) setRole(cachedRole);
          setLoading(false);
        }

        // Firestore listener keeps the value fresh (e.g. after completing onboarding on another device)
        firestoreUnsub = onSnapshot(doc(db, 'users', firebaseUser.uid), async (snap) => {
          // A phone opening cold is offline for a moment — the radio isn't up
          // yet — and Firestore answers a listener from its (empty) cache
          // rather than waiting. That snapshot says "no such user", which read
          // as "onboarding isn't done" and flashed the instrument picker over
          // the app on every launch until the network arrived. It isn't an
          // answer; wait for the real one.
          if (!snap.exists() && snap.metadata.fromCache) return;
          const data = snap.data() || {};
          const isComplete = data.onboardingComplete === true;
          setOnboardingComplete(isComplete);
          setRole(data.role || null);
          // Gated only if the account was created with the flag AND Firebase
          // still says the address is unconfirmed.
          setNeedsEmailVerification(data.requiresEmailVerification === true && !auth.currentUser?.emailVerified);
          // Analytics identity: uid only (no email), plus a few traits.
          identifyUser(firebaseUser.uid, data);
          if (isComplete) {
            await AsyncStorage.setItem(`onboarding_${firebaseUser.uid}`, 'true');
            if (data.role) await AsyncStorage.setItem(`role_${firebaseUser.uid}`, data.role);
          }
          // Normalize email to lowercase so teacher-by-email search always works.
          // Only run on fresh server data (not cache) to avoid spurious writes on reconnect.
          if (!snap.metadata.fromCache && data.email && data.email !== data.email.toLowerCase()) {
            updateDoc(doc(db, 'users', firebaseUser.uid), { email: data.email.toLowerCase() })
              .catch((err) => console.warn('Email normalise failed:', err));
          }
          setProfileLoaded(true);
          setLoading(false);
        }, (err) => {
          // permission-denied is expected briefly during sign-out — ignore it.
          if (err.code === 'permission-denied') return;
          console.warn('User snapshot error:', err);
          // A listener that has really failed shouldn't hold the app on the
          // splash until the timeout runs out.
          setProfileLoaded(true);
          setLoading(false);
        });
      } else {
        setUser(null);
        setOnboardingComplete(false);
        setRole(null);
        setNeedsEmailVerification(false);
        setProfileLoaded(false);
        setLoading(false);
        resetAnalytics();
      }
    });

    return () => {
      clearTimeout(timeout);
      if (profileTimeout) clearTimeout(profileTimeout);
      authUnsub();
      if (firestoreUnsub) firestoreUnsub();
    };
  }, []);

  return { user, onboardingComplete, setOnboardingComplete, role, loading, profileLoaded,
    needsEmailVerification, setNeedsEmailVerification };
}
