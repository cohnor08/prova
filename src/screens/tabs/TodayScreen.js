import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Modal, Animated, Alert, Linking, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../lib/firebase';
import { scheduleStreakSaver, cancelStreakSaver, notifyNewTasks } from '../../lib/notifications';
import { COLORS, SPACING } from '../../constants/theme';
import { adjustSessionFromRating } from '../../lib/claude';
import { getDailySong } from '../../constants/songs';
import { getDailyChallenge, CHALLENGE_POINTS } from '../../constants/challenges';
import { taskPoints, completionBonus, displayScore, formatScore, scoreRank, restoreState, spendRestore, teacherTaskPoints } from '../../lib/score';
import { displayName } from '../../lib/displayName';
import { pickMedia, captureMedia, uploadProofMedia } from '../../lib/media';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const CATEGORY_COLORS = {
  warmup: '#06B6D4',
  technique: '#3B82F6',
  theory: '#8B5CF6',
  ear_training: '#10B981',
  repertoire: '#0EA5E9',
  improvisation: '#6366F1',
};

const RATING_OPTIONS = [
  { key: 'too_easy',   label: 'Too Easy',    sub: 'Step it up next time',    icon: 'trending-up' },
  { key: 'just_right', label: 'Just Right',  sub: 'Perfect challenge level', icon: 'checkmark-circle' },
  { key: 'too_hard',   label: 'Too Hard',    sub: 'Dial it back a bit',      icon: 'trending-down' },
];

const TODAY_NAME = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

// Due label for an assigned (teacher) task (ISO datetime) — null when no due date.
function assignedDueLabel(due) {
  if (!due) return null;
  const d = new Date(due);
  if (isNaN(d)) return null;
  if (d < new Date()) return { text: 'Overdue', overdue: true };
  const d0 = new Date(d); d0.setHours(0, 0, 0, 0);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const days = Math.round((d0 - t0) / 86400000);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return { text: `Due ${time}`, overdue: false };
  if (days === 1) return { text: `Tomorrow ${time}`, overdue: false };
  return { text: `Due ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`, overdue: false };
}

const pad2 = (n) => String(n).padStart(2, '0');
const ymdLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// The next date a lesson lands on, today or later (handles weekly recurrence).
// Returns a Date (midnight) or null if it has no upcoming occurrence.
function nextLessonOccurrence(lesson, from) {
  const startYmd = lesson.date;
  if (!startYmd) return null;
  if (lesson.repeat === 'weekly') {
    const startDow = new Date(`${startYmd}T00:00:00`).getDay();
    for (let i = 0; i < 7; i++) {
      const d = new Date(from); d.setHours(0, 0, 0, 0); d.setDate(from.getDate() + i);
      if (ymdLocal(d) >= startYmd && d.getDay() === startDow) return d;
    }
    return null;
  }
  return ymdLocal(from) <= startYmd ? new Date(`${startYmd}T00:00:00`) : null;
}

// "4:00 PM" from "16:00"
function fmtLessonTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${(h % 12) || 12}:${pad2(m || 0)} ${h >= 12 ? 'PM' : 'AM'}`;
}

// "Today" / "Tomorrow" / "Mon, Jun 30"
function lessonDayLabel(d) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function pastDayLabel(ymdStr) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - date) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Attendance the teacher set (read-only for the student). The numeric mark is
// intentionally NOT shown to the student — only status + note.
const ATT_META = {
  present: { color: '#22C55E', label: 'Present' },
  late: { color: '#E0A800', label: 'Late' },
  absent: { color: '#EF4444', label: 'Absent' },
  excused: { color: '#94A3B8', label: 'Excused' },
};

// Small "Notes" pill in the FROM YOUR TEACHER header that opens the read-only
// lesson-notes window.
function NotesChip({ onPress }) {
  return (
    <TouchableOpacity style={styles.notesChip} onPress={onPress} activeOpacity={0.8} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      <Ionicons name="document-text-outline" size={13} color={COLORS.primary} />
      <Text style={styles.notesChipText}>Notes</Text>
    </TouchableOpacity>
  );
}

// One teacher-assigned task on the student's Today screen. The timer counts the
// time actually practised; tapping "Done" banks points for THIS lap (partial
// credit — 3 of 20 min still pays), then "Practice again" lets them run another
// lap for more. Points are time-proportional, so the only way to score is to
// put in the real minutes.
function TeacherTaskCard({ task, expanded, onToggle, onBank, openTaskLink, onOpenSong, onAttachProof, onViewProof, proofBusy }) {
  const target = (task.durationMin || 0) * 60; // 0 = no set target, just a stopwatch
  const [elapsed, setElapsed] = useState(0);   // seconds practised THIS lap
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  // Pause at the target as a natural stopping point — they can bank or keep going.
  useEffect(() => {
    if (target > 0 && elapsed >= target && running) setRunning(false);
  }, [elapsed, target, running]);

  const fmt = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  const due = assignedDueLabel(task.dueDate);
  const lapPts = teacherTaskPoints(elapsed);
  const reachedTarget = target > 0 && elapsed >= target;
  const earnedSoFar = task.pointsEarned || 0;
  const laps = task.timesCompleted || 0;

  const bank = () => {
    if (elapsed <= 0) return;
    onBank(task.id, elapsed);
    setRunning(false);
    setElapsed(0);
  };

  return (
    <View style={styles.teacherTask}>
      <View style={styles.teacherTaskRow}>
        <TouchableOpacity style={styles.teacherTaskMain} onPress={onToggle} activeOpacity={0.7}>
          <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} color={COLORS.textMuted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.teacherTaskTitle, task.completed && styles.teacherTaskDone]} numberOfLines={expanded ? undefined : 2}>{task.title}</Text>
            {!task.completed && due && (
              <Text style={[styles.teacherDue, due.overdue && styles.teacherDueOverdue]}>{due.text}</Text>
            )}
            {earnedSoFar > 0 && (
              <Text style={styles.teacherEarned}>
                {formatScore(earnedSoFar)} pts earned{laps > 1 ? ` (${laps} laps)` : ''}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        {task.completed && <Ionicons name="checkmark-circle" size={22} color={COLORS.success} style={{ marginLeft: 6 }} />}
      </View>

      {expanded && (
      <View style={styles.ttTimer}>
        {target > 0 && (
          <View style={styles.ttTimerBarBg}>
            <View style={[styles.ttTimerBarFill, { width: `${Math.min(1, elapsed / target) * 100}%` }]} />
          </View>
        )}
        <View style={styles.ttTimerInfo}>
          <Text style={styles.ttTimerText}>{fmt(elapsed)}{target > 0 ? ` / ${fmt(target)}` : ''}</Text>
          {elapsed > 0 && <Text style={styles.ttLapPts}>+{lapPts} pts</Text>}
        </View>
        <View style={styles.ttBtnRow}>
          <TouchableOpacity style={styles.ttTimerBtn} onPress={() => setRunning((r) => !r)} activeOpacity={0.8}>
            <Ionicons name={running ? 'pause' : 'play'} size={13} color={COLORS.text} />
            <Text style={styles.ttTimerBtnText} numberOfLines={1}>
              {running ? 'Pause' : elapsed > 0 ? 'Resume' : task.completed ? `Lap ×${laps + 1}` : 'Start'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ttBankBtn, elapsed <= 0 && styles.ttBankBtnDim]}
            onPress={bank}
            activeOpacity={elapsed > 0 ? 0.85 : 1}
          >
            <Text style={[styles.ttBankBtnText, elapsed <= 0 && styles.ttBankBtnTextDim]} numberOfLines={1}>
              {reachedTarget ? 'Done' : 'Bank'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      )}

      {expanded && !!task.description && <Text style={styles.teacherTaskDesc}>{task.description}</Text>}
      {expanded && !!task.youtube && (
        <TouchableOpacity style={styles.teacherTaskLink} onPress={() => openTaskLink(task.youtube)} activeOpacity={0.7}>
          <Ionicons name="logo-youtube" size={15} color="#FF0000" />
          <Text style={styles.teacherTaskLinkText} numberOfLines={1}>Watch: {task.youtube}</Text>
        </TouchableOpacity>
      )}
      {expanded && !!task.song && (
        <TouchableOpacity style={styles.teacherTaskLink} onPress={() => onOpenSong(task.song)} activeOpacity={0.7}>
          <Ionicons name="musical-notes" size={15} color={COLORS.accent} />
          <Text style={styles.teacherTaskLinkText} numberOfLines={1}>Song: {task.song}</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
        </TouchableOpacity>
      )}

      {expanded && (
        task.proofUrl ? (
          <View style={styles.proofRow}>
            <Ionicons name={task.proofVerified ? 'checkmark-circle' : 'videocam'} size={15} color={task.proofVerified ? COLORS.success : COLORS.primary} />
            <Text style={styles.proofRowText} numberOfLines={1}>
              {task.proofVerified ? 'Proof verified by your teacher' : 'Proof submitted'}
            </Text>
            <TouchableOpacity onPress={() => onViewProof(task)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Text style={styles.proofViewLink}>View</Text>
            </TouchableOpacity>
            {!task.proofVerified && (
              <TouchableOpacity onPress={() => onAttachProof(task.id)} disabled={proofBusy} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={styles.proofReplaceLink}>{proofBusy ? '…' : 'Replace'}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity style={styles.proofAddBtn} onPress={() => onAttachProof(task.id)} disabled={proofBusy} activeOpacity={0.8}>
            {proofBusy
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <Ionicons name="videocam-outline" size={15} color={COLORS.primary} />}
            <Text style={styles.proofAddText}>{proofBusy ? 'Uploading…' : 'Add proof of practice'}</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}

// Live scoreboard for one class: ranks classmates by the points they've banked
// on this class's assignments, so practising the teacher's tasks becomes a race.
// Reads the teacher doc → class members → each member's assignedTasks (the same
// reads the class leaderboard already does, so Firestore rules allow it).
function ClassScoreboard({ classId, teacherUid, myUid }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState(null);

  const load = async () => {
    if (!teacherUid || !classId) return;
    setLoading(true);
    try {
      const tSnap = await getDoc(doc(db, 'users', teacherUid));
      const classes = Array.isArray(tSnap.data()?.classes) ? tSnap.data().classes : [];
      const klass = classes.find((c) => c.id === classId);
      const uids = (klass?.studentUids || []);
      const memberSnaps = await Promise.all(uids.map((uid) => getDoc(doc(db, 'users', uid))));
      const board = memberSnaps
        .filter((s) => s.exists())
        .map((s) => {
          const d = s.data();
          const points = (d.assignedTasks || [])
            .filter((t) => t.classId === classId)
            .reduce((sum, t) => sum + (t.pointsEarned || 0), 0);
          return { uid: s.id, name: displayName(d), points };
        })
        .sort((a, b) => b.points - a.points);
      setRows(board);
    } catch (e) {
      setRows([]);
    }
    setLoading(false);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loading) load(); // refetch on open so freshly-banked points show
  };

  return (
    <View style={styles.scoreboard}>
      <TouchableOpacity style={styles.scoreboardHeader} onPress={toggle} activeOpacity={0.7}>
        <Ionicons name="trophy" size={15} color={COLORS.accent || COLORS.primary} />
        <Text style={styles.scoreboardTitle}>Class scoreboard</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
      </TouchableOpacity>
      {open && (
        loading || rows === null ? (
          <Text style={styles.scoreboardEmpty}>Loading…</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.scoreboardEmpty}>No classmates yet.</Text>
        ) : (
          rows.map((r, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
            const isMe = r.uid === myUid;
            return (
              <View key={r.uid} style={[styles.scoreboardRow, isMe && styles.scoreboardRowMe]}>
                <Text style={styles.scoreboardRank}>{medal || `${i + 1}`}</Text>
                <Text style={[styles.scoreboardName, isMe && styles.scoreboardNameMe]} numberOfLines={1}>
                  {isMe ? 'You' : r.name}
                </Text>
                <Text style={styles.scoreboardPts}>{formatScore(r.points)}</Text>
              </View>
            );
          })
        )
      )}
    </View>
  );
}

function SkeletonBlock({ width, height, style }) {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={[{ width, height, borderRadius: 8, backgroundColor: COLORS.card, opacity: anim }, style]} />;
}

// Opens a YouTube search for the exercise. We build a search URL (never a
// hard-coded video link) so it always resolves to real, current results.
function ReferenceLink({ reference }) {
  if (!reference) return null;
  const open = () => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(reference)}`;
    Linking.openURL(url).catch(() => {});
  };
  return (
    <TouchableOpacity style={styles.refRow} onPress={open} activeOpacity={0.7}>
      <Ionicons name="logo-youtube" size={15} color="#FF0000" />
      <Text style={styles.refText} numberOfLines={1}>Watch: {reference}</Text>
    </TouchableOpacity>
  );
}

function SessionCard({ session, onComplete, completed, onStart }) {
  const [timerActive, setTimerActive] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(session.duration * 60);
  const [expanded, setExpanded] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (timerActive && secondsLeft > 0) {
      intervalRef.current = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    } else if (secondsLeft === 0) {
      clearInterval(intervalRef.current);
      setTimerActive(false);
    }
    return () => clearInterval(intervalRef.current);
  }, [timerActive, secondsLeft]);

  const fmt = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  const categoryColor = CATEGORY_COLORS[session.category] || COLORS.primary;
  const timerDone = secondsLeft === 0;

  return (
    <View style={[styles.card, completed && styles.cardCompleted]}>
      <View style={[styles.categoryBar, { backgroundColor: categoryColor }]} />
      <View style={styles.cardContent}>
        <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.7}>
          <View style={styles.cardHeader}>
            <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '22' }]}>
              <Text style={[styles.categoryText, { color: categoryColor }]}>
                {session.category.replace('_', ' ').toUpperCase()}
              </Text>
            </View>
            <Text style={styles.duration}>{session.duration} min</Text>
          </View>
          <View style={styles.sessionTitleRow}>
            <Text style={[styles.sessionTitle, completed && styles.sessionTitleCompleted, { flex: 1, marginBottom: 0 }]} numberOfLines={expanded ? undefined : 1}>{session.title}</Text>
            {completed && <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />}
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
          </View>
        </TouchableOpacity>
        {expanded && (<>
        <Text style={styles.sessionDesc}>{session.description}</Text>
        <ReferenceLink reference={session.reference} />
        <View style={styles.sessionPtsRow}>
          <Ionicons name="sparkles" size={13} color={COLORS.accent} />
          <Text style={styles.sessionPts}>Worth +{Math.round(taskPoints(session) / 5) * 5} Prova points</Text>
        </View>
        {!completed && (
          <View>
            {timerActive && (
              <View style={styles.timerProgress}>
                <View style={[styles.timerProgressFill, {
                  width: `${(1 - secondsLeft / (session.duration * 60)) * 100}%`,
                  backgroundColor: categoryColor,
                }]} />
              </View>
            )}
            <View style={styles.timerRow}>
              <Text style={styles.timerText}>{fmt(secondsLeft)}</Text>
              <TouchableOpacity
                style={[styles.timerBtn, timerActive && { backgroundColor: categoryColor }]}
                onPress={() => {
                  if (timerDone) return;
                  if (!timerActive && onStart) { onStart(session); } else { setTimerActive(!timerActive); }
                }}
                activeOpacity={timerDone ? 1 : 0.8}
              >
                <Ionicons name={timerActive ? 'pause' : 'play'} size={14} color={COLORS.text} />
                <Text style={styles.timerBtnText}>{timerActive ? 'Pause' : 'Start'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.completeBtn, !timerDone && styles.completeBtnLocked]}
                onPress={() => timerDone && onComplete(session.id)}
                activeOpacity={timerDone ? 0.8 : 1}
              >
                <Ionicons name={timerDone ? 'checkmark' : 'lock-closed'} size={14}
                  color={timerDone ? COLORS.success : COLORS.textMuted} />
                <Text style={[styles.completeBtnText, !timerDone && styles.completeBtnTextLocked]}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {completed && (
          <View style={styles.completedRow}>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
            <Text style={styles.completedBadge}>Completed</Text>
          </View>
        )}
        </>)}
      </View>
    </View>
  );
}

function PlanCard({ session }) {
  const color = CATEGORY_COLORS[session.category] || COLORS.primary;
  return (
    <View style={styles.planCard}>
      <View style={styles.planLeft}>
        <View style={[styles.planDot, { backgroundColor: color }]} />
        <View style={styles.planConnector} />
      </View>
      <View style={styles.planRight}>
        <Text style={styles.sessionTitle}>{session.title}</Text>
        <Text style={styles.sessionDesc}>{session.description}</Text>
        <ReferenceLink reference={session.reference} />
        <View style={styles.sessionMeta}>
          <Text style={styles.sessionDuration}>{session.duration} min</Text>
          <Text style={[styles.sessionCategory, { color }]}>{session.category.replace('_', ' ')}</Text>
          <Text style={styles.sessionPts}>+{Math.round(taskPoints(session) / 5) * 5} pts</Text>
        </View>
      </View>
    </View>
  );
}

export default function TodayScreen({ navigation }) {
  const [plan, setPlan] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [completedIds, setCompletedIds] = useState([]);
  const [lessons, setLessons] = useState([]); // this student's lessons, read from their teacher's doc
  const [attendance, setAttendance] = useState({}); // teacher-set attendance map `${lessonId}__${ymd}` -> { status, note }
  const [loading, setLoading] = useState(true);
  const [showRating, setShowRating] = useState(false);
  const [userData, setUserData] = useState(null);
  const [selectedDay, setSelectedDay] = useState(TODAY_NAME);
  const [expandedTask, setExpandedTask] = useState(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [proofBusyId, setProofBusyId] = useState(null); // task id currently uploading a proof clip
  const [proofView, setProofView] = useState(null);     // { url, type } currently being watched
  const [soloOpen, setSoloOpen] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set()); // class section keys collapsed
  const toggleGroup = (key) => setCollapsedGroups((prev) => {
    const n = new Set(prev);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const restorePromptedRef = useRef(false); // pop the restore modal once per app open

  useEffect(() => { loadData(); }, []);

  // On refocus (e.g. returning from the Practice tab) pull the latest completed
  // sessions + score so a session finished over there shows as done here too.
  useEffect(() => {
    const unsub = navigation.addListener('focus', async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        const d = snap.data() || {};
        const todayKey = new Date().toDateString();
        setCompletedIds(d.sessionProgress?.date === todayKey ? (d.sessionProgress.ids || []) : []);
        if (typeof d.provaScore === 'number') setUserData((p) => (p ? { ...p, provaScore: d.provaScore } : p));
      } catch { /* ignore */ }
    });
    return unsub;
  }, [navigation]);

  // When the app opens and the user missed exactly one day (with a streak worth
  // saving + a restore available), pop the "you lost your streak" modal once.
  useEffect(() => {
    if (!userData || restorePromptedRef.current) return;
    const streakVal = userData.streak || 0;
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const lastDay = userData.lastSessionDate ? new Date(userData.lastSessionDate) : null;
    if (lastDay) lastDay.setHours(0, 0, 0, 0);
    const daysSinceLast = lastDay ? Math.round((startOfToday - lastDay) / 86400000) : null;
    const { total } = restoreState(userData);
    if (selectedDay === TODAY_NAME && daysSinceLast === 2 && streakVal >= 2 && total > 0) {
      restorePromptedRef.current = true;
      setShowRestoreModal(true);
    }
  }, [userData, selectedDay]);

  // Streak-saver notification: if reminders are on and they have a streak worth
  // saving but haven't practised today, schedule tonight's nudge. Cancel it once
  // they've practised.
  useEffect(() => {
    if (!userData) return;
    const streakVal = userData.streak || 0;
    const todayStr = new Date().toDateString();
    const lastStr = userData.lastSessionDate ? new Date(userData.lastSessionDate).toDateString() : null;
    const practicedToday = lastStr === todayStr || completedIds.length > 0;
    if (userData.reminderEnabled && streakVal >= 2 && !practicedToday) {
      scheduleStreakSaver(streakVal);
    } else {
      cancelStreakSaver();
    }
  }, [userData, completedIds]);

  // New-task ping: when this device first sees a teacher task it hasn't seen
  // before, fire a local notification. Seeds silently on first run so existing
  // tasks don't all ping at once.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    const tasks = userData?.assignedTasks;
    if (!uid || !Array.isArray(tasks)) return;
    const key = `prova_seen_tasks_${uid}`;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        const ids = tasks.map((t) => t.id);
        if (raw === null) {
          await AsyncStorage.setItem(key, JSON.stringify(ids));
          return; // first run — seed without notifying
        }
        const seen = new Set(JSON.parse(raw));
        const fresh = tasks.filter((t) => !t.completed && !seen.has(t.id));
        if (fresh.length > 0) await notifyNewTasks(fresh.length);
        await AsyncStorage.setItem(key, JSON.stringify(ids));
      } catch (e) { /* ignore */ }
    })();
  }, [userData?.assignedTasks]);

  // Persist restore bookkeeping (monthly reset, baseline init, earned grants).
  // Converges: applying the updates changes the keys below, re-runs, then no-ops.
  useEffect(() => {
    if (!userData) return;
    const { updates } = restoreState(userData);
    if (Object.keys(updates).length === 0) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    updateDoc(doc(db, 'users', uid), updates).catch(() => {});
    setUserData((p) => ({ ...p, ...updates }));
  }, [userData?.provaScore, userData?.restoreMonth, userData?.restoreBaseline]);

  useEffect(() => {
    if (showRating) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
    } else {
      slideAnim.setValue(300);
    }
  }, [showRating]);

  const loadData = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'users', uid));
      const data = snap.data();

      const todayStr = new Date().toDateString();
      const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
      const lastStr = data?.lastSessionDate ? new Date(data.lastSessionDate).toDateString() : null;
      if (lastStr && lastStr !== todayStr && lastStr !== yesterdayStr && (data?.streak || 0) > 0) {
        await updateDoc(doc(db, 'users', uid), { streak: 0 });
        data.streak = 0;
      }

      // Auto-sync today's level-matched song into the user's library so it's
      // available (and playable) in the Practice tab's song list.
      const daily = getDailySong(data?.instrument, data?.level);
      if (daily) {
        const lib = Array.isArray(data?.songLibrary) ? data.songLibrary : [];
        const exists = lib.some(
          (s) => (s.title || '').toLowerCase() === daily.title.toLowerCase()
            && (s.artist || '').toLowerCase() === (daily.artist || '').toLowerCase()
        );
        if (!exists) {
          const nextLib = [
            { id: `song_${Date.now()}`, title: daily.title, artist: daily.artist || '', addedAt: new Date().toISOString(), fromDaily: true },
            ...lib,
          ];
          data.songLibrary = nextLib;
          updateDoc(doc(db, 'users', uid), { songLibrary: nextLib }).catch(console.error);
        }
      }

      setUserData(data);
      const weeklyPlan = data?.practicePlan?.weeklyPlan || {};
      setPlan(weeklyPlan);
      setSessions(weeklyPlan[TODAY_NAME]?.sessions || []);

      // Sessions completed today (here OR in the Practice tab) live in the shared
      // `sessionProgress` store, so the checkmarks persist and points aren't
      // double-banked across the two screens.
      const todayKey = new Date().toDateString();
      setCompletedIds(data?.sessionProgress?.date === todayKey ? (data.sessionProgress.ids || []) : []);

      // Pull this student's lessons from their linked teacher's doc, so we can
      // surface the next upcoming lesson on Today.
      if (data?.teacherUid) {
        try {
          const tSnap = await getDoc(doc(db, 'users', data.teacherUid));
          const tData = tSnap.data() || {};
          const all = Array.isArray(tData.lessons) ? tData.lessons : [];
          setLessons(all.filter((l) => l.studentUid === uid));
          setAttendance(tData.attendance || {});
        } catch { setLessons([]); setAttendance({}); }
      } else {
        setLessons([]);
        setAttendance({});
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Plan regeneration now lives only on the Profile tab.

  const handleComplete = async (sessionId) => {
    if (completedIds.includes(sessionId)) return;
    const optimistic = [...completedIds, sessionId]; // instant checkmark
    setCompletedIds(optimistic);
    const maybeRate = (ids) => { if (sessions.every(s => ids.includes(s.id))) setShowRating(true); };

    const session = sessions.find(s => s.id === sessionId);
    const uid = auth.currentUser?.uid;
    if (!session || !uid) { maybeRate(optimistic); return; }

    const todayKey = new Date().toDateString();
    try {
      // Merge with the shared store so a session finished in the Practice tab
      // isn't lost or re-awarded.
      const snap = await getDoc(doc(db, 'users', uid));
      const d = snap.data() || {};
      const prior = d.sessionProgress?.date === todayKey ? (d.sessionProgress.ids || []) : [];
      if (prior.includes(sessionId)) {
        // Already completed elsewhere — sync checkmarks, don't re-award.
        const merged = Array.from(new Set([...optimistic, ...prior]));
        setCompletedIds(merged);
        maybeRate(merged);
        return;
      }
      const pts = taskPoints(session);
      const newScore = displayScore(d) + pts;
      const ids = Array.from(new Set([...prior, ...optimistic]));
      await updateDoc(doc(db, 'users', uid), {
        provaScore: newScore,
        sessionProgress: { date: todayKey, ids },
      });
      setUserData(p => ({ ...p, provaScore: newScore }));
      setCompletedIds(ids);
      Alert.alert('Task done', `+${formatScore(pts)} Prova points 🎸`);
      maybeRate(ids);
    } catch (e) {
      maybeRate(optimistic); // keep the optimistic checkmark on failure
    }
  };

  const handleRating = async (rating) => {
    setShowRating(false);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const todayStr = new Date().toDateString();
      const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
      const lastStr = userData?.lastSessionDate ? new Date(userData.lastSessionDate).toDateString() : null;
      const newStreak = lastStr === todayStr
        ? (userData?.streak || 1)
        : lastStr === yesterdayStr ? (userData?.streak || 0) + 1 : 1;
      const sessionMins = sessions.reduce((s, x) => s + x.duration, 0);
      const categories = {};
      sessions.forEach(s => { categories[s.category] = (categories[s.category] || 0) + s.duration; });
      const dateKey = new Date().toISOString().split('T')[0];
      // Per-task points are already banked on completion; here we add the
      // end-of-day bonus (finish reward + streak + quality rating).
      const earnedPoints = completionBonus(newStreak, rating);
      const prevScore = displayScore(userData);
      const newScore = prevScore + earnedPoints;
      const rankedUp = scoreRank(newScore).index > scoreRank(prevScore).index;
      await Promise.all([
        updateDoc(doc(db, 'users', uid), {
          lastSessionRating: rating,
          lastSessionDate: new Date().toISOString(),
          totalMinutes: increment(sessionMins),
          totalSessions: increment(1),
          streak: newStreak,
          provaScore: newScore,
        }),
        setDoc(doc(db, 'sessionHistory', uid, 'logs', dateKey), {
          date: dateKey,
          totalMinutes: increment(sessionMins),
          sessionCount: increment(1),
          categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, increment(v)])),
          rating,
        }, { merge: true }),
      ]);
      const newRank = scoreRank(newScore);
      Alert.alert(
        rankedUp ? `${newRank.emoji} New rank: ${newRank.name}!` : `+${formatScore(earnedPoints)} finish bonus! 🎸`,
        rankedUp
          ? `Session complete — you leveled up to ${newRank.name} (${formatScore(newScore)} pts)!`
          : `Session complete — your Prova Score is now ${formatScore(newScore)}.${newStreak > 1 ? `\n🔥 ${newStreak}-day streak — keep it alive!` : ''}`,
      );
      adjustSessionFromRating(sessions, rating, null)
        .then(adjusted => updateDoc(doc(db, 'users', uid), {
          [`practicePlan.weeklyPlan.${TODAY_NAME}.sessions`]: adjusted,
        }))
        .catch(console.error);
    } catch (e) {
      console.error(e);
    }
  };

  // Daily challenge — banks bonus points and counts as activity for the day, so
  // it keeps the streak alive even without a full session (the "streak-saver").
  const handleCompleteChallenge = async () => {
    if (challengeDoneToday) return;
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const now = new Date();
      const todayStr = now.toDateString();
      const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
      const lastStr = userData?.lastSessionDate ? new Date(userData.lastSessionDate).toDateString() : null;
      const newStreak = lastStr === todayStr
        ? (userData?.streak || 1)
        : lastStr === yesterdayStr ? (userData?.streak || 0) + 1 : 1;
      const prevScore = displayScore(userData);
      const newScore = prevScore + CHALLENGE_POINTS;
      const rankedUp = scoreRank(newScore).index > scoreRank(prevScore).index;

      const updates = {
        provaScore: newScore,
        lastChallengeDate: now.toISOString(),
        lastSessionDate: now.toISOString(), // counts as activity → preserves streak
        streak: newStreak,
      };
      await updateDoc(doc(db, 'users', uid), updates);
      setUserData((p) => ({ ...p, ...updates }));

      const newRank = scoreRank(newScore);
      Alert.alert(
        rankedUp ? `${newRank.emoji} New rank: ${newRank.name}!` : 'Challenge complete! 🔥',
        `+${formatScore(CHALLENGE_POINTS)} Prova points${newStreak > 1 ? ` · 🔥 ${newStreak}-day streak kept!` : ''}.`,
      );
    } catch (e) {
      console.error(e);
      Alert.alert('Error', "Couldn't save your challenge. Please try again.");
    }
  };

  // Bank a lap of practice on a teacher-assigned task: award time-proportional
  // points for the minutes just practised, accumulate the task's totals, and
  // write back so the teacher + class scoreboard see the progress.
  const bankTeacherTask = async (taskId, lapSeconds) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const pts = teacherTaskPoints(lapSeconds);
    const next = (userData?.assignedTasks || []).map((t) =>
      t.id === taskId
        ? {
            ...t,
            completed: true,
            completedAt: new Date().toISOString(),
            practicedSec: (t.practicedSec || 0) + Math.round(lapSeconds),
            pointsEarned: (t.pointsEarned || 0) + pts,
            timesCompleted: (t.timesCompleted || 0) + 1,
          }
        : t
    );
    const newScore = displayScore(userData) + pts;
    setUserData((p) => ({ ...p, assignedTasks: next, provaScore: newScore }));
    try {
      await updateDoc(doc(db, 'users', uid), { assignedTasks: next, provaScore: newScore });
    } catch (e) {
      Alert.alert('Error', "Couldn't save. Please try again.");
    }
    if (pts > 0) Alert.alert('Nice work', `+${formatScore(pts)} Prova points 🎸\nPractice it again to earn more.`);
  };

  // Record/pick a short clip as proof a teacher task was practised, upload it,
  // and store the URL on that task. Clears any prior teacher verification when
  // re-submitting so the teacher re-checks the new clip.
  const runProofUpload = async (taskId, getMedia) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setProofBusyId(taskId);
    try {
      const picked = await getMedia();
      if (!picked) { setProofBusyId(null); return; }
      if (picked.error) { Alert.alert('Proof', picked.error); setProofBusyId(null); return; }
      const url = await uploadProofMedia(picked.uri, uid, picked.type);
      const next = (userData?.assignedTasks || []).map((t) =>
        t.id === taskId
          ? { ...t, proofUrl: url, proofType: picked.type, proofAt: new Date().toISOString(), proofVerified: false }
          : t
      );
      setUserData((p) => ({ ...p, assignedTasks: next }));
      await updateDoc(doc(db, 'users', uid), { assignedTasks: next });
      Alert.alert('Proof submitted 🎥', 'Your teacher can now review it.');
    } catch (e) {
      Alert.alert('Upload failed', "Couldn't upload your clip. Please try again.");
    } finally {
      setProofBusyId(null);
    }
  };

  const attachProof = (taskId) => {
    Alert.alert('Add proof of practice', 'Show your teacher you practised this.', [
      { text: 'Record now', onPress: () => runProofUpload(taskId, captureMedia) },
      { text: 'Choose from library', onPress: () => runProofUpload(taskId, pickMedia) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const viewProof = (task) => {
    if (task.proofUrl) setProofView({ url: task.proofUrl, type: task.proofType || 'video' });
  };

  // Free student accounts don't get the AI personalised plan — it's part of a
  // paid Personal account. Confirm, then send them to the upgrade screen.
  const promptUpgrade = () => {
    Alert.alert(
      'Upgrade to Personal',
      'Get your own AI practice plan that adapts to you — alongside your teacher’s tasks.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'See plans', onPress: () => navigation.navigate('Paywall') },
      ]
    );
  };

  // Open an attachment a teacher added to a task: a raw URL opens directly,
  // anything else becomes a YouTube search (handles links and song names).
  const openTaskLink = (value) => {
    const s = (value || '').trim();
    if (!s) return;
    const url = /^https?:\/\//i.test(s)
      ? s
      : `https://www.youtube.com/results?search_query=${encodeURIComponent(s)}`;
    Linking.openURL(url).catch(() => {});
  };

  // Open a teacher-assigned song in the Songs library, pinned to the top there.
  const openSongInLibrary = (songStr) => {
    const s = (songStr || '').trim();
    if (!s) return;
    const m = s.match(/^(.*?)\s+(?:-|–|—|by)\s+(.*)$/i);
    const focusSong = m ? { title: m[1].trim(), artist: m[2].trim() } : { title: s, artist: '' };
    navigation.navigate('Practice', { screen: 'Songs', params: { focusSong }, initial: false });
  };

  // Spend a restore to save a streak after one missed day. Backfills yesterday's
  // activity marker so practising today continues the chain instead of resetting.
  const handleRestoreStreak = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const updates = spendRestore(userData || {});
    if (!updates) {
      setShowRestoreModal(false);
      Alert.alert('No restores left', 'You\'re out of streak restores this month. Earn another by reaching the next 1,000 Prova points.');
      return;
    }
    setShowRestoreModal(false);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    updates.lastSessionDate = yesterday.toISOString();
    setUserData((p) => ({ ...p, ...updates }));
    try {
      await updateDoc(doc(db, 'users', uid), updates);
      Alert.alert('🔥 Streak restored!', `Your ${userData?.streak || 0}-day streak is safe. Practise today to keep it going.`);
    } catch (e) {
      Alert.alert('Error', "Couldn't restore your streak. Please try again.");
    }
  };

  const isToday = selectedDay === TODAY_NAME;
  const assignedTasks = userData?.assignedTasks || [];
  // Separate one-to-one teacher tasks from class-assigned ones (which carry a
  // classId/className), so the student can tell them apart.
  const soloTasks = assignedTasks.filter((t) => !t.classId);
  const classGroups = [];
  assignedTasks.filter((t) => t.classId).forEach((t) => {
    const key = t.className || 'Class';
    let g = classGroups.find((x) => x.key === key);
    if (!g) { g = { key, name: key, tasks: [] }; classGroups.push(g); }
    g.tasks.push(t);
  });

  const selectedSessions = isToday ? sessions : (plan?.[selectedDay]?.sessions || []);
  // A student account is free and has no AI plan unless they opt in. Distinguish
  // "no plan at all" from a genuine rest day inside an existing plan.
  const hasPlan = !!plan && Object.keys(plan).length > 0;
  const totalMins = sessions.reduce((s, x) => s + x.duration, 0);
  const progress = sessions.length > 0 ? completedIds.length / sessions.length : 0;
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const songOfTheDay = getDailySong(userData?.instrument, userData?.level);

  // The soonest upcoming lesson from the student's teacher, surfaced on Today.
  const nowDate = new Date();
  const nextLesson = lessons
    .map((l) => ({ lesson: l, when: nextLessonOccurrence(l, nowDate) }))
    .filter((x) => x.when)
    .sort((a, b) => a.when - b.when)[0] || null;
  const lessonIsToday = nextLesson && lessonDayLabel(nextLesson.when) === 'Today';

  // Most recent lesson the teacher has marked attendance for (status + note only,
  // never the numeric mark). Keys are `${lessonId}__${YYYY-MM-DD}`.
  const myUid = auth.currentUser?.uid;
  const todayYmd = ymdLocal(nowDate);
  const lastAttended = Object.entries(attendance)
    .map(([key, rec]) => ({ date: key.split('__')[1], rec }))
    .filter((x) => x.rec && x.rec.status && x.rec.studentUid === myUid && x.date && x.date <= todayYmd && ATT_META[x.rec.status])
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  // Whether there's any lesson feedback to open in the notes window.

  const dailyChallenge = getDailyChallenge(userData?.instrument, userData?.level);
  const challengeDoneToday = !!userData?.lastChallengeDate
    && new Date(userData.lastChallengeDate).toDateString() === new Date().toDateString();

  // Restore balance for the modal (detection of "missed a day" is in the effect).
  const restore = restoreState(userData || {});
  const streakVal = userData?.streak || 0;

  if (loading) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <SkeletonBlock width={160} height={12} style={{ marginBottom: SPACING.sm }} />
          <SkeletonBlock width={220} height={28} style={{ marginBottom: SPACING.lg }} />
          <SkeletonBlock width="100%" height={40} style={{ marginBottom: SPACING.lg }} />
          <SkeletonBlock width="100%" height={120} style={{ marginBottom: SPACING.md }} />
          <SkeletonBlock width="100%" height={120} />
        </ScrollView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        <Text style={[styles.date, styles.headerCentered]}>{todayLabel.toUpperCase()}</Text>
        <Text style={[styles.title, styles.headerCentered]}>
          {isToday ? "Today's Practice" : selectedDay.charAt(0).toUpperCase() + selectedDay.slice(1)}
        </Text>

        {(userData?.streak || 0) > 0 && (
          <View style={styles.streakChip}>
            <Text style={styles.streakChipText}>🔥 {userData.streak} day{userData.streak === 1 ? '' : 's'} streak</Text>
          </View>
        )}

        {/* Day picker */}
        <View style={styles.dayRow}>
          {DAY_ORDER.map((day) => {
            const hasSessions = plan?.[day]?.sessions?.length > 0;
            const isSelected = day === selectedDay;
            const isDayToday = day === TODAY_NAME;
            return (
              <TouchableOpacity
                key={day}
                style={[styles.dayBtn, isSelected && styles.dayBtnSelected, isDayToday && !isSelected && styles.dayBtnToday]}
                onPress={() => setSelectedDay(day)}
              >
                <Text style={[styles.dayBtnText, isSelected && styles.dayBtnTextSelected]}>
                  {day.slice(0, 3).toUpperCase()}
                </Text>
                {hasSessions && <View style={[styles.dayDot, isSelected && styles.dayDotSelected]} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Today's progress — one cohesive summary card */}
        {isToday && sessions.length > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryStats}>
              {[
                { value: totalMins, label: 'MINUTES' },
                { value: sessions.length, label: 'EXERCISES' },
                { value: completedIds.length, label: 'DONE' },
              ].map((stat, i) => (
                <React.Fragment key={stat.label}>
                  {i > 0 && <View style={styles.summaryDivider} />}
                  <View style={styles.summaryStat}>
                    <Text style={styles.summaryStatValue}>{stat.value}</Text>
                    <Text style={styles.summaryStatLabel}>{stat.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressLabel}>
              {completedIds.length} of {sessions.length} completed · {Math.round(progress * 100)}%
            </Text>
          </View>
        )}

        {/* Daily challenge — bonus task that keeps the streak alive */}
        {isToday && (
          <View style={styles.challengeCard}>
            <TouchableOpacity style={styles.challengeHeader} onPress={() => setChallengeOpen((o) => !o)} activeOpacity={0.7}>
              <View style={styles.challengeIcon}>
                <Ionicons name={dailyChallenge.icon} size={18} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.challengeKicker}>DAILY CHALLENGE</Text>
                <Text style={styles.challengeTitle} numberOfLines={challengeOpen ? undefined : 1}>{dailyChallenge.title}</Text>
              </View>
              {challengeDoneToday
                ? <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                : <Text style={styles.challengePts}>+{CHALLENGE_POINTS} pts</Text>}
              <Ionicons name={challengeOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
            {challengeOpen && (
              <>
                <Text style={styles.challengeDetail}>{dailyChallenge.detail}</Text>
                <ReferenceLink reference={`${dailyChallenge.title} ${userData?.instrument || 'guitar'} lesson`} />
                {challengeDoneToday ? (
                  <View style={styles.challengeDone}>
                    <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                    <Text style={styles.challengeDoneText}>Completed — nice one! Back tomorrow.</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.challengeBtn} onPress={handleCompleteChallenge} activeOpacity={0.85}>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={styles.challengeBtnText}>Mark complete</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}

        {/* Sessions — the actual practice for the day */}
        {selectedSessions.length > 0 && (
          <Text style={styles.sectionLabel}>{isToday ? "TODAY'S SESSIONS" : 'PLANNED SESSIONS'}</Text>
        )}
        {selectedSessions.length === 0 ? (
          isToday && !hasPlan ? (
            // Students: the "unlock your AI plan" hero is rendered at the BOTTOM
            // (teacher tasks/classes/song take priority), so nothing here.
            userData?.role === 'student' ? null : (
              <View style={styles.restDay}>
                <View style={styles.restIconWrap}>
                  <Ionicons name="sparkles-outline" size={34} color={COLORS.primary} />
                </View>
                <Text style={styles.restTitle}>No plan yet</Text>
                <Text style={styles.restSubtitle}>Build your personalised plan from Profile whenever you’re ready.</Text>
                <TouchableOpacity style={styles.makePlanBtn} onPress={() => navigation.navigate('Profile')} activeOpacity={0.85}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.makePlanText}>Create a plan</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            <View style={styles.restDay}>
              <View style={styles.restIconWrap}>
                <Ionicons name="bed-outline" size={36} color={COLORS.textMuted} />
              </View>
              <Text style={styles.restTitle}>Rest Day</Text>
              <Text style={styles.restSubtitle}>No sessions scheduled. Enjoy the break!</Text>
            </View>
          )
        ) : isToday ? (
          selectedSessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              onComplete={handleComplete}
              completed={completedIds.includes(session.id)}
              onStart={(s) => navigation.navigate('Practice', { screen: 'PracticeHome', params: { activeSession: s } })}
            />
          ))
        ) : (
          selectedSessions.map((session, i) => (
            <PlanCard key={session.id || i} session={session} />
          ))
        )}

        {/* One-to-one tasks from the teacher (collapsible when there are 3+) */}
        {isToday && (soloTasks.length > 0 || nextLesson || lastAttended || userData?.teacherUid) && (
          <View style={[styles.teacherCard, { marginTop: SPACING.sm }]}>
            {soloTasks.length >= 3 ? (
              <TouchableOpacity style={styles.teacherHeader} onPress={() => setSoloOpen((o) => !o)} activeOpacity={0.7}>
                <Ionicons name="school" size={16} color={COLORS.primary} />
                <Text style={[styles.teacherKicker, { flex: 1 }]}>FROM YOUR TEACHER</Text>
                {userData?.teacherUid && <NotesChip onPress={() => navigation.navigate('LessonNotes')} />}
                <Text style={styles.classGroupSub}>{soloTasks.filter((t) => t.completed).length}/{soloTasks.length} done</Text>
                <Ionicons name={soloOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ) : (
              <View style={styles.teacherHeader}>
                <Ionicons name="school" size={16} color={COLORS.primary} />
                <Text style={[styles.teacherKicker, { flex: 1 }]}>FROM YOUR TEACHER</Text>
                {userData?.teacherUid && <NotesChip onPress={() => navigation.navigate('LessonNotes')} />}
              </View>
            )}
            {nextLesson && (
              <TouchableOpacity
                style={styles.lessonRow}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Practice', {
                  screen: 'Schedule',
                  params: { date: ymdLocal(nextLesson.when) },
                  initial: false,
                })}
              >
                <Ionicons name="calendar-outline" size={15} color={COLORS.primary} />
                <Text style={styles.lessonRowText} numberOfLines={1}>
                  {lessonIsToday ? 'Lesson today' : 'Next lesson'}: {lessonDayLabel(nextLesson.when)}{nextLesson.lesson.time ? ` · ${fmtLessonTime(nextLesson.lesson.time)}` : ''}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
            {lastAttended && (
              <TouchableOpacity
                style={styles.lessonRow}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('LessonNotes', { date: lastAttended.date })}
              >
                <View style={[styles.attDot, { backgroundColor: ATT_META[lastAttended.rec.status].color }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.lessonRowText} numberOfLines={1}>
                    Last lesson ({pastDayLabel(lastAttended.date)}): {ATT_META[lastAttended.rec.status].label}
                  </Text>
                  {lastAttended.rec.note ? (
                    <Text style={styles.attNoteText} numberOfLines={2}>“{lastAttended.rec.note}”</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
            {(soloTasks.length < 3 || soloOpen) && soloTasks.map((t) => (
              <TeacherTaskCard
                key={t.id}
                task={t}
                expanded={expandedTask === t.id}
                onToggle={() => setExpandedTask(expandedTask === t.id ? null : t.id)}
                onBank={bankTeacherTask}
                openTaskLink={openTaskLink}
                onOpenSong={openSongInLibrary}
                onAttachProof={attachProof}
                onViewProof={viewProof}
                proofBusy={proofBusyId === t.id}
              />
            ))}
          </View>
        )}

        {/* Class-assigned tasks, grouped per class with a collapsible header */}
        {isToday && classGroups.map((g) => {
          const collapsed = collapsedGroups.has(g.key);
          const doneCount = g.tasks.filter((t) => t.completed).length;
          return (
            <View key={g.key} style={styles.teacherCard}>
              <TouchableOpacity style={[styles.classGroupHeader, collapsed && { marginBottom: 0 }]} onPress={() => toggleGroup(g.key)} activeOpacity={0.7}>
                <Ionicons name="people" size={16} color={COLORS.accent || COLORS.primary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.classGroupKicker} numberOfLines={1}>{g.name.toUpperCase()}</Text>
                  <Text style={styles.classGroupSub}>{doneCount}/{g.tasks.length} done</Text>
                </View>
                <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
              {!collapsed && g.tasks.map((t) => (
                <TeacherTaskCard
                  key={t.id}
                  task={t}
                  expanded={expandedTask === t.id}
                  onToggle={() => setExpandedTask(expandedTask === t.id ? null : t.id)}
                  onBank={bankTeacherTask}
                  openTaskLink={openTaskLink}
                onOpenSong={openSongInLibrary}
                  onAttachProof={attachProof}
                  onViewProof={viewProof}
                  proofBusy={proofBusyId === t.id}
                />
              ))}
              {!collapsed && userData?.teacherUid && g.tasks[0]?.classId && (
                <ClassScoreboard
                  classId={g.tasks[0].classId}
                  teacherUid={userData.teacherUid}
                  myUid={auth.currentUser?.uid}
                />
              )}
            </View>
          );
        })}

        {/* Song to practice — matched to the player's level */}
        {isToday && songOfTheDay && (
          <TouchableOpacity
            style={styles.songCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Practice', {
              screen: 'Songs',
              params: { focusSong: songOfTheDay },
              initial: false,
            })}
          >
            <View style={styles.songIcon}>
              <Ionicons name="musical-notes" size={20} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.songLabel}>
                SONG TO PRACTICE{userData?.level ? ` · ${userData.level.toUpperCase()}` : ''}
              </Text>
              <Text style={styles.songTitle} numberOfLines={1}>{songOfTheDay.title}</Text>
              {!!songOfTheDay.artist && (
                <Text style={styles.songArtist} numberOfLines={1}>{songOfTheDay.artist}</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}

        {/* Free students: the upgrade CTA sits at the bottom, below the teacher's
            tasks, classes and the song — those take priority. */}
        {isToday && !hasPlan && userData?.role === 'student' && (
          <LinearGradient
            colors={[COLORS.primary, COLORS.accent || '#06B6D4']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.upgradeHero}
          >
            <View style={styles.upgradeBadge}><Ionicons name="sparkles" size={22} color="#fff" /></View>
            <Text style={styles.upgradeTitle}>Unlock your own AI plan</Text>
            <Text style={styles.upgradeSub}>Your teacher’s tasks and the daily challenge are free — get a personalised plan that adapts to you with Personal.</Text>
            <TouchableOpacity style={styles.upgradeBtn} onPress={promptUpgrade} activeOpacity={0.9}>
              <Ionicons name="star" size={15} color={COLORS.primary} />
              <Text style={styles.upgradeBtnText}>Upgrade to Personal</Text>
            </TouchableOpacity>
          </LinearGradient>
        )}

      </ScrollView>

      <Modal visible={showRating} transparent animationType="none">
        <View style={styles.ratingBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowRating(false)} />
          <Animated.View style={[styles.ratingSheet, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.ratingHandle} />
            <Text style={styles.ratingTitle}>How was that session?</Text>
            <Text style={styles.ratingSubtitle}>Prova will adjust your next session based on this</Text>
            {RATING_OPTIONS.map(({ key, label, sub, icon }) => (
              <TouchableOpacity key={key} style={styles.ratingBtn} onPress={() => handleRating(key)} activeOpacity={0.8}>
                <View style={styles.ratingBtnIcon}>
                  <Ionicons name={icon} size={20} color={COLORS.primary} />
                </View>
                <View>
                  <Text style={styles.ratingBtnLabel}>{label}</Text>
                  <Text style={styles.ratingBtnSub}>{sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} style={{ flex: 1, textAlign: 'right' }} />
              </TouchableOpacity>
            ))}
          </Animated.View>
        </View>
      </Modal>

      {/* Streak-lost pop-up — shown once on open when a day was missed */}
      <Modal visible={showRestoreModal} transparent animationType="fade" onRequestClose={() => setShowRestoreModal(false)}>
        <View style={styles.restoreModalBackdrop}>
          <View style={styles.restoreModalCard}>
            <View style={styles.restoreModalIcon}>
              <Ionicons name="flame" size={34} color={COLORS.error} />
            </View>
            <Text style={styles.restoreModalTitle}>You lost your streak!</Text>
            <Text style={styles.restoreModalBody}>
              You missed a day, so your {streakVal}-day streak is about to reset to zero. Spend a restore to keep it alive.
            </Text>
            <View style={styles.restoreModalCountWrap}>
              <Ionicons name="snow" size={15} color={COLORS.primary} />
              <Text style={styles.restoreModalCount}>
                {restore.total} restore{restore.total === 1 ? '' : 's'} left
                {restore.freeRemaining > 0 ? ` (${restore.freeRemaining} free this month)` : ''}
              </Text>
            </View>
            <TouchableOpacity style={styles.restoreModalBtn} onPress={handleRestoreStreak} activeOpacity={0.85}>
              <Ionicons name="flame" size={16} color="#fff" />
              <Text style={styles.restoreModalBtnText}>Restore my streak</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowRestoreModal(false)} activeOpacity={0.7} style={styles.restoreModalDismissBtn}>
              <Text style={styles.restoreModalDismiss}>No thanks, let it reset</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!proofView} transparent animationType="fade" onRequestClose={() => setProofView(null)}>
        <View style={styles.proofBackdrop}>
          <View style={styles.proofViewer}>
            {proofView?.type === 'video' ? (
              <Video source={{ uri: proofView.url }} style={styles.proofMedia} useNativeControls resizeMode={ResizeMode.CONTAIN} shouldPlay />
            ) : proofView ? (
              <Image source={{ uri: proofView.url }} style={styles.proofMedia} resizeMode="contain" />
            ) : null}
            <TouchableOpacity style={styles.proofCloseBtn} onPress={() => setProofView(null)} activeOpacity={0.85}>
              <Ionicons name="close" size={20} color="#fff" />
              <Text style={styles.proofCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  date: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.xs },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800', marginBottom: SPACING.md },
  headerCentered: { textAlign: 'center', alignSelf: 'center' },

  dayRow: { flexDirection: 'row', gap: 6, marginBottom: SPACING.lg },
  dayBtn: { flex: 1, paddingVertical: SPACING.sm, borderRadius: 10, backgroundColor: COLORS.card, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  dayBtnSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayBtnToday: { borderColor: COLORS.primary },
  dayBtnText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  dayBtnTextSelected: { color: COLORS.text },
  dayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.textMuted, marginTop: 3 },
  dayDotSelected: { backgroundColor: COLORS.text },

  streakChip: {
    alignSelf: 'center', flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 5, paddingHorizontal: 12, marginBottom: SPACING.md,
  },
  streakChipText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  summaryCard: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, marginBottom: SPACING.lg },
  summaryStats: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 32, backgroundColor: COLORS.border },
  summaryStatValue: { color: COLORS.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summaryStatLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginTop: 3 },
  progressBar: { height: 8, backgroundColor: COLORS.border, borderRadius: 4, marginBottom: SPACING.sm, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 4 },
  progressLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', textAlign: 'center' },

  sectionLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: SPACING.sm },

  // Streak-lost pop-up
  restoreModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  restoreModalCard: { width: '100%', backgroundColor: COLORS.surface, borderRadius: 20, padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  restoreModalIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.error + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  restoreModalTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: SPACING.sm },
  restoreModalBody: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: SPACING.md },
  restoreModalCountWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.lg },
  restoreModalCount: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  restoreModalBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.error, borderRadius: 12, paddingVertical: 14, width: '100%' },
  restoreModalBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  restoreModalDismissBtn: { paddingVertical: SPACING.md },
  restoreModalDismiss: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },

  // Daily challenge card
  challengeCard: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: SPACING.lg, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },

  // Teacher-assigned tasks
  teacherCard: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: SPACING.lg, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  teacherHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  teacherKicker: { color: COLORS.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  classGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.md },
  classGroupKicker: { color: COLORS.accent || COLORS.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  classGroupSub: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', marginTop: 1 },
  teacherTask: { paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  teacherTaskRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, justifyContent: 'space-between' },
  teacherTaskMain: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  teacherTaskTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  teacherTaskDone: { color: COLORS.textMuted },
  teacherTaskDesc: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginTop: SPACING.sm, marginLeft: 22 },
  teacherTaskLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm, marginLeft: 22 },
  teacherTaskLinkText: { color: COLORS.textSecondary, fontSize: 13, textDecorationLine: 'underline', flexShrink: 1 },
  teacherDue: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  teacherDueOverdue: { color: COLORS.error },
  teacherDoneBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 999, paddingHorizontal: SPACING.md, paddingVertical: 8 },
  teacherDoneBtnLocked: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  teacherDoneText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  teacherDoneTextLocked: { color: COLORS.textMuted },
  ttTimer: { marginLeft: 22, marginTop: SPACING.sm },
  ttTimerBarBg: { height: 4, borderRadius: 2, backgroundColor: COLORS.border, overflow: 'hidden' },
  ttTimerBarFill: { height: 4, borderRadius: 2, backgroundColor: COLORS.primary },
  ttTimerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: SPACING.sm },
  ttTimerText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  ttLapPts: { color: COLORS.accent || COLORS.primary, fontSize: 13, fontWeight: '800' },
  ttBtnRow: { flexDirection: 'row', gap: SPACING.sm },
  ttTimerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: COLORS.primaryDark || COLORS.primary, borderRadius: 999, paddingHorizontal: SPACING.md, paddingVertical: 9 },
  ttTimerBtnText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  ttBankBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.success, borderRadius: 999, paddingHorizontal: SPACING.md, paddingVertical: 9 },
  ttBankBtnDim: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  ttBankBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  ttBankBtnTextDim: { color: COLORS.textMuted },
  teacherEarned: { color: COLORS.success, fontSize: 11, fontWeight: '700', marginTop: 2 },
  scoreboard: { marginTop: SPACING.md, backgroundColor: COLORS.background, borderRadius: 12, padding: SPACING.sm },
  scoreboardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  scoreboardTitle: { flex: 1, color: COLORS.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  scoreboardEmpty: { color: COLORS.textMuted, fontSize: 12, marginTop: SPACING.sm, paddingHorizontal: 4 },
  scoreboardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, marginTop: 4 },
  scoreboardRowMe: { backgroundColor: (COLORS.primary || '#000') + '18' },
  scoreboardRank: { width: 22, textAlign: 'center', color: COLORS.textSecondary, fontSize: 13, fontWeight: '800' },
  scoreboardName: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: '600' },
  scoreboardNameMe: { fontWeight: '800' },
  scoreboardPts: { color: COLORS.accent || COLORS.primary, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  challengeHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  challengeIcon: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: COLORS.accent + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  challengeKicker: { color: COLORS.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  challengePts: { color: COLORS.accent, fontSize: 12, fontWeight: '800' },
  challengeTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800', marginTop: 2, lineHeight: 18 },
  challengeDetail: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginTop: SPACING.md, marginBottom: SPACING.md },
  challengeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 12,
  },
  challengeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  challengeDone: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 4 },
  challengeDoneText: { color: COLORS.success, fontSize: 14, fontWeight: '700' },

  card: { backgroundColor: COLORS.card, borderRadius: 16, marginBottom: SPACING.md, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  cardCompleted: { opacity: 0.45 },
  categoryBar: { width: 4 },
  cardContent: { flex: 1, paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.md + SPACING.xs },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  categoryBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: 4 },
  categoryText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  duration: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  sessionPtsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: SPACING.md },
  sessionPts: { color: COLORS.accent, fontSize: 12, fontWeight: '800' },
  sessionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: SPACING.xs },
  sessionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  sessionTitleCompleted: { color: COLORS.textMuted },
  sessionDesc: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: SPACING.sm },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  refText: { color: COLORS.textSecondary, fontSize: 12, flexShrink: 1, textDecorationLine: 'underline' },
  timerProgress: { height: 3, backgroundColor: COLORS.border, borderRadius: 2, marginBottom: SPACING.sm, overflow: 'hidden' },
  timerProgressFill: { height: '100%', borderRadius: 2 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  timerText: { color: COLORS.text, fontSize: 18, fontWeight: '700', minWidth: 56, fontVariant: ['tabular-nums'] },
  timerBtn: { backgroundColor: COLORS.border, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, flexDirection: 'row', alignItems: 'center', gap: 5 },
  timerBtnText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  completeBtn: { backgroundColor: COLORS.success + '1A', borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, flexDirection: 'row', alignItems: 'center', gap: 5 },
  completeBtnText: { color: COLORS.success, fontSize: 13, fontWeight: '700' },
  completeBtnLocked: { backgroundColor: COLORS.border + '80' },
  completeBtnTextLocked: { color: COLORS.textMuted },
  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  completedBadge: { color: COLORS.success, fontSize: 13, fontWeight: '700' },

  planCard: { flexDirection: 'row', marginBottom: SPACING.lg },
  planLeft: { width: 24, alignItems: 'center', marginRight: SPACING.md },
  planDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  planConnector: { flex: 1, width: 2, backgroundColor: COLORS.border, marginTop: SPACING.xs },
  planRight: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  sessionMeta: { flexDirection: 'row', gap: SPACING.md },
  sessionDuration: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  sessionCategory: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },

  songCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    borderLeftWidth: 4, borderLeftColor: COLORS.accent, padding: SPACING.md, marginTop: SPACING.sm,
  },
  songIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accent + '18',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  lessonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 9, paddingHorizontal: 10, marginTop: SPACING.sm,
    backgroundColor: COLORS.primary + '12', borderRadius: 10,
  },
  lessonRowText: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: '600' },
  attDot: { width: 9, height: 9, borderRadius: 5 },
  attNoteText: { color: COLORS.textSecondary, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  notesChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: COLORS.primary + '18', borderWidth: 1, borderColor: COLORS.primary + '33',
    marginLeft: 8,
  },
  notesChipText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  proofAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: SPACING.sm, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.primary + '40', backgroundColor: COLORS.primary + '12' },
  proofAddText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  proofRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.sm, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: COLORS.card },
  proofRowText: { flex: 1, color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  proofViewLink: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  proofReplaceLink: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700' },
  proofBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  proofViewer: { width: '100%', alignItems: 'center' },
  proofMedia: { width: '100%', height: 360, borderRadius: 12, backgroundColor: '#000' },
  proofCloseBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.lg, paddingVertical: 10, paddingHorizontal: SPACING.lg, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.15)' },
  proofCloseText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  songLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  songTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  songArtist: { color: COLORS.textSecondary, fontSize: 13, marginTop: 1 },

  restDay: { alignItems: 'center', paddingTop: SPACING.xxl },
  restIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  restTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginBottom: SPACING.sm },
  restSubtitle: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 21, paddingHorizontal: SPACING.lg },
  makePlanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.lg, paddingVertical: 11, paddingHorizontal: SPACING.lg, borderRadius: 999, backgroundColor: COLORS.primary },
  makePlanText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  upgradeHero: { borderRadius: 20, padding: SPACING.xl, alignItems: 'center', marginTop: SPACING.md, marginBottom: SPACING.md },
  upgradeBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  upgradeTitle: { color: '#fff', fontSize: 19, fontWeight: '900', textAlign: 'center' },
  upgradeSub: { color: 'rgba(255,255,255,0.92)', fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.lg, paddingVertical: 12, paddingHorizontal: SPACING.xl, borderRadius: 999, backgroundColor: '#fff' },
  upgradeBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: '800' },

  ratingBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  ratingSheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: 40, borderTopWidth: 1, borderColor: COLORS.border },
  ratingHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.lg },
  ratingTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800', marginBottom: SPACING.xs },
  ratingSubtitle: { color: COLORS.textSecondary, fontSize: 14, marginBottom: SPACING.xl, lineHeight: 20 },
  ratingBtn: { backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  ratingBtnIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary + '1A', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ratingBtnLabel: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  ratingBtnSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 1 },
});
