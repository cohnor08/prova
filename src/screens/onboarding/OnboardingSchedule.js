import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { COLORS, SPACING, DAYS, PRACTICE_DURATIONS } from '../../constants/theme';

export default function OnboardingSchedule({ onNext, data }) {
  const [selectedDays, setSelectedDays] = useState(data?.availableDays || []);
  const [selectedDuration, setSelectedDuration] = useState(data?.dailyDuration || null);

  const toggleDay = (day) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const canContinue = selectedDays.length > 0 && selectedDuration !== null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.step}>Step 4 of 5</Text>
      <Text style={styles.title}>Your schedule</Text>
      <Text style={styles.subtitle}>When can you practice? Prova will build around your life</Text>

      <Text style={styles.sectionTitle}>AVAILABLE DAYS</Text>
      <View style={styles.days}>
        {DAYS.map((day) => (
          <TouchableOpacity
            key={day}
            style={[styles.dayChip, selectedDays.includes(day) && styles.dayChipSelected]}
            onPress={() => toggleDay(day)}
          >
            <Text style={[styles.dayText, selectedDays.includes(day) && styles.dayTextSelected]}>
              {day.slice(0, 3).toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>DAILY PRACTICE TIME</Text>
      <View style={styles.durations}>
        {PRACTICE_DURATIONS.map((dur) => (
          <TouchableOpacity
            key={dur.value}
            style={[styles.durationChip, selectedDuration === dur.value && styles.durationChipSelected]}
            onPress={() => setSelectedDuration(dur.value)}
          >
            <Text style={[styles.durationText, selectedDuration === dur.value && styles.durationTextSelected]}>
              {dur.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, !canContinue && styles.buttonDisabled]}
        onPress={() => canContinue && onNext({ availableDays: selectedDays, dailyDuration: selectedDuration })}
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
    marginBottom: SPACING.md,
    marginTop: SPACING.md,
  },
  days: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl, flexWrap: 'wrap' },
  dayChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  dayChipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  dayTextSelected: { color: COLORS.text },
  durations: { gap: SPACING.sm, marginBottom: SPACING.xl },
  durationChip: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  durationChipSelected: { borderColor: COLORS.primary },
  durationText: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '600' },
  durationTextSelected: { color: COLORS.primary },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
});
