import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, INSTRUMENTS } from '../../constants/theme';

export default function OnboardingInstrument({ onNext, onBack, data }) {
  const [selected, setSelected] = useState(data?.instrument || null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onBack
          ? <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          : <View style={{ width: 24 }} />
        }
        <View style={styles.stepPills}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.pill, i === 0 && styles.pillActive]} />
          ))}
        </View>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.title}>What do you play?</Text>
      <Text style={styles.subtitle}>Prova will tailor your plan to your instrument</Text>

      <View style={styles.options}>
        {INSTRUMENTS.map((instrument) => (
          <TouchableOpacity
            key={instrument}
            style={[styles.option, selected === instrument && styles.optionSelected]}
            onPress={() => setSelected(instrument)}
            activeOpacity={0.75}
          >
            {instrument === 'Guitar'
              ? <Text style={styles.optionIcon}>🎸</Text>
              : <Image source={require('../../../assets/bass.png')} style={styles.optionImage} />
            }
            <Text style={[styles.optionText, selected === instrument && styles.optionTextSelected]}>
              {instrument}
            </Text>
            {selected === instrument && (
              <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} style={styles.checkmark} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, !selected && styles.buttonDisabled]}
        onPress={() => selected && onNext({ instrument: selected })}
        disabled={!selected}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl },
  stepPills: { flexDirection: 'row', gap: 6 },
  pill: { width: 24, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  pillActive: { backgroundColor: COLORS.primary, width: 40 },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '800', marginBottom: SPACING.sm },
  subtitle: { color: COLORS.textSecondary, fontSize: 15, marginBottom: SPACING.xxl, lineHeight: 22 },
  options: { flex: 1, justifyContent: 'center', gap: SPACING.md },
  option: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  optionSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '12' },
  optionIcon: { fontSize: 48, marginBottom: SPACING.sm },
  optionImage: { width: 56, height: 56, marginBottom: SPACING.sm, resizeMode: 'contain', transform: [{ rotate: '-30deg' }] },
  optionText: { color: COLORS.textSecondary, fontSize: 20, fontWeight: '600' },
  optionTextSelected: { color: COLORS.primary },
  checkmark: { position: 'absolute', top: SPACING.md, right: SPACING.md },
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
