import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generatePracticePlan } from '../../lib/claude';
import { auth, db } from '../../lib/firebase';
import { AuthContext } from '../../contexts/AuthContext';
import { COLORS, SPACING, LEVELS, INSTRUMENTS, GOALS, SKILLS, PRACTICE_DURATIONS, DAYS } from '../../constants/theme';

// ─── Picker Modal ─────────────────────────────────────────────────────────────

function PickerModal({ visible, title, options, selected, multi, onSave, onClose }) {
  const [current, setCurrent] = useState(selected);

  useEffect(() => {
    setCurrent(selected);
  }, [selected, visible]);

  const toggle = (val) => {
    if (multi) {
      setCurrent((prev) =>
        prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
      );
    } else {
      setCurrent(val);
    }
  };

  const isSelected = (val) => multi ? current.includes(val) : current === val;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>

          <ScrollView style={styles.modalOptions} showsVerticalScrollIndicator={false}>
            {options.map((opt) => {
              const label = typeof opt === 'object' ? opt.label : opt;
              const val = typeof opt === 'object' ? opt.value : opt;
              const sel = isSelected(val);
              return (
                <TouchableOpacity
                  key={String(val)}
                  style={[styles.optionRow, sel && styles.optionRowSelected]}
                  onPress={() => toggle(val)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.optionText, sel && styles.optionTextSelected]}>{label}</Text>
                  {sel && <Text style={styles.optionCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={() => onSave(current)}
            >
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Legal Modal ─────────────────────────────────────────────────────────────

const PRIVACY_POLICY = `Last updated: 28 May 2026

Prova ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use the Prova mobile application.

1. INFORMATION WE COLLECT

Account Information
When you create an account, we collect your email address and password (stored securely via Firebase Authentication). We never see your plain-text password.

Practice Profile
During onboarding and through Profile settings, you provide your instrument, skill level, practice goals, focus skills, available practice days, and daily practice duration. This information is used solely to generate and personalise your practice plans.

Practice Activity
When you complete a session, we record the date, duration, categories practised (e.g. warmup, technique), and your session rating (too easy / just right / too hard). We do not record audio, video, or the specific notes or exercises you play.

Usage Metadata
For security and service improvement, our backend logs each AI request with metadata including: your user ID, request timestamp, model used, and token count. We do not log the content of prompts sent to our AI provider.

2. HOW WE USE YOUR INFORMATION

We use your information to:
- Generate and adjust your personalised AI practice plans
- Track your progress (streak, total hours, sessions, Prova Score)
- Display your practice history in charts and the activity heatmap
- Detect and prevent abuse of the AI features
- Maintain the security and reliability of the Service

Your practice profile is sent to our AI provider (Anthropic) to generate plans. Anthropic processes this data according to their own privacy policy and does not use it to train their models.

3. DATA SHARING

We do not sell, rent, or share your personal information with third parties for marketing purposes. We may share data only:
- With service providers who operate the app on our behalf (Firebase/Google, Anthropic), under strict data processing agreements
- If required by law, court order, or to protect the safety of our users

4. DATA STORAGE AND SECURITY

Your data is stored in Google Firebase (Firestore and Firebase Authentication), hosted in secure Google Cloud data centres. We use industry-standard encryption in transit (TLS) and at rest. Access is restricted by security rules that ensure you can only access your own data.

5. DATA RETENTION

We retain your account and practice data for as long as your account is active. You may request deletion of your account and all associated data by contacting us at privacy@prova.app. We will action deletion requests within 30 days.

6. CHILDREN'S PRIVACY

Prova is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us immediately.

7. YOUR RIGHTS

Depending on your location, you may have the right to access, correct, or delete the personal data we hold about you. To exercise these rights, contact us at privacy@prova.app.

8. CHANGES TO THIS POLICY

We may update this Privacy Policy periodically. We will notify you of significant changes by updating the date at the top of this page. Continued use of the app after changes constitutes acceptance of the updated policy.

9. CONTACT

For privacy-related questions, contact us at: privacy@prova.app`;

const TERMS_CONDITIONS = `Last updated: 28 May 2026

Please read these Terms and Conditions carefully before using the Prova application. By creating an account or using the Service, you agree to be bound by these Terms.

1. ACCEPTANCE OF TERMS

By accessing or using Prova, you confirm that you are at least 13 years old and agree to these Terms. If you are under 18, you should review these Terms with a parent or guardian. If you do not agree to any part of these Terms, do not use the Service.

2. YOUR ACCOUNT

You are responsible for maintaining the confidentiality of your account credentials. You must provide accurate information when registering and keep it up to date. You are responsible for all activity that occurs under your account. Notify us immediately at legal@prova.app if you suspect unauthorised access.

We reserve the right to suspend or terminate accounts that violate these Terms, engage in abusive behaviour, or attempt to circumvent service limits.

3. THE SERVICE

Prova provides AI-generated music practice plans, session tracking, and progress analytics for guitar and bass players. The Service is provided on a best-efforts basis and features may change over time.

AI-Generated Content: Practice plans are generated by an AI model and are intended as a starting point for your practice. They do not constitute professional music instruction. Results depend on your own effort, consistency, and musical development. We make no guarantees about specific outcomes.

Usage Limits: To ensure fair access and protect service stability, each account is subject to daily limits on AI requests. Attempting to circumvent these limits is a violation of these Terms.

4. ACCEPTABLE USE

You agree not to:
- Use the Service for any unlawful purpose
- Attempt to access other users' accounts or data
- Reverse-engineer, scrape, or extract data from the Service
- Use automated tools to make AI requests beyond normal personal use
- Share your account credentials with others
- Attempt to overload or disrupt the Service

5. INTELLECTUAL PROPERTY

All content, branding, design, and code in Prova is the property of Prova and its licensors. You may not copy, reproduce, or redistribute any part of the Service without our written permission. Your personal data and practice history belong to you.

6. LIMITATION OF LIABILITY

To the maximum extent permitted by law, Prova and its team shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service, including loss of data, loss of practice progress, or interruption of service.

Our total liability for any claim arising from use of the Service shall not exceed the amount you paid for the Service in the 12 months preceding the claim (or NZD $10 if you have not paid anything).

7. DISCLAIMER OF WARRANTIES

The Service is provided "as is" and "as available" without warranties of any kind, express or implied. We do not warrant that the Service will be uninterrupted, error-free, or that AI-generated practice plans will meet your specific musical goals.

8. GOVERNING LAW

These Terms are governed by the laws of New Zealand. Any disputes shall be subject to the exclusive jurisdiction of the courts of New Zealand.

9. CHANGES TO TERMS

We may update these Terms periodically. We will give at least 14 days' notice of material changes by updating the date above. Continued use of the Service after changes take effect constitutes acceptance.

10. CONTACT

For questions about these Terms: legal@prova.app`;

function LegalModal({ visible, title, content, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={legalStyles.container}>
        <View style={legalStyles.header}>
          <Text style={legalStyles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={legalStyles.close}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={legalStyles.body} showsVerticalScrollIndicator={false}>
          <Text style={legalStyles.content}>{content}</Text>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const legalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: SPACING.xl, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  close: { color: COLORS.textSecondary, fontSize: 20, fontWeight: '600' },
  body: { flex: 1, padding: SPACING.xl },
  content: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 22 },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

function Row({ icon, label, value, valueColor }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={COLORS.textMuted} style={styles.rowIcon} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor && { color: valueColor }]}>{value || '—'}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { setOnboardingComplete } = useContext(AuthContext);
  const [userData, setUserData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [legalVisible, setLegalVisible] = useState(null); // 'privacy' | 'terms' | null
  const [modal, setModal] = useState(null); // { key, title, options, multi }
  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'users', uid));
      setUserData(snap.data());
    } catch (error) {
      console.error(error);
    }
  };

  const openModal = (key, title, options, multi = false) => {
    setModal({ key, title, options, multi });
  };

  const handleSave = async (value) => {
    const key = modal.key;
    setModal(null);
    setSaving(true);
    try {
      const uid = auth.currentUser.uid;
      await updateDoc(doc(db, 'users', uid), { [key]: value });
      setUserData((prev) => ({ ...prev, [key]: value }));

      const planKeys = ['instrument', 'level', 'goals', 'skills', 'availableDays', 'dailyDuration'];
      if (planKeys.includes(key)) {
        Alert.alert(
          'Regenerate Plan?',
          'Your settings changed. Would you like Prova to build you a new practice plan?',
          [
            { text: 'Not Now', style: 'cancel' },
            { text: 'Regenerate', onPress: () => handleRegenerate({ ...userData, [key]: value }) },
          ]
        );
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async (profile) => {
    setRegenerating(true);
    try {
      const uid = auth.currentUser.uid;
      const plan = await generatePracticePlan(profile);
      await setDoc(doc(db, 'users', uid), {
        practicePlan: plan,
        planGeneratedAt: new Date().toISOString(),
      }, { merge: true });
      Alert.alert('Done!', 'Your new practice plan is ready. Head to the Today tab.');
    } catch (err) {
      Alert.alert('Error', `Could not regenerate plan: ${err.message}`);
    } finally {
      setRegenerating(false);
    }
  };

  const handleResetTeacherPro = () => {
    Alert.alert('Reset Teacher Pro', 'This will remove your Teacher Pro access so you can see the paywall again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset', onPress: async () => {
          try {
            const uid = auth.currentUser?.uid;
            if (!uid) return;
            await updateDoc(doc(db, 'users', uid), { isTeacherPro: false });
            Alert.alert('Done', 'Teacher Pro reset. Tap the Teacher tab to see the paywall.');
          } catch (err) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const handleRestartSurvey = () => {
    Alert.alert('Restart Survey', 'This will take you back through the setup survey and generate a new plan. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restart', onPress: async () => {
          try {
            const uid = auth.currentUser?.uid;
            if (!uid) return;
            await updateDoc(doc(db, 'users', uid), { onboardingComplete: false });
            await AsyncStorage.removeItem(`onboarding_${uid}`);
            setOnboardingComplete(false);
          } catch (err) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  };

  const durationLabel = (val) => {
    const found = PRACTICE_DURATIONS.find((d) => d.value === val);
    return found ? found.label : `${val} mins`;
  };

  const currentModal = modal ? {
    instrument: { options: INSTRUMENTS, multi: false },
    level: { options: LEVELS, multi: false },
    goals: { options: GOALS, multi: true },
    skills: { options: SKILLS, multi: true },
    availableDays: { options: DAYS, multi: true },
    dailyDuration: { options: PRACTICE_DURATIONS, multi: false },
  }[modal.key] : null;
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Profile</Text>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {auth.currentUser?.email?.[0]?.toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.email}>{auth.currentUser?.email}</Text>
          <Text style={styles.levelText}>{userData?.level || 'Beginner'} · {userData?.instrument || 'Guitar'}</Text>
        </View>

        {saving && (
          <View style={styles.savingRow}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.savingText}>Saving...</Text>
          </View>
        )}
        {regenerating && (
          <View style={styles.savingRow}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.savingText}>Building your new plan...</Text>
          </View>
        )}

        {/* Practice Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRACTICE SETTINGS</Text>

          <TouchableOpacity style={styles.row} onPress={() => openModal('instrument', 'Instrument', INSTRUMENTS)}>
            <Text style={styles.rowLabel}>Instrument</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{userData?.instrument || '—'}</Text>
              <Text style={styles.rowArrow}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => openModal('level', 'Level', LEVELS)}>
            <Text style={styles.rowLabel}>Level</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{userData?.level || '—'}</Text>
              <Text style={styles.rowArrow}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => openModal('dailyDuration', 'Daily Practice Time', PRACTICE_DURATIONS)}>
            <Text style={styles.rowLabel}>Daily Duration</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{userData?.dailyDuration ? durationLabel(userData.dailyDuration) : '—'}</Text>
              <Text style={styles.rowArrow}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => openModal('availableDays', 'Practice Days', DAYS, true)}>
            <Text style={styles.rowLabel}>Practice Days</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue} numberOfLines={1}>
                {userData?.availableDays?.length ? `${userData.availableDays.length} days` : '—'}
              </Text>
              <Text style={styles.rowArrow}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Goals & Skills */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>GOALS & SKILLS</Text>

          <TouchableOpacity style={styles.row} onPress={() => openModal('goals', 'Your Goals', GOALS, true)}>
            <Text style={styles.rowLabel}>Goals</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue} numberOfLines={1}>
                {userData?.goals?.length ? userData.goals.slice(0, 2).join(', ') + (userData.goals.length > 2 ? '…' : '') : '—'}
              </Text>
              <Text style={styles.rowArrow}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => openModal('skills', 'Skills to Focus On', SKILLS, true)}>
            <Text style={styles.rowLabel}>Focus Skills</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue} numberOfLines={1}>
                {userData?.skills?.length ? userData.skills.slice(0, 2).join(', ') + (userData.skills.length > 2 ? '…' : '') : '—'}
              </Text>
              <Text style={styles.rowArrow}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <TouchableOpacity style={styles.row} onPress={() => {
            Alert.prompt('Set Username', 'This shows on the leaderboard', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Save', onPress: async (val) => {
                const trimmed = (val || '').trim();
                if (!trimmed || trimmed.length < 2) { Alert.alert('Too short', 'At least 2 characters.'); return; }
                try {
                  await updateDoc(doc(db, 'users', auth.currentUser.uid), { username: trimmed });
                  setUserData(prev => ({ ...prev, username: trimmed }));
                } catch (e) { Alert.alert('Error', e.message); }
              }},
            ], 'plain-text', userData?.username || '');
          }}>
            <Text style={styles.rowLabel}>Username</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{userData?.username || 'Tap to set'}</Text>
              <Text style={styles.rowArrow}>›</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue}>{auth.currentUser?.email}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Plan</Text>
            <Text style={[styles.rowValue, { color: COLORS.primary }]}>
              {userData?.isTeacherPro ? 'Teacher Pro' : 'Free'}
            </Text>
          </View>
        </View>

        {/* Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LEGAL</Text>
          <TouchableOpacity style={styles.row} onPress={() => setLegalVisible('privacy')}>
            <Text style={styles.rowLabel}>Privacy Policy</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={() => setLegalVisible('terms')}>
            <Text style={styles.rowLabel}>Terms & Conditions</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.restartBtn} onPress={handleRestartSurvey}>
          <Text style={styles.restartText}>Restart Survey</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.restartBtn} onPress={handleResetTeacherPro}>
          <Text style={styles.restartText}>Reset Teacher Pro</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <LegalModal
        visible={legalVisible === 'privacy'}
        title="Privacy Policy"
        content={PRIVACY_POLICY}
        onClose={() => setLegalVisible(null)}
      />
      <LegalModal
        visible={legalVisible === 'terms'}
        title="Terms & Conditions"
        content={TERMS_CONDITIONS}
        onClose={() => setLegalVisible(null)}
      />

      {modal && currentModal && (
        <PickerModal
          visible={!!modal}
          title={modal.title}
          options={currentModal.options}
          selected={userData?.[modal.key] ?? (currentModal.multi ? [] : '')}
          multi={currentModal.multi}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </SafeAreaView>  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.xl },

  avatarSection: { alignItems: 'center', marginBottom: SPACING.xl },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md,
  },
  avatarText: { color: COLORS.text, fontSize: 32, fontWeight: '800' },
  email: { color: COLORS.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  levelText: { color: COLORS.textSecondary, fontSize: 14 },

  savingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  savingText: { color: COLORS.textSecondary, fontSize: 13 },

  section: { marginBottom: SPACING.xl },
  sectionTitle: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.sm },

  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  rowLabel: { color: COLORS.textSecondary, fontSize: 15 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, maxWidth: '55%' },
  rowValue: { color: COLORS.text, fontSize: 15, fontWeight: '500', textAlign: 'right' },
  rowArrow: { color: COLORS.textMuted, fontSize: 18, lineHeight: 20 },

  restartBtn: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.lg,
  },
  restartText: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '600' },
  logoutBtn: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.error + '44', marginTop: SPACING.sm,
  },
  logoutText: { color: COLORS.error, fontSize: 16, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.xl, maxHeight: '75%',
  },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginBottom: SPACING.lg },
  modalOptions: { marginBottom: SPACING.lg },
  optionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.md, borderRadius: 12,
    marginBottom: SPACING.xs,
  },
  optionRowSelected: { backgroundColor: COLORS.primary + '22' },
  optionText: { color: COLORS.textSecondary, fontSize: 16 },
  optionTextSelected: { color: COLORS.text, fontWeight: '600' },
  optionCheck: { color: COLORS.primary, fontSize: 16, fontWeight: '800' },
  modalBtns: { flexDirection: 'row', gap: SPACING.md },
  modalCancelBtn: {
    flex: 1, padding: SPACING.md, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  modalCancelText: { color: COLORS.textSecondary, fontWeight: '600' },
  modalSaveBtn: { flex: 1, padding: SPACING.md, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center' },
  modalSaveText: { color: COLORS.text, fontWeight: '700' },
});
