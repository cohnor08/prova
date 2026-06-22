import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function lessonOccursOn(lesson, dateStr) {
  if (lesson.repeat === 'weekly') {
    if (dateStr < lesson.date) return false;
    return parseYmd(dateStr).getDay() === parseYmd(lesson.date).getDay();
  }
  return lesson.date === dateStr;
}

function timeLabel(v) {
  const [h, m] = (v || '').split(':').map(Number);
  if (isNaN(h)) return null;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function prettyDate(ymdStr) {
  return parseYmd(ymdStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Each event type gets its own colour for dots + the day list.
const TYPE_META = {
  lesson: { color: COLORS.primary, icon: 'school', label: 'Lesson' },
  gig: { color: COLORS.accent || '#A855F7', icon: 'mic', label: 'Gig' },
  due: { color: COLORS.error, icon: 'alert-circle', label: 'Task due' },
};

export default function ScheduleScreen({ navigation }) {
  const todayStr = ymd(new Date());
  const [lessons, setLessons] = useState([]);
  const [gigs, setGigs] = useState([]);
  const [tasks, setTasks] = useState([]);          // assigned tasks with a dueDate
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(todayStr);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const uid = auth.currentUser?.uid;
          if (!uid) return;
          const meSnap = await getDoc(doc(db, 'users', uid));
          const me = meSnap.data() || {};
          if (cancelled) return;
          setGigs(Array.isArray(me.gigs) ? me.gigs : []);
          setTasks((Array.isArray(me.assignedTasks) ? me.assignedTasks : []).filter((t) => t.dueDate));
          if (me.teacherUid) {
            const tSnap = await getDoc(doc(db, 'users', me.teacherUid));
            const all = Array.isArray(tSnap.data()?.lessons) ? tSnap.data().lessons : [];
            if (!cancelled) setLessons(all.filter((l) => l.studentUid === uid));
          } else {
            setLessons([]);
          }
        } catch (e) { /* ignore */ }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  // All events occurring on a given date, sorted by time.
  const eventsOn = (dateStr) => {
    const out = [];
    lessons.forEach((l) => { if (lessonOccursOn(l, dateStr)) out.push({ type: 'lesson', title: l.studentName ? 'Lesson with your teacher' : 'Lesson', sub: l.note, time: l.time }); });
    gigs.forEach((g) => { if (g.date === dateStr) out.push({ type: 'gig', title: g.name || 'Gig', sub: null, time: null }); });
    tasks.forEach((t) => {
      const d = new Date(t.dueDate);
      if (!isNaN(d) && ymd(d) === dateStr) {
        const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        out.push({ type: 'due', title: t.title || 'Task due', sub: t.className ? `${t.className}` : null, time: hh, done: !!t.completed });
      }
    });
    return out.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  };

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dayEvents = eventsOn(selected);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Practice</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Calendar</Text>
        <View style={{ width: 72 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>Your lessons, gigs and task deadlines in one place.</Text>

        <View style={styles.legend}>
          {Object.entries(TYPE_META).map(([k, m]) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: m.color }]} />
              <Text style={styles.legendText}>{m.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => setCursor(new Date(year, month - 1, 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{MONTHS[month]} {year}</Text>
          <TouchableOpacity onPress={() => setCursor(new Date(year, month + 1, 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((w, i) => <Text key={i} style={styles.weekLabel}>{w}</Text>)}
        </View>

        <View style={styles.grid}>
          {cells.map((d, i) => {
            if (d === null) return <View key={`b${i}`} style={styles.cell} />;
            const cellYmd = ymd(new Date(year, month, d));
            const isSel = cellYmd === selected;
            const isToday = cellYmd === todayStr;
            const evs = eventsOn(cellYmd);
            const types = [...new Set(evs.map((e) => e.type))];
            return (
              <TouchableOpacity key={d} style={styles.cell} onPress={() => setSelected(cellYmd)} activeOpacity={0.7}>
                <View style={[styles.cellInner, isSel && styles.cellSelected, isToday && !isSel && styles.cellToday]}>
                  <Text style={[styles.cellText, isSel && { color: '#fff', fontWeight: '800' }]}>{d}</Text>
                </View>
                <View style={styles.dotRow}>
                  {types.slice(0, 3).map((tp) => (
                    <View key={tp} style={[styles.dot, { backgroundColor: isSel ? '#fff' : TYPE_META[tp].color }]} />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.dayTitle}>{prettyDate(selected)}</Text>
        {dayEvents.length === 0 ? (
          <Text style={styles.empty}>Nothing scheduled this day.</Text>
        ) : dayEvents.map((e, i) => {
          const meta = TYPE_META[e.type];
          const done = e.type === 'due' && e.done;
          return (
            <View key={i} style={styles.eventCard}>
              <View style={[styles.eventIcon, { backgroundColor: (done ? COLORS.success : meta.color) + '22' }]}>
                <Ionicons name={done ? 'checkmark' : meta.icon} size={16} color={done ? COLORS.success : meta.color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.eventTitle, done && { color: COLORS.textMuted, textDecorationLine: 'line-through' }]} numberOfLines={1}>{e.title}</Text>
                <Text style={styles.eventSub} numberOfLines={1}>
                  {done ? 'Completed' : meta.label}{e.time && timeLabel(e.time) ? ` · ${timeLabel(e.time)}` : ''}{e.sub ? ` · ${e.sub}` : ''}
                </Text>
              </View>
              {done && <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />}
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
  subtitle: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: SPACING.md },

  legend: { flexDirection: 'row', gap: SPACING.lg, marginBottom: SPACING.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  monthTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  weekRow: { flexDirection: 'row', marginBottom: SPACING.xs },
  weekLabel: { flex: 1, textAlign: 'center', color: COLORS.textMuted, fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: SPACING.lg },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 },
  cellInner: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  cellSelected: { backgroundColor: COLORS.primary },
  cellToday: { borderWidth: 1, borderColor: COLORS.primary },
  cellText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  dotRow: { flexDirection: 'row', gap: 2, marginTop: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },

  dayTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800', marginBottom: SPACING.sm },
  empty: { color: COLORS.textMuted, fontSize: 13, paddingVertical: SPACING.sm },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.sm },
  eventIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  eventTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  eventSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
});
