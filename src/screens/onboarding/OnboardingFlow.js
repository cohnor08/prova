import React, { useState } from 'react';
import { Alert } from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../lib/firebase';
import { generatePracticePlan } from '../../lib/claude';
import OnboardingInstrument from './OnboardingInstrument';
import OnboardingLevel from './OnboardingLevel';
import OnboardingGoals from './OnboardingGoals';
import OnboardingSchedule from './OnboardingSchedule';
import OnboardingGenerating from './OnboardingGenerating';

export default function OnboardingFlow() {
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

    // Final step — generate plan
    setGenerating(true);
    try {
      console.log('PROVA: Starting plan generation...');
      const plan = await generatePracticePlan(updatedProfile);
      console.log('PROVA: Plan generated, saving to Firestore...');
      const uid = auth.currentUser.uid;

      await setDoc(doc(db, 'users', uid), {
        ...updatedProfile,
        onboardingComplete: true,
        practicePlan: plan,
        planGeneratedAt: new Date().toISOString(),
        streak: 0,
        totalMinutes: 0,
      }, { merge: true });
      console.log('PROVA: Firestore save complete.');
    } catch (error) {
      console.error('Failed to generate plan:', error);
      setGenerating(false);
      Alert.alert('Error', `Failed to generate plan: ${error.message}`);
    }
  };

  if (generating) return <OnboardingGenerating />;

  const screens = [
    <OnboardingInstrument key="instrument" onNext={handleNext} data={profile} />,
    <OnboardingLevel key="level" onNext={handleNext} data={profile} />,
    <OnboardingGoals key="goals" onNext={handleNext} data={profile} />,
    <OnboardingSchedule key="schedule" onNext={handleNext} data={profile} />,
  ];

  return screens[step];
}
