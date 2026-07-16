// Shown when a teacher lands on the Free plan with more students than it
// includes (e.g. after a Studio downgrade): they pick exactly `limit`
// students to keep. Everyone else is UNLINKED, not deleted — the student's
// account, history and score are untouched, and they can reconnect with the
// teacher's join code any time (same as a manual remove). Not dismissible:
// the choice is theirs to make, not ours to guess.
import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { COLORS, SPACING, themedStyles } from '../constants/theme';
import { displayName } from '../lib/displayName';
import { track } from '../lib/analytics';

export default function StudentKeeperModal({ visible, students, limit, onDone }) {
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);

  const toggle = (uid) => setPicked((p) => {
    if (p.includes(uid)) return p.filter((x) => x !== uid);
    return p.length < limit ? [...p, uid] : p;
  });

  const confirm = async () => {
    if (picked.length !== limit || saving) return;
    setSaving(true);
    const dropped = students.filter((s) => !picked.includes(s.uid));
    for (const s of dropped) {
      try { await updateDoc(doc(db, 'users', s.uid), { teacherUid: null }); } catch (e) { /* best-effort per student */ }
    }
    try { await updateDoc(doc(db, 'users', auth.currentUser.uid), { students: picked }); } catch (e) {}
    track('roster_trimmed', { kept: picked.length, dropped: dropped.length });
    setSaving(false);
    onDone(picked);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.dim}>
        <View style={styles.card}>
          <Text style={styles.title}>Choose your {limit} students</Text>
          <Text style={styles.sub}>
            Your plan includes {limit} connected students. Pick who stays — the others are
            unlinked (their accounts and progress are untouched) and can reconnect with your
            join code whenever you upgrade.
          </Text>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {students.map((s) => {
              const on = picked.includes(s.uid);
              return (
                <TouchableOpacity key={s.uid} style={styles.row} onPress={() => toggle(s.uid)} activeOpacity={0.7}>
                  <Ionicons
                    name={on ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={on ? COLORS.primary : COLORS.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{displayName(s)}</Text>
                    {!!s.email && <Text style={styles.email} numberOfLines={1}>{s.email}</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            style={[styles.btn, picked.length !== limit && styles.btnOff]}
            onPress={confirm}
            disabled={picked.length !== limit || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.btnText}>Keep these {picked.length}/{limit}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(2,4,10,0.85)', alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.xl, marginHorizontal: 28, alignSelf: 'stretch', maxHeight: '78%',
  },
  title: { color: COLORS.text, fontSize: 19, fontWeight: '800' },
  sub: { color: COLORS.textSecondary, fontSize: 13.5, lineHeight: 20, marginTop: 6, marginBottom: SPACING.md },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  name: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  email: { color: COLORS.textMuted, fontSize: 12, marginTop: 1 },
  btn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: SPACING.lg,
  },
  btnOff: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
}));
