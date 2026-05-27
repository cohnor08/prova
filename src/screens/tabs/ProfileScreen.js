import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';import { signOut } from 'firebase/auth';
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
    } finally {
      setLoading(false);
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

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

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
