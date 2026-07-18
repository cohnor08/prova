import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useMetronome } from '../lib/MetronomeContext';
import { COLORS, SPACING, themedStyles } from '../constants/theme';

// Floating "metronome is running" pill, shown above the tab bar on every
// student screen while the click plays — so leaving the Practice tab doesn't
// mean losing sight of (or control over) the metronome. Tap the pill to jump
// back to the metronome; tap the stop button to kill the click right there.
export default function MetronomePill() {
  const m = useMetronome();
  const navigation = useNavigation();

  // Safety net: if this whole tab tree unmounts (logout), stop the click —
  // otherwise it would keep ticking with no visible way to stop it.
  useEffect(() => () => { m?.stop?.(); }, []);

  if (!m?.isPlaying) return null;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <TouchableOpacity
        style={styles.pill}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('Practice', { screen: 'PracticeHome', params: { tool: 'metronome' } })}
      >
        <Animated.View style={[styles.dot, { transform: [{ scale: m.pulseAnim }] }]} />
        <Text style={styles.bpm}>{m.bpm} BPM</Text>
        <TouchableOpacity onPress={m.stop} hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}>
          <Ionicons name="stop-circle" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  // Sits just above the 84px tab bar, right-aligned so it covers no content.
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 92, alignItems: 'flex-end', paddingRight: SPACING.md },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 999,
    paddingVertical: 8, paddingHorizontal: 14,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  bpm: { color: '#fff', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
}));
