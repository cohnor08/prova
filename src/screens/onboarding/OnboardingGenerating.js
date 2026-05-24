import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS, SPACING } from '../../constants/theme';

const STEPS = [
  'Analyzing your profile...',
  'Calculating your practice goals...',
  'Building your weekly plan...',
  'Scheduling your sessions...',
  'Finalizing your Prova plan...',
];

export default function OnboardingGenerating() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();

    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Animated.View style={[styles.logo, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={styles.logoText}>PROVA</Text>
      </Animated.View>

      <Text style={styles.title}>Building your plan</Text>
      <Text style={styles.subtitle}>Your AI coach is creating a personalized schedule just for you</Text>

      <View style={styles.steps}>
        {STEPS.map((step, i) => (
          <Text key={i} style={styles.step}>
            {step}
          </Text>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  logoText: { color: COLORS.text, fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
    lineHeight: 22,
  },
  steps: { gap: SPACING.sm, alignItems: 'flex-start', width: '100%' },
  step: { color: COLORS.textMuted, fontSize: 14 },
});
