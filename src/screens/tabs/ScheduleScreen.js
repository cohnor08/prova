import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Keyboard, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';
import TimeWheel from '../../components/TimeWheel';

const PRE_GIG_WINDOW = 14; // days before a gig that Pre-Gig Mode kicks in
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((parseYmd(dateStr) - today) / 86400000);
}

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

const TYPE_META = {
  lesson: { color: COLORS.primary, icon: 'school', label: 'Lesson' },
  gig: { color: COLORS.accent || '#A855F7', icon: 'mic', label: 'Gig' },
  due: { color: COLORS.error, icon: 'alert-circle', label: 'Task due' },
};

// Attendance set by the teacher (read-only on the student side). The numeric
// mark is deliberately NOT surfaced to students — only status + note.
const ATT_META = {
  present: { color: '#22C55E', label: 'Present' },
  late: { color: '#E0A800', label: 'Late' },
  absent: { color: '#EF4444', label: 'Absent' },
  excused: { color: '#94A3B8', label: 'Excused' },
};

export default function ScheduleScreen({ navigation, route }) {
  const todayStr = ymd(new Date());
  const [lessons, setLessons] = useState([]);
  const [attendance, setAttendance] = useState({}); // `${lessonId}__${ymd}` -> { status, note } from teacher
  const [gigs, setGigs] = useState([]);
  const [setlists, setSetlists] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(todayStr);

  // Open straight to a specific day when navigated with a `date` param (e.g.
  // tapping the next-lesson row on Today).
  useEffect(() => {
    const d = route?.params?.date;
    if (!d) return;
    setSelected(d);
    const parsed = parseYmd(d);
    if (!isNaN(parsed)) setCursor(parsed);
  }, [route?.params?.date]);

  const [personalEvents, setPersonalEvents] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState('gig'); // 'gig' | 'task' | 'lesson'
  const [newGigName, setNewGigName] = useState('');
  const [newGigSetlistId, setNewGigSetlistId] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('16:00'); // lesson time — always set, picked on the wheel
  const [newGigTime, setNewGigTime] = useState(''); // gig time — optional
  const [newNote, setNewNote] = useState('');
  // The time-wheel sheet: which field it's editing + the in-progress value,
  // committed on Set (late wheel onChange fires make value-as-visibility buggy).
  const [timePickerFor, setTimePickerFor] = useState(null); // null | 'lesson' | 'gig'
  const [pendingTime, setPendingTime] = useState('16:00');

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
          setSetlists(Array.isArray(me.setlists) ? me.setlists : []);
          setTasks((Array.isArray(me.assignedTasks) ? me.assignedTasks : []).filter((t) => t.dueDate));
          setPersonalEvents(Array.isArray(me.personalEvents) ? me.personalEvents : []);
          if (me.teacherUid) {
            const tSnap = await getDoc(doc(db, 'users', me.teacherUid));
            const tData = tSnap.data() || {};
            const all = Array.isArray(tData.lessons) ? tData.lessons : [];
            if (!cancelled) {
              setLessons(all.filter((l) => l.studentUid === uid));
              setAttendance(tData.attendance || {});
            }
          } else {
            setLessons([]);
            setAttendance({});
          }
        } catch (e) { /* ignore */ }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const saveGigs = async (next) => {
    setGigs(next);
    try {
      const uid = auth.currentUser?.uid;
      if (uid) await setDoc(doc(db, 'users', uid), { gigs: next }, { merge: true });
    } catch (e) {
      Alert.alert('Error', "Couldn't save your gig. Check your connection and try again.");
    }
  };

  const savePersonal = async (next) => {
    setPersonalEvents(next);
    try {
      const uid = auth.currentUser?.uid;
      if (uid) await setDoc(doc(db, 'users', uid), { personalEvents: next }, { merge: true });
    } catch (e) {
      Alert.alert('Error', "Couldn't save your event. Check your connection and try again.");
    }
  };

  // When set, the form is editing an existing event instead of adding one.
  const [editing, setEditing] = useState(null); // null | { kind: 'gig'|'personal', id }

  const resetForm = () => {
    setNewGigName(''); setNewGigSetlistId(null); setNewTitle(''); setNewTime('16:00'); setNewGigTime(''); setNewNote('');
    setEditing(null); setShowAdd(false); Keyboard.dismiss();
  };

  // Tap a gig / self-added event in the day list → reopen the form prefilled.
  const startEditGig = (g) => {
    setAddType('gig');
    setNewGigName(g.name || ''); setNewGigTime(g.time || ''); setNewGigSetlistId(g.setlistId || null);
    setEditing({ kind: 'gig', id: g.id }); setShowAdd(true);
  };
  const startEditPersonal = (p) => {
    setAddType(p.type === 'lesson' ? 'lesson' : 'task');
    setNewTitle(p.title || ''); setNewTime(p.time || '16:00'); setNewNote(p.note || '');
    setEditing({ kind: 'personal', id: p.id }); setShowAdd(true);
  };

  const openTimeWheel = (which) => {
    Keyboard.dismiss();
    setPendingTime(which === 'gig' ? (newGigTime || '19:00') : newTime);
    setTimePickerFor(which);
  };

  // Add whatever type the chooser is on. Gigs live in `gigs`; self-assigned
  // tasks and out-of-school lessons live in `personalEvents` on the user doc.
  const addEvent = () => {
    if (addType === 'gig') {
      const name = newGigName.trim();
      if (!name) { Alert.alert('Name your gig', 'Give the gig a name first.'); return; }
      const fields = {
        name: name.slice(0, 60),
        date: selected,
        time: newGigTime || null,
        setlistId: newGigSetlistId || null,
      };
      const next = editing
        ? gigs.map((g) => (g.id === editing.id ? { ...g, ...fields } : g))
        : [...gigs, { id: `gig_${Date.now()}`, createdAt: new Date().toISOString(), ...fields }];
      saveGigs(next.sort((a, b) => a.date.localeCompare(b.date)));
      resetForm();
      return;
    }
    const title = newTitle.trim();
    if (!title) {
      Alert.alert(addType === 'task' ? 'Name your task' : 'Name your lesson', 'Give it a name first.');
      return;
    }
    const fields = {
      type: addType, // 'task' | 'lesson'
      title: title.slice(0, 80),
      date: selected,
      time: addType === 'lesson' ? newTime : '',
      note: newNote.trim().slice(0, 140),
    };
    const next = editing
      ? personalEvents.map((p) => (p.id === editing.id ? { ...p, ...fields } : p))
      : [...personalEvents, { id: `pe_${Date.now()}`, createdAt: new Date().toISOString(), ...fields }];
    savePersonal(next.sort((a, b) => a.date.localeCompare(b.date)));
    resetForm();
  };

  const removeGig = (id, name) => Alert.alert('Remove gig?', name, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => saveGigs(gigs.filter((g) => g.id !== id)) },
  ]);

  const removePersonal = (id, title) => Alert.alert('Remove event?', title, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => savePersonal(personalEvents.filter((e) => e.id !== id)) },
  ]);

  const eventsOn = (dateStr) => {
    const out = [];
    lessons.forEach((l) => {
      if (!lessonOccursOn(l, dateStr)) return;
      const rec = attendance[`${l.id}__${dateStr}`];
      // Only surface status + note to the student — never the numeric mark.
      const att = rec && rec.status ? { status: rec.status, note: rec.note || null } : null;
      out.push({ type: 'lesson', title: 'Lesson with your teacher', sub: l.note, time: l.time, att });
    });
    gigs.forEach((g) => {
      if (g.date === dateStr) {
        const sl = g.setlistId ? setlists.find((s) => s.id === g.setlistId) : null;
        out.push({ type: 'gig', title: g.name || 'Gig', sub: sl ? sl.name : null, time: g.time || null, gigId: g.id });
      }
    });
    tasks.forEach((t) => {
      const d = new Date(t.dueDate);
      if (!isNaN(d) && ymd(d) === dateStr) {
        const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        out.push({ type: 'due', title: t.title || 'Task due', sub: t.className || null, time: hh, done: !!t.completed });
      }
    });
    // Self-added events: personal tasks show as a due marker, out-of-school
    // lessons as a lesson. Both are removable (they carry personalId).
    personalEvents.forEach((p) => {
      if (p.date !== dateStr) return;
      out.push({
        type: p.type === 'lesson' ? 'lesson' : 'due',
        title: p.title || (p.type === 'lesson' ? 'Lesson' : 'Task'),
        sub: p.note || null,
        time: p.time || null,
        personalId: p.id,
      });
    });
    return out.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  };

  const nextGig = [...gigs].filter((g) => daysUntil(g.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  const nextGigDays = nextGig ? daysUntil(nextGig.date) : null;

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

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {/* Pre-Gig countdown banner — tap to jump the calendar to the gig's day */}
        {nextGig && (
          <TouchableOpacity
            style={[styles.preGig, nextGigDays <= PRE_GIG_WINDOW && styles.preGigSoon]}
            activeOpacity={0.85}
            onPress={() => {
              setSelected(nextGig.date);
              const parsed = parseYmd(nextGig.date);
              if (!isNaN(parsed)) setCursor(parsed);
            }}
          >
            <View style={styles.preGigNum}>
              <Text style={styles.preGigNumText}>{nextGigDays}</Text>
              <Text style={styles.preGigUnit}>{nextGigDays === 1 ? 'DAY' : 'DAYS'}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.preGigName} numberOfLines={1}>🎸 {nextGig.name}</Text>
              <Text style={styles.preGigSub} numberOfLines={1}>
                {nextGigDays <= PRE_GIG_WINDOW ? 'Pre-Gig Mode on — song tasks go first in your practice.' : 'Your next performance.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        )}

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
            const cellEvents = eventsOn(cellYmd);
            const types = [...new Set(cellEvents.map((e) => e.type))];
            // A day's "task due" dot turns green once every task due that day is done.
            const dueEvents = cellEvents.filter((e) => e.type === 'due');
            const allDueDone = dueEvents.length > 0 && dueEvents.every((e) => e.done);
            const dotColor = (tp) => (tp === 'due' && allDueDone ? COLORS.success : TYPE_META[tp].color);
            return (
              <TouchableOpacity key={d} style={styles.cell} onPress={() => { setSelected(cellYmd); setShowAdd(false); }} activeOpacity={0.7}>
                <View style={[styles.cellInner, isSel && styles.cellSelected, isToday && !isSel && styles.cellToday]}>
                  <Text style={[styles.cellText, isSel && { color: '#fff', fontWeight: '800' }]}>{d}</Text>
                </View>
                <View style={styles.dotRow}>
                  {types.slice(0, 3).map((tp) => (
                    <View key={tp} style={[styles.dot, { backgroundColor: isSel ? '#fff' : dotColor(tp) }]} />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.dayHeader}>
          <Text style={styles.dayTitle} numberOfLines={1}>{prettyDate(selected)}</Text>
          <TouchableOpacity style={styles.addGigBtn} onPress={() => (showAdd ? resetForm() : setShowAdd(true))} activeOpacity={0.85}>
            <Ionicons name={showAdd ? 'close' : 'add'} size={15} color="#fff" />
            <Text style={styles.addGigText}>{showAdd ? 'Cancel' : 'Add event'}</Text>
          </TouchableOpacity>
        </View>

        {/* Add-event form (date = the selected calendar day). The student picks
            what kind of event: a gig, a task they set themselves, or an
            out-of-school lesson. */}
        {showAdd && (
          <View style={styles.gigForm}>
            {/* Editing keeps the event's kind — the chooser only applies to new events */}
            {!editing && (
            <View style={styles.typeRow}>
              {[
                { key: 'gig', label: 'Gig', icon: 'mic' },
                { key: 'task', label: 'Task', icon: 'checkbox-outline' },
                { key: 'lesson', label: 'Lesson', icon: 'school' },
              ].map((t) => {
                const on = addType === t.key;
                return (
                  <TouchableOpacity key={t.key} style={[styles.typeChip, on && styles.typeChipOn]} onPress={() => setAddType(t.key)} activeOpacity={0.85}>
                    <Ionicons name={t.icon} size={14} color={on ? COLORS.primary : COLORS.textMuted} />
                    <Text style={[styles.typeChipText, on && styles.typeChipTextOn]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            )}

            {addType === 'gig' && (
              <>
                <TextInput
                  style={styles.gigInput}
                  placeholder="Gig name (e.g. Sarah's wedding)"
                  placeholderTextColor={COLORS.textMuted}
                  value={newGigName}
                  onChangeText={setNewGigName}
                  maxLength={60}
                />
                <TouchableOpacity style={styles.timeRow} onPress={() => openTimeWheel('gig')} activeOpacity={0.8}>
                  <Ionicons name="time-outline" size={16} color={COLORS.textMuted} />
                  <Text style={styles.timeRowLabel}>Time</Text>
                  <Text style={newGigTime ? styles.timeRowValue : styles.timeRowPlaceholder}>
                    {newGigTime ? timeLabel(newGigTime) : 'Add a time (optional)'}
                  </Text>
                  {newGigTime ? (
                    <TouchableOpacity onPress={() => setNewGigTime('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                  )}
                </TouchableOpacity>
                {setlists.length > 0 && (
                  <>
                    <Text style={styles.gigFormLabel}>SETLIST (OPTIONAL)</Text>
                    <View style={styles.gigChips}>
                      {setlists.map((s) => {
                        const on = newGigSetlistId === s.id;
                        return (
                          <TouchableOpacity key={s.id} style={[styles.gigChip, on && styles.gigChipOn]} onPress={() => setNewGigSetlistId(on ? null : s.id)} activeOpacity={0.8}>
                            <Text style={[styles.gigChipText, on && styles.gigChipTextOn]} numberOfLines={1}>{s.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
              </>
            )}

            {addType === 'task' && (
              <TextInput
                style={styles.gigInput}
                placeholder="Task (e.g. Practice barre chords)"
                placeholderTextColor={COLORS.textMuted}
                value={newTitle}
                onChangeText={setNewTitle}
                maxLength={80}
              />
            )}

            {addType === 'lesson' && (
              <>
                <TextInput
                  style={styles.gigInput}
                  placeholder="Lesson (e.g. Lesson with Jane)"
                  placeholderTextColor={COLORS.textMuted}
                  value={newTitle}
                  onChangeText={setNewTitle}
                  maxLength={80}
                />
                <TouchableOpacity style={styles.timeRow} onPress={() => openTimeWheel('lesson')} activeOpacity={0.8}>
                  <Ionicons name="time-outline" size={16} color={COLORS.textMuted} />
                  <Text style={styles.timeRowLabel}>Time</Text>
                  <Text style={styles.timeRowValue}>{timeLabel(newTime)}</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </>
            )}

            {addType !== 'gig' && (
              <TextInput
                style={styles.gigInput}
                placeholder="Note (optional)"
                placeholderTextColor={COLORS.textMuted}
                value={newNote}
                onChangeText={setNewNote}
                maxLength={140}
              />
            )}

            <TouchableOpacity style={styles.gigSaveBtn} onPress={addEvent} activeOpacity={0.85}>
              <Text style={styles.gigSaveText}>
                {editing ? 'Save changes' : `Add ${addType} on ${parseYmd(selected).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {dayEvents.length === 0 ? (
          <Text style={styles.empty}>Nothing scheduled this day.</Text>
        ) : dayEvents.map((e, i) => {
          const meta = TYPE_META[e.type];
          const done = e.type === 'due' && e.done;
          const att = e.att && ATT_META[e.att.status] ? e.att : null;
          // Pressing a row: a marked teacher lesson opens its note window; the
          // student's own events (gigs, self-added lessons/tasks) open the form
          // to edit them. Teacher-owned rows stay read-only.
          const gigObj = e.gigId ? gigs.find((g) => g.id === e.gigId) : null;
          const perObj = e.personalId ? personalEvents.find((p) => p.id === e.personalId) : null;
          const onRowPress = att
            ? () => navigation.navigate('LessonNotes', { date: selected })
            : gigObj ? () => startEditGig(gigObj)
            : perObj ? () => startEditPersonal(perObj)
            : null;
          const Card = onRowPress ? TouchableOpacity : View;
          return (
            <Card
              key={i}
              style={styles.eventCard}
              activeOpacity={onRowPress ? 0.7 : 1}
              {...(onRowPress ? { onPress: onRowPress } : {})}
            >
              <View style={[styles.eventIcon, { backgroundColor: (done ? COLORS.success : meta.color) + '22' }]}>
                <Ionicons name={done ? 'checkmark' : meta.icon} size={16} color={done ? COLORS.success : meta.color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.eventTitle, done && { color: COLORS.textMuted, textDecorationLine: 'line-through' }]} numberOfLines={1}>{e.title}</Text>
                <Text style={styles.eventSub} numberOfLines={1}>
                  {done ? 'Completed' : meta.label}{e.time && timeLabel(e.time) ? ` · ${timeLabel(e.time)}` : ''}{e.sub ? ` · ${e.sub}` : ''}
                </Text>
                {att && (
                  <View style={styles.attRow}>
                    <View style={[styles.attPill, { backgroundColor: ATT_META[att.status].color + '22' }]}>
                      <Text style={[styles.attPillText, { color: ATT_META[att.status].color }]}>{ATT_META[att.status].label}</Text>
                    </View>
                    {att.note ? <Text style={styles.attNoteHint}>View note ›</Text> : null}
                  </View>
                )}
              </View>
              {e.personalId || e.type === 'gig'
                ? <View style={styles.rowActions}>
                    <Ionicons name="create-outline" size={17} color={COLORS.textMuted} />
                    <TouchableOpacity
                      onPress={() => (e.personalId ? removePersonal(e.personalId, e.title) : removeGig(e.gigId, e.title))}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                : att ? <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                : done ? <Ionicons name="checkmark-circle" size={18} color={COLORS.success} /> : null}
            </Card>
          );
        })}
      </ScrollView>

      {/* Rollable time picker — same wheel as the Profile reminder time */}
      <Modal visible={!!timePickerFor} transparent animationType="slide" onRequestClose={() => setTimePickerFor(null)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>{timePickerFor === 'gig' ? 'Gig time' : 'Lesson time'}</Text>
            <View style={{ marginVertical: SPACING.lg }}>
              <TimeWheel value={pendingTime} onChange={setPendingTime} />
            </View>
            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setTimePickerFor(null)} activeOpacity={0.85}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetSetBtn}
                onPress={() => {
                  if (timePickerFor === 'gig') setNewGigTime(pendingTime);
                  else setNewTime(pendingTime);
                  setTimePickerFor(null);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.sheetSetText}>Set time</Text>
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
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 72 },
  backText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },

  preGig: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.lg },
  preGigSoon: { borderColor: COLORS.primary + '66', backgroundColor: COLORS.primary + '12' },
  preGigNum: { width: 52, height: 52, borderRadius: 14, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  preGigNumText: { color: COLORS.primary, fontSize: 20, fontWeight: '900', lineHeight: 22 },
  preGigUnit: { color: COLORS.textMuted, fontSize: 9, fontWeight: '700' },
  preGigName: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  preGigSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },

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

  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm, marginBottom: SPACING.sm },
  dayTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800', flex: 1, minWidth: 0 },
  addGigBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  addGigText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  gigForm: { gap: SPACING.sm, marginBottom: SPACING.md },
  typeRow: { flexDirection: 'row', gap: SPACING.sm },
  typeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  typeChipOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '18' },
  typeChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  typeChipTextOn: { color: COLORS.primary },
  gigInput: { backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 12, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  gigFormLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: SPACING.xs },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: SPACING.md, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border },
  timeRowLabel: { color: COLORS.textMuted, fontSize: 15 },
  timeRowValue: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '700', textAlign: 'right', marginRight: 2 },
  timeRowPlaceholder: { flex: 1, color: COLORS.textMuted, fontSize: 15, textAlign: 'right', marginRight: 2 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheetCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: SPACING.xxl },
  sheetTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  sheetBtns: { flexDirection: 'row', gap: SPACING.sm },
  sheetCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  sheetCancelText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700' },
  sheetSetBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.primary },
  sheetSetText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  gigChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  gigChip: { paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, maxWidth: '100%' },
  gigChipOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '22' },
  gigChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  gigChipTextOn: { color: COLORS.primary },
  gigSaveBtn: { paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', marginTop: SPACING.xs },
  gigSaveText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  empty: { color: COLORS.textMuted, fontSize: 13, paddingVertical: SPACING.sm },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.sm },
  eventIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  eventTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  eventSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  attRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  attPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  attPillText: { fontSize: 11, fontWeight: '800' },
  attNoteHint: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
});
