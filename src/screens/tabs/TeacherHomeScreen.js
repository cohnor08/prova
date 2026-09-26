import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Share, TextInput,
  Animated, PanResponder, Alert,
} from 'react-native';
import Ghost from '../../components/Ghost';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, onSnapshot, limit, orderBy } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { TourSpot, useTourScroller, useTourPadding } from '../../components/TourSpot';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';
import { ensureTeacherCode, queryMyStudents } from '../../lib/teacher';
import { pickDocument, uploadTaskFile } from '../../lib/media';
import { attachmentKind, attachmentMeta, cleanFileName, TASK_FILE_MAX_LABEL } from '../../lib/attachments';
import TaskAttachments from '../../components/TaskAttachments';
import { displayName } from '../../lib/displayName';
import { liveStreak } from '../../lib/score';
import { sendNotification } from '../../lib/inbox';
import { advancePrograms } from '../../lib/programs';
import { studioUpsell, TEACHER_FREE_STUDENT_LIMIT } from '../../lib/entitlements';
import StudentKeeperModal from '../../components/StudentKeeperModal';
import SheetModal from '../../components/SheetModal';
import ProofMedia from '../../components/ProofMedia';
import { upcomingLessons, lessonPrep, dayLabel, timeLabel } from '../../lib/lessonSchedule';
import { watchLessonRequests, answerLessonRequest, whenLabel } from '../../lib/lessonRequests';
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
  // Students lead: a teacher opens this screen to see who needs them, not to
  // read their own statistics. (The three stat boxes that used to sit at the
  // top are gone — a teacher told us the page read like a student's.)
  { id: 'pulse', enabled: true },
  { id: 'calendar', enabled: true },
  { id: 'lessons', enabled: true },
  { id: 'files', enabled: true },
  { id: 'getstarted', enabled: true },
  { id: 'actions', enabled: true },
  { id: 'ask', enabled: true },
  // Extra widgets — off by default; teachers switch them on in Edit mode.
  { id: 'tip', enabled: false },
  { id: 'top', enabled: false },
  { id: 'notes', enabled: false },
];
// Retiring a widget means dropping it from here: mergeLayout only keeps ids it
// knows, so a saved layout loses it on the next load. That's how `stats` went.
const WIDGET_LABELS = {
  code: 'Join code',
  pulse: 'Students',
  calendar: 'Calendar',
  lessons: 'Lessons',
  files: 'My files',
  getstarted: 'Get started',
  actions: 'Quick actions',
  ask: 'Ask Prova',
  tip: 'Tip of the day',
  top: 'Top students',
  notes: 'My notes',
};

// The files card lists this many, then offers the rest — a library gets long,
// and Home is not where you browse it.
const FILES_COMPACT = 5;

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
  useThemeSync();
  const tourScrollRef = useTourScroller('TeacherHomeMain'); // full tour scroll access
  const tourPad = useTourPadding();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ students: 0, active: 0, tasks: 0 });
  const [students, setStudents] = useState([]);
  const [joinCode, setJoinCode] = useState(null);
  const [layout, setLayout] = useState(DEFAULT_WIDGETS);
  const [editMode, setEditMode] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState('');
  const [lessons, setLessons] = useState([]);
  const [attendance, setAttendance] = useState({});     // lesson notes live here, keyed lessonId_date
  const [prepFor, setPrepFor] = useState(null);         // { lesson, date } — the Prep sheet
  const [prepCache, setPrepCache] = useState({});       // studentUid -> practice log, fetched on first Prep
  const [proofView, setProofView] = useState(null);     // a proof clip opened from the prep card
  const [requests, setRequests] = useState([]);         // students asking to move/cancel a lesson
  const [reqBusy, setReqBusy] = useState(null);
  const [nudged, setNudged] = useState(() => new Set()); // student uids nudged this session
  const [pulseOpen, setPulseOpen] = useState(false);     // student list "show more"
  // The teacher's own library: every PDF and backing track they use, kept on
  // their account (users/{uid}.teacherFiles) instead of being re-found on a
  // laptop every time they set a task.
  const [files, setFiles] = useState([]);
  // Folders the teacher named, kept even when empty — Studio can create one
  // before anything is in it, and the two screens share the field.
  const [folders, setFolders] = useState([]);
  const [fileFolder, setFileFolder] = useState('All');
  const [fileBusy, setFileBusy] = useState(false);
  const [filePct, setFilePct] = useState(null);
  const [fileEdit, setFileEdit] = useState(null);        // the file open in the rename/move sheet
  const [filesAll, setFilesAll] = useState(false);       // the card lists five until asked
  const [fileName, setFileName] = useState('');
  const [fileFolderText, setFileFolderText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);     // inbox badge on the bell

  const [teacherPro, setTeacherPro] = useState(true);    // optimistic — real value loads with the doc
  const [keeperOpen, setKeeperOpen] = useState(false);   // free plan + over the student cap -> pick who stays

  // Free plan holding more students than it includes (e.g. after a Studio
  // downgrade): the teacher picks who stays connected. Fires here because
  // Home is the landing tab.
  // Must stay below the two useState lines above: the dependency array is
  // evaluated during render, so declaring it first put `teacherPro` in the
  // temporal dead zone and threw on every teacher's first paint.
  useEffect(() => {
    if (!DEMO_MODE && !teacherPro && students.length > TEACHER_FREE_STUDENT_LIMIT) setKeeperOpen(true);
  }, [teacherPro, students.length]);

  // Live unread count for the teacher's bell (e.g. "parent reports sent").
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const q = query(collection(db, 'users', uid, 'inbox'), where('read', '==', false), limit(10));
    return onSnapshot(q, (snap) => setUnreadCount(snap.size), () => {});
  }, []);

  // One-tap nudge: drop an encouraging notification into the student's inbox
  // (shows under their Today bell). Optimistic — flips to "Nudged" instantly.
  const nudgeStudent = async (s) => {
    if (!s?.uid || nudged.has(s.uid)) return;
    if (!teacherPro) { studioUpsell('One-tap student nudges are part of Prova Studio.'); return; }
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
        setTeacherPro(true); // FREE LAUNCH: Studio unlocked for all (real value in teacherPlan)
        setNote(s.data()?.teacherNote || '');
        setLessons(Array.isArray(s.data()?.lessons) ? s.data().lessons : []);
        setFiles(Array.isArray(s.data()?.teacherFiles) ? s.data().teacherFiles : []);
        setFolders(Array.isArray(s.data()?.teacherFolders) ? s.data().teacherFolders : []);
      })
      .catch(() => {});
  }, []);

  // One write for the whole library — it's a small array on the teacher's own
  // doc, and keeping it in one field means no sync to get wrong.
  const saveFiles = (next) => {
    setFiles(next);
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { teacherFiles: next }).catch(() => {});
  };

  const addFile = async () => {
    if (fileBusy) return;
    const picked = await pickDocument();
    if (!picked) return;
    if (picked.error) { Alert.alert('Cannot add', picked.error); return; }
    setFileBusy(true); setFilePct(0);
    try {
      const uid = auth.currentUser.uid;
      const att = await uploadTaskFile(picked, uid, (pct) => setFilePct(pct));
      saveFiles([{ ...att, id: `${Date.now()}`, folder: fileFolder === 'All' ? '' : fileFolder, addedAt: new Date().toISOString() }, ...files]);
    } catch (e) {
      Alert.alert('Upload failed', e?.message || 'That file could not be uploaded.');
    } finally {
      setFileBusy(false); setFilePct(null);
    }
  };

  const openFileEdit = (f) => {
    setFileEdit(f);
    setFileName(cleanFileName(f.title || ''));
    setFileFolderText(f.folder || '');
  };

  const saveFileEdit = () => {
    const folder = fileFolderText.trim();
    const next = files.map((f) => (f.id === fileEdit.id
      ? { ...f, title: fileName.trim() || f.title, folder }
      : f));
    saveFiles(next);
    // Naming a new folder here makes it, so it's there to file the next thing
    // into — and Studio shows it too.
    if (folder && !folders.includes(folder)) {
      const nextFolders = [...folders, folder];
      setFolders(nextFolders);
      const uid = auth.currentUser?.uid;
      if (uid) updateDoc(doc(db, 'users', uid), { teacherFolders: nextFolders }).catch(() => {});
    }
    setFileEdit(null);
  };

  // Removes it from the library only. The copy already attached to a task
  // keeps working — pulling a file out from under a student's homework would
  // be a nasty surprise.
  const deleteFile = () => {
    const gone = fileEdit;
    Alert.alert('Remove from your files?', cleanFileName(gone.title || 'This file'), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => { saveFiles(files.filter((f) => f.id !== gone.id)); setFileEdit(null); },
      },
    ]);
  };

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
          // Release any program weeks that have come due since last open.
          advancePrograms(uid).catch(() => {});
          // Students who connected carry my uid in teacherUid or teacherUids.
          const [list, meSnap] = await Promise.all([
            queryMyStudents(uid),
            getDoc(doc(db, 'users', uid)),
          ]);
          if (!cancelled) {
            setStats(computeStats(list));
            setStudents(list);
            setLessons(Array.isArray(meSnap.data()?.lessons) ? meSnap.data().lessons : []);
            setAttendance(meSnap.data()?.attendance || {});
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

  // Requests arrive live — a teacher shouldn't have to pull to refresh to see
  // that Thursday is off.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || DEMO_MODE) return;
    return watchLessonRequests('teacherUid', uid, (all) => setRequests(all.filter((r) => r.status === 'pending')));
  }, []);

  const answerRequest = async (req, accept) => {
    const uid = auth.currentUser?.uid;
    if (!uid || reqBusy) return;
    setReqBusy(req.id);
    try {
      await answerLessonRequest(uid, req, accept);
      if (accept) {
        const snap = await getDoc(doc(db, 'users', uid));
        setLessons(Array.isArray(snap.data()?.lessons) ? snap.data().lessons : []);
      }
    } catch (e) {
      Alert.alert('Could not answer', e?.message || 'Please try again.');
    } finally {
      setReqBusy(null);
    }
  };

  // Prep is a button on a lesson: open the sheet, fetch that student's
  // practice log the first time.
  const openPrep = (lesson, date) => {
    setPrepFor({ lesson, date });
    const sid = lesson.studentUid;
    if (!sid || prepCache[sid] || DEMO_MODE) return;
    getDocs(query(collection(db, 'sessionHistory', sid, 'logs'), orderBy('date', 'desc'), limit(45)))
      .then((snap) => {
        const logs = {};
        snap.forEach((d) => { logs[d.id] = d.data()?.totalMinutes || 0; });
        setPrepCache((c) => ({ ...c, [sid]: logs }));
      })
      .catch(() => setPrepCache((c) => ({ ...c, [sid]: {} })));
  };

  const goStudents = () => navigation.navigate('Teacher');
  const goResources = () => navigation.navigate('Resources');
  const goPacks = () => navigation.navigate('Packs');

  const renderPrep = () => {
        if (!prepFor) return null;
        const { lesson, date } = prepFor;
        const nextStudent = students.find((x) => x.uid === lesson.studentUid);
        if (!nextStudent) return null;
        const name = displayName(nextStudent);
        const loaded = !!prepCache[nextStudent.uid];
        const prep = lessonPrep({
          lesson, date, student: nextStudent, teacherUid: auth.currentUser?.uid,
          attendance, logs: loaded ? prepCache[nextStudent.uid] : {},
        });
        const rec = attendance[`${lesson.id}__${date}`] || {};
        const dot = { proof: COLORS.primary, bad: COLORS.error, warn: '#F59E0B', hear: COLORS.primary, good: COLORS.success, note: COLORS.textMuted };
        return (
          <View>
            <View style={styles.fileSheetHead}>
              <Text style={[styles.prepWho, { flex: 1, minWidth: 0 }]} numberOfLines={1}>Prep for {name}</Text>
              <TouchableOpacity onPress={() => setPrepFor(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.prepWhen}>
              {dayLabel(date)} · {timeLabel(lesson.time)}
            </Text>

            {!loaded ? (
              <Text style={[styles.prepText, styles.prepMuted, { marginTop: SPACING.md }]}>Reading their practice…</Text>
            ) : (
              <>
                <Text style={styles.prepLabel}>WORK ON TODAY</Text>
                {prep.workOn.map((w, i) => (
                  <View key={i} style={styles.prepWork}>
                    <View style={[styles.prepDot, { backgroundColor: dot[w.kind] }]} />
                    <Text style={styles.prepWorkText}>{w.text}</Text>
                  </View>
                ))}
                {prep.proofs.length > 0 && (
                  <TouchableOpacity style={styles.prepProof} onPress={() => { const pv = prep.proofs[0]; setPrepFor(null); setTimeout(() => setProofView(pv), 350); }} activeOpacity={0.8}>
                    <Ionicons name="play-circle" size={18} color={COLORS.primary} />
                    <Text style={styles.prepProofText} numberOfLines={1}>
                      Watch their recording{prep.proofs.length > 1 ? ` (+${prep.proofs.length - 1} more)` : ''}
                    </Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.prepLabel}>
                  SINCE LAST LESSON{prep.lastLesson ? ` (${dayLabel(prep.lastLesson.date).toUpperCase()})` : ''}
                </Text>
                <View style={styles.prepTask}>
                  <Text style={styles.prepTaskTitle}>Practice</Text>
                  <Text style={[styles.prepTaskMeta, !prep.minutes && styles.prepBad]}>
                    {prep.minutes ? `${prep.minutes} min over ${prep.days} day${prep.days === 1 ? '' : 's'}` : 'None logged'}
                  </Text>
                </View>
                {prep.tasks.map((t, i) => (
                  <View key={i} style={styles.prepTask}>
                    <Text style={styles.prepTaskTitle} numberOfLines={1}>{t.title}</Text>
                    <Text style={[styles.prepTaskMeta, {
                      color: t.state === 'done' ? COLORS.success : t.state === 'started' ? COLORS.primary : COLORS.error,
                    }]}>
                      {t.state === 'done' ? 'Done' : t.state === 'started' ? `${t.minutes} min, not finished` : "Didn't touch"}
                    </Text>
                  </View>
                ))}
                {!!prep.lastLesson?.note && (
                  <>
                    <Text style={styles.prepLabel}>YOUR NOTE FROM LAST TIME</Text>
                    <Text style={[styles.prepText, styles.prepMuted]} numberOfLines={5}>{prep.lastLesson.note}</Text>
                  </>
                )}
              </>
            )}

            <View style={styles.prepBtns}>
              <TouchableOpacity style={[styles.prepBtn, styles.prepBtnAlt]} activeOpacity={0.85} onPress={() => { setPrepFor(null); goStudents(); }}>
                <Text style={[styles.prepBtnText, { color: COLORS.primary }]}>Open {name.split(' ')[0]}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.prepBtn, styles.prepBtnAlt]}
                activeOpacity={0.85}
                onPress={() => { setPrepFor(null); navigation.navigate('LessonNote', {
                  lessonId: lesson.id, dateStr: date, studentName: lesson.studentName,
                  studentUid: lesson.studentUid, time: lesson.time, note: rec.note || '',
                }); }}
              >
                <Text style={[styles.prepBtnText, { color: COLORS.primary }]}>{rec.note ? 'Edit' : 'Write'} lesson note</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
  };

  const renderWidget = (id) => {
    switch (id) {
      case 'code':
        return joinCode ? (
          <View style={styles.codeCard}>
            <TourSpot id="th-code" />
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
      case 'files': {
        const allFolders = [...new Set([...folders, ...files.map((f) => (f.folder || '').trim())].filter(Boolean))].sort();
        const shown = fileFolder === 'All' ? files : files.filter((f) => (f.folder || '') === fileFolder);
        return (
          <View style={styles.card}>
            <View style={styles.pulseHeader}>
              <Text style={styles.cardTitle}>My files</Text>
              <Text style={styles.pulseSummary}>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : ''}</Text>
            </View>
            <Text style={styles.filesSub}>
              Sheet music, tabs and backing tracks in one place. Tap to open or play; attach them to a task without
              going looking for the file again. Up to {TASK_FILE_MAX_LABEL} each.
            </Text>
            {allFolders.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.folderRow} contentContainerStyle={{ gap: 8 }}>
                {['All', ...allFolders].map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.folderChip, fileFolder === f && styles.folderChipOn]}
                    onPress={() => setFileFolder(f)}
                    disabled={editMode}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.folderChipText, fileFolder === f && { color: COLORS.onPrimary }]} numberOfLines={1}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {shown.length === 0 ? (
              <Text style={styles.emptyMini}>
                {files.length === 0
                  ? 'Nothing here yet. Add a PDF or a backing track and it stays in your library.'
                  : `Nothing in “${fileFolder}” yet.`}
              </Text>
            ) : (
              /* The same player the students get — audio plays in the row, a
                 PDF opens in the app — plus a ⋯ to rename or file each one. */
              <>
                <TaskAttachments
                  attachments={filesAll ? shown : shown.slice(0, FILES_COMPACT)}
                  style={{ marginTop: SPACING.sm }}
                  onEdit={editMode ? undefined : openFileEdit}
                />
                {shown.length > FILES_COMPACT && (
                  <TouchableOpacity onPress={() => setFilesAll((v) => !v)} activeOpacity={0.7} disabled={editMode}>
                    <Text style={styles.filesMore}>
                      {filesAll ? 'Show less' : `Show all ${shown.length}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            <TouchableOpacity style={styles.filesAddBtn} onPress={addFile} disabled={fileBusy || editMode} activeOpacity={0.85}>
              {fileBusy
                ? <Ghost size="small" color={COLORS.primary} />
                : <Ionicons name="add" size={18} color={COLORS.primary} />}
              <Text style={styles.filesAddText}>
                {fileBusy ? (filePct != null ? `Uploading… ${filePct}%` : 'Uploading…') : 'Add a PDF or audio file'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      }
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
          <View style={styles.actionsCol}>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={goStudents} activeOpacity={0.85} disabled={editMode}>
                <Ionicons name="person-add" size={18} color={COLORS.onPrimary} />
                <Text style={styles.actionText}>Add a student</Text>
              </TouchableOpacity>
              {/* One tap to the calendar, from the top of the screen — a
                  teacher's most-used page shouldn't need scrolling to. */}
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={() => navigation.navigate('TeacherCalendar')} activeOpacity={0.85} disabled={editMode}>
                <Ionicons name="calendar" size={18} color={COLORS.primary} />
                <Text style={[styles.actionText, { color: COLORS.primary }]}>Calendar</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={goResources} activeOpacity={0.85} disabled={editMode}>
                <Ionicons name="library" size={18} color={COLORS.primary} />
                <Text style={[styles.actionText, { color: COLORS.primary }]}>Resources</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={goPacks} activeOpacity={0.85} disabled={editMode}>
                <Ionicons name="albums-outline" size={18} color={COLORS.primary} />
                <Text style={[styles.actionText, { color: COLORS.primary }]}>Packs</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case 'ask':
        return (
          <TouchableOpacity
            style={styles.askCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('AskProva')}
            disabled={editMode}
          >
            <View style={styles.askIcon}>
              <Ionicons name="sparkles" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.askTitle}>Ask Prova</Text>
              <Text style={styles.askSub} numberOfLines={1}>Your AI assistant — lesson ideas, theory, anything</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
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
            <TourSpot id="th-lessons" />
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
        // Next 28 days, weekly repeats resolved and moved/cancelled weeks skipped.
        // Hidden (not deleted) when the student is no longer connected.
        const upcoming = upcomingLessons(lessons.filter((l) => !l.studentUid || students.some((x) => x.uid === l.studentUid)), new Date(), 28).slice(0, 3).map((o) => ({ ...o.lesson, date: o.date }));
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
                {students.some((x) => x.uid === l.studentUid) && (
                  <TouchableOpacity style={styles.nudgeBtn} onPress={() => openPrep(l, l.date)} disabled={editMode} activeOpacity={0.8}>
                    <Text style={styles.nudgeText}>Prep</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        );
      }
      case 'pulse': {
        if (!teacherPro) {
          return (
            <View style={styles.card}>
              <View style={styles.pulseHeader}>
                <Text style={styles.cardTitle}>Students</Text>
                <Ionicons name="lock-closed" size={14} color={COLORS.textSecondary} />
              </View>
              <Text style={styles.emptyMini}>See who's on track and who needs a nudge, at a glance — part of Prova Studio.</Text>
              <TouchableOpacity onPress={() => studioUpsell("Practice Pulse shows every student's practice health at a glance, with one-tap nudges.")} hitSlop={{ top: 6, bottom: 6 }}>
                <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 13, marginTop: 8 }}>Learn more</Text>
              </TouchableOpacity>
            </View>
          );
        }
        const now = Date.now();
        const statusOf = (s) => {
          if (!s.lastSessionDate) return { rank: 0, color: COLORS.error, label: 'never practiced' };
          const days = Math.floor((now - new Date(s.lastSessionDate).getTime()) / 86400000);
          if (days >= 4) return { rank: 0, color: COLORS.error, label: `${days}d ago` };
          if (days >= 2) return { rank: 1, color: '#F59E0B', label: `${days}d ago` };
          return { rank: 2, color: COLORS.success, label: days <= 0 ? 'practiced today' : 'yesterday' };
        };
        const rows = students
          .map((s) => ({ s, st: statusOf(s), streak: liveStreak(s) }))
          .sort((a, b) => a.st.rank - b.st.rank || b.streak - a.streak);
        // "Needs a nudge" = hasn't practised in more than 3 days (rank 0).
        const needCount = rows.filter((r) => r.st.rank === 0).length;
        const shown = pulseOpen ? rows : rows.slice(0, 3);
        return (
          <View style={styles.card}>
            {/* This card was "Practice Pulse" — a name that meant nothing to the
                teacher reading it. It is the roster: who they teach, who needs
                them today, and a tap through to that student. */}
            <View style={styles.pulseHeader}>
              <Text style={styles.cardTitle}>Students</Text>
              <Text style={styles.pulseSummary}>
                {rows.length === 0 ? '' : needCount === 0
                  ? `${rows.length} · all on track`
                  : `${rows.length} · ${needCount} need a nudge`}
              </Text>
            </View>
            {rows.length === 0 ? (
              <Text style={styles.emptyMini}>Share your join code and your students appear here.</Text>
            ) : shown.map(({ s, st, streak }) => {
              const done = nudged.has(s.uid);
              return (
                <TouchableOpacity
                  key={s.uid}
                  style={styles.pulseRow}
                  onPress={goStudents}
                  activeOpacity={0.7}
                  disabled={editMode}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${displayName(s)}`}
                >
                  <View style={[styles.pulseDot, { backgroundColor: st.color }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.pulseName} numberOfLines={1}>{displayName(s)}</Text>
                    <Text style={styles.pulseMeta} numberOfLines={1}>
                      {streak > 0 ? `${streak}-day streak · ` : ''}{st.label}
                    </Text>
                  </View>
                  {st.rank === 0 && (
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
                  <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
                </TouchableOpacity>
              );
            })}
            {rows.length > 3 && (
              <TouchableOpacity onPress={() => setPulseOpen((v) => !v)} activeOpacity={0.7}>
                <Text style={styles.pulseMore}>{pulseOpen ? 'Show less' : `Show more (${rows.length - 3})`}</Text>
              </TouchableOpacity>
            )}
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView ref={tourScrollRef} contentContainerStyle={[styles.content, tourPad ? { paddingBottom: tourPad } : null]} scrollEnabled={!dragging}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kicker}>TEACHER HOME</Text>
            <Text style={styles.title}>Welcome back, coach 👋</Text>
          </View>
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => navigation.navigate('Notifications')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name={unreadCount > 0 ? 'notifications' : 'notifications-outline'} size={22} color={unreadCount > 0 ? COLORS.primary : COLORS.textSecondary} />
            {unreadCount > 0 && (
              <View style={styles.bellDot}>
                <Text style={styles.bellDotText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.editBtn, editMode && styles.editBtnActive]}
            onPress={() => (editMode ? saveLayout() : setEditMode(true))}
            activeOpacity={0.85}
          >
            <Ionicons name={editMode ? 'checkmark' : 'create-outline'} size={16} color={editMode ? '#fff' : COLORS.primary} />
            <Text style={[styles.editBtnText, editMode && { color: COLORS.onPrimary }]}>{editMode ? 'Done' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>

        {editMode && (
          <Text style={styles.editHelp}>Hold the ≡ handle to drag a card up or down. Tap a row to preview it. Use the eye to show/hide. Tap Done to save.</Text>
        )}

        {editMode ? (
          <WidgetEditList layout={layout} onReorder={setLayout} onToggle={toggleWidget} renderPreview={renderWidget} onDragStateChange={setDragging} />
        ) : loading ? (
          <Ghost color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
        ) : (
          <>
          {requests.length > 0 && (
            <View style={[styles.card, styles.reqCard]}>
              <Text style={styles.cardTitle}>Lesson changes · {requests.length}</Text>
              {requests.map((r) => {
                const busy = reqBusy === r.id;
                return (
                  <View key={r.id} style={styles.reqRow}>
                    <Text style={styles.reqWho} numberOfLines={1}>{r.studentName} can't make {whenLabel(r.date, r.time)}</Text>
                    <Text style={styles.reqAsk}>
                      {r.newDate ? `Asks for ${whenLabel(r.newDate, r.newTime)}` : 'Asks to cancel this one'}
                    </Text>
                    {!!r.note && <Text style={styles.reqNote} numberOfLines={3}>“{r.note}”</Text>}
                    <View style={styles.reqBtns}>
                      <TouchableOpacity style={[styles.reqBtn, styles.reqNo]} onPress={() => answerRequest(r, false)} disabled={!!reqBusy} activeOpacity={0.8}>
                        <Text style={[styles.reqBtnText, { color: COLORS.textSecondary }]}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.reqBtn} onPress={() => answerRequest(r, true)} disabled={!!reqBusy} activeOpacity={0.8}>
                        <Text style={styles.reqBtnText}>{busy ? '…' : r.newDate ? 'Move it' : 'Cancel it'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          {layout.map((w) => {
            if (!w.enabled) return null;
            const content = renderWidget(w.id);
            return content ? <View key={w.id}>{content}</View> : null;
          })}
          </>
        )}
      </ScrollView>
      <SheetModal visible={!!prepFor} onRequestClose={() => setPrepFor(null)} cardStyle={styles.fileSheet}>
        <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
          {renderPrep()}
        </ScrollView>
      </SheetModal>
      <SheetModal visible={!!proofView} onRequestClose={() => setProofView(null)} cardStyle={styles.fileSheet}>
        <View style={styles.fileSheetHead}>
          <Text style={styles.cardTitle} numberOfLines={1}>{proofView?.title || 'Recording'}</Text>
          <TouchableOpacity onPress={() => setProofView(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
        {!!proofView && <ProofMedia key={proofView.url} url={proofView.url} type={proofView.type} style={styles.prepProofMedia} />}
      </SheetModal>
      <StudentKeeperModal
        visible={keeperOpen}
        students={students}
        limit={TEACHER_FREE_STUDENT_LIMIT}
        onDone={(kept) => { setStudents((prev) => prev.filter((s) => kept.includes(s.uid))); setKeeperOpen(false); }}
      />

      {/* Rename a file to something you'll recognise, and file it under a
          folder of your own naming — typing a new name makes the folder. */}
      <SheetModal visible={!!fileEdit} onRequestClose={() => setFileEdit(null)} cardStyle={styles.fileSheet}>
        <View style={styles.fileSheetHead}>
          <Text style={styles.cardTitle}>File</Text>
          <TouchableOpacity onPress={() => setFileEdit(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
        {!!fileEdit && (
          <Text style={styles.fileSheetMeta}>{attachmentMeta(fileEdit)}</Text>
        )}
        <Text style={styles.fileSheetLabel}>NAME</Text>
        <TextInput
          style={styles.fileInput}
          value={fileName}
          onChangeText={setFileName}
          placeholder="Grade 3 scales"
          placeholderTextColor={COLORS.textMuted}
        />
        <Text style={styles.fileSheetLabel}>FOLDER</Text>
        <TextInput
          style={styles.fileInput}
          value={fileFolderText}
          onChangeText={setFileFolderText}
          placeholder="e.g. Scales, Grade 3, Backing tracks"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="sentences"
        />
        {[...new Set([...folders, ...files.map((f) => (f.folder || '').trim())].filter(Boolean))].length > 0 && (
          <View style={styles.folderPickRow}>
            {[...new Set([...folders, ...files.map((f) => (f.folder || '').trim())].filter(Boolean))].sort().map((f) => (
              <TouchableOpacity key={f} style={styles.folderChip} onPress={() => setFileFolderText(f)} activeOpacity={0.8}>
                <Text style={styles.folderChipText} numberOfLines={1}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={styles.fileSheetBtns}>
          <TouchableOpacity style={styles.fileDeleteBtn} onPress={deleteFile} activeOpacity={0.85}>
            <Ionicons name="trash-outline" size={16} color={COLORS.error} />
            <Text style={styles.fileDeleteText}>Remove</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.fileSaveBtn} onPress={saveFileEdit} activeOpacity={0.85}>
            <Text style={styles.fileSaveText}>Save</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.filesSub}>Removing it here leaves any task you've already attached it to untouched.</Text>
      </SheetModal>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg },
  kicker: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.xs },
  title: { color: COLORS.text, fontSize: 24, fontWeight: '800', marginBottom: SPACING.lg },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACING.sm },
  bellBtn: { paddingTop: 2, paddingHorizontal: 4 },
  bellDot: { position: 'absolute', top: -5, right: -3, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  bellDotText: { color: '#fff', fontSize: 10, fontWeight: '800' },
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

  card: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg,
  },
  cardTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800', marginBottom: SPACING.sm },
  calendarCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md },
  calendarCardIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: COLORS.primary + '18', alignItems: 'center', justifyContent: 'center' },
  calendarCardSub: { color: COLORS.textMuted, fontSize: 12, marginTop: -6 },
  emptyMini: { color: COLORS.textMuted, fontSize: 13 },
  prepCard: { borderColor: COLORS.primary + '55' },
  prepHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  prepEyebrow: { color: COLORS.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  prepSoon: { color: COLORS.primary, fontSize: 12, fontWeight: '800', backgroundColor: COLORS.primary + '1A', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  prepWho: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginTop: 4 },
  prepWhen: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  prepLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: SPACING.md, marginBottom: 3 },
  prepText: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  prepMuted: { color: COLORS.textMuted },
  prepBad: { color: COLORS.error },
  prepWork: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, paddingVertical: 4 },
  prepDot: { width: 7, height: 7, borderRadius: 4, marginTop: 7 },
  prepWorkText: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 14, lineHeight: 20 },
  prepTask: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 4 },
  prepTaskTitle: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 14 },
  prepTaskMeta: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700', flexShrink: 0 },
  prepProof: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, padding: SPACING.sm, borderRadius: 10, backgroundColor: COLORS.primary + '12' },
  prepProofText: { flex: 1, minWidth: 0, color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  prepProofMedia: { width: '100%', aspectRatio: 9 / 16, maxHeight: 460, borderRadius: 12, backgroundColor: '#000' },
  prepBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  prepBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 10 },
  prepBtnAlt: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.primary },
  prepBtnText: { color: COLORS.onPrimary, fontSize: 13, fontWeight: '800' },
  reqCard: { borderColor: '#F59E0B88' },
  reqRow: { paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  reqWho: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  reqAsk: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  reqNote: { color: COLORS.textSecondary, fontSize: 13, fontStyle: 'italic', marginTop: 4 },
  reqBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  reqBtn: { flex: 1, alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 8 },
  reqNo: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border },
  reqBtnText: { color: COLORS.onPrimary, fontSize: 13, fontWeight: '800' },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 7, borderTopWidth: 1, borderTopColor: COLORS.border },
  miniRank: { width: 22, textAlign: 'center', fontSize: 15 },
  miniName: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 14, fontWeight: '600' },
  miniScore: { color: COLORS.primary, fontSize: 13, fontWeight: '800' },
  miniMeta: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  // My files
  filesSub: { color: COLORS.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  filesMore: { color: COLORS.primary, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingTop: SPACING.sm },
  folderRow: { marginTop: SPACING.sm, marginHorizontal: -2 },
  folderChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, maxWidth: 160,
  },
  folderChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  folderChipText: { color: COLORS.textSecondary, fontSize: 12.5, fontWeight: '700' },
  folderPickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACING.sm },
  filesAddBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginTop: SPACING.md, paddingVertical: 11, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.primary + '44', backgroundColor: COLORS.primary + '12',
  },
  filesAddText: { color: COLORS.primary, fontSize: 13.5, fontWeight: '700' },
  fileSheet: { padding: SPACING.lg, borderRadius: 20 },
  fileSheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  fileSheetMeta: { color: COLORS.textMuted, fontSize: 12.5, marginBottom: SPACING.md },
  fileSheetLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: SPACING.sm, marginBottom: 6 },
  fileInput: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11, color: COLORS.text, fontSize: 14.5,
  },
  fileSheetBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  fileDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.error + '55',
  },
  fileDeleteText: { color: COLORS.error, fontSize: 14, fontWeight: '700' },
  fileSaveBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.primary,
  },
  fileSaveText: { color: COLORS.onPrimary, fontSize: 14.5, fontWeight: '800' },

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
  actionsCol: { marginBottom: SPACING.lg, gap: SPACING.sm },
  actionsRow: { flexDirection: 'row', gap: SPACING.sm },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14,
  },
  actionBtnAlt: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  actionBtnWide: { flex: 0 },
  actionText: { color: COLORS.onPrimary, fontSize: 14, fontWeight: '700' },
  tipCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  tipKicker: { color: COLORS.accent || COLORS.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  tipText: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21 },
  askCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, marginBottom: SPACING.lg,
  },
  askIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary + '18',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  askTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  askSub: { color: COLORS.textSecondary, fontSize: 12.5, marginTop: 1 },
}));
