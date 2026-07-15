import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, DAYS, PRACTICE_DURATIONS, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';

export default function OnboardingSchedule({ onNext, onBack, data }) {
  useThemeSync();
  const [selectedDays, setSelectedDays] = useState(data?.availableDays || []);
  const [selectedDuration, setSelectedDuration] = useState(data?.dailyDuration || null);

  const toggleDay = (day) =>
    setSelectedDays((prev) => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);

  const canContinue = selectedDays.length > 0 && selectedDuration !== null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <View style={styles.stepPills}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.pill, i === 3 && styles.pillActive, i < 3 && styles.pillDone]} />
          ))}
        </View>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.title}>Your schedule</Text>
      <Text style={styles.subtitle}>When can you practice? Prova builds around your life</Text>

      <Text style={styles.sectionTitle}>AVAILABLE DAYS</Text>
      <View style={styles.days}>
        {DAYS.map((day) => (
          <TouchableOpacity
            key={day}
            style={[styles.dayChip, selectedDays.includes(day) && styles.dayChipSelected]}
            onPress={() => toggleDay(day)}
            activeOpacity={0.75}
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
            activeOpacity={0.75}
          >
            <Text style={[styles.durationText, selectedDuration === dur.value && styles.durationTextSelected]}>
              {dur.label}
            </Text>
            {selectedDuration === dur.value && <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, !canContinue && styles.buttonDisabled]}
        onPress={() => canContinue && onNext({ availableDays: selectedDays, dailyDuration: selectedDuration })}
        disabled={!canContinue}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Generate My Plan</Text>
        <Ionicons name="sparkles" size={18} color={COLORS.text} style={{ marginLeft: SPACING.xs }} />
      </TouchableOpacity>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.xl, paddingTop: 56 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.lg },
  stepPills: { flexDirection: 'row', gap: 6 },
  pill: { width: 24, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  pillActive: { backgroundColor: COLORS.primary, width: 40 },
  pillDone: { backgroundColor: COLORS.primary + '66' },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '800', marginBottom: SPACING.xs },
  subtitle: { color: COLORS.textSecondary, fontSize: 15, marginBottom: SPACING.lg, lineHeight: 22 },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  days: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg, flexWrap: 'wrap' },
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
  durations: { gap: SPACING.sm, marginBottom: SPACING.lg },
  durationChip: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  durationChipSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '12' },
  durationText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' },
  durationTextSelected: { color: COLORS.primary },
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
}));
