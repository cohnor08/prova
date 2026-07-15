import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';

// The reward for completing the first-session warm-up. Kept here so the
// celebration screen and the Firestore write (OnboardingFlow) stay in sync.
export const FIRST_WIN_POINTS = 50;
export const FIRST_WIN_MINUTES = 1;
const WARMUP_SECONDS = 60;

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Pull the first real session from the freshly generated plan — today's if it
// has any, otherwise the first day that does — to preview as "first up".
function firstSessionFrom(plan) {
  const wp = plan?.weeklyPlan;
  if (!wp) return null;
  const todayName = DAYS[new Date().getDay()];
  const order = [todayName, ...DAYS.filter((d) => d !== todayName)];
  for (const d of order) {
    const s = wp[d]?.sessions;
    if (Array.isArray(s) && s.length) return s[0];
  }
  return null;
}

// First-win onboarding: a quick guided warm-up so the new user finishes their
// very first minute with a streak + points before they ever reach the app.
export default function OnboardingFirstWin({ profile, plan, onFinish }) {
  useThemeSync();
  const [phase, setPhase] = useState('reveal'); // reveal → timer → done
  const [secondsLeft, setSecondsLeft] = useState(WARMUP_SECONDS);
  const fade = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0.8)).current;
  const intervalRef = useRef(null);

  const instrument = (profile?.instrument || 'instrument').toLowerCase();
  const firstSession = firstSessionFrom(plan);

  // Fade each phase in.
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [phase]);

  // Run the countdown while on the timer phase.
  useEffect(() => {
    if (phase !== 'timer') return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(intervalRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [phase]);

  useEffect(() => {
    if (phase === 'timer' && secondsLeft === 0) celebrate();
  }, [secondsLeft, phase]);

  const celebrate = () => {
    clearInterval(intervalRef.current);
    setPhase('done');
    pop.setValue(0.8);
    Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  };

  const fmt = (s) => `0:${String(s).padStart(2, '0')}`;

  if (phase === 'reveal') {
    return (
      <Animated.View style={[styles.container, { opacity: fade }]}>
        <Text style={styles.kicker}>YOUR PLAN IS READY</Text>
        <Text style={styles.bigEmoji}>🎸</Text>
        <Text style={styles.title}>Let’s get your first win</Text>
        <Text style={styles.subtitle}>
          Before you dive in, a quick 60-second warm-up to start your streak.
        </Text>

        {firstSession && (
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>FIRST UP TODAY</Text>
            <Text style={styles.previewTitle} numberOfLines={2}>{firstSession.title}</Text>
            {!!firstSession.duration && (
              <Text style={styles.previewMeta}>
                {firstSession.duration} min{firstSession.category ? ` · ${String(firstSession.category).replace('_', ' ')}` : ''}
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => { setSecondsLeft(WARMUP_SECONDS); setPhase('timer'); }}
          activeOpacity={0.85}
        >
          <Ionicons name="play" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Start 60-second warm-up</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onFinish(false)} style={styles.skipBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  if (phase === 'timer') {
    return (
      <Animated.View style={[styles.container, { opacity: fade }]}>
        <Text style={styles.kicker}>WARM-UP</Text>
        <View style={styles.ring}>
          <Text style={styles.ringNum}>{fmt(secondsLeft)}</Text>
        </View>
        <Text style={styles.title}>Just play</Text>
        <Text style={styles.subtitle}>
          Pick up your {instrument}, get comfortable, and play anything for a minute. No pressure — this one’s a freebie.
        </Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${(1 - secondsLeft / WARMUP_SECONDS) * 100}%` }]} />
        </View>
        <TouchableOpacity onPress={celebrate} style={styles.skipBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.skipText}>I’m done early ✓</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fade }]}>
      <Animated.View style={[styles.checkCircle, { transform: [{ scale: pop }] }]}>
        <Ionicons name="checkmark" size={48} color="#fff" />
      </Animated.View>
      <Text style={styles.title}>You did it! 🎉</Text>
      <Text style={styles.subtitle}>
        That’s your first session in the books — you’re officially on a roll.
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>🔥 1</Text>
          <Text style={styles.statLabel}>day streak</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statValue}>+{FIRST_WIN_POINTS}</Text>
          <Text style={styles.statLabel}>Prova points</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{FIRST_WIN_MINUTES}m</Text>
          <Text style={styles.statLabel}>practiced</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={() => onFinish(true)} activeOpacity={0.85}>
        <Text style={styles.primaryBtnText}>Enter Prova</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center', padding: SPACING.xl,
  },
  kicker: { color: COLORS.primary, fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: SPACING.md },
  bigEmoji: { fontSize: 56, marginBottom: SPACING.md },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: {
    color: COLORS.textSecondary, fontSize: 14, textAlign: 'center',
    marginBottom: SPACING.xl, lineHeight: 21, paddingHorizontal: SPACING.md,
  },
  previewCard: {
    alignSelf: 'stretch', backgroundColor: COLORS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, marginBottom: SPACING.xl,
  },
  previewLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  previewTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  previewMeta: { color: COLORS.textSecondary, fontSize: 13 },
  ring: {
    width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '14', alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  ringNum: { color: COLORS.text, fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums'] },
  barBg: {
    alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: COLORS.border,
    overflow: 'hidden', marginBottom: SPACING.lg,
  },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: COLORS.primary },
  checkCircle: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.success,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg,
  },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch',
    backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: SPACING.lg, marginBottom: SPACING.xl,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 32, backgroundColor: COLORS.border },
  statValue: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginBottom: 2 },
  statLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 999, paddingVertical: 16, paddingHorizontal: 32,
    alignSelf: 'stretch',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  skipBtn: { paddingVertical: SPACING.md, marginTop: SPACING.sm },
  skipText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
}));
