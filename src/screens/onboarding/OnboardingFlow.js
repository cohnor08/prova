import React, { useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { generatePracticePlan } from '../../lib/claude';
import { useAuthContext } from '../../contexts/AuthContext';
import OnboardingInstrument from './OnboardingInstrument';
import OnboardingLevel from './OnboardingLevel';
import OnboardingGoals from './OnboardingGoals';
import OnboardingSchedule from './OnboardingSchedule';
import OnboardingGenerating from './OnboardingGenerating';
import OnboardingFirstWin, { FIRST_WIN_POINTS, FIRST_WIN_MINUTES } from './OnboardingFirstWin';

export default function OnboardingFlow() {
  const { setOnboardingComplete } = useAuthContext();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({});
  const [generating, setGenerating] = useState(false);
  const [firstWin, setFirstWin] = useState(null); // { profile, plan } → show the first-win screen

  const handleNext = async (stepData) => {
    const updatedProfile = { ...profile, ...stepData };
    setProfile(updatedProfile);

    if (step < 3) {
      setStep(step + 1);
      return;
    }

    setGenerating(true);
    try {
      const plan = await generatePracticePlan(updatedProfile);
      const uid = auth.currentUser.uid;

      await setDoc(doc(db, 'users', uid), {
        ...updatedProfile,
        onboardingComplete: true,
        practicePlan: plan,
        planGeneratedAt: new Date().toISOString(),
        streak: 0,
        totalMinutes: 0,
      }, { merge: true });

      // Sync AsyncStorage so useAuth reads true immediately on this device.
      await AsyncStorage.setItem(`onboarding_${uid}`, 'true');
      // Hand off to the first-win warm-up before entering the app (instead of
      // navigating straight to MainTabs).
      setGenerating(false);
      setFirstWin({ profile: updatedProfile, plan });
    } catch (error) {
      setGenerating(false);
      Alert.alert('Error', `Failed to generate plan: ${error.message}`);
    }
  };

  // Finish onboarding. If they completed the warm-up, bank a real starter
  // session (streak + points + minutes) using the same fields as a normal
  // session completion, so the engagement loop is consistent from minute one.
  const finishOnboarding = async (rewarded) => {
    if (rewarded) {
      try {
        const uid = auth.currentUser.uid;
        const now = new Date();
        const dateKey = now.toISOString().split('T')[0];
        await updateDoc(doc(db, 'users', uid), {
          streak: 1,
          lastSessionDate: now.toISOString(),
          totalMinutes: increment(FIRST_WIN_MINUTES),
          provaScore: increment(FIRST_WIN_POINTS),
        });
        await setDoc(doc(db, 'sessionHistory', uid, 'logs', dateKey), {
          date: dateKey,
          totalMinutes: increment(FIRST_WIN_MINUTES),
          sessionCount: increment(1),
        }, { merge: true });
      } catch (e) {
        // Non-fatal — never block the user from entering the app over a reward write.
      }
    }
    setOnboardingComplete(true);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  if (firstWin) {
    return <OnboardingFirstWin profile={firstWin.profile} plan={firstWin.plan} onFinish={finishOnboarding} />;
  }
  if (generating) return <OnboardingGenerating />;

  const screens = [
    <OnboardingInstrument key="instrument" onNext={handleNext} onBack={null} data={profile} />,
    <OnboardingLevel key="level" onNext={handleNext} onBack={handleBack} data={profile} />,
    <OnboardingGoals key="goals" onNext={handleNext} onBack={handleBack} data={profile} />,
    <OnboardingSchedule key="schedule" onNext={handleNext} onBack={handleBack} data={profile} />,
  ];

  return screens[step];
}
