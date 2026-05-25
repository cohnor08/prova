import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, LEVELS } from '../../constants/theme';

const LEVEL_DESCRIPTIONS = {
  Beginner: 'Just starting out, learning basic chords and notes',
  Novice: 'Know some chords, can play simple songs',
  Intermediate: 'Comfortable with most open chords, some barre chords, basic scales',
  Advanced: 'Proficient with techniques, can learn songs quickly, knows music theory',
  Elite: 'Professional level, can play complex solos, improvise freely',
};

export default function OnboardingLevel({ onNext, onBack, data }) {
  const [selected, setSelected] = useState(data?.level || null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <View style={styles.stepPills}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.pill, i === 1 && styles.pillActive, i < 1 && styles.pillDone]} />
          ))}
        </View>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.title}>What's your level?</Text>
      <Text style={styles.subtitle}>Be honest — this helps Prova build the right plan</Text>

      <View style={styles.options}>
        {LEVELS.map((level, index) => (
          <TouchableOpacity
            key={level}
            style={[styles.option, selected === level && styles.optionSelected]}
            onPress={() => setSelected(level)}
            activeOpacity={0.75}
          >
            <View style={[styles.badge, selected === level && styles.badgeSelected]}>
              <Text style={[styles.badgeText, selected === level && styles.badgeTextSelected]}>{index + 1}</Text>
            </View>
            <View style={styles.optionContent}>
              <Text style={[styles.optionTitle, selected === level && styles.optionTitleSelected]}>{level}</Text>
              <Text style={styles.optionDesc}>{LEVEL_DESCRIPTIONS[level]}</Text>
            </View>
            {selected === level && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, !selected && styles.buttonDisabled]}
        onPress={() => selected && onNext({ level: selected })}
        disabled={!selected}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Continue</Text>
        <Ionicons name="arrow-forward" size={18} color={COLORS.text} style={{ marginLeft: SPACING.xs }} />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingTop: 56, paddingBottom: SPACING.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl },
  stepPills: { flexDirection: 'row', gap: 6 },
  pill: { width: 24, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  pillActive: { backgroundColor: COLORS.primary, width: 40 },
  pillDone: { backgroundColor: COLORS.primary + '66' },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '800', marginBottom: SPACING.sm },
  subtitle: { color: COLORS.textSecondary, fontSize: 15, marginBottom: SPACING.xl, lineHeight: 22 },
  options: { gap: SPACING.sm, marginBottom: SPACING.xl },
  option: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  optionSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '12' },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeSelected: { backgroundColor: COLORS.primary },
  badgeText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  badgeTextSelected: { color: COLORS.text },
  optionContent: { flex: 1 },
  optionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 2 },
  optionTitleSelected: { color: COLORS.primary },
  optionDesc: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17 },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
});
