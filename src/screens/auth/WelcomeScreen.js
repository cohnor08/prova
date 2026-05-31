import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../../constants/theme';

const ROLES = [
  {
    role: 'student',
    icon: 'musical-notes',
    title: "I'm a Student",
    subtitle: 'Get an AI practice plan and track your progress',
  },
  {
    role: 'teacher',
    icon: 'school',
    title: "I'm a Teacher",
    subtitle: 'Monitor students and assign practice tasks',
  },
];

export default function WelcomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.logoArea}>
          <View style={styles.logoGlow}>
            <Text style={styles.logo}>PROVA</Text>
          </View>
          <Text style={styles.tagline}>Your AI Music Coach</Text>
        </View>

        <View style={styles.choices}>
          <Text style={styles.chooseLabel}>Get started</Text>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r.role}
              style={styles.roleCard}
              onPress={() => navigation.navigate('Signup', { role: r.role })}
              activeOpacity={0.85}
            >
              <View style={styles.roleIconWrap}>
                <Ionicons name={r.icon} size={24} color={COLORS.primary} />
              </View>
              <View style={styles.roleTextWrap}>
                <Text style={styles.roleTitle}>{r.title}</Text>
                <Text style={styles.roleSubtitle}>{r.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate('Login')}
          hitSlop={{ top: 8, bottom: 8 }}
        >
          <Text style={styles.linkText}>
            Already have an account? <Text style={styles.linkAccent}>Log in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACING.xl },
  logoArea: { alignItems: 'center', marginBottom: SPACING.xxl },
  logoGlow: {
    borderWidth: 1,
    borderColor: COLORS.primary + '44',
    borderRadius: 20,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.primary + '0D',
  },
  logo: { fontSize: 42, fontWeight: '900', color: COLORS.primary, letterSpacing: 10 },
  tagline: {
    fontSize: 13,
    color: COLORS.textSecondary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  choices: { marginBottom: SPACING.xl },
  chooseLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
    marginLeft: SPACING.xs,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  roleIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary + '18',
    borderWidth: 1,
    borderColor: COLORS.primary + '33',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  roleTextWrap: { flex: 1, minWidth: 0 },
  roleTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', marginBottom: 3 },
  roleSubtitle: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18 },
  linkText: { color: COLORS.textSecondary, textAlign: 'center', fontSize: 14 },
  linkAccent: { color: COLORS.primary, fontWeight: '600' },
});
