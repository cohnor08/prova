import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Share, TextInput,
  Animated, PanResponder, Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';
import { ensureTeacherCode } from '../../lib/teacher';
import { displayName } from '../../lib/displayName';
import { sendNotification } from '../../lib/inbox';
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

// Home is composed of widgets the teacher can show/hide and reorder.
const DEFAULT_WIDGETS = [
  { id: 'code', enabled: true },
  { id: 'pulse', enabled: true },
  { id: 'calendar', enabled: true },
  { id: 'lessons', enabled: true },
  { id: 'stats', enabled: true },
  { id: 'getstarted', enabled: true },
  { id: 'actions', enabled: true },
  // Extra widgets — off by default; teachers switch them on in Edit mode.
  { id: 'tip', enabled: false },
  { id: 'top', enabled: false },
  { id: 'attention', enabled: false },
  { id: 'notes', enabled: false },
];
const WIDGET_LABELS = {
  code: 'Join code',
  pulse: 'Practice Pulse',
  calendar: 'Calendar',
  lessons: 'Lessons',
  stats: 'Stats',
  getstarted: 'Get started',
  actions: 'Quick actions',
  tip: 'Tip of the day',
  top: 'Top students',
  attention: 'Needs a nudge',
  notes: 'My notes',
};

const LESSON_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function lessonWhen(l) {
  const [y, m, d] = (l.date || '').split('-').map(Number);
  const day = y ? `${LESSON_MONTHS[m - 1]} ${d}` : l.date;
  const [hh, mm] = (l.time || '').split(':').map(Number);
  const t = isNaN(hh) ? l.time : `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
  return `${day} · ${t}`;
}

// Merge a saved layout with the defaults: keep saved order/visibility for known
// widgets, then append any new widgets that didn't exist when it was saved.
function mergeLayout(saved) {
  if (!Array.isArray(saved)) return DEFAULT_WIDGETS;
  const known = new Set(Object.keys(WIDGET_LABELS));
  const kept = saved.filter((w) => w && known.has(w.id)).map((w) => ({ id: w.id, enabled: w.enabled !== false }));
  const have = new Set(kept.map((w) => w.id));
  // Slot any NEW widget into its default position (before the first default
  // that follows it and that the teacher already has), not just at the end.
  DEFAULT_WIDGETS.forEach((d, di) => {
    if (have.has(d.id)) return;
    let insertAt = kept.length;
    for (let j = di + 1; j < DEFAULT_WIDGETS.length; j++) {
      const idx = kept.findIndex((w) => w.id === DEFAULT_WIDGETS[j].id);
      if (idx !== -1) { insertAt = idx; break; }
    }
    kept.splice(insertAt, 0, { ...d });
    have.add(d.id);
  });
  return kept;
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

// Edit-mode list: hold the grip (≡) and drag a row to reorder, tap a row to
// drop it down and preview the widget, and use the eye to show/hide it. Built
// on PanResponder (no extra deps); rows measure their own height so previews
// of any size still reorder correctly.
const ROW_H = 56;
function WidgetEditList({ layout, onReorder, onToggle, renderPreview, onDragStateChange }) {
  const [dragId, setDragId] = useState(null);
  const [open, setOpen] = useState({});           // id -> previewing?
  const orderRef = useRef(layout);
  orderRef.current = layout;
  const heights = useRef({});                      // id -> measured height
  const responders = useRef({});
  const pan = useRef(new Animated.Value(0)).current;
  const startTop = useRef(0);

  const offsetsOf = (order) => {
    const o = {}; let y = 0;
    order.forEach((w) => { o[w.id] = y; y += (heights.current[w.id] || ROW_H); });
    return o;
  };

  const getResponder = (id) => {
    if (responders.current[id]) return responders.current[id];
    responders.current[id] = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startTop.current = offsetsOf(orderRef.current)[id] || 0;
        pan.setValue(0);
        setDragId(id);
        onDragStateChange && onDragStateChange(true);
      },
      onPanResponderMove: (_, g) => {
        const order = orderRef.current;
        const offs = offsetsOf(order);
        const desiredTop = startTop.current + g.dy;
        const center = desiredTop + (heights.current[id] || ROW_H) / 2;
        let target = 0;
        for (let i = 0; i < order.length; i++) {
          if (center >= offs[order[i].id]) target = i; else break;
        }
        const curIndex = order.findIndex((w) => w.id === id);
        if (target !== curIndex) {
          const arr = [...order];
          const [it] = arr.splice(curIndex, 1);
          arr.splice(target, 0, it);
          onReorder(arr);
          pan.setValue(desiredTop - (offsetsOf(arr)[id] || 0));
        } else {
          pan.setValue(desiredTop - offs[id]);
        }
      },
      onPanResponderRelease: () => { setDragId(null); pan.setValue(0); onDragStateChange && onDragStateChange(false); },
      onPanResponderTerminate: () => { setDragId(null); pan.setValue(0); onDragStateChange && onDragStateChange(false); },
    });
    return responders.current[id];
  };

  return (
    <View style={{ marginBottom: SPACING.md }}>
      {layout.map((w) => {
        const dragging = dragId === w.id;
        const isOpen = open[w.id];
        const preview = isOpen ? renderPreview(w.id) : null;
        return (
          <Animated.View
            key={w.id}
            onLayout={(e) => { heights.current[w.id] = e.nativeEvent.layout.height + SPACING.sm; }}
            style={[
              styles.editItem,
              dragging && styles.editItemDragging,
              dragging && { transform: [{ translateY: pan }], zIndex: 20, elevation: 8 },
            ]}
          >
            <View style={styles.editHeader}>
              <View {...getResponder(w.id).panHandlers} style={styles.grip}>
                <Ionicons name="reorder-three" size={26} color={COLORS.textSecondary} />
              </View>
              <TouchableOpacity style={styles.editNameWrap} onPress={() => setOpen((o) => ({ ...o, [w.id]: !o[w.id] }))} activeOpacity={0.7}>
                <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={COLORS.textMuted} />
                <Text style={[styles.editRowName, !w.enabled && { color: COLORS.textMuted }]} numberOfLines={1}>{WIDGET_LABELS[w.id]}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onToggle(w.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={w.enabled ? 'eye' : 'eye-off'} size={20} color={w.enabled ? COLORS.primary : COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            {isOpen && (
              <View pointerEvents="none" style={[styles.editPreview, !w.enabled && { opacity: 0.4 }]}>
                {preview || <Text style={styles.emptyMini}>Nothing to preview yet.</Text>}
              </View>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

export default function TeacherHomeScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ students: 0, active: 0, tasks: 0 });
  const [students, setStudents] = useState([]);
  const [joinCode, setJoinCode] = useState(null);
  const [layout, setLayout] = useState(DEFAULT_WIDGETS);
  const [editMode, setEditMode] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState('');
  const [lessons, setLessons] = useState([]);
  const [nudged, setNudged] = useState(() => new Set()); // student uids nudged this session

  // One-tap nudge: drop an encouraging notification into the student's inbox
  // (shows under their Today bell). Optimistic — flips to "Nudged" instantly.
  const nudgeStudent = async (s) => {
    if (!s?.uid || nudged.has(s.uid)) return;
    setNudged((prev) => new Set(prev).add(s.uid));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await sendNotification(s.uid, {
        type: 'nudge',
        title: 'A nudge from your teacher 👋',
        body: 'Time for a quick practice — your teacher is cheering you on!',
      });
    } catch (e) {
      setNudged((prev) => { const n = new Set(prev); n.delete(s.uid); return n; });
      Alert.alert('Error', "Couldn't send the nudge. Please try again.");
    }
  };

  // Make sure this teacher has a join code (students use it to connect) and
  // load their saved home layout + personal note.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    ensureTeacherCode(uid).then(setJoinCode).catch(() => {});
    getDoc(doc(db, 'users', uid))
      .then((s) => {
        // One-time order fix for layouts saved before 2026-07-07: the calendar
        // and lessons cards belong above Top Students. Guarded by a doc flag so
        // it never re-runs — reordering afterwards sticks.
        let merged = mergeLayout(s.data()?.teacherWidgets);
        if (s.data()?.widgetOrderFixed !== true) {
          const topIdx = merged.findIndex((w) => w.id === 'top');
          const calIdxs = ['calendar', 'lessons'].map((id) => merged.findIndex((w) => w.id === id)).filter((i) => i !== -1);
          if (topIdx !== -1 && calIdxs.some((i) => i > topIdx)) {
            const next = [...merged];
            const [topW] = next.splice(topIdx, 1);
            const lastCal = Math.max(...['calendar', 'lessons'].map((id) => next.findIndex((w) => w.id === id)));
            next.splice(lastCal + 1, 0, topW);
            merged = next;
          }
          updateDoc(doc(db, 'users', uid), { teacherWidgets: merged, widgetOrderFixed: true }).catch(() => {});
        }
        setLayout(merged);
        setNote(s.data()?.teacherNote || '');
        setLessons(Array.isArray(s.data()?.lessons) ? s.data().lessons : []);
      })
      .catch(() => {});
  }, []);

  const saveNote = async () => {
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { teacherNote: note }).catch(() => {});
  };

  const moveWidget = (id, dir) => {
    setLayout((prev) => {
      const i = prev.findIndex((w) => w.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const toggleWidget = (id) => {
    setLayout((prev) => prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)));
  };

  const saveLayout = async () => {
    setEditMode(false);
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { teacherWidgets: layout }).catch(() => {});
  };

  const shareCode = () => {
    if (!joinCode) return;
    Share.share({ message: `Add me as your Prova teacher with this code: ${joinCode}` }).catch(() => {});
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (DEMO_MODE) {
        setStats(computeStats(DEMO_STUDENTS_DATA));
        setStudents(DEMO_STUDENTS_DATA);
        setLoading(false);
        return () => { cancelled = true; };
      }
      (async () => {
        try {
          const uid = auth.currentUser?.uid;
          if (!uid) return;
          // Students who connected carry teacherUid === my uid.
          const [snap, meSnap] = await Promise.all([
            getDocs(query(collection(db, 'users'), where('teacherUid', '==', uid))),
            getDoc(doc(db, 'users', uid)),
          ]);
          const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
          if (!cancelled) {
            setStats(computeStats(list));
            setStudents(list);
            setLessons(Array.isArray(meSnap.data()?.lessons) ? meSnap.data().lessons : []);
          }
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

  const renderWidget = (id) => {
    switch (id) {
      case 'code':
        return joinCode ? (
          <View style={styles.codeCard}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.codeLabel}>YOUR JOIN CODE</Text>
              <Text style={styles.codeValue}>{joinCode}</Text>
              <Text style={styles.codeHint}>Students enter this in their Profile to connect with you.</Text>
            </View>
            <TouchableOpacity style={styles.codeShareBtn} onPress={shareCode} activeOpacity={0.85} disabled={editMode}>
              <Ionicons name="share-outline" size={18} color={COLORS.primary} />
              <Text style={styles.codeShareText}>Share</Text>
            </TouchableOpacity>
          </View>
        ) : null;
      case 'stats':
        return (
          <View style={styles.statsRow}>
            <StatCard value={stats.students} label="Students" icon="people" />
            <StatCard value={stats.active} label="Active this week" icon="flame" />
            <StatCard value={stats.tasks} label="Tasks assigned" icon="clipboard" />
          </View>
        );
      case 'getstarted':
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Get started</Text>
            <ChecklistRow done={stats.students > 0} label="Add your first student" onPress={editMode ? null : goStudents} />
            <ChecklistRow done={stats.tasks > 0} label="Assign a practice task" onPress={editMode ? null : goStudents} />
            <ChecklistRow done={false} label="Browse the resource library" onPress={editMode ? null : goResources} />
          </View>
        );
      case 'actions':
        return (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={goStudents} activeOpacity={0.85} disabled={editMode}>
              <Ionicons name="person-add" size={18} color={COLORS.text} />
              <Text style={styles.actionText}>Add a student</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={goResources} activeOpacity={0.85} disabled={editMode}>
              <Ionicons name="library" size={18} color={COLORS.primary} />
              <Text style={[styles.actionText, { color: COLORS.primary }]}>Resources</Text>
            </TouchableOpacity>
          </View>
        );
      case 'tip':
        return (
          <View style={styles.tipCard}>
            <View style={styles.tipHeader}>
              <Ionicons name="bulb" size={16} color={COLORS.accent || COLORS.primary} />
              <Text style={styles.tipKicker}>TIP OF THE DAY</Text>
            </View>
            <Text style={styles.tipText}>{tipOfTheDay()}</Text>
          </View>
        );
      case 'calendar':
        // The calendar gets its own tappable card, sitting above Lessons.
        return (
          <TouchableOpacity
            style={[styles.card, styles.calendarCard]}
            onPress={() => navigation.navigate('TeacherCalendar')}
            activeOpacity={0.85}
            disabled={editMode}
          >
            <View style={styles.calendarCardIcon}>
              <Ionicons name="calendar" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardTitle}>Calendar</Text>
              <Text style={styles.calendarCardSub}>Plan lessons & mark attendance</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        );
      case 'lessons': {
        // Expand the next 28 days so weekly lessons show their next occurrences.
        const base = new Date();
        const occ = [];
        for (let i = 0; i < 28; i++) {
          const d = new Date(base); d.setDate(base.getDate() + i);
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          lessons.forEach((l) => {
            const anchor = (l.date || '').split('-').map(Number);
            const anchorDow = anchor.length === 3 ? new Date(anchor[0], anchor[1] - 1, anchor[2]).getDay() : -1;
            const matches = l.repeat === 'weekly' ? (ds >= l.date && d.getDay() === anchorDow) : l.date === ds;
            if (matches) occ.push({ ...l, date: ds });
          });
        }
        occ.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        const upcoming = occ.slice(0, 3);
        return (
          <View style={styles.card}>
            <View style={styles.lessonsHead}>
              <Text style={styles.cardTitle}>Lessons</Text>
            </View>
            {upcoming.length === 0 ? (
              <Text style={styles.emptyMini}>No lessons scheduled. Add one from the Calendar.</Text>
            ) : upcoming.map((l) => (
              <View key={`${l.id}_${l.date}`} style={styles.miniRow}>
                <Ionicons name="time-outline" size={15} color={COLORS.primary} />
                <Text style={styles.miniName} numberOfLines={1}>{l.studentName}</Text>
                <Text style={styles.miniMeta}>{lessonWhen(l)}</Text>
              </View>
            ))}
          </View>
        );
      }
      case 'pulse': {
        const now = Date.now();
        const statusOf = (s) => {
          if (!s.lastSessionDate) return { rank: 0, color: COLORS.error, label: 'never practiced' };
          const days = Math.floor((now - new Date(s.lastSessionDate).getTime()) / 86400000);
          if (days >= 4) return { rank: 0, color: COLORS.error, label: `${days}d ago` };
          if (days >= 2) return { rank: 1, color: '#F59E0B', label: `${days}d ago` };
          return { rank: 2, color: COLORS.success, label: days <= 0 ? 'practiced today' : 'yesterday' };
        };
        const rows = students
          .map((s) => ({ s, st: statusOf(s) }))
          .sort((a, b) => a.st.rank - b.st.rank || (b.s.streak || 0) - (a.s.streak || 0));
        const needCount = rows.filter((r) => r.st.rank < 2).length;
        return (
          <View style={styles.card}>
            <View style={styles.pulseHeader}>
              <Text style={styles.cardTitle}>Practice Pulse</Text>
              <Text style={styles.pulseSummary}>
                {rows.length === 0 ? '' : needCount === 0 ? 'all on track 🎉' : `${needCount} need a nudge`}
              </Text>
            </View>
            {rows.length === 0 ? (
              <Text style={styles.emptyMini}>Connect students to see their practice at a glance.</Text>
            ) : rows.slice(0, 8).map(({ s, st }) => {
              const done = nudged.has(s.uid);
              return (
                <View key={s.uid} style={styles.pulseRow}>
                  <View style={[styles.pulseDot, { backgroundColor: st.color }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.pulseName} numberOfLines={1}>{displayName(s)}</Text>
                    <Text style={styles.pulseMeta} numberOfLines={1}>
                      {(s.streak || 0) > 0 ? `🔥 ${s.streak} · ` : ''}{st.label}
                    </Text>
                  </View>
                  {st.rank < 2 && (
                    <TouchableOpacity
                      style={[styles.nudgeBtn, done && styles.nudgeBtnDone]}
                      onPress={() => nudgeStudent(s)}
                      disabled={done}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={done ? 'checkmark' : 'hand-right-outline'} size={13} color={done ? COLORS.success : COLORS.primary} />
                      <Text style={[styles.nudgeText, done && { color: COLORS.success }]}>{done ? 'Nudged' : 'Nudge'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            {rows.length > 8 && <Text style={styles.pulseMore}>+{rows.length - 8} more</Text>}
          </View>
        );
      }
      case 'top': {
        const ranked = [...students].sort((a, b) => (b.provaScore || 0) - (a.provaScore || 0)).slice(0, 3);
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top students</Text>
            {ranked.length === 0 ? (
              <Text style={styles.emptyMini}>No students yet.</Text>
            ) : ranked.map((s, i) => (
              <View key={s.uid || i} style={styles.miniRow}>
                <Text style={styles.miniRank}>{['🥇', '🥈', '🥉'][i]}</Text>
                <Text style={styles.miniName} numberOfLines={1}>{displayName(s)}</Text>
                <Text style={styles.miniScore}>{(s.provaScore || 0).toLocaleString()}</Text>
              </View>
            ))}
          </View>
        );
      }
      case 'attention': {
        const now = Date.now();
        const flagged = students.filter((s) => {
          if (!s.lastSessionDate) return true;
          return now - new Date(s.lastSessionDate).getTime() >= 3 * 86400000;
        });
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Needs a nudge</Text>
            {flagged.length === 0 ? (
              <Text style={styles.emptyMini}>Everyone's practiced recently 🎉</Text>
            ) : flagged.slice(0, 5).map((s, i) => {
              const days = s.lastSessionDate ? Math.floor((now - new Date(s.lastSessionDate).getTime()) / 86400000) : null;
              return (
                <View key={s.uid || i} style={styles.miniRow}>
                  <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                  <Text style={styles.miniName} numberOfLines={1}>{displayName(s)}</Text>
                  <Text style={styles.miniMeta}>{days === null ? 'never' : `${days}d ago`}</Text>
                </View>
              );
            })}
          </View>
        );
      }
      case 'notes':
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>My notes</Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              onBlur={saveNote}
              editable={!editMode}
              multiline
              placeholder="Jot reminders for yourself — lesson ideas, who to follow up with…"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={!dragging}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kicker}>TEACHER HOME</Text>
            <Text style={styles.title}>Welcome back, coach 👋</Text>
          </View>
          <TouchableOpacity
            style={[styles.editBtn, editMode && styles.editBtnActive]}
            onPress={() => (editMode ? saveLayout() : setEditMode(true))}
            activeOpacity={0.85}
          >
            <Ionicons name={editMode ? 'checkmark' : 'create-outline'} size={16} color={editMode ? '#fff' : COLORS.primary} />
            <Text style={[styles.editBtnText, editMode && { color: '#fff' }]}>{editMode ? 'Done' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>

        {editMode && (
          <Text style={styles.editHelp}>Hold the ≡ handle to drag a card up or down. Tap a row to preview it. Use the eye to show/hide. Tap Done to save.</Text>
        )}

        {editMode ? (
          <WidgetEditList layout={layout} onReorder={setLayout} onToggle={toggleWidget} renderPreview={renderWidget} onDragStateChange={setDragging} />
        ) : loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
        ) : (
          layout.map((w) => {
            if (!w.enabled) return null;
            const content = renderWidget(w.id);
            return content ? <View key={w.id}>{content}</View> : null;
          })
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
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACING.sm },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.surface },
  editBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  editBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  editHelp: { color: COLORS.textMuted, fontSize: 12, lineHeight: 17, marginBottom: SPACING.md, marginTop: -SPACING.sm },
  editWrap: { borderWidth: 1, borderColor: COLORS.primary + '55', borderRadius: 16, padding: SPACING.sm, marginBottom: SPACING.md, backgroundColor: COLORS.primary + '0C' },
  editItem: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm, overflow: 'hidden' },
  editItemDragging: { borderColor: COLORS.primary, backgroundColor: COLORS.surface, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  editHeader: { height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md },
  editNameWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  grip: { paddingVertical: 10, paddingHorizontal: 4 },
  editRowName: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 15, fontWeight: '700' },
  editPreview: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.md },
  editBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm, paddingHorizontal: 4 },
  editName: { color: COLORS.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  editControls: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  codeCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.lg,
    backgroundColor: COLORS.primary + '14', borderRadius: 16, borderWidth: 1, borderColor: COLORS.primary + '44',
    padding: SPACING.lg,
  },
  codeLabel: { color: COLORS.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 2 },
  codeValue: { color: COLORS.text, fontSize: 28, fontWeight: '900', letterSpacing: 4, fontVariant: ['tabular-nums'] },
  codeHint: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 16, marginTop: 4 },
  codeShareBtn: { alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  codeShareText: { color: COLORS.primary, fontSize: 11, fontWeight: '700' },

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
  calendarCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md },
  calendarCardIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: COLORS.primary + '18', alignItems: 'center', justifyContent: 'center' },
  calendarCardSub: { color: COLORS.textMuted, fontSize: 12, marginTop: -6 },
  emptyMini: { color: COLORS.textMuted, fontSize: 13 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 7, borderTopWidth: 1, borderTopColor: COLORS.border },
  miniRank: { width: 22, textAlign: 'center', fontSize: 15 },
  miniName: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 14, fontWeight: '600' },
  miniScore: { color: COLORS.primary, fontSize: 13, fontWeight: '800' },
  miniMeta: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  // Practice Pulse
  pulseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  pulseSummary: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  pulseRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  pulseDot: { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  pulseName: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  pulseMeta: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: 1 },
  nudgeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary + '1A', borderRadius: 12, paddingHorizontal: SPACING.sm + 2, paddingVertical: 5, flexShrink: 0 },
  nudgeBtnDone: { backgroundColor: COLORS.success + '1A' },
  nudgeText: { color: COLORS.primary, fontSize: 12, fontWeight: '800' },
  pulseMore: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: SPACING.sm, textAlign: 'center' },
  noteInput: { color: COLORS.text, fontSize: 14, lineHeight: 20, minHeight: 70, textAlignVertical: 'top' },
  lessonsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  calBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: COLORS.primary },
  calBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
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
