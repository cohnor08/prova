import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useThemeSync } from '../../lib/ThemeContext';
import { generatePracticePlan } from '../../lib/claude';
import OnboardingInstrument from './OnboardingInstrument';
import OnboardingLevel from './OnboardingLevel';
import OnboardingGoals from './OnboardingGoals';
import OnboardingSchedule from './OnboardingSchedule';
import OnboardingGenerating from './OnboardingGenerating';

// The "Create a plan" survey for an already-signed-in learner. Reuses the exact
// onboarding question screens, then generates the plan and returns to Today.
// Unlike signup, it does NOT reset streak/totalMinutes — this is an existing
// account building (or rebuilding) its plan. Prefills from the passed profile.
export default function CreatePlanScreen({ navigation, route }) {
  useThemeSync();
  const initial = route?.params?.profile || {};
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(initial);
  const [generating, setGenerating] = useState(false);

  const totalSteps = 4;
  const lastStep = 3;

  const handleNext = async (stepData) => {
    const updated = { ...profile, ...stepData };
    setProfile(updated);

    if (step < lastStep) {
      setStep(step + 1);
      return;
    }

    setGenerating(true);
    try {
      const plan = await generatePracticePlan(updated);
      const uid = auth.currentUser.uid;
      await setDoc(doc(db, 'users', uid), {
        ...updated,
        practicePlan: plan,
        planGeneratedAt: new Date().toISOString(),
      }, { merge: true });
      setGenerating(false);
      // Back to Today with a signal so it reloads and shows the new plan.
      navigation.navigate('TodayHome', { planCreated: Date.now() });
    } catch (error) {
      setGenerating(false);
      Alert.alert('Error', `Couldn't build your plan: ${error.message}`);
    }
  };

  // Step 0 back-arrow leaves the survey; later steps walk back through it.
  const handleBack = () => {
    if (step > 0) setStep(step - 1);
    else navigation.goBack();
  };

  if (generating) return <OnboardingGenerating />;

  const screens = [
    <OnboardingInstrument key="instrument" onNext={handleNext} onBack={handleBack} data={profile} steps={totalSteps} />,
    <OnboardingLevel key="level" onNext={handleNext} onBack={handleBack} data={profile} steps={totalSteps} />,
    <OnboardingGoals key="goals" onNext={handleNext} onBack={handleBack} data={profile} />,
    <OnboardingSchedule key="schedule" onNext={handleNext} onBack={handleBack} data={profile} />,
  ];

  return <View style={{ flex: 1 }}>{screens[step]}</View>;
}
