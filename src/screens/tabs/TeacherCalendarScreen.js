import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { displayName } from '../../lib/displayName';
import { COLORS, SPACING } from '../../constants/theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Lesson times 8:00 AM → 8:00 PM in 30-min steps.
const TIME_OPTIONS = (() => {
  const out = [];
  for (let h = 8; h <= 20; h++) {
    for (const m of [0, 30]) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const hr12 = ((h + 11) % 12) + 1;
      out.push({ value, label: `${hr12}:${m === 0 ? '00' : '30'} ${h < 12 ? 'AM' : 'PM'}` });
    }
  }
  return out;
})();
const timeLabel = (v) => (TIME_OPTIONS.find((t) => t.value === v) || {}).label || v;

function prettyDate(ymdStr) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function TeacherCalendarScreen({ navigation }) {
  const todayStr = ymd(new Date());
  const [lessons, setLessons] = useState([]);
  const [students, setStudents] = useState([]);
  const [cursor, setCursor] = useState(new Date());     // month being viewed
  const [selected, setSelected] = useState(todayStr);
  const [showAdd, setShowAdd] = useState(false);

  // Add-lesson form
  const [aStudent, setAStudent] = useState(null);
  const [aTime, setATime] = useState('16:00');
  const [aNote, setANote] = useState('');

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
          setLessons(Array.isArray(meSnap.data()?.lessons) ? meSnap.data().lessons : []);
          setStudents(stuSnap.docs.map((d) => ({ uid: d.id, ...d.data() })));
        } catch (e) { /* ignore */ }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const saveLessons = (next) => {
    setLessons(next);
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { lessons: next }).catch(() => {});
  };

  const addLesson = () => {
    if (!aStudent) { Alert.alert('Pick a student', 'Choose who the lesson is with.'); return; }
    const s = students.find((x) => x.uid === aStudent);
    const lesson = {
      id: Date.now().toString(),
      studentUid: aStudent,
      studentName: s ? displayName(s) : 'Student',
      date: selected,
      time: aTime,
      note: aNote.trim(),
    };
    saveLessons([...lessons, lesson]);
    setShowAdd(false); setAStudent(null); setATime('16:00'); setANote('');
  };

  const removeLesson = (id, name) => {
    Alert.alert('Remove lesson?', name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => saveLessons(lessons.filter((l) => l.id !== id)) },
    ]);
  };

  // Month grid
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const countByDate = {};
  lessons.forEach((l) => { countByDate[l.date] = (countByDate[l.date] || 0) + 1; });

  const dayLessons = lessons
    .filter((l) => l.date === selected)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const upcoming = lessons
    .filter((l) => l.date >= todayStr)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 1);

  const changeMonth = (dir) => setCursor(new Date(year, month + dir, 1));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Home</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Lessons</Text>
        <View style={{ width: 64 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Month header */}
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => changeMonth(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{MONTHS[month]} {year}</Text>
          <TouchableOpacity onPress={() => changeMonth(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Weekday labels */}
        <View style={styles.weekRow}>
          {WEEKDAYS.map((w, i) => <Text key={i} style={styles.weekLabel}>{w}</Text>)}
        </View>

        {/* Day grid */}
        <View style={styles.grid}>
          {cells.map((d, i) => {
            if (d === null) return <View key={`b${i}`} style={styles.cell} />;
            const cellYmd = ymd(new Date(year, month, d));
            const isSel = cellYmd === selected;
            const isToday = cellYmd === todayStr;
            const has = countByDate[cellYmd];
            return (
              <TouchableOpacity key={d} style={styles.cell} onPress={() => setSelected(cellYmd)} activeOpacity={0.7}>
                <View style={[styles.cellInner, isSel && styles.cellSelected, isToday && !isSel && styles.cellToday]}>
                  <Text style={[styles.cellText, isSel && { color: '#fff', fontWeight: '800' }]}>{d}</Text>
                </View>
                {has ? <View style={[styles.dot, isSel && { backgroundColor: '#fff' }]} /> : <View style={styles.dotGap} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected day's lessons */}
        <View style={styles.dayHeader}>
          <Text style={styles.dayTitle}>{prettyDate(selected)}</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addBtnText}>Add lesson</Text>
          </TouchableOpacity>
        </View>

        {dayLessons.length === 0 ? (
          <Text style={styles.empty}>No lessons this day.</Text>
        ) : dayLessons.map((l) => (
          <View key={l.id} style={styles.lessonCard}>
            <View style={styles.lessonTime}><Text style={styles.lessonTimeText}>{timeLabel(l.time)}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.lessonName} numberOfLines={1}>{l.studentName}</Text>
              {!!l.note && <Text style={styles.lessonNote} numberOfLines={2}>{l.note}</Text>}
            </View>
            <TouchableOpacity onPress={() => removeLesson(l.id, `${l.studentName} · ${timeLabel(l.time)}`)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={18} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {/* Add lesson modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New lesson</Text>
            <Text style={styles.modalSub}>{prettyDate(selected)}</Text>

            <Text style={styles.fieldLabel}>STUDENT</Text>
            {students.length === 0 ? (
              <Text style={styles.empty}>No connected students yet.</Text>
            ) : (
              <View style={styles.chipWrap}>
                {students.map((s) => {
                  const on = aStudent === s.uid;
                  return (
                    <TouchableOpacity key={s.uid} style={[styles.chip, on && styles.chipOn]} onPress={() => setAStudent(s.uid)} activeOpacity={0.8}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{displayName(s)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text style={styles.fieldLabel}>TIME</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm, paddingVertical: 2 }}>
              {TIME_OPTIONS.map((t) => {
                const on = aTime === t.value;
                return (
                  <TouchableOpacity key={t.value} style={[styles.timeChip, on && styles.chipOn]} onPress={() => setATime(t.value)} activeOpacity={0.8}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.fieldLabel}>NOTE (OPTIONAL)</Text>
            <TextInput
              style={styles.noteInput}
              value={aNote}
              onChangeText={setANote}
              placeholder="e.g. Bring the new song chart"
              placeholderTextColor={COLORS.textMuted}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowAdd(false); setAStudent(null); setANote(''); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addLesson}>
                <Text style={styles.saveText}>Add lesson</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 64 },
  backText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },

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
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.primary, marginTop: 3 },
  dotGap: { height: 8, marginTop: 3 },

  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  dayTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800', flex: 1, minWidth: 0 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { color: COLORS.textMuted, fontSize: 13, paddingVertical: SPACING.sm },

  lessonCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.sm },
  lessonTime: { backgroundColor: COLORS.surface, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  lessonTimeText: { color: COLORS.primary, fontSize: 12, fontWeight: '800' },
  lessonName: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  lessonNote: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, paddingBottom: SPACING.xl },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  modalSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, marginBottom: SPACING.md },
  fieldLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: SPACING.md, marginBottom: SPACING.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, maxWidth: 200 },
  timeChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: '#fff' },
  noteInput: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 14 },
  modalBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.card },
  cancelText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.primary },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
