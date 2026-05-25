import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../../constants/theme';

const STEPS = [
  'Analyzing your profile...',
  'Calculating your practice goals...',
  'Building your weekly plan...',
  'Scheduling your sessions...',
  'Finalizing your Prova plan...',
];

const STEP_DELAY = 1800;

export default function OnboardingGenerating() {
  const [activeStep, setActiveStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const stepAnims = useRef(STEPS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();

    // Animate first step in immediately
    Animated.timing(stepAnims[0], { toValue: 1, duration: 300, useNativeDriver: true }).start();

    const timers = STEPS.slice(1).map((_, i) =>
      setTimeout(() => {
        const next = i + 1;
        setActiveStep(next);
        Animated.timing(stepAnims[next], { toValue: 1, duration: 300, useNativeDriver: true }).start();
      }, STEP_DELAY * (i + 1))
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Animated.View style={[styles.logoRing, { transform: [{ scale: pulseAnim }] }]}>
        <View style={styles.logoDot} />
        <Text style={styles.logoText}>PROVA</Text>
      </Animated.View>

      <Text style={styles.title}>Building your plan</Text>
      <Text style={styles.subtitle}>Your AI coach is crafting a personalised schedule</Text>

      <View style={styles.steps}>
        {STEPS.map((step, i) => {
          const isDone = i < activeStep;
          const isActive = i === activeStep;
          return (
            <Animated.View
              key={i}
              style={[styles.stepRow, { opacity: stepAnims[i] }]}
            >
              <View style={[styles.stepIcon, isDone && styles.stepIconDone, isActive && styles.stepIconActive]}>
                {isDone
                  ? <Ionicons name="checkmark" size={12} color={COLORS.text} />
                  : <View style={[styles.stepDot, isActive && styles.stepDotActive]} />
                }
              </View>
              <Text style={[styles.stepText, isDone && styles.stepTextDone, isActive && styles.stepTextActive]}>
                {step}
              </Text>
            </Animated.View>
          );
        })}
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
  logoRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    gap: 4,
  },
  logoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  logoText: { color: COLORS.primary, fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
    lineHeight: 21,
  },
  steps: { gap: SPACING.md, alignSelf: 'stretch' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  stepIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepIconDone: { backgroundColor: COLORS.success },
  stepIconActive: { backgroundColor: COLORS.primary + '33', borderWidth: 1.5, borderColor: COLORS.primary },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.textMuted },
  stepDotActive: { backgroundColor: COLORS.primary },
  stepText: { color: COLORS.textMuted, fontSize: 14, lineHeight: 20 },
  stepTextDone: { color: COLORS.textSecondary, textDecorationLine: 'line-through' },
  stepTextActive: { color: COLORS.text, fontWeight: '600' },
});
