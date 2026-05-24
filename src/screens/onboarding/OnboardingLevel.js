import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { COLORS, SPACING, LEVELS } from '../../constants/theme';

const LEVEL_DESCRIPTIONS = {
  Beginner: 'Just starting out, learning basic chords and notes',
  Novice: 'Know some chords, can play simple songs',
  Intermediate: 'Comfortable with most open chords, some barre chords, basic scales',
  Advanced: 'Proficient with techniques, can learn songs quickly, knows music theory',
  Elite: 'Professional level, can play complex solos, improvise freely',
};

export default function OnboardingLevel({ onNext, data }) {
  const [selected, setSelected] = useState(data?.level || null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.step}>Step 2 of 5</Text>
      <Text style={styles.title}>What's your level?</Text>
      <Text style={styles.subtitle}>Be honest — this helps Prova build the right plan</Text>

      <View style={styles.options}>
        {LEVELS.map((level, index) => (
          <TouchableOpacity
            key={level}
            style={[styles.option, selected === level && styles.optionSelected]}
            onPress={() => setSelected(level)}
          >
            <View style={styles.optionLeft}>
              <Text style={[styles.optionNumber, selected === level && styles.optionNumberSelected]}>
                {index + 1}
              </Text>
              <View>
                <Text style={[styles.optionTitle, selected === level && styles.optionTitleSelected]}>
                  {level}
                </Text>
                <Text style={styles.optionDesc}>{LEVEL_DESCRIPTIONS[level]}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, !selected && styles.buttonDisabled]}
        onPress={() => selected && onNext({ level: selected })}
        disabled={!selected}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  step: { color: COLORS.primary, fontSize: 12, fontWeight: '600', letterSpacing: 2, marginBottom: SPACING.sm },
  title: { color: COLORS.text, fontSize: 32, fontWeight: '800', marginBottom: SPACING.sm },
  subtitle: { color: COLORS.textSecondary, fontSize: 16, marginBottom: SPACING.xl },
  options: { gap: SPACING.sm, marginBottom: SPACING.xl },
  option: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  optionSelected: { borderColor: COLORS.primary },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  optionNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.border,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 32,
    fontWeight: '700',
    fontSize: 14,
  },
  optionNumberSelected: { backgroundColor: COLORS.primary, color: COLORS.text },
  optionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 2 },
  optionTitleSelected: { color: COLORS.primary },
  optionDesc: { color: COLORS.textSecondary, fontSize: 12, flexShrink: 1 },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
});
