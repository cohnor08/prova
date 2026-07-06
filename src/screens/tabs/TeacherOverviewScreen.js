import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { displayName } from '../../lib/displayName';
import { COLORS, SPACING } from '../../constants/theme';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const STATUS_META = {
  present: { label: 'Present', color: '#22C55E' },
  late:    { label: 'Late',    color: '#E0A800' },
  absent:  { label: 'Absent',  color: '#EF4444' },
  excused: { label: 'Excused', color: '#94A3B8' },
};

const RANGES = [
  { key: '30d',  label: '30 days', days: 30 },
  { key: 'term', label: 'Term',    days: 91 },   // ~13 weeks
  { key: 'year', label: 'Year',    days: 365 },
  { key: 'all',  label: 'All',     days: null },
];

// Every date a lesson actually happens within [startStr, endStr] — expanding
// weekly recurrences and skipping anything in the future.
function occurrencesInRange(lesson, startStr, endStr) {
  const out = [];
  const end = parseYmd(endStr);
  if (lesson.repeat === 'weekly') {
    const start = parseYmd(startStr);
    let d = parseYmd(lesson.date);
    while (d < start) d = addDays(d, 7);
    while (d <= end) { out.push(ymd(d)); d = addDays(d, 7); }
  } else if (lesson.date >= startStr && lesson.date <= endStr) {
    out.push(lesson.date);
  }
  return out;
}

function pctColor(pct) {
  if (pct == null) return COLORS.textMuted;
  if (pct >= 90) return '#22C55E';
  if (pct >= 75) return '#E0A800';
  return '#EF4444';
}

export default function TeacherOverviewScreen({ navigation }) {
  const [lessons, setLessons] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [students, setStudents] = useState([]);
  const [range, setRange] = useState('term');
  const [openUid, setOpenUid] = useState(null);
  const [occShown, setOccShown] = useState({}); // uid -> lessons revealed (starts at 3, +7 per "Show more")

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const uid = auth.currentUser?.uid;
          if (!uid) return;
          const [meSnap, stuSnap] = await Promise.all([
            getDoc(doc(db, 'users', uid)),
            getDocs(query(collection(db, 'users'), where('teacherUid', '==', uid))),
          ]);
          if (cancelled) return;
          const me = meSnap.data() || {};
          setLessons(Array.isArray(me.lessons) ? me.lessons : []);
          setAttendance(me.attendance || {});
          setStudents(stuSnap.docs.map((d) => ({ uid: d.id, ...d.data() })));
        } catch (e) { /* ignore */ }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const today = new Date();
  const todayStr = ymd(today);
  const rangeDef = RANGES.find((r) => r.key === range) || RANGES[1];
  const startStr = rangeDef.days == null ? '0000-01-01' : ymd(addDays(today, -rangeDef.days));

  // Per-student attendance + marks across the selected range.
  const rows = students.map((stu) => {
    const mine = lessons.filter((l) => l.studentUid === stu.uid);
    const counts = { present: 0, late: 0, absent: 0, excused: 0, unmarked: 0 };
    let markSum = 0, markCount = 0;
    const occ = [];
    mine.forEach((l) => {
      occurrencesInRange(l, startStr, todayStr).forEach((dateStr) => {
        const rec = attendance[`${l.id}__${dateStr}`] || {};
        const status = rec.status || 'unmarked';
        counts[status] = (counts[status] || 0) + 1;
        if (rec.mark) { markSum += rec.mark; markCount += 1; }
        occ.push({ date: dateStr, time: l.time, status: rec.status || null, mark: rec.mark || null, note: rec.note || null });
      });
    });
    const denom = counts.present + counts.late + counts.absent;
    const pct = denom > 0 ? Math.round(((counts.present + counts.late) / denom) * 100) : null;
    const avgMark = markCount ? markSum / markCount : null;
    occ.sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
    return { stu, name: displayName(stu), counts, total: occ.length, pct, avgMark, occ };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const totalLessons = rows.reduce((s, r) => s + r.total, 0);
  const totMarked = rows.reduce((s, r) => s + r.counts.present + r.counts.late + r.counts.absent, 0);
  const totAttended = rows.reduce((s, r) => s + r.counts.present + r.counts.late, 0);
  const studioPct = totMarked > 0 ? Math.round((totAttended / totMarked) * 100) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Lessons</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Overview</Text>
        <View style={{ width: 72 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Range selector */}
        <View style={styles.rangeRow}>
          {RANGES.map((r) => {
            const on = range === r.key;
            return (
              <TouchableOpacity key={r.key} style={[styles.rangeChip, on && styles.rangeChipOn]} onPress={() => setRange(r.key)} activeOpacity={0.85}>
                <Text style={[styles.rangeText, on && styles.rangeTextOn]}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Studio summary */}
        <View style={styles.summary}>
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryNum, { color: pctColor(studioPct) }]}>{studioPct == null ? '—' : `${studioPct}%`}</Text>
            <Text style={styles.summaryLabel}>ATTENDANCE</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryStat}>
            <Text style={styles.summaryNum}>{totalLessons}</Text>
            <Text style={styles.summaryLabel}>LESSONS</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryStat}>
            <Text style={styles.summaryNum}>{students.length}</Text>
            <Text style={styles.summaryLabel}>STUDENTS</Text>
          </View>
        </View>

        {rows.length === 0 ? (
          <Text style={styles.empty}>No students connected yet.</Text>
        ) : rows.map((r) => {
          const open = openUid === r.stu.uid;
          return (
            <View key={r.stu.uid} style={styles.card}>
              <TouchableOpacity style={styles.cardHead} onPress={() => setOpenUid(open ? null : r.stu.uid)} activeOpacity={0.7}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
                  <Text style={styles.sub}>
                    {r.total === 0 ? 'No lessons in range' : `${r.total} lesson${r.total === 1 ? '' : 's'}`}
                    {r.avgMark != null ? `  ·  avg mark ${r.avgMark.toFixed(1)}★` : ''}
                    {r.counts.unmarked > 0 ? `  ·  ${r.counts.unmarked} unmarked` : ''}
                  </Text>
                </View>
                <Text style={[styles.pct, { color: pctColor(r.pct) }]}>{r.pct == null ? '—' : `${r.pct}%`}</Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} style={{ marginLeft: 6 }} />
              </TouchableOpacity>

              {/* Quick count pills */}
              <View style={styles.pills}>
                {['present', 'late', 'absent', 'excused'].map((k) => (
                  r.counts[k] > 0 ? (
                    <View key={k} style={[styles.pill, { borderColor: STATUS_META[k].color }]}>
                      <Text style={[styles.pillText, { color: STATUS_META[k].color }]}>{STATUS_META[k].label} {r.counts[k]}</Text>
                    </View>
                  ) : null
                ))}
              </View>

              {open && r.occ.length > 0 && (() => {
                // Newest lessons first; start at 3 and reveal older ones in
                // batches so long histories stay compact.
                const shown = occShown[r.stu.uid] || 3;
                const visible = r.occ.slice(0, shown);
                const remaining = r.occ.length - visible.length;
                return (
                  <View style={styles.occList}>
                    {visible.map((o, i) => (
                      <View key={i}>
                        <View style={styles.occRow}>
                          <Text style={styles.occDate}>{parseYmd(o.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                          <Text style={[styles.occStatus, { color: o.status ? STATUS_META[o.status].color : COLORS.textMuted }]}>
                            {o.status ? STATUS_META[o.status].label : 'Not marked'}
                          </Text>
                          <Text style={styles.occMark}>{o.mark ? `${o.mark}★` : ''}</Text>
                        </View>
                        {o.note ? <Text style={styles.occNote}>{o.note}</Text> : null}
                      </View>
                    ))}
                    {remaining > 0 && (
                      <TouchableOpacity
                        style={styles.showMoreBtn}
                        onPress={() => setOccShown((p) => ({ ...p, [r.stu.uid]: shown + 7 }))}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.showMoreText}>Show {Math.min(remaining, 7)} more</Text>
                        <Ionicons name="chevron-down" size={14} color={COLORS.primary} />
                      </TouchableOpacity>
                    )}
                    {remaining === 0 && r.occ.length > 3 && (
                      <TouchableOpacity
                        style={styles.showMoreBtn}
                        onPress={() => setOccShown((p) => ({ ...p, [r.stu.uid]: 3 }))}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.showMoreText}>Show less</Text>
                        <Ionicons name="chevron-up" size={14} color={COLORS.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })()}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 72 },
  backText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },

  rangeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  rangeChip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  rangeChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  rangeText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  rangeTextOn: { color: '#fff' },

  summary: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, paddingVertical: SPACING.md, marginBottom: SPACING.lg },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryNum: { color: COLORS.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summaryLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  summaryDivider: { width: 1, height: 30, backgroundColor: COLORS.border },

  empty: { color: COLORS.textMuted, fontSize: 13, paddingVertical: SPACING.sm },

  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  name: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  sub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  pct: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },

  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: SPACING.sm },
  pill: { borderWidth: 1, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  pillText: { fontSize: 11, fontWeight: '800' },

  occList: { marginTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.xs },
  occRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  occDate: { width: 70, color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  occStatus: { flex: 1, fontSize: 13, fontWeight: '700' },
  occMark: { color: COLORS.accent || COLORS.primary, fontSize: 13, fontWeight: '800' },
  occNote: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17, fontStyle: 'italic', marginLeft: 70, marginBottom: 6 },
  showMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
  showMoreText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
});
