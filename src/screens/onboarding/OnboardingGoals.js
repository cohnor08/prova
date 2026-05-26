import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, GOALS, SKILLS } from '../../constants/theme';

export default function OnboardingGoals({ onNext, onBack, data }) {
  const [selectedGoals, setSelectedGoals] = useState(data?.goals || []);
  const [selectedSkills, setSelectedSkills] = useState(data?.skills || []);

  const toggleGoal = (goal) =>
    setSelectedGoals((prev) => prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]);

  const toggleSkill = (skill) =>
    setSelectedSkills((prev) => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);

  const canContinue = selectedGoals.length > 0 && selectedSkills.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <View style={styles.stepPills}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.pill, i === 2 && styles.pillActive, i < 2 && styles.pillDone]} />
          ))}
        </View>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.title}>Goals & skills</Text>
      <Text style={styles.subtitle}>Select all that apply</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>YOUR GOALS</Text>
        <View style={styles.chips}>
          {GOALS.map((goal) => (
            <TouchableOpacity
              key={goal}
              style={[styles.chip, selectedGoals.includes(goal) && styles.chipSelected]}
              onPress={() => toggleGoal(goal)}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, selectedGoals.includes(goal) && styles.chipTextSelected]}>
                {goal}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SKILLS TO FOCUS ON</Text>
        <View style={styles.chips}>
          {SKILLS.map((skill) => (
            <TouchableOpacity
              key={skill}
              style={[styles.chip, selectedSkills.includes(skill) && styles.chipSelected]}
              onPress={() => toggleSkill(skill)}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, selectedSkills.includes(skill) && styles.chipTextSelected]}>
                {skill}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, !canContinue && styles.buttonDisabled]}
        onPress={() => canContinue && onNext({ goals: selectedGoals, skills: selectedSkills })}
        disabled={!canContinue}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Continue</Text>
        <Ionicons name="arrow-forward" size={18} color={COLORS.text} style={{ marginLeft: SPACING.xs }} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.xl, paddingTop: 56 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.lg },
  stepPills: { flexDirection: 'row', gap: 6 },
  pill: { width: 24, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  pillActive: { backgroundColor: COLORS.primary, width: 40 },
  pillDone: { backgroundColor: COLORS.primary + '66' },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '800', marginBottom: SPACING.xs },
  subtitle: { color: COLORS.textSecondary, fontSize: 15, marginBottom: SPACING.lg, lineHeight: 22 },
  section: { marginBottom: SPACING.lg },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    borderRadius: 100,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '500' },
  chipTextSelected: { color: COLORS.text, fontWeight: '700' },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
});
