import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';

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
  const focusDate = route?.params?.date || null;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          setLoading(true);
          const uid = auth.currentUser?.uid;
          if (!uid) { if (!cancelled) { setEntries([]); setLoading(false); } return; }
          const meSnap = await getDoc(doc(db, 'users', uid));
          const me = meSnap.data() || {};
          if (!me.teacherUid) { if (!cancelled) { setEntries([]); setLoading(false); } return; }
          const tSnap = await getDoc(doc(db, 'users', me.teacherUid));
          const att = tSnap.data()?.attendance || {};
          const list = Object.entries(att)
            .filter(([, rec]) => rec && rec.studentUid === uid && (rec.status || rec.note))
            .map(([key, rec]) => ({ date: key.split('__')[1], status: rec.status || null, note: rec.note || null }))
            .filter((x) => x.date)
            .sort((a, b) => b.date.localeCompare(a.date));
          if (!cancelled) { setEntries(list); setLoading(false); }
        } catch (e) {
          if (!cancelled) { setEntries([]); setLoading(false); }
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
        <Text style={styles.navTitle}>Lesson Notes</Text>
        <View style={{ width: 64 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="document-text-outline" size={40} color={COLORS.textMuted} />
          <Text style={styles.empty}>No lesson notes yet.</Text>
          <Text style={styles.emptySub}>When your teacher marks a lesson, their feedback shows up here.</Text>
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 64 },
  backText: { color: COLORS.primary, fontSize: 16, fontWeight: '600' },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  empty: { color: COLORS.text, fontSize: 15, fontWeight: '700', marginTop: SPACING.md },
  emptySub: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  content: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.md },
  cardFocused: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '0D' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardDate: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '700' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginLeft: 8 },
  pillText: { fontSize: 12, fontWeight: '800' },
  note: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20 },
  noNote: { color: COLORS.textMuted, fontSize: 13, fontStyle: 'italic' },
});
