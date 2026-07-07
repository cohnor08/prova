import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { displayName } from '../../lib/displayName';
import { COLORS, SPACING } from '../../constants/theme';
import SheetModal from '../../components/SheetModal';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

// Does a lesson happen on a given date? Weekly lessons recur on the same weekday
// from their start date onward; one-off lessons only match their exact date.
function occursOn(lesson, dateStr) {
  if (lesson.repeat === 'weekly') {
    if (dateStr < lesson.date) return false;
    return parseYmd(dateStr).getDay() === parseYmd(lesson.date).getDay();
  }
  return lesson.date === dateStr;
}

// Format a 24h "HH:MM" string as a friendly 12h label.
function timeLabel(v) {
  const [h, m] = (v || '').split(':').map(Number);
  if (isNaN(h)) return v;
  const hr12 = ((h + 11) % 12) + 1;
  return `${hr12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
const to24h = (hour12, minute, meridiem) => {
  const h = meridiem === 'PM' ? (hour12 % 12) + 12 : hour12 % 12;
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

function prettyDate(ymdStr) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// A rollable scroll-wheel: scroll the column, it snaps to the nearest value.
const WHEEL_ITEM_H = 40;
function Wheel({ values, value, onChange, format }) {
  const ref = useRef(null);
  const index = Math.max(0, values.indexOf(value));

  const settle = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    let i = Math.round(y / WHEEL_ITEM_H);
    i = Math.max(0, Math.min(values.length - 1, i));
    if (values[i] !== value) onChange(values[i]);
  };

  return (
    <View style={styles.wheel}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        nestedScrollEnabled
        onLayout={() => ref.current?.scrollTo({ y: index * WHEEL_ITEM_H, animated: false })}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM_H }}
      >
        {values.map((v) => (
          <View key={v} style={styles.wheelRow}>
            <Text style={[styles.wheelItem, v === value && styles.wheelItemSel]}>{format ? format(v) : v}</Text>
          </View>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={styles.wheelHighlight} />
    </View>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 00,05,…,55

// Attendance statuses a teacher can mark per lesson occurrence.
const STATUSES = [
  { key: 'present', label: 'Present', color: '#22C55E' },
  { key: 'late',    label: 'Late',    color: '#E0A800' },
  { key: 'absent',  label: 'Absent',  color: '#EF4444' },
  { key: 'excused', label: 'Excused', color: '#94A3B8' },
];

export default function TeacherCalendarScreen({ navigation }) {
  const todayStr = ymd(new Date());
  const [lessons, setLessons] = useState([]);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({}); // `${lessonId}__${ymd}` -> { status, mark, studentUid, ... }
  const [cursor, setCursor] = useState(new Date());     // month being viewed
  const [selected, setSelected] = useState(todayStr);
  const [showAdd, setShowAdd] = useState(false);

  // Add-lesson form
  const [aStudent, setAStudent] = useState(null);
  const [aSearch, setASearch] = useState('');
  const [aHour, setAHour] = useState(4);        // 1–12
  const [aMin, setAMin] = useState(0);          // 0–59
  const [aMeridiem, setAMeridiem] = useState('PM');
  const [aNote, setANote] = useState('');
  const [aWeekly, setAWeekly] = useState(false);

  const resetForm = () => {
    setAStudent(null); setASearch(''); setAHour(4); setAMin(0);
    setAMeridiem('PM'); setANote(''); setAWeekly(false);
  };

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
          setAttendance(meSnap.data()?.attendance || {});
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

  // Attendance is keyed by lesson + the specific date (so weekly recurrences are
  // marked per-occurrence). Tapping the active status/mark again clears it.
  const attKey = (lessonId, dateStr) => `${lessonId}__${dateStr}`;
  const saveAttendance = (next) => {
    setAttendance(next);
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { attendance: next }).catch(() => {});
  };
  const updateRecord = (lesson, dateStr, patch) => {
    const key = attKey(lesson.id, dateStr);
    const cur = attendance[key] || {};
    const rec = { ...cur, ...patch, studentUid: lesson.studentUid, studentName: lesson.studentName, date: dateStr };
    const next = { ...attendance };
    if (!rec.status && !rec.mark && !rec.note) delete next[key];
    else next[key] = rec;
    saveAttendance(next);
  };
  const markStatus = (lesson, dateStr, status) => {
    const cur = attendance[attKey(lesson.id, dateStr)] || {};
    updateRecord(lesson, dateStr, { status: cur.status === status ? null : status });
  };
  const setMark = (lesson, dateStr, mark) => {
    const cur = attendance[attKey(lesson.id, dateStr)] || {};
    updateRecord(lesson, dateStr, { mark: cur.mark === mark ? null : mark });
  };

  const addLesson = () => {
    if (!aStudent) { Alert.alert('Pick a student', 'Choose who the lesson is with.'); return; }
    const s = students.find((x) => x.uid === aStudent);
    const lesson = {
      id: Date.now().toString(),
      studentUid: aStudent,
      studentName: s ? displayName(s) : 'Student',
      date: selected,
      time: to24h(aHour, aMin, aMeridiem),
      note: aNote.trim(),
      repeat: aWeekly ? 'weekly' : 'none',
    };
    saveLessons([...lessons, lesson]);
    setShowAdd(false); resetForm();
  };

  const removeLesson = (lesson) => {
    const weekly = lesson.repeat === 'weekly';
    Alert.alert(
      weekly ? 'Remove weekly lesson?' : 'Remove lesson?',
      weekly ? `${lesson.studentName} — this removes it from every week.` : `${lesson.studentName} · ${timeLabel(lesson.time)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => saveLessons(lessons.filter((l) => l.id !== lesson.id)) },
      ]
    );
  };

  // Month grid
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const lessonsOnDay = (dateStr) => lessons.filter((l) => occursOn(l, dateStr));

  const dayLessons = lessonsOnDay(selected)
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
        <TouchableOpacity onPress={() => navigation.navigate('TeacherOverview')} style={styles.overviewBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="stats-chart-outline" size={15} color={COLORS.primary} />
          <Text style={styles.overviewText}>Overview</Text>
        </TouchableOpacity>
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
            const has = lessonsOnDay(cellYmd).length;
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
        ) : dayLessons.map((l) => {
          const rec = attendance[attKey(l.id, selected)] || {};
          return (
          <View key={l.id} style={styles.lessonCard}>
            <View style={styles.lessonTopRow}>
              <View style={styles.lessonTime}><Text style={styles.lessonTimeText}>{timeLabel(l.time)}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.lessonNameRow}>
                  <Text style={styles.lessonName} numberOfLines={1}>{l.studentName}</Text>
                  {l.repeat === 'weekly' && (
                    <View style={styles.weeklyBadge}>
                      <Ionicons name="repeat" size={11} color={COLORS.primary} />
                      <Text style={styles.weeklyBadgeText}>Weekly</Text>
                    </View>
                  )}
                </View>
                {!!l.note && <Text style={styles.lessonNote} numberOfLines={2}>{l.note}</Text>}
              </View>
              <TouchableOpacity onPress={() => removeLesson(l)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={18} color={COLORS.error} />
              </TouchableOpacity>
            </View>

            {/* Attendance — tap to mark; tap the active one again to clear */}
            <View style={styles.markRow}>
              {STATUSES.map((s) => {
                const active = rec.status === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.markBtn, active && { backgroundColor: s.color + '22', borderColor: s.color }]}
                    onPress={() => markStatus(l, selected, s.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.markBtnText, active && { color: s.color, fontWeight: '800' }]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {(rec.status === 'present' || rec.status === 'late') && (
              <View style={styles.markScoreRow}>
                <Text style={styles.markScoreLabel}>MARK</Text>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity key={n} onPress={() => setMark(l, selected, n)} hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}>
                    <Ionicons name={(rec.mark || 0) >= n ? 'star' : 'star-outline'} size={20} color={COLORS.accent || COLORS.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Lesson note — opens its own page (a running per-student journal) */}
            <TouchableOpacity
              style={styles.noteRow}
              onPress={() => navigation.navigate('LessonNote', { lessonId: l.id, dateStr: selected, studentName: l.studentName, studentUid: l.studentUid, time: l.time, note: rec.note || '' })}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={14} color={rec.note ? COLORS.primary : COLORS.textMuted} />
              {rec.note
                ? <Text style={styles.noteText} numberOfLines={3}>{rec.note}</Text>
                : <Text style={styles.noteAdd}>Add a lesson note</Text>}
              <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          );
        })}
      </ScrollView>

      {/* Add lesson modal */}
      <SheetModal visible={showAdd} onRequestClose={() => setShowAdd(false)} cardStyle={styles.modalCard} keyboardAvoiding>
            <Text style={styles.modalTitle}>New lesson</Text>
            <Text style={styles.modalSub}>{prettyDate(selected)}</Text>

            <Text style={styles.fieldLabel}>STUDENT</Text>
            {students.length === 0 ? (
              <Text style={styles.empty}>No connected students yet.</Text>
            ) : (
              <>
                {students.length > 4 && (
                  <View style={styles.searchBar}>
                    <Ionicons name="search" size={15} color={COLORS.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      value={aSearch}
                      onChangeText={setASearch}
                      placeholder="Search students…"
                      placeholderTextColor={COLORS.textMuted}
                      autoCapitalize="none"
                    />
                    {aSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setASearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                <View style={styles.chipWrap}>
                  {(() => {
                    const q = aSearch.trim().toLowerCase();
                    const shown = q ? students.filter((s) => displayName(s).toLowerCase().includes(q)) : students;
                    if (shown.length === 0) return <Text style={styles.empty}>No students match “{aSearch}”.</Text>;
                    return shown.map((s) => {
                      const on = aStudent === s.uid;
                      return (
                        <TouchableOpacity key={s.uid} style={[styles.chip, on && styles.chipOn]} onPress={() => setAStudent(s.uid)} activeOpacity={0.8}>
                          <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{displayName(s)}</Text>
                        </TouchableOpacity>
                      );
                    });
                  })()}
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>TIME</Text>
            <View style={styles.timePicker}>
              <Wheel values={HOURS} value={aHour} onChange={setAHour} />
              <Text style={styles.timeColon}>:</Text>
              <Wheel values={MINUTES} value={aMin} onChange={setAMin} format={(m) => String(m).padStart(2, '0')} />
              <View style={styles.ampmCol}>
                {['AM', 'PM'].map((p) => (
                  <TouchableOpacity key={p} style={[styles.ampmBtn, aMeridiem === p && styles.chipOn]} onPress={() => setAMeridiem(p)} activeOpacity={0.8}>
                    <Text style={[styles.chipText, aMeridiem === p && styles.chipTextOn]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={styles.fieldLabel}>NOTE (OPTIONAL)</Text>
            <TextInput
              style={styles.noteInput}
              value={aNote}
              onChangeText={setANote}
              placeholder="e.g. Bring the new song chart"
              placeholderTextColor={COLORS.textMuted}
            />

            <TouchableOpacity style={styles.repeatRow} onPress={() => setAWeekly((v) => !v)} activeOpacity={0.7}>
              <Ionicons name="repeat" size={18} color={aWeekly ? COLORS.primary : COLORS.textMuted} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.repeatLabel}>Repeats weekly</Text>
                <Text style={styles.repeatHint}>Shows every week on this day — no need to re-add it.</Text>
              </View>
              <Ionicons name={aWeekly ? 'checkbox' : 'square-outline'} size={22} color={aWeekly ? COLORS.primary : COLORS.textMuted} />
            </TouchableOpacity>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowAdd(false); resetForm(); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addLesson}>
                <Text style={styles.saveText}>Add lesson</Text>
              </TouchableOpacity>
            </View>
      </SheetModal>
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

  lessonCard: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.sm },
  lessonTopRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  markRow: { flexDirection: 'row', gap: 6, marginTop: SPACING.md },
  markBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  markBtnText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  markScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: SPACING.sm },
  markScoreLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginRight: 2 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  noteText: { flex: 1, color: COLORS.textSecondary, fontSize: 13, lineHeight: 18 },
  noteAdd: { flex: 1, color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  overviewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  overviewText: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  lessonTime: { minWidth: 62 },
  lessonTimeText: { color: COLORS.primary, fontSize: 13, fontWeight: '800' },
  lessonNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  lessonName: { color: COLORS.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  weeklyBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.primary + '22', borderRadius: 999, paddingVertical: 2, paddingHorizontal: 7 },
  weeklyBadgeText: { color: COLORS.primary, fontSize: 10, fontWeight: '800' },
  lessonNote: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  repeatRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, paddingVertical: SPACING.sm },
  repeatLabel: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  repeatHint: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },

  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, paddingBottom: SPACING.xl + 40, marginBottom: -40 },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  modalSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, marginBottom: SPACING.md },
  fieldLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: SPACING.md, marginBottom: SPACING.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, maxWidth: 200 },
  timePicker: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  timeColon: { color: COLORS.text, fontSize: 22, fontWeight: '800' },
  wheel: { width: 58, height: WHEEL_ITEM_H * 3, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  wheelRow: { height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' },
  wheelItem: { color: COLORS.textMuted, fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  wheelItemSel: { color: COLORS.text, fontSize: 22, fontWeight: '800' },
  wheelHighlight: { position: 'absolute', left: 6, right: 6, top: WHEEL_ITEM_H, height: WHEEL_ITEM_H, borderRadius: 8, backgroundColor: COLORS.primary + '1A' },
  ampmCol: { gap: SPACING.sm, marginLeft: SPACING.sm },
  ampmBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: '#fff' },
  noteInput: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 14 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: COLORS.card, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: 9, marginBottom: SPACING.sm },
  searchInput: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 14, padding: 0 },
  modalBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.card },
  cancelText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.primary },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
