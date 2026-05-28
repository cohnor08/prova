import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
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

const PRIVACY_POLICY = `Last updated: [Date]

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Prova ("we", "us", or "our") operates the Prova mobile application (the "Service"). This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our Service.

1. INFORMATION WE COLLECT

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. We collect information you provide directly to us, such as when you create an account, complete onboarding, or use our AI-powered practice planning features.

Account Information: Lorem ipsum dolor sit amet, consectetur adipiscing elit. When you register, we collect your email address and practice profile information including your instrument, skill level, goals, and available practice time.

Usage Data: Lorem ipsum dolor sit amet, consectetur adipiscing elit. We automatically collect certain information about how you interact with the Service, including session durations, practice completion rates, and feature usage patterns.

2. HOW WE USE YOUR INFORMATION

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. We use the information we collect to provide, maintain, and improve our Services, process your AI-generated practice plans, track your progress, and communicate with you about updates to the Service.

AI Practice Planning: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Your practice profile (instrument, level, goals, schedule) is sent to our AI service to generate personalised practice plans. We do not store your prompts or AI-generated responses beyond what is necessary to provide the Service.

3. DATA SHARING AND DISCLOSURE

Lorem ipsum dolor sit amet, consectetur adipiscing elit. We do not sell, trade, or rent your personal information to third parties. We may share information in the following limited circumstances: with your consent, to comply with legal obligations, or to protect the rights, property, or safety of Prova, our users, or others.

4. DATA RETENTION

Lorem ipsum dolor sit amet, consectetur adipiscing elit. We retain your account information for as long as your account is active or as needed to provide you with our Services. You may delete your account at any time by contacting us, and we will delete your personal information within 30 days.

5. SECURITY

Lorem ipsum dolor sit amet, consectetur adipiscing elit. We take reasonable measures to help protect information about you from loss, theft, misuse, and unauthorised access. Your data is stored using Firebase, a Google service, and protected by industry-standard security measures.

6. CHILDREN'S PRIVACY

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Our Service is not directed to children under the age of 13. We do not knowingly collect personal information from children under 13.

7. CHANGES TO THIS POLICY

Lorem ipsum dolor sit amet, consectetur adipiscing elit. We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.

8. CONTACT US

Lorem ipsum dolor sit amet, consectetur adipiscing elit. If you have any questions about this Privacy Policy, please contact us at: privacy@prova.app`;

const TERMS_CONDITIONS = `Last updated: [Date]

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Please read these Terms and Conditions carefully before using the Prova mobile application operated by us. Your access to and use of the Service is conditioned on your acceptance of and compliance with these Terms.

1. ACCEPTANCE OF TERMS

Lorem ipsum dolor sit amet, consectetur adipiscing elit. By accessing or using our Service, you agree to be bound by these Terms. If you disagree with any part of the Terms, you may not access the Service. These Terms apply to all visitors, users, and others who access or use the Service.

2. ACCOUNTS

Lorem ipsum dolor sit amet, consectetur adipiscing elit. When you create an account with us, you must provide information that is accurate, complete, and current at all times. You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password. You agree not to disclose your password to any third party.

3. AI-GENERATED CONTENT

Lorem ipsum dolor sit amet, consectetur adipiscing elit. The practice plans and recommendations generated by our AI are for informational purposes only and should not be considered professional music instruction. Results may vary based on your individual circumstances, skill level, and consistency of practice. We make no guarantees about specific outcomes.

Rate Limits: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Free accounts are subject to daily usage limits on AI-generated content. These limits exist to ensure fair access for all users and to protect the integrity of the Service.

4. ACCEPTABLE USE

Lorem ipsum dolor sit amet, consectetur adipiscing elit. You agree not to use the Service in any way that could damage, disable, overburden, or impair the Service, or interfere with any other party's use of the Service. You may not attempt to gain unauthorised access to any part of the Service, other accounts, or computer systems connected to the Service.

5. INTELLECTUAL PROPERTY

Lorem ipsum dolor sit amet, consectetur adipiscing elit. The Service and its original content (excluding content provided by users), features, and functionality are and will remain the exclusive property of Prova and its licensors. Our trademarks and trade dress may not be used in connection with any product or service without the prior written consent of Prova.

6. TERMINATION

Lorem ipsum dolor sit amet, consectetur adipiscing elit. We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms. Upon termination, your right to use the Service will cease immediately.

7. LIMITATION OF LIABILITY

Lorem ipsum dolor sit amet, consectetur adipiscing elit. In no event shall Prova, its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your use of the Service.

8. DISCLAIMER

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Your use of the Service is at your sole risk. The Service is provided on an "AS IS" and "AS AVAILABLE" basis. The Service is provided without warranties of any kind, whether express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, non-infringement, or course of performance.

9. GOVERNING LAW

Lorem ipsum dolor sit amet, consectetur adipiscing elit. These Terms shall be governed and construed in accordance with the laws of New Zealand, without regard to its conflict of law provisions.

10. CHANGES TO TERMS

Lorem ipsum dolor sit amet, consectetur adipiscing elit. We reserve the right to modify or replace these Terms at any time. We will provide at least 30 days' notice before any new terms take effect. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms.

11. CONTACT US

Lorem ipsum dolor sit amet, consectetur adipiscing elit. If you have any questions about these Terms, please contact us at: legal@prova.app`;

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
  const [userData, setUserData] = useState(null);
  const [saving, setSaving] = useState(false);
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
          'Your settings changed. Would you like Prova to regenerate your practice plan?',
          [
            { text: 'Not Now', style: 'cancel' },
            { text: 'Regenerate', onPress: () => Alert.alert('Coming Soon', 'Plan regeneration will be available in the next update.') },
          ]
        );
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
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

  logoutBtn: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.error + '44', marginTop: SPACING.lg,  },
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
