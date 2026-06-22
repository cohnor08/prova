import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Share, TextInput,
  Animated, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';
import { ensureTeacherCode } from '../../lib/teacher';
import { displayName } from '../../lib/displayName';
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
  DEFAULT_WIDGETS.forEach((d) => { if (!have.has(d.id)) kept.push({ ...d }); });
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

// Edit-mode list you reorder by holding the grip (≡) and dragging up/down.
// Built on PanResponder (no extra deps). Rows are a fixed height so the drag
// maps cleanly to list positions.
const ROW_H = 56;
function WidgetEditList({ layout, onReorder, onToggle }) {
  const [dragId, setDragId] = useState(null);
  const orderRef = useRef(layout);
  orderRef.current = layout;
  const responders = useRef({});
  const pan = useRef(new Animated.Value(0)).current;
  const startIdx = useRef(0);
  const curIdx = useRef(0);

  const getResponder = (id) => {
    if (responders.current[id]) return responders.current[id];
    responders.current[id] = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const i = orderRef.current.findIndex((w) => w.id === id);
        startIdx.current = i; curIdx.current = i;
        pan.setValue(0);
        setDragId(id);
      },
      onPanResponderMove: (_, g) => {
        const target = Math.max(0, Math.min(orderRef.current.length - 1, startIdx.current + Math.round(g.dy / ROW_H)));
        if (target !== curIdx.current) {
          const arr = [...orderRef.current];
          const from = arr.findIndex((w) => w.id === id);
          const [it] = arr.splice(from, 1);
          arr.splice(target, 0, it);
          curIdx.current = target;
          onReorder(arr);
        }
        pan.setValue(g.dy + (startIdx.current - curIdx.current) * ROW_H);
      },
      onPanResponderRelease: () => { setDragId(null); pan.setValue(0); },
      onPanResponderTerminate: () => { setDragId(null); pan.setValue(0); },
    });
    return responders.current[id];
  };

  return (
    <View style={{ marginBottom: SPACING.md }}>
      {layout.map((w) => {
        const dragging = dragId === w.id;
        return (
          <Animated.View
            key={w.id}
            style={[
              styles.editRow,
              dragging && styles.editRowDragging,
              dragging && { transform: [{ translateY: pan }], zIndex: 20, elevation: 8 },
            ]}
          >
            <View {...getResponder(w.id).panHandlers} style={styles.grip}>
              <Ionicons name="reorder-three" size={26} color={COLORS.textSecondary} />
            </View>
            <Text style={[styles.editRowName, !w.enabled && { color: COLORS.textMuted }]} numberOfLines={1}>
              {WIDGET_LABELS[w.id]}
            </Text>
            <TouchableOpacity onPress={() => onToggle(w.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={w.enabled ? 'eye' : 'eye-off'} size={20} color={w.enabled ? COLORS.primary : COLORS.textMuted} />
            </TouchableOpacity>
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
  const [note, setNote] = useState('');
  const [lessons, setLessons] = useState([]);

  // Make sure this teacher has a join code (students use it to connect) and
  // load their saved home layout + personal note.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    ensureTeacherCode(uid).then(setJoinCode).catch(() => {});
    getDoc(doc(db, 'users', uid))
      .then((s) => {
        setLayout(mergeLayout(s.data()?.teacherWidgets));
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
              <TouchableOpacity style={styles.calBtn} onPress={() => navigation.navigate('TeacherCalendar')} activeOpacity={0.85} disabled={editMode}>
                <Ionicons name="calendar-outline" size={15} color={COLORS.primary} />
                <Text style={styles.calBtnText}>Calendar</Text>
              </TouchableOpacity>
            </View>
            {upcoming.length === 0 ? (
              <Text style={styles.emptyMini}>No lessons scheduled. Tap Calendar to add one.</Text>
            ) : upcoming.map((l) => (
              <View key={l.id} style={styles.miniRow}>
                <Ionicons name="time-outline" size={15} color={COLORS.primary} />
                <Text style={styles.miniName} numberOfLines={1}>{l.studentName}</Text>
                <Text style={styles.miniMeta}>{lessonWhen(l)}</Text>
              </View>
            ))}
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
              <Text style={styles.emptyMini}>Everyone's practised recently 🎉</Text>
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
      <ScrollView contentContainerStyle={styles.content}>
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
          <Text style={styles.editHelp}>Hold the ≡ handle and drag a card up or down to reorder. Tap the eye to hide it. Tap Done to save.</Text>
        )}

        {editMode ? (
          <WidgetEditList layout={layout} onReorder={setLayout} onToggle={toggleWidget} />
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
  editRow: { height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, marginBottom: SPACING.sm },
  editRowDragging: { borderColor: COLORS.primary, backgroundColor: COLORS.surface, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  grip: { paddingVertical: 6, paddingRight: 4 },
  editRowName: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 15, fontWeight: '700' },
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
  emptyMini: { color: COLORS.textMuted, fontSize: 13 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 7, borderTopWidth: 1, borderTopColor: COLORS.border },
  miniRank: { width: 22, textAlign: 'center', fontSize: 15 },
  miniName: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 14, fontWeight: '600' },
  miniScore: { color: COLORS.primary, fontSize: 13, fontWeight: '800' },
  miniMeta: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
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
