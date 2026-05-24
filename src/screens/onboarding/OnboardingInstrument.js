import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, INSTRUMENTS } from '../../constants/theme';

export default function OnboardingInstrument({ onNext, data }) {
  const [selected, setSelected] = useState(data?.instrument || null);

  return (
    <View style={styles.container}>
      <Text style={styles.step}>Step 1 of 5</Text>
      <Text style={styles.title}>What do you play?</Text>
      <Text style={styles.subtitle}>Prova will tailor your plan to your instrument</Text>

      <View style={styles.options}>
        {INSTRUMENTS.map((instrument) => (
          <TouchableOpacity
            key={instrument}
            style={[styles.option, selected === instrument && styles.optionSelected]}
            onPress={() => setSelected(instrument)}
          >
            <Text style={styles.optionIcon}>{instrument === 'Guitar' ? '🎸' : '🎵'}</Text>
            <Text style={[styles.optionText, selected === instrument && styles.optionTextSelected]}>
              {instrument}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, !selected && styles.buttonDisabled]}
        onPress={() => selected && onNext({ instrument: selected })}
        disabled={!selected}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.xl },
  step: { color: COLORS.primary, fontSize: 12, fontWeight: '600', letterSpacing: 2, marginBottom: SPACING.sm },
  title: { color: COLORS.text, fontSize: 32, fontWeight: '800', marginBottom: SPACING.sm },
  subtitle: { color: COLORS.textSecondary, fontSize: 16, marginBottom: SPACING.xxl },
  options: { flex: 1, justifyContent: 'center', gap: SPACING.md },
  option: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  optionSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryDark + '22' },
  optionIcon: { fontSize: 48, marginBottom: SPACING.sm },
  optionText: { color: COLORS.textSecondary, fontSize: 20, fontWeight: '600' },
  optionTextSelected: { color: COLORS.primary },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
});
