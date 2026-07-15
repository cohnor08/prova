import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, themedStyles } from '../constants/theme';
import { useThemeSync } from '../lib/ThemeContext';

export default function MaintenanceScreen({ message }) {
  useThemeSync();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Maintenance</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
}));
