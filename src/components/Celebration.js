import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING } from '../constants/theme';

// A single, tasteful celebration moment — used at the emotional peaks of the
// app (finishing a task, completing the daily challenge, saving a streak).
//
// Two ways to fire it:
//   • useCelebration()  → celebrate({ points, title, subtitle, emoji, streak })
//     for normal screens (a <CelebrationProvider> lives at the app root).
//   • <Celebration data onDone/> directly — needed inside RN Modals (e.g. the
//     PracticePlayer), because a root overlay can't paint over a native modal.
//
// It's non-blocking (pointerEvents none) and auto-dismisses, so it never traps
// the user mid-flow.

const CelebrationContext = createContext(() => {});
export const useCelebration = () => useContext(CelebrationContext);

// A little variety so the praise never feels canned.
const PRAISE = ['Nice work!', 'Boom!', 'Great job!', 'Love it!', 'Keep going!', 'On fire!'];

export function CelebrationProvider({ children }) {
  const [data, setData] = useState(null);
  // _id forces the effect to re-run even on back-to-back identical celebrations.
  const celebrate = useCallback((d) => setData({ ...(d || {}), _id: Date.now() }), []);
  return (
    <CelebrationContext.Provider value={celebrate}>
      {children}
      <Celebration data={data} onDone={() => setData(null)} />
    </CelebrationContext.Provider>
  );
}

export default function Celebration({ data, onDone }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const counter = useRef(new Animated.Value(0)).current;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!data) return;
    const pts = Math.max(0, Math.round(data.points || 0));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    scale.setValue(0); opacity.setValue(0); ring.setValue(0); counter.setValue(0); setCount(0);
    const sub = counter.addListener(({ value }) => setCount(Math.round(value * pts)));
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 80 }),
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(ring, { toValue: 1, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(counter, { toValue: 1, duration: 600, delay: 140, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]).start();
    // A soft second tick mid-animation makes it feel physical.
    const tick = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), 240);
    const out = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.92, duration: 240, useNativeDriver: true }),
      ]).start(() => onDone && onDone());
    }, pts > 0 ? 1550 : 1150);
    return () => { clearTimeout(tick); clearTimeout(out); counter.removeListener(sub); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data && data._id]);

  if (!data) return null;
  const pts = Math.max(0, Math.round(data.points || 0));
  const title = data.title || PRAISE[Math.floor((data._id || 0) / 137) % PRAISE.length];

  return (
    <View style={styles.root} pointerEvents="none">
      <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
        <View style={styles.badgeWrap}>
          <Animated.View
            style={[styles.ring, {
              opacity: ring.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.5, 0.12, 0] }),
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.4] }) }],
            }]}
          />
          <View style={styles.badge}>
            <Text style={styles.emoji}>{data.emoji || '🎸'}</Text>
          </View>
        </View>

        <Text style={styles.title}>{title}</Text>

        {pts > 0 && (
          <Text style={styles.points}>
            +{count}<Text style={styles.pointsUnit}> pts</Text>
          </Text>
        )}
        {!!data.subtitle && <Text style={styles.subtitle}>{data.subtitle}</Text>}

        {data.streak > 0 && (
          <View style={styles.streakChip}>
            <Text style={styles.streakText}>🔥 {data.streak} day streak</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  card: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xxl,
    borderWidth: 1,
    borderColor: COLORS.primary + '2E',
    // A soft lift so it reads as floating above the screen.
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  badgeWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  ring: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.accent || COLORS.primary,
  },
  badge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: (COLORS.accent || COLORS.primary) + '22',
    borderWidth: 1,
    borderColor: (COLORS.accent || COLORS.primary) + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 38 },
  title: { color: COLORS.text, fontSize: 19, fontWeight: '800', marginBottom: 4 },
  points: { color: COLORS.accent || COLORS.primary, fontSize: 40, fontWeight: '900', letterSpacing: -0.5 },
  pointsUnit: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '800' },
  subtitle: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  streakChip: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  streakText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
});
