import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';
import { displayName } from '../../lib/displayName';
import { pastTasks, setRevived } from '../../lib/taskVisibility';

// Teacher tasks the student has finished and that have left Today (see
// lib/taskVisibility.js). Bring one back and it sits on Today again until it's
// practiced; "Practice now" also opens the player on it. Same screen as the
// web app's Past tasks page.

function dueText(t) {
  const v = t.dueDate || t.assignedAt;
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return t.dueDate ? `was due ${day}` : `set ${day}`;
}

export default function PastTasksScreen({ navigation }) {
  useThemeSync();
  const [tasks, setTasks] = useState(null);
  const [names, setNames] = useState({});   // teacherUid -> name

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setTasks([]); return undefined; }
    return onSnapshot(doc(db, 'users', uid),
      (snap) => setTasks(Array.isArray(snap.data()?.assignedTasks) ? snap.data().assignedTasks : []),
      () => setTasks([]));
  }, []);

  // Name whoever set each task — including teachers the student has since
  // left, which the Today screen's lookup doesn't cover.
  const uidsKey = [...new Set((tasks || []).map((t) => t.teacherUid).filter(Boolean))].sort().join(',');
  useEffect(() => {
    if (!uidsKey) return undefined;
    let alive = true;
    Promise.all(uidsKey.split(',').map(async (tid) => {
      try { return [tid, displayName((await getDoc(doc(db, 'users', tid))).data() || {})]; }
      catch { return [tid, '']; }
    })).then((entries) => { if (alive) setNames(Object.fromEntries(entries)); });
    return () => { alive = false; };
  }, [uidsKey]);

  const bringBack = async (task, practice) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await updateDoc(doc(db, 'users', uid), { assignedTasks: setRevived(tasks, task.id, true) });
    } catch {
      Alert.alert('Error', "Couldn't save. Please try again.");
      return;
    }
    if (practice) navigation.navigate('Today', { screen: 'TodayHome', params: { practiceTask: task.id } });
    else Alert.alert('Back on Today', `"${task.title}" is on your Today list again.`);
  };

  const list = pastTasks(tasks);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Past tasks</Text>
        <View style={{ width: 64 }} />
      </View>

      {tasks === null ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : list.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-done-outline" size={40} color={COLORS.textMuted} />
          <Text style={styles.empty}>Nothing here yet</Text>
          <Text style={styles.emptySub}>Tasks you finish move here once their due date has passed.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>Tasks from your teacher you've already finished. Bring one back to keep working on it.</Text>
          {list.map((t, i) => (
            <View key={`${t.id}_${i}`} style={styles.card}>
              <Text style={styles.title} numberOfLines={2}>{t.title}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[names[t.teacherUid] || t.className || '', dueText(t)].filter(Boolean).join(' · ')}
              </Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => bringBack(t, false)} activeOpacity={0.8}>
                  <Text style={styles.btnGhostText}>Bring back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={() => bringBack(t, true)} activeOpacity={0.85}>
                  <Ionicons name="play" size={14} color={COLORS.onPrimary} />
                  <Text style={styles.btnText}>Practice now</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 64 },
  backText: { color: COLORS.primary, fontSize: 16, fontWeight: '600' },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  empty: { color: COLORS.text, fontSize: 15, fontWeight: '700', marginTop: SPACING.md },
  emptySub: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  content: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  intro: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: SPACING.md },
  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.sm },
  title: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  meta: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.primary },
  btnText: { color: COLORS.onPrimary, fontSize: 14, fontWeight: '700' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border },
  btnGhostText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
}));
