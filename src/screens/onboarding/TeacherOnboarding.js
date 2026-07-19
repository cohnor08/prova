import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Ghost from '../../components/Ghost';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, setDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../lib/firebase';
import { useAuthContext } from '../../contexts/AuthContext';
import { COLORS, SPACING, INSTRUMENTS, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';

export default function TeacherOnboarding() {
  useThemeSync();
  const { setOnboardingComplete } = useAuthContext();
  const [name, setName] = useState('');
  const [teaches, setTeaches] = useState([]);
  const [saving, setSaving] = useState(false);

  const toggleInstrument = (inst) => {
    setTeaches((prev) =>
      prev.includes(inst) ? prev.filter((i) => i !== inst) : [...prev, inst]
    );
  };

  const handleFinish = async () => {
    if (!name.trim()) {
      Alert.alert('Add your name', 'Students will see this name when you message them.');
      return;
    }
    if (teaches.length === 0) {
      Alert.alert('Pick what you teach', 'Select at least one instrument.');
      return;
    }
    setSaving(true);
    try {
      const uid = auth.currentUser.uid;
      await setDoc(
        doc(db, 'users', uid),
        {
          name: name.trim(),
          teaches,
          onboardingComplete: true,
        },
        { merge: true }
      );
      await AsyncStorage.setItem(`onboarding_${uid}`, 'true');
      setOnboardingComplete(true);
    } catch (error) {
      setSaving(false);
      Alert.alert('Error', error.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}>
            <Ionicons name="school" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Welcome to Prova for Teachers</Text>
          <Text style={styles.subtitle}>Just a couple of quick details to get set up.</Text>

          <Text style={styles.label}>YOUR NAME</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="e.g. Alex Morgan"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <Text style={[styles.label, { marginTop: SPACING.lg }]}>WHAT DO YOU TEACH?</Text>
          <View style={styles.instrumentRow}>
            {INSTRUMENTS.map((inst) => {
              const active = teaches.includes(inst);
              return (
                <TouchableOpacity
                  key={inst}
                  style={[styles.instrumentChip, active && styles.instrumentChipActive]}
                  onPress={() => toggleInstrument(inst)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={inst === 'Bass' ? 'musical-note' : 'musical-notes'}
                    size={16}
                    color={active ? COLORS.text : COLORS.textMuted}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.instrumentText, active && styles.instrumentTextActive]}>
                    {inst}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={handleFinish}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <Ghost color={COLORS.text} size="small" />
              : <Text style={styles.buttonText}>Get Started</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingTop: SPACING.xxl, flexGrow: 1 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary + '18',
    borderWidth: 1,
    borderColor: COLORS.primary + '33',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800', marginBottom: SPACING.sm },
  subtitle: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: SPACING.xl },
  label: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 52,
  },
  inputIcon: { marginRight: SPACING.sm },
  input: { flex: 1, color: COLORS.text, fontSize: 16, height: '100%' },
  instrumentRow: { flexDirection: 'row', gap: SPACING.md },
  instrumentChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
  },
  instrumentChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  instrumentText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '700' },
  instrumentTextActive: { color: COLORS.text },
  footer: { padding: SPACING.xl, paddingTop: SPACING.md },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: COLORS.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
}));
