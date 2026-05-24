import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { COLORS, SPACING, GOALS, SKILLS } from '../../constants/theme';

export default function OnboardingGoals({ onNext, data }) {
  const [selectedGoals, setSelectedGoals] = useState(data?.goals || []);
  const [selectedSkills, setSelectedSkills] = useState(data?.skills || []);

  const toggleGoal = (goal) => {
    setSelectedGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  };

  const toggleSkill = (skill) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const canContinue = selectedGoals.length > 0 && selectedSkills.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.step}>Step 3 of 5</Text>
      <Text style={styles.title}>What are your goals?</Text>
      <Text style={styles.subtitle}>Select all that apply</Text>

      <Text style={styles.sectionTitle}>YOUR GOALS</Text>
      <View style={styles.chips}>
        {GOALS.map((goal) => (
          <TouchableOpacity
            key={goal}
            style={[styles.chip, selectedGoals.includes(goal) && styles.chipSelected]}
            onPress={() => toggleGoal(goal)}
          >
            <Text style={[styles.chipText, selectedGoals.includes(goal) && styles.chipTextSelected]}>
              {goal}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>SKILLS TO FOCUS ON</Text>
      <View style={styles.chips}>
        {SKILLS.map((skill) => (
          <TouchableOpacity
            key={skill}
            style={[styles.chip, selectedSkills.includes(skill) && styles.chipSelected]}
            onPress={() => toggleSkill(skill)}
          >
            <Text style={[styles.chipText, selectedSkills.includes(skill) && styles.chipTextSelected]}>
              {skill}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, !canContinue && styles.buttonDisabled]}
        onPress={() => canContinue && onNext({ goals: selectedGoals, skills: selectedSkills })}
        disabled={!canContinue}
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
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 100,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '500' },
  chipTextSelected: { color: COLORS.text, fontWeight: '700' },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
});
