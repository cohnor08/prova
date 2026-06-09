import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';
import { DEMO_MODE, DEMO_STUDENTS_DATA } from './TeacherScreen';

function computeStats(students) {
  const weekAgo = Date.now() - 7 * 86400000;
  const active = students.filter((s) => s.lastSessionDate && new Date(s.lastSessionDate).getTime() >= weekAgo).length;
  const tasks = students.reduce((sum, s) => sum + (Array.isArray(s.assignedTasks) ? s.assignedTasks.length : 0), 0);
  return { students: students.length, active, tasks };
}

const TIPS = [
  'Keep early lessons to one clear goal per week — the student always knows what success looks like.',
  'Most beginner buzzing is fixed by pressing just behind the fret with the fingertip, not the pad.',
  '“Slow is fast.” Loop the hardest two bars at half speed for 10 perfect reps before speeding up.',
  'End every lesson by assigning one specific, measurable task for the week.',
  'Have students record one take a week — hearing themselves catches what a lesson misses.',
  'Praise the process (clean changes, steady tempo), not just the result.',
  'Match new songs to the exact skill you just taught so practice reinforces the lesson.',
];

function tipOfTheDay() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const day = Math.floor((Date.now() - start) / 86400000);
  return TIPS[day % TIPS.length];
}

function StatCard({ value, label, icon }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={18} color={COLORS.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ChecklistRow({ done, label, onPress }) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress}>
      <Ionicons
        name={done ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
        color={done ? COLORS.success : COLORS.textMuted}
      />
      <Text style={[styles.checkLabel, done && styles.checkLabelDone]}>{label}</Text>
      {onPress && !done && <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />}
    </TouchableOpacity>
  );
}

export default function TeacherHomeScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ students: 0, active: 0, tasks: 0 });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (DEMO_MODE) {
        setStats(computeStats(DEMO_STUDENTS_DATA));
        setLoading(false);
        return () => { cancelled = true; };
      }
      (async () => {
        try {
          const uid = auth.currentUser?.uid;
          if (!uid) return;
          const me = await getDoc(doc(db, 'users', uid));
          const studentUids = me.data()?.students || [];
          const docs = await Promise.all(
            studentUids.map((suid) => getDoc(doc(db, 'users', suid)).then((s) => (s.exists() ? s.data() : null)))
          );
          const students = docs.filter(Boolean);
          if (!cancelled) setStats(computeStats(students));
        } catch (e) {
          console.error(e);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const goStudents = () => navigation.navigate('Teacher');
  const goResources = () => navigation.navigate('Resources');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>TEACHER HOME</Text>
        <Text style={styles.title}>Welcome back, coach 👋</Text>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard value={stats.students} label="Students" icon="people" />
              <StatCard value={stats.active} label="Active this week" icon="flame" />
              <StatCard value={stats.tasks} label="Tasks assigned" icon="clipboard" />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Get started</Text>
              <ChecklistRow done={stats.students > 0} label="Add your first student" onPress={goStudents} />
              <ChecklistRow done={stats.tasks > 0} label="Assign a practice task" onPress={goStudents} />
              <ChecklistRow done={false} label="Browse the resource library" onPress={goResources} />
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={goStudents} activeOpacity={0.85}>
                <Ionicons name="person-add" size={18} color={COLORS.text} />
                <Text style={styles.actionText}>Add a student</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={goResources} activeOpacity={0.85}>
                <Ionicons name="library" size={18} color={COLORS.primary} />
                <Text style={[styles.actionText, { color: COLORS.primary }]}>Resources</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tipCard}>
              <View style={styles.tipHeader}>
                <Ionicons name="bulb" size={16} color={COLORS.accent || COLORS.primary} />
                <Text style={styles.tipKicker}>TIP OF THE DAY</Text>
              </View>
              <Text style={styles.tipText}>{tipOfTheDay()}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg },
  kicker: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.xs },
  title: { color: COLORS.text, fontSize: 24, fontWeight: '800', marginBottom: SPACING.lg },
  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  statCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: SPACING.md,
    alignItems: 'center', gap: 4, borderWidth: 1, borderColor: COLORS.border,
  },
  statValue: { color: COLORS.text, fontSize: 22, fontWeight: '800' },
  statLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'center', letterSpacing: 0.4 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg,
  },
  cardTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800', marginBottom: SPACING.sm },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 10 },
  checkLabel: { color: COLORS.textSecondary, fontSize: 14, flex: 1 },
  checkLabelDone: { color: COLORS.textMuted, textDecorationLine: 'line-through' },
  actionsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14,
  },
  actionBtnAlt: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  actionText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  tipCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  tipKicker: { color: COLORS.accent || COLORS.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  tipText: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21 },
});
