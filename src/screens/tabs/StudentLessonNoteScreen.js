import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ghost from '../../components/Ghost';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';

// Read-only view of the lesson notes + attendance the teacher recorded for this
// student. The numeric mark is intentionally never shown — only status + note.
const ATT_META = {
  present: { color: '#22C55E', label: 'Present' },
  late: { color: '#E0A800', label: 'Late' },
  absent: { color: '#EF4444', label: 'Absent' },
  excused: { color: '#94A3B8', label: 'Excused' },
};

function prettyDate(ymdStr) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function StudentLessonNoteScreen({ navigation, route }) {
  useThemeSync();
  const focusDate = route?.params?.date || null;
  const [entries, setEntries] = useState([]);
  const [taskNotes, setTaskNotes] = useState([]); // per-task feedback the teacher left
  const [loading, setLoading] = useState(true);
  // Two homes in one window. Arriving from a lesson row opens Lesson notes;
  // otherwise Task feedback leads.
  const [tab, setTab] = useState(focusDate ? 'lessons' : 'feedback');
  const [collapsed, setCollapsed] = useState(() => new Set()); // collapsed feedback sections
  const toggleSection = (label) => setCollapsed((prev) => {
    const next = new Set(prev);
    next.has(label) ? next.delete(label) : next.add(label);
    return next;
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          setLoading(true);
          const uid = auth.currentUser?.uid;
          if (!uid) { if (!cancelled) { setEntries([]); setTaskNotes([]); setLoading(false); } return; }
          const meSnap = await getDoc(doc(db, 'users', uid));
          const me = meSnap.data() || {};

          // Task feedback lives on the student's own assigned tasks (incl.
          // completed ones, which no longer show on Today).
          const fb = (me.assignedTasks || [])
            .filter((t) => (t.feedback || '').trim().length > 0)
            .map((t) => ({
              title: t.title,
              feedback: t.feedback,
              at: t.feedbackAt || t.completedAt || t.assignedAt || null,
              completed: !!t.completed,
              className: t.className || null,
            }))
            .sort((a, b) => (b.at || '').localeCompare(a.at || ''));

          if (!me.teacherUid) { if (!cancelled) { setEntries([]); setTaskNotes(fb); setLoading(false); } return; }
          const tSnap = await getDoc(doc(db, 'users', me.teacherUid));
          const att = tSnap.data()?.attendance || {};
          const list = Object.entries(att)
            .filter(([, rec]) => rec && rec.studentUid === uid && (rec.status || rec.note))
            .map(([key, rec]) => ({ date: key.split('__')[1], status: rec.status || null, note: rec.note || null }))
            .filter((x) => x.date)
            .sort((a, b) => b.date.localeCompare(a.date));
          if (!cancelled) { setEntries(list); setTaskNotes(fb); setLoading(false); }
        } catch (e) {
          if (!cancelled) { setEntries([]); setTaskNotes([]); setLoading(false); }
        }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Notes & Feedback</Text>
        <View style={{ width: 64 }} />
      </View>

      {/* ── Tab toggle: two homes, one window ── */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabPill, tab === 'feedback' && styles.tabPillOn]}
          onPress={() => setTab('feedback')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabPillText, tab === 'feedback' && styles.tabPillTextOn]}>
            Task feedback{taskNotes.length > 0 ? ` (${taskNotes.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabPill, tab === 'lessons' && styles.tabPillOn]}
          onPress={() => setTab('lessons')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabPillText, tab === 'lessons' && styles.tabPillTextOn]}>
            Lesson notes{entries.length > 0 ? ` (${entries.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><Ghost color={COLORS.primary} /></View>
      ) : tab === 'feedback' ? (
        taskNotes.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="chatbubble-ellipses-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.empty}>No task feedback yet.</Text>
            <Text style={styles.emptySub}>When your teacher comments on a task or proof video, it shows up here.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {/* Solo teacher tasks first, class tasks after — clearly separated. */}
            {[
              { label: 'FROM YOUR TEACHER', items: taskNotes.filter((f) => !f.className) },
              { label: 'CLASS TASKS', items: taskNotes.filter((f) => !!f.className) },
            ].filter((g) => g.items.length > 0).map((g, gi) => (
              <View key={g.label}>
                {/* Tappable header — fold a section away when it gets long. */}
                <TouchableOpacity
                  style={[styles.sectionHeader, gi > 0 && { marginTop: SPACING.md }]}
                  onPress={() => toggleSection(g.label)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sectionLabel}>{g.label}</Text>
                  <Text style={styles.sectionCount}>{g.items.length}</Text>
                  <Ionicons name={collapsed.has(g.label) ? 'chevron-down' : 'chevron-up'} size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
                {!collapsed.has(g.label) && g.items.map((f, i) => (
                  <View key={`${g.label}_${i}`} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardDate} numberOfLines={1}>{f.title}</Text>
                      {f.completed && <Ionicons name="checkmark-circle" size={16} color="#22C55E" style={{ marginLeft: 8 }} />}
                    </View>
                    <Text style={styles.note}>{f.feedback}</Text>
                    {(f.at || f.className) && (
                      <Text style={styles.metaLine}>
                        {[
                          f.at ? new Date(f.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null,
                          f.className,
                        ].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        )
      ) : (
        entries.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="document-text-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.empty}>No lesson notes yet.</Text>
            <Text style={styles.emptySub}>When your teacher marks a lesson, their notes show up here.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {entries.map((e, i) => {
              const meta = e.status ? ATT_META[e.status] : null;
              const focused = focusDate && e.date === focusDate;
              return (
                <View key={i} style={[styles.card, focused && styles.cardFocused]}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardDate}>{prettyDate(e.date)}</Text>
                    {meta && (
                      <View style={[styles.pill, { backgroundColor: meta.color + '22' }]}>
                        <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                    )}
                  </View>
                  {e.note ? (
                    <Text style={styles.note}>{e.note}</Text>
                  ) : (
                    <Text style={styles.noNote}>No note for this lesson.</Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )
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
  metaLine: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', marginTop: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm, paddingVertical: 2 },
  sectionLabel: { flex: 1, color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  sectionCount: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700' },
  tabRow: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  tabPill: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  tabPillOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabPillText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  tabPillTextOn: { color: '#fff' },
  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.md },
  cardFocused: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '0D' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardDate: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '700' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginLeft: 8 },
  pillText: { fontSize: 12, fontWeight: '800' },
  note: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20 },
  noNote: { color: COLORS.textMuted, fontSize: 13, fontStyle: 'italic' },
}));
