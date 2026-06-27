import React, { useState } from 'react';
import { Alert, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { COLORS } from '../../constants/theme';
import { generatePracticePlan } from '../../lib/claude';
import { useAuthContext } from '../../contexts/AuthContext';
import OnboardingInstrument from './OnboardingInstrument';
import OnboardingLevel from './OnboardingLevel';
import OnboardingGoals from './OnboardingGoals';
import OnboardingSchedule from './OnboardingSchedule';
import OnboardingGenerating from './OnboardingGenerating';
import OnboardingFirstWin, { FIRST_WIN_POINTS, FIRST_WIN_MINUTES } from './OnboardingFirstWin';

export default function OnboardingFlow() {
  const { setOnboardingComplete, role } = useAuthContext();
  // A "student" learns through a teacher, so their account is free and skips the
  // AI personalised plan — they only pick instrument + level. A "personal"
  // account is a solo learner who gets the full survey + generated plan.
  const isStudent = role === 'student';
  const lastStep = isStudent ? 1 : 3;
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({});
  const [generating, setGenerating] = useState(false);
  const [firstWin, setFirstWin] = useState(null); // { profile, plan } → show the first-win screen

  const handleNext = async (stepData) => {
    const updatedProfile = { ...profile, ...stepData };
    setProfile(updatedProfile);

    if (step < lastStep) {
      setStep(step + 1);
      return;
    }

    // Students: no AI plan (free account). Save the basics and enter the app —
    // they can opt into a personalised plan later from Profile.
    if (isStudent) {
      try {
        const uid = auth.currentUser.uid;
        await setDoc(doc(db, 'users', uid), {
          ...updatedProfile,
          onboardingComplete: true,
          streak: 0,
          totalMinutes: 0,
        }, { merge: true });
        await AsyncStorage.setItem(`onboarding_${uid}`, 'true');
        setOnboardingComplete(true);
      } catch (error) {
        Alert.alert('Error', `Couldn't finish setting up: ${error.message}`);
      }
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

  const handleLogout = () => {
    Alert.alert(
      'Log out?',
      'Sign out and go back to the login screen to use a different account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: () => signOut(auth).catch(() => {}) },
      ]
    );
  };

  const totalSteps = isStudent ? 2 : 4;
  const screens = [
    <OnboardingInstrument key="instrument" onNext={handleNext} onBack={null} data={profile} steps={totalSteps} />,
    <OnboardingLevel key="level" onNext={handleNext} onBack={handleBack} data={profile} steps={totalSteps} />,
    // Goals + schedule only feed the AI plan, so students (no plan) skip them.
    ...(isStudent ? [] : [
      <OnboardingGoals key="goals" onNext={handleNext} onBack={handleBack} data={profile} />,
      <OnboardingSchedule key="schedule" onNext={handleNext} onBack={handleBack} data={profile} />,
    ]),
  ];

  let content;
  if (firstWin) {
    content = <OnboardingFirstWin profile={firstWin.profile} plan={firstWin.plan} onFinish={finishOnboarding} />;
  } else if (generating) {
    content = <OnboardingGenerating />;
  } else {
    content = screens[step];
  }

  // A persistent escape hatch so a half-finished signup isn't a dead end — drop
  // back to the login screen to use an existing account.
  return (
    <View style={{ flex: 1 }}>
      {content}
      <SafeAreaView style={styles.logoutWrap} pointerEvents="box-none">
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  logoutWrap: { position: 'absolute', top: 0, right: 0, alignItems: 'flex-end' },
  logoutBtn: { marginTop: 6, marginRight: 16, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: (COLORS.card || '#1a1a1a') + 'cc' },
  logoutText: { color: COLORS.textSecondary || '#aaa', fontSize: 13, fontWeight: '700' },
});
