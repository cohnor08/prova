// The one signpost we drop into any screen that can be empty, so a new user
// (or one in a dead zone) never stares at blank space. Ring medallion icon
// (same language as badges/skill tree), a line of what this is, a line of
// what to do, and an optional action button. `variant="error"` reskins it
// for load failures with a Try again button.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/theme';

export default function EmptyState({
  icon = 'sparkles-outline',
  title,
  subtitle,
  actionLabel,
  onAction,
  variant = 'empty',       // 'empty' | 'error'
  style,
}) {
  const isError = variant === 'error';
  const ringColor = isError ? COLORS.textMuted : COLORS.primary;
  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.ring, { borderColor: ringColor + '55' }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: ringColor + '12', borderRadius: 40 }]} />
        <Ionicons name={isError ? 'cloud-offline-outline' : icon} size={30} color={ringColor} />
      </View>
      {!!title && <Text style={styles.title}>{title}</Text>}
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {!!actionLabel && !!onAction && (
        <TouchableOpacity style={styles.btn} onPress={onAction} activeOpacity={0.85}>
          {isError && <Ionicons name="refresh" size={16} color="#fff" style={{ marginRight: 6 }} />}
          <Text style={styles.btnText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xl * 1.5, paddingHorizontal: SPACING.xl },
  ring: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg, overflow: 'hidden',
  },
  title: { color: COLORS.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20.5, textAlign: 'center', marginTop: 6, maxWidth: 300 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary, borderRadius: 13, paddingVertical: 13, paddingHorizontal: 26, marginTop: SPACING.lg,
  },
  btnText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
});
