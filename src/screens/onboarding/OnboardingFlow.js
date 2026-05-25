import React, { useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { generatePracticePlan } from '../../lib/claude';
import { useAuthContext } from '../../contexts/AuthContext';
import OnboardingInstrument from './OnboardingInstrument';
import OnboardingLevel from './OnboardingLevel';
import OnboardingGoals from './OnboardingGoals';
import OnboardingSchedule from './OnboardingSchedule';
import OnboardingGenerating from './OnboardingGenerating';

export default function OnboardingFlow() {
  const { setOnboardingComplete } = useAuthContext();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({});
  const [generating, setGenerating] = useState(false);

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

      // Sync AsyncStorage so useAuth reads true immediately on this device
      await AsyncStorage.setItem(`onboarding_${uid}`, 'true');
      // Update in-memory state to trigger navigation to MainTabs
      setOnboardingComplete(true);
    } catch (error) {
      setGenerating(false);
      Alert.alert('Error', `Failed to generate plan: ${error.message}`);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  if (generating) return <OnboardingGenerating />;

  const screens = [
    <OnboardingInstrument key="instrument" onNext={handleNext} onBack={null} data={profile} />,
    <OnboardingLevel key="level" onNext={handleNext} onBack={handleBack} data={profile} />,
    <OnboardingGoals key="goals" onNext={handleNext} onBack={handleBack} data={profile} />,
    <OnboardingSchedule key="schedule" onNext={handleNext} onBack={handleBack} data={profile} />,
  ];

  return screens[step];
}
