import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Modal, Animated, Alert, Linking, ActivityIndicator, Image, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, getDoc, setDoc, updateDoc, increment, collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../lib/firebase';
import { scheduleStreakSaver, cancelStreakSaver, notifyNewTasks, rearmDailyReminder } from '../../lib/notifications';
import { refreshWeeklyPlan } from '../../lib/claude';
import { COLORS, SPACING } from '../../constants/theme';
import { getDailySong } from '../../constants/songs';
import { getDailyChallenge, CHALLENGE_POINTS } from '../../constants/challenges';
import { taskPoints, completionBonus, displayScore, formatScore, scoreRank, restoreState, spendRestore, teacherTaskPoints, POINTS_PER_MIN } from '../../lib/score';
import { practiceStreakUpdates, logPracticeMinutes } from '../../lib/practiceLog';
import { track } from '../../lib/analytics';
import { displayName } from '../../lib/displayName';
import { pickMedia, captureMedia, uploadProofMedia } from '../../lib/media';
import * as MediaLibrary from 'expo-media-library';
import ProofMedia from '../../components/ProofMedia';
import YouTubePlayerModal from '../../components/YouTubePlayerModal';
import PracticePlayer from '../../components/PracticePlayer';
import SheetModal from '../../components/SheetModal';
import { useCelebration } from '../../components/Celebration';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const CATEGORY_COLORS = {
  warmup: '#06B6D4',
  technique: '#3B82F6',
  theory: '#8B5CF6',
  ear_training: '#10B981',
  repertoire: '#0EA5E9',
  improvisation: '#6366F1',
};

// Compact one-tap difficulty options shown inline on each completed session.
// Keys match the values Prova's plan logic already understands (too_hard etc.).
const DIFF_OPTS = [
  { key: 'too_hard',   label: 'Too hard' },
  { key: 'just_right', label: 'Just right' },
  { key: 'too_easy',   label: 'Too easy' },
];

// Build a { sessionId: { difficulty, note } } map of TODAY's session feedback
// from the rolling users.weekFeedback log, so ratings persist across reloads.
function todayFeedbackMap(d, todayKey) {
  const arr = Array.isArray(d?.weekFeedback) ? d.weekFeedback : [];
  const map = {};
  arr.forEach((e) => {
    if (e && e.date === todayKey && e.sessionId) map[e.sessionId] = { difficulty: e.difficulty, note: e.note || '' };
  });
  return map;
}

// Whether to surface the "week in review" card: there's feedback to learn from
// and it's been ≥7 days since the last review (or there's never been one).
function weekReviewDue(d) {
  const fb = Array.isArray(d?.weekFeedback) ? d.weekFeedback : [];
  if (fb.length === 0) return false;
  const last = d?.lastWeekReviewAt ? new Date(d.lastWeekReviewAt).getTime() : 0;
  return Date.now() - last >= 7 * 86400000;
}

// Most common difficulty among today's ratings (defaults to 'just_right'); used
// only for the small end-of-day quality bonus now that adaptation is weekly.
function aggregateDifficulty(map) {
  const counts = {};
  Object.values(map || {}).forEach((f) => { if (f?.difficulty) counts[f.difficulty] = (counts[f.difficulty] || 0) + 1; });
  let best = 'just_right', bestN = 0;
  Object.entries(counts).forEach(([k, n]) => { if (n > bestN) { best = k; bestN = n; } });
  return best;
}

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

// One teacher-assigned task on the student's Today screen. The card is a
// readable preview — practicing (and its timer) happens in the practice player,
// which "Practice this" opens at this task.
function TeacherTaskCard({ task, expanded, onToggle, onPractice, openTaskLink, onOpenSong, onAttachProof, onViewProof, proofBusy, proofPct, proofStep, topDivider }) {
  const uploadingLabel = proofPct != null
    ? `Uploading… ${proofPct}%`
    : (proofStep || 'Uploading…');
  const target = (task.durationMin || 0) * 60; // 0 = no set target, open-ended
  const due = assignedDueLabel(task.dueDate);
  const earnedSoFar = task.pointsEarned || 0;
  // Long feedback clamps to 2 lines with a "Show more" toggle.
  const [fbOpen, setFbOpen] = useState(false);
  const fbLong = (task.feedback || '').length > 100 || (task.feedback || '').includes('\n');
  // Long descriptions clamp to 6 lines with a Show more/less. Measure the real
  // rendered line count once (unclamped first pass) so the toggle only appears
  // when it's genuinely longer than 6 lines.
  const [descOpen, setDescOpen] = useState(false);
  const [descLineCount, setDescLineCount] = useState(null);
  const descOverflow = (descLineCount || 0) > 6;

  return (
    <View style={[styles.teacherTask, topDivider && styles.teacherTaskDivider]}>
      <View style={styles.teacherTaskRow}>
        <TouchableOpacity style={styles.teacherTaskMain} onPress={onToggle} activeOpacity={0.7}>
          <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} color={COLORS.textMuted} style={styles.taskLineIcon} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.teacherTaskTitle, task.completed && styles.teacherTaskDone]} numberOfLines={expanded ? undefined : 2}>{task.title}</Text>
            {!task.completed && due && (
              <Text style={[styles.teacherDue, due.overdue && styles.teacherDueOverdue]}>{due.text}</Text>
            )}
            {earnedSoFar > 0 && (
              <Text style={styles.teacherEarned}>
                {formatScore(earnedSoFar)} pts earned
              </Text>
            )}
          </View>
        </TouchableOpacity>
        {!task.completed && target > 0 && (
          <Text style={styles.ttDurationLabel}>{task.durationMin} min</Text>
        )}
        {task.completed && <Ionicons name="checkmark-circle" size={22} color={COLORS.success} style={{ marginLeft: 6 }} />}
      </View>

      {/* Content first — the student reads what to do, then the timer sits at the bottom. */}
      {expanded && !!task.description && (
        <View style={styles.teacherTaskDescRow}>
          <Ionicons name="document-text-outline" size={15} color={COLORS.textMuted} style={[styles.taskLineIcon, { marginTop: 1 }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={styles.teacherTaskDesc}
              numberOfLines={descOpen || descLineCount == null ? undefined : 6}
              onTextLayout={(e) => { if (descLineCount == null) setDescLineCount(e.nativeEvent.lines.length); }}
            >
              {task.description}
            </Text>
            {descOverflow && (
              <TouchableOpacity onPress={() => setDescOpen((o) => !o)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={styles.taskFeedbackMore}>{descOpen ? 'Show less' : 'Show more'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      {expanded && !!task.feedback && (
        <View style={styles.taskFeedback}>
          <Ionicons name="chatbubble-ellipses" size={13} color={COLORS.accent} style={[styles.taskLineIcon, { marginTop: 1 }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.taskFeedbackText} numberOfLines={fbOpen ? undefined : 2}>“{task.feedback}”</Text>
            {fbLong && (
              <TouchableOpacity onPress={() => setFbOpen((o) => !o)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={styles.taskFeedbackMore}>{fbOpen ? 'Show less' : 'Show more'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      {expanded && !!task.youtube && (
        <TouchableOpacity style={styles.teacherTaskLink} onPress={() => openTaskLink(task.youtube)} activeOpacity={0.8}>
          <Ionicons name="play-circle" size={18} color={COLORS.primary} style={styles.taskLineIcon} />
          <Text style={[styles.teacherTaskLinkText, styles.teacherTaskWatchText]} numberOfLines={1}>Watch a tutorial</Text>
          <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
        </TouchableOpacity>
      )}
      {expanded && !!task.song && (
        <TouchableOpacity style={styles.teacherTaskLink} onPress={() => onOpenSong(task.song)} activeOpacity={0.7}>
          <Ionicons name="musical-notes" size={15} color={COLORS.primary} style={styles.taskLineIcon} />
          <Text style={[styles.teacherTaskLinkText, styles.teacherTaskSongText]} numberOfLines={1}>{task.song}</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
        </TouchableOpacity>
      )}

      {expanded && (
        task.proofUrl ? (
          <View style={styles.proofRow}>
            <Ionicons name={task.proofVerified ? 'checkmark-circle' : 'videocam'} size={15} color={task.proofVerified ? COLORS.success : COLORS.primary} />
            <Text style={styles.proofRowText} numberOfLines={1}>
              {task.proofVerified ? 'Proof verified by your teacher' : 'Proof submitted'}
              {(task.proofs?.length || 0) > 1 ? ` (${task.proofs.length})` : ''}
            </Text>
            <TouchableOpacity onPress={() => onViewProof(task)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Text style={styles.proofViewLink}>View</Text>
            </TouchableOpacity>
            {/* Opens the add-another / replace-latest chooser. */}
            <TouchableOpacity onPress={() => onAttachProof(task.id)} disabled={proofBusy} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Text style={styles.proofReplaceLink}>{proofBusy ? '…' : 'Add / Replace'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.proofAddBtn} onPress={() => onAttachProof(task.id)} disabled={proofBusy} activeOpacity={0.8}>
            <View style={styles.proofAddIcon}>
              {proofBusy
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <Ionicons name="videocam-outline" size={15} color={COLORS.primary} />}
            </View>
            <Text style={styles.proofAddText}>{proofBusy ? uploadingLabel : 'Add proof of practice'}</Text>
          </TouchableOpacity>
        )
      )}

      {/* Practicing happens in the player — this just opens it at this task. */}
      {expanded && !task.completed && (
        <TouchableOpacity style={styles.practiceThisBtn} onPress={() => onPractice(task)} activeOpacity={0.85}>
          <Ionicons name="play" size={15} color={COLORS.text} />
          <Text style={styles.practiceThisText}>Practice{target > 0 ? ` · ${task.durationMin} min` : ''}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Live scoreboard for one class: ranks classmates by the points they've banked
// on this class's assignments, so practicing the teacher's tasks becomes a race.
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
function ReferenceLink({ reference, label }) {
  const [open, setOpen] = useState(false);
  if (!reference) return null;
  const cta = label ? `Watch videos on ${label}` : 'Watch lesson videos';
  return (
    <>
      <TouchableOpacity style={styles.refRow} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Ionicons name="play-circle" size={18} color={COLORS.primary} />
        <Text style={styles.refText} numberOfLines={1}>{cta}</Text>
        <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
      </TouchableOpacity>
      <YouTubePlayerModal visible={open} query={reference} title={label ? `Videos on ${label}` : 'Watch'} onClose={() => setOpen(false)} />
    </>
  );
}

// A plan session on Today. The timer lives ONLY in the practice player now —
// this card is a readable preview; "Practice" opens the player at this task.
function SessionCard({ session, completed, onPractice }) {
  const [expanded, setExpanded] = useState(false);
  const categoryColor = CATEGORY_COLORS[session.category] || COLORS.primary;

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
        <ReferenceLink reference={session.reference} label={session.title} />
        <View style={styles.sessionPtsRow}>
          <Ionicons name="sparkles" size={13} color={COLORS.accent} />
          <Text style={styles.sessionPts}>Worth +{Math.round(taskPoints(session) / 5) * 5} Prova points</Text>
        </View>
        {!completed && (
          <TouchableOpacity style={[styles.practiceThisBtn, { backgroundColor: categoryColor }]} onPress={() => onPractice(session)} activeOpacity={0.85}>
            <Ionicons name="play" size={15} color={COLORS.text} />
            <Text style={styles.practiceThisText}>Practice</Text>
          </TouchableOpacity>
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
        <ReferenceLink reference={session.reference} label={session.title} />
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
  const celebrate = useCelebration();
  const [plan, setPlan] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [completedIds, setCompletedIds] = useState([]);
  const [lessons, setLessons] = useState([]); // this student's lessons, read from their teacher's doc
  const [attendance, setAttendance] = useState({}); // teacher-set attendance map `${lessonId}__${ymd}` -> { status, note }
  const [loading, setLoading] = useState(true);
  const [feedbackMap, setFeedbackMap] = useState({}); // today's per-session { difficulty, note }
  const finalizedRef = useRef(null); // guards the once-a-day finish bonus
  const [playerVisible, setPlayerVisible] = useState(false); // guided practice player
  const [playerStartId, setPlayerStartId] = useState(null);  // queue item to start on
  const [playerProgress, setPlayerProgress] = useState(null); // { date, elapsedById, lastItemId } — survives app restarts
  const [setlistAsk, setSetlistAsk] = useState(null); // null | 'ask' | 'pick' | 'lists' — the pre-gig "practice your set first?" sheet
  const [pickSetlistId, setPickSetlistId] = useState(null); // setlist shown in the picker (null = the gig's linked one)
  const [gigSongItem, setGigSongItem] = useState(null); // chosen setlist song, runs first in the player
  const [unreadCount, setUnreadCount] = useState(0);  // inbox badge on the bell
  // What to open once the setlist sheet has FULLY closed — iOS can't present
  // the player while the sheet's modal is still dismissing (screen freezes).
  const pendingPlayerRef = useRef(null); // '__default__' | queue item id | null
  const insets = useSafeAreaInsets();

  // Live unread count for the bell — gig invites, teacher task alerts.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const q = query(collection(db, 'users', uid, 'inbox'), where('read', '==', false), limit(10));
    return onSnapshot(q, (snap) => setUnreadCount(snap.size), () => {});
  }, []);

  // Restore any unfinished run from earlier today (stale days are ignored and
  // overwritten on the next write).
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    AsyncStorage.getItem(`prova_player_progress_${uid}`)
      .then((raw) => { if (raw) setPlayerProgress(JSON.parse(raw)); })
      .catch(() => {});
  }, []);
  const [reviewOpen, setReviewOpen] = useState(false);   // week-in-review modal
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewData, setReviewData] = useState(null);    // { changeSummary, weeklyPlan }
  const [dayReviewOpen, setDayReviewOpen] = useState(false); // end-of-day "how did today go?" pop-up
  const [dayRatings, setDayRatings] = useState({});      // { sessionId: difficulty } — uncommitted until Submit
  const [dayNote, setDayNote] = useState('');
  const [taskWatch, setTaskWatch] = useState(null);      // teacher-task "Watch" → in-app player (phrase or URL)
  const [userData, setUserData] = useState(null);
  const [selectedDay, setSelectedDay] = useState(TODAY_NAME);
  const [expandedTask, setExpandedTask] = useState(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [proofBusyId, setProofBusyId] = useState(null); // task id currently uploading a proof clip
  const [proofPct, setProofPct] = useState(null); // upload progress 0-100 while a proof clip uploads
  const [proofStep, setProofStep] = useState(null); // human label for the current upload phase
  const [proofView, setProofView] = useState(null);     // { url, type, proofs, taskId } currently being watched
  const [proofIdx, setProofIdx] = useState(0);           // which clip is showing when a task has several
  useEffect(() => { setProofIdx(0); }, [proofView?.taskId]);
  const [soloOpen, setSoloOpen] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set()); // class section keys collapsed
  const toggleGroup = (key) => setCollapsedGroups((prev) => {
    const n = new Set(prev);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });
  const [showRestoreModal, setShowRestoreModal] = useState(false);
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
        setFeedbackMap(todayFeedbackMap(d, todayKey));
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
  // saving but haven't practiced today, schedule tonight's nudge. Cancel it once
  // they've practiced.
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

  // Re-arm the daily reminder on open (permission-gated, never prompts).
  // Reinstalls/new builds wipe the device's scheduled notifications while the
  // account still says reminders are on — without this they'd never fire again.
  useEffect(() => {
    if (userData?.reminderEnabled && userData?.reminderTime) {
      rearmDailyReminder(userData.reminderTime);
    }
  }, [userData?.reminderEnabled, userData?.reminderTime]);

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
      setFeedbackMap(todayFeedbackMap(data, todayKey));

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

  // Completes one plan session. `silent` (used by the practice player) skips
  // the alert + auto day-review so the player can own those moments; returns
  // the points awarded so the player's summary can add them up.
  const handleComplete = async (sessionId, { silent = false } = {}) => {
    if (completedIds.includes(sessionId)) return 0;
    const optimistic = [...completedIds, sessionId]; // instant checkmark
    setCompletedIds(optimistic);
    const maybeRate = (ids) => { if (!silent && sessions.length > 0 && sessions.every(s => ids.includes(s.id))) openDayReview(); };

    const session = sessions.find(s => s.id === sessionId);
    const uid = auth.currentUser?.uid;
    if (!session || !uid) { maybeRate(optimistic); return 0; }

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
        return 0;
      }
      const pts = taskPoints(session);
      const newScore = displayScore(d) + pts;
      const ids = Array.from(new Set([...prior, ...optimistic]));
      await updateDoc(doc(db, 'users', uid), {
        // increment() so concurrent awards can't lose points; the absolute
        // write happens only once, for legacy docs without the field.
        provaScore: typeof d?.provaScore === 'number' ? increment(pts) : newScore,
        sessionProgress: { date: todayKey, ids },
      });
      setUserData(p => ({ ...p, provaScore: newScore }));
      setCompletedIds(ids);
      if (!silent) celebrate({ points: pts, title: 'Task done!', subtitle: 'Prova points', emoji: '🎸' });
      maybeRate(ids);
      return pts;
    } catch (e) {
      maybeRate(optimistic); // keep the optimistic checkmark on failure
      return 0;
    }
  };

  // ── End-of-day session review ──────────────────────────────────────────────
  // Open the one-shot "How did today go?" pop-up, pre-filling any picks already
  // saved for today so re-opening shows the current state.
  const openDayReview = () => {
    const seed = {};
    Object.entries(feedbackMap).forEach(([id, f]) => { if (f?.difficulty) seed[id] = f.difficulty; });
    setDayRatings(seed);
    setDayNote('');
    setDayReviewOpen(true);
  };

  // Submit the whole day's ratings + optional note at once, then close out the
  // day. Selecting difficulty chips only updates local state; nothing is saved
  // until this runs.
  const submitDayReview = () => {
    const uid = auth.currentUser?.uid;
    const todayKey = new Date().toDateString();
    const note = dayNote.trim();
    const picks = { ...dayRatings };
    // Close instantly and close out the day; persistence runs in the background so
    // Submit never feels like it hangs on a slow connection.
    setDayReviewOpen(false);
    const fm = {}; Object.entries(picks).forEach(([id, difficulty]) => { if (difficulty) fm[id] = { difficulty, note: '' }; });
    setFeedbackMap(fm);
    const agg = {}; Object.entries(picks).forEach(([id, difficulty]) => { if (difficulty) agg[id] = { difficulty }; });
    finalizeDay(aggregateDifficulty(agg));
    if (!uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        const d = snap.data() || {};
        const arr = Array.isArray(d.weekFeedback) ? d.weekFeedback : [];
        const cutoff = Date.now() - 9 * 86400000;
        // Drop today's prior entries, prune very old ones, then add this submission.
        const kept = arr.filter(e => (e && e.date === todayKey) ? false : (!e?.ts || e.ts >= cutoff));
        sessions.forEach((s) => {
          const difficulty = picks[s.id];
          if (!difficulty) return; // unrated tasks are left neutral
          kept.push({ date: todayKey, ts: Date.now(), sessionId: s.id, title: s.title || '', category: s.category || '', difficulty, note: '' });
        });
        if (note) kept.push({ date: todayKey, ts: Date.now(), sessionId: '__day__', title: 'Overall note for the day', category: 'note', difficulty: null, note: note.slice(0, 300) });
        await updateDoc(doc(db, 'users', uid), { weekFeedback: kept });
      } catch (e) { console.error(e); }
    })();
  };

  // Dismiss without rating — still close out the day so the streak/bonus survive.
  const skipDayReview = () => {
    setDayReviewOpen(false);
    finalizeDay('just_right');
  };

  // Close out the day: streak, finish bonus, sessionHistory log. Adaptation is
  // weekly (Stage 2), so this no longer rewrites today's plan. `aggRating` only
  // feeds the small quality bonus.
  const finalizeDay = async (aggRating = 'just_right') => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const todayStr = new Date().toDateString();
      if (finalizedRef.current === todayStr) return; // don't double-award
      finalizedRef.current = todayStr;

      const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
      const lastStr = userData?.lastSessionDate ? new Date(userData.lastSessionDate).toDateString() : null;
      const newStreak = lastStr === todayStr
        ? (userData?.streak || 1)
        : lastStr === yesterdayStr ? (userData?.streak || 0) + 1 : 1;
      const rating = aggRating || 'just_right';
      const sessionMins = sessions.reduce((s, x) => s + x.duration, 0);
      const categories = {};
      sessions.forEach(s => { categories[s.category] = (categories[s.category] || 0) + s.duration; });
      const dateKey = new Date().toISOString().split('T')[0];
      const earnedPoints = completionBonus(newStreak, rating);
      const prevScore = displayScore(userData);
      const newScore = prevScore + earnedPoints;
      const rankedUp = scoreRank(newScore).index > scoreRank(prevScore).index;
      const nowIso = new Date().toISOString();
      track('day_completed', { minutes: sessionMins, streak: newStreak });
      await Promise.all([
        updateDoc(doc(db, 'users', uid), {
          lastSessionRating: rating,
          lastSessionDate: nowIso,
          totalMinutes: increment(sessionMins),
          totalSessions: increment(1),
          streak: newStreak,
          provaScore: typeof userData?.provaScore === 'number' ? increment(earnedPoints) : newScore,
        }),
        setDoc(doc(db, 'sessionHistory', uid, 'logs', dateKey), {
          date: dateKey,
          totalMinutes: increment(sessionMins),
          sessionCount: increment(1),
          categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, increment(v)])),
          rating,
        }, { merge: true }),
      ]);
      setUserData(p => ({ ...p, provaScore: newScore, streak: newStreak, lastSessionDate: nowIso }));
      const newRank = scoreRank(newScore);
      Alert.alert(
        rankedUp ? `${newRank.emoji} New rank: ${newRank.name}!` : `+${formatScore(earnedPoints)} finish bonus! 🎸`,
        rankedUp
          ? `All done for today — you leveled up to ${newRank.name} (${formatScore(newScore)} pts)!`
          : `All done for today — your Prova Score is now ${formatScore(newScore)}.${newStreak > 1 ? `\n🔥 ${newStreak}-day streak — keep it alive!` : ''}`,
      );
    } catch (e) {
      console.error(e);
    }
  };

  // Week in review: ask Prova to re-plan next week from the collected feedback,
  // then open the preview so the user can approve or keep their current plan.
  const openReview = async () => {
    if (reviewLoading) return;
    setReviewOpen(true);
    setReviewLoading(true);
    setReviewData(null);
    try {
      const profile = {
        instrument: userData?.instrument,
        level: userData?.level,
        goals: userData?.goals || [],
        skills: userData?.skills || [],
        availableDays: userData?.availableDays || [],
        dailyDuration: userData?.dailyDuration,
      };
      const feedback = Array.isArray(userData?.weekFeedback) ? userData.weekFeedback : [];
      const res = await refreshWeeklyPlan(profile, feedback);
      setReviewData(res);
    } catch (e) {
      console.error(e);
      Alert.alert('Could not build your new plan', e?.message?.includes('limit')
        ? "You've refreshed your plan already this week. Try again next week."
        : 'Something went wrong. Please try again.');
      setReviewOpen(false);
    } finally {
      setReviewLoading(false);
    }
  };

  // Approve the adapted plan: swap it in, stamp the review, and clear the feedback
  // log so the card doesn't fire again until a fresh week accumulates.
  const applyNewPlan = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !reviewData?.weeklyPlan) return;
    const nowIso = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'users', uid), {
        'practicePlan.weeklyPlan': reviewData.weeklyPlan,
        planGeneratedAt: nowIso,
        lastWeekReviewAt: nowIso,
        weekFeedback: [],
      });
      setPlan(reviewData.weeklyPlan);
      setSessions(reviewData.weeklyPlan[TODAY_NAME]?.sessions || []);
      setUserData(p => ({ ...p, practicePlan: { ...(p?.practicePlan || {}), weeklyPlan: reviewData.weeklyPlan }, lastWeekReviewAt: nowIso, weekFeedback: [] }));
      setReviewOpen(false);
      Alert.alert('Plan updated 🎸', 'Your new week is ready — tuned to your feedback.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', "Couldn't save your new plan. Please try again.");
    }
  };

  // Keep the current plan but stamp the review so the card stops nagging this week.
  const keepPlan = async () => {
    const uid = auth.currentUser?.uid;
    setReviewOpen(false);
    if (!uid) return;
    const nowIso = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'users', uid), { lastWeekReviewAt: nowIso });
      setUserData(p => ({ ...p, lastWeekReviewAt: nowIso }));
    } catch { /* non-critical */ }
  };

  // Daily challenge — banks bonus points and counts as activity for the day, so
  // it keeps the streak alive even without a full session (the "streak-saver").
  const handleCompleteChallenge = async () => {
    if (challengeDoneToday) return;
    track('challenge_completed');
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
        provaScore: typeof userData?.provaScore === 'number' ? increment(CHALLENGE_POINTS) : newScore,
        lastChallengeDate: now.toISOString(),
        lastSessionDate: now.toISOString(), // counts as activity → preserves streak
        streak: newStreak,
      };
      await updateDoc(doc(db, 'users', uid), updates);
      setUserData((p) => ({ ...p, ...updates }));

      const newRank = scoreRank(newScore);
      celebrate({
        points: CHALLENGE_POINTS,
        title: rankedUp ? `New rank: ${newRank.name}!` : 'Challenge complete!',
        subtitle: 'Prova points',
        emoji: rankedUp ? newRank.emoji : '🔥',
        streak: newStreak > 1 ? newStreak : 0,
      });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', "Couldn't save your challenge. Please try again.");
    }
  };

  // Bank a lap of practice on a teacher-assigned task: award time-proportional
  // points for the minutes just practiced, accumulate the task's totals, and
  // write back so the teacher + class scoreboard see the progress.
  const bankTeacherTask = async (taskId, lapSeconds, { silent = false } = {}) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return 0;
    const pts = teacherTaskPoints(lapSeconds);
    let finished = false;
    const next = (userData?.assignedTasks || []).map((t) => {
      if (t.id !== taskId) return t;
      const target = (t.durationMin || 0) * 60;
      const practicedSec = (t.practicedSec || 0) + Math.round(lapSeconds);
      // A timed task is "done" once its set time has been practised — it then
      // drops off Today (kept in the doc as completed so the teacher still sees
      // it). A task with no timer never auto-completes: it stays as open-ended
      // practice the student can repeat.
      finished = target > 0 && practicedSec >= target;
      return {
        ...t,
        completed: finished,
        completedAt: finished ? new Date().toISOString() : (t.completedAt || null),
        practicedSec,
        pointsEarned: (t.pointsEarned || 0) + pts,
        timesCompleted: (t.timesCompleted || 0) + 1,
      };
    });
    // Teacher-task time is REAL practice: feed the same minutes/streak stats
    // the plan sessions use, so parent reports, Progress charts and the
    // teacher's Pulse see it (previously it awarded points only — a student
    // doing all their assigned work showed "0m practiced" with a dead streak).
    const mins = Math.round(lapSeconds / 60);
    if (mins > 0) track('teacher_task_banked', { minutes: mins });
    const activity = mins > 0 ? practiceStreakUpdates(userData) : null;
    const newScore = displayScore(userData) + pts;
    setUserData((p) => ({
      ...p, assignedTasks: next, provaScore: newScore,
      ...(activity ? { ...activity, totalMinutes: (p?.totalMinutes || 0) + mins } : {}),
    }));
    try {
      await updateDoc(doc(db, 'users', uid), {
        assignedTasks: next,
        ...(activity ? { ...activity, totalMinutes: increment(mins) } : {}),
        provaScore: typeof userData?.provaScore === 'number' ? increment(pts) : newScore,
      });
      if (mins > 0) logPracticeMinutes(uid, mins, 'teacher');
    } catch (e) {
      Alert.alert('Error', "Couldn't save. Please try again.");
    }
    if (!silent) {
      if (finished) {
        celebrate({ points: pts, title: 'Task complete!', subtitle: "Off your list", emoji: '⭐' });
      } else if (pts > 0) {
        celebrate({ points: pts, title: 'Nice work!', subtitle: 'Practice again to earn more', emoji: '⭐' });
      }
    }
    return pts;
  };

  // Record/pick a short clip as proof a teacher task was practiced. A task can
  // hold SEVERAL clips (`proofs` array): mode 'add' appends, 'replace' swaps
  // the latest. proofUrl/proofType always mirror the newest clip so everything
  // reading the single-clip fields keeps working; a new upload clears teacher
  // verification so the fresh clip gets re-checked.
  const runProofUpload = async (taskId, getMedia, mode = 'add', fromCamera = false) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setProofBusyId(taskId);
    let rollSaved = false;
    try {
      const picked = await getMedia();
      if (!picked) { setProofBusyId(null); return; }
      if (picked.error) { Alert.alert('Proof', picked.error); setProofBusyId(null); return; }
      // Recorded in Prova → also save the clip to the camera roll, so the
      // student keeps their own copy (best-effort; skipped if declined).
      // iOS "limited" photo access still allows adding new items.
      if (fromCamera) {
        try {
          const perm = await MediaLibrary.requestPermissionsAsync(true); // write-only access
          if (perm.granted || perm.accessPrivileges === 'limited') {
            await MediaLibrary.saveToLibraryAsync(picked.uri);
            rollSaved = true;
          }
        } catch (e) { /* never block the upload on this */ }
      }
      setProofPct(0);
      // Report each phase to the button so a stall shows WHICH step is stuck
      // (Checking / Preparing / Uploading / Saving) instead of a blank spinner.
      const onStep = (s) => { setProofStep(s); if (s !== 'Uploading…') setProofPct(null); };
      const url = await uploadProofMedia(picked.uri, uid, picked.type, setProofPct, onStep);
      const next = (userData?.assignedTasks || []).map((t) => {
        if (t.id !== taskId) return t;
        const existing = Array.isArray(t.proofs) && t.proofs.length > 0
          ? t.proofs
          : (t.proofUrl ? [{ url: t.proofUrl, type: t.proofType || 'video', at: t.proofAt || null }] : []);
        const clip = { url, type: picked.type, at: new Date().toISOString() };
        const proofs = mode === 'replace' && existing.length > 0
          ? [...existing.slice(0, -1), clip]
          : [...existing, clip];
        return { ...t, proofs, proofUrl: clip.url, proofType: clip.type, proofAt: clip.at, proofVerified: false };
      });
      setUserData((p) => ({ ...p, assignedTasks: next }));
      await updateDoc(doc(db, 'users', uid), { assignedTasks: next });
      Alert.alert(
        'Proof submitted 🎥',
        `Your teacher can now review it.${fromCamera ? (rollSaved ? ' The clip was saved to your camera roll too.' : " (Couldn't save a copy to your camera roll.)") : ''}`
      );
    } catch (e) {
      // Show the real reason — "storage/unauthorized" etc. tells us whether
      // it's rules, size, or network, instead of a dead-end generic message.
      const detail = e?.friendly
        ? e.message
        : `Couldn't upload your clip.\n${e?.code || e?.message || 'Unknown error'}`;
      Alert.alert('Upload failed', detail);
    } finally {
      setProofBusyId(null);
      setProofPct(null);
      setProofStep(null);
    }
  };

  const attachProof = (taskId) => {
    const task = (userData?.assignedTasks || []).find((x) => x.id === taskId);
    const pickSource = (mode) => {
      // Browsers can't hand us a camera recorder — go straight to the file
      // picker on web (which offers the camera anyway on tablets/phones).
      if (Platform.OS === 'web') { runProofUpload(taskId, pickMedia, mode); return; }
      Alert.alert(
        mode === 'replace' ? 'Replace your latest video' : 'Add proof of practice',
        'Show your teacher you practiced this.',
        [
          { text: 'Record now', onPress: () => runProofUpload(taskId, captureMedia, mode, true) },
          { text: 'Choose from library', onPress: () => runProofUpload(taskId, pickMedia, mode) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    };
    if (!task?.proofUrl) { pickSource('add'); return; }
    Alert.alert('Proof of practice', 'Add another video, or replace your latest one?', [
      { text: 'Add another', onPress: () => pickSource('add') },
      { text: 'Replace latest', onPress: () => pickSource('replace') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const viewProof = (task) => {
    if (task.proofUrl) setProofView({ url: task.proofUrl, type: task.proofType || 'video', proofs: task.proofs, taskId: task.id });
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
    setTaskWatch(s); // in-app player handles both a YouTube URL and a search phrase
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
  // activity marker so practicing today continues the chain instead of resetting.
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
      celebrate({ title: 'Streak restored!', emoji: '🔥', subtitle: 'Practice today to keep it going', streak: userData?.streak || 0 });
    } catch (e) {
      Alert.alert('Error', "Couldn't restore your streak. Please try again.");
    }
  };

  const isToday = selectedDay === TODAY_NAME;
  const assignedTasks = userData?.assignedTasks || [];
  // Separate one-to-one teacher tasks from class-assigned ones (which carry a
  // classId/className), so the student can tell them apart.
  // Completed tasks disappear from the student's list to keep it from piling up
  // (they stay in the doc as `completed` for the teacher's dashboard/proof).
  const soloTasks = assignedTasks.filter((t) => !t.classId && !t.completed);
  const classGroups = [];
  assignedTasks.filter((t) => t.classId && !t.completed).forEach((t) => {
    const key = t.className || 'Class';
    let g = classGroups.find((x) => x.key === key);
    if (!g) { g = { key, name: key, tasks: [] }; classGroups.push(g); }
    g.tasks.push(t);
  });

  const selectedSessions = isToday ? sessions : (plan?.[selectedDay]?.sessions || []);
  // A student account is free and has no AI plan unless they opt in. Distinguish
  // "no plan at all" from a genuine rest day inside an existing plan.
  const hasPlan = !!plan && Object.keys(plan).length > 0;
  // Teacher/class tasks count as exercises in the summary alongside plan
  // sessions. A completed task only counts if it was finished TODAY (completed
  // tasks stay on the doc forever for the teacher's dashboard). Only tasks
  // with a set time add to the planned minutes — open-ended ones add nothing.
  const tasksDoneToday = assignedTasks.filter((t) => t.completed && t.completedAt
    && new Date(t.completedAt).toDateString() === new Date().toDateString());
  const openTasks = assignedTasks.filter((t) => !t.completed);
  const exerciseCount = sessions.length + openTasks.length + tasksDoneToday.length;
  const doneCount = completedIds.length + tasksDoneToday.length;
  const totalMins = sessions.reduce((s, x) => s + (x.duration || 0), 0)
    + [...openTasks, ...tasksDoneToday].reduce((s, t) => s + (t.durationMin || 0), 0);
  // Minutes practised today = summed duration of everything completed so far.
  const practisedMins = sessions.reduce((s, x) => s + (completedIds.includes(x.id) ? (x.duration || 0) : 0), 0)
    + tasksDoneToday.reduce((s, t) => s + (t.durationMin || 0), 0);
  const progress = exerciseCount > 0 ? doneCount / exerciseCount : 0;
  // Show the "review today" entry point once every session is done but the day
  // hasn't been closed out yet (covers re-opening + finishing in the Practice tab).
  const allSessionsDone = sessions.length > 0 && sessions.every(s => completedIds.includes(s.id));
  const finalizedToday = userData?.lastSessionDate ? new Date(userData.lastSessionDate).toDateString() === new Date().toDateString() : false;
  const showRateToday = isToday && allSessionsDone && !finalizedToday;
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const songOfTheDay = getDailySong(userData?.instrument, userData?.level);

  // ── Guided practice player ──────────────────────────────────────────────────
  // Everything still to do today, normalized into one queue: plan sessions
  // first (in plan order), then teacher tasks (solo + class). The player is the
  // ONLY place with a practice timer; cards/rows just open it. Completed tasks
  // are excluded, so a fresh run always starts at the first uncompleted task.
  const playerQueue = [
    ...sessions
      .filter((s) => !completedIds.includes(s.id))
      .map((s) => ({
        id: `s_${s.id}`,
        kind: 'session',
        sessionId: s.id,
        title: s.title,
        description: s.description,
        category: s.category,
        targetSec: (s.duration || 0) * 60,
        priorSec: 0,
        watch: s.reference || `${s.title} ${userData?.instrument || 'guitar'} lesson`,
      })),
    ...assignedTasks
      .filter((t) => !t.completed)
      .map((t) => ({
        id: `t_${t.id}`,
        kind: 'teacher',
        taskId: t.id,
        title: t.title,
        description: t.description,
        targetSec: (t.durationMin || 0) * 60,
        priorSec: t.practicedSec || 0,
        watch: t.youtube || '',
        song: t.song || '',
        proofUrl: t.proofUrl,
        proofVerified: t.proofVerified,
      })),
  ];
  const openPlayerAt = (id) => { setPlayerStartId(id || null); setPlayerVisible(true); track('practice_started'); };
  const anyDoneToday = completedIds.length > 0;

  // Mid-run progress (each task's clock + which task was open) persists across
  // closing the player AND the app, so exiting never loses practiced time. The
  // player reports every change; stored per day in AsyncStorage.
  const progressKey = `prova_player_progress_${auth.currentUser?.uid || ''}`;
  const saveProgress = (p) => {
    const next = p ? { date: new Date().toDateString(), ...p } : null;
    setPlayerProgress(next);
    (next ? AsyncStorage.setItem(progressKey, JSON.stringify(next)) : AsyncStorage.removeItem(progressKey)).catch(() => {});
  };
  const progressToday = playerProgress?.date === new Date().toDateString() ? playerProgress : null;
  // Resume rule (Ethan's): reopen at the task the student exited from if it's
  // unfinished. Completing a task records the NEXT one as the position, so
  // closing right after a Done resumes at that next task. Anything else (ran
  // to the end, set songs) starts from the first still-to-do task in plan
  // order — no jumping back to old partial clocks; their time stays saved.
  const resumeId = (progressToday?.lastItemId && playerQueue.some((q) => q.id === progressToday.lastItemId))
    ? progressToday.lastItemId
    : null;
  const hasStartedToday = anyDoneToday || !!resumeId;
  const startLabel = hasStartedToday ? 'Resume practice' : 'Start practice';

  // ── Pre-Gig set rehearsal ───────────────────────────────────────────────────
  // A gig within 14 days that has a setlist attached: pressing Start practice
  // first asks "practice your set first?" — opt-in, the student picks the song.
  const preGigSetlist = (() => {
    const gigs = Array.isArray(userData?.gigs) ? userData.gigs : [];
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const soon = gigs
      .map((g) => ({ g, days: Math.round((new Date(`${g.date}T00:00:00`) - midnight) / 86400000) }))
      .filter((x) => x.days >= 0 && x.days <= 14 && x.g.setlistId)
      .sort((a, b) => a.days - b.days)[0];
    if (!soon) return null;
    const setlist = (userData?.setlists || []).find((s) => s.id === soon.g.setlistId);
    return setlist && setlist.songs?.length > 0 ? { gig: soon.g, days: soon.days, setlist } : null;
  })();

  // Fresh runs get the ask; resuming mid-task goes straight back in.
  const openPlayerMaybeAsk = () => {
    if (!resumeId && preGigSetlist) { setPickSetlistId(null); setSetlistAsk('ask'); }
    else openPlayerAt(resumeId);
  };

  // Which setlist the picker is showing: the gig's linked one by default, but
  // the student can switch to ANY of their setlists from inside the sheet.
  const rehearsableSetlists = (userData?.setlists || []).filter((s) => s.songs?.length > 0);
  const activePickSetlist = rehearsableSetlists.find((s) => s.id === pickSetlistId)
    || preGigSetlist?.setlist
    || rehearsableSetlists[0]
    || null;

  // Rehearsing a setlist song = an open-ended player task that banks points for
  // the real time practiced (same rate as everything else).
  const startGigSong = (song) => {
    setGigSongItem({
      id: `gig_${song.id || song.title}`,
      kind: 'gigsong',
      title: song.title,
      description: [
        song.artist ? `by ${song.artist}` : null,
        `From your “${activePickSetlist?.name || 'setlist'}” set — run it like it's the gig.`,
      ].filter(Boolean).join('  ·  '),
      category: 'repertoire',
      targetSec: 0,
      priorSec: 0,
      watch: `${song.title} ${song.artist || ''} ${userData?.instrument || 'guitar'} lesson`,
    });
    // The player opens from the sheet's onClosed — never while it's dismissing.
    pendingPlayerRef.current = `gig_${song.id || song.title}`;
    setSetlistAsk(null);
  };

  const bankGigSong = async (sec) => {
    const uid = auth.currentUser?.uid;
    const pts = Math.round((sec / 60) * POINTS_PER_MIN);
    if (!uid || pts <= 0) return 0;
    try {
      await updateDoc(doc(db, 'users', uid), {
        provaScore: typeof userData?.provaScore === 'number' ? increment(pts) : (displayScore(userData) + pts),
      });
      setUserData((u) => (u ? { ...u, provaScore: (u.provaScore || 0) + pts } : u));
    } catch (e) { /* best-effort */ }
    return pts;
  };

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
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Bell — gig invites + teacher updates land here. Absolute positioning
          ignores the SafeAreaView's padding, so offset by the real inset. */}
      <TouchableOpacity
        style={[styles.bellBtn, { top: insets.top + 10 }]}
        onPress={() => navigation.navigate('Notifications')}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <Ionicons name={unreadCount > 0 ? 'notifications' : 'notifications-outline'} size={22} color={unreadCount > 0 ? COLORS.primary : COLORS.textSecondary} />
        {unreadCount > 0 && (
          <View style={styles.bellDot}>
            <Text style={styles.bellDotText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>
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

        {weekReviewDue(userData) && (
          <TouchableOpacity style={styles.reviewCard} onPress={openReview} activeOpacity={0.85}>
            <View style={styles.reviewIcon}>
              <Ionicons name="sparkles" size={18} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.reviewTitle}>Your week in review</Text>
              <Text style={styles.reviewSub} numberOfLines={2}>Prova can adapt next week's plan to your feedback.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
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

        {/* Today's progress — one cohesive summary card. Everything to do today
            counts: plan sessions AND teacher/class tasks, so free students with
            only assigned work get the same card. */}
        {isToday && exerciseCount > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryStats}>
              {[
                { value: practisedMins, suffix: totalMins > 0 ? ` /${totalMins}` : null, label: 'MINUTES' },
                { value: exerciseCount, label: 'EXERCISES' },
                { value: doneCount, label: 'DONE' },
              ].map((stat, i) => (
                <React.Fragment key={stat.label}>
                  {i > 0 && <View style={styles.summaryDivider} />}
                  <View style={styles.summaryStat}>
                    <Text style={styles.summaryStatValue}>
                      {stat.value}{stat.suffix ? <Text style={styles.summaryStatSuffix}>{stat.suffix}</Text> : null}
                    </Text>
                    <Text style={styles.summaryStatLabel}>{stat.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressLabel}>
              {doneCount} of {exerciseCount} completed · {Math.round(progress * 100)}%
            </Text>
            {playerQueue.length > 0 && (
              <TouchableOpacity style={styles.startPracticeBtn} onPress={openPlayerMaybeAsk} activeOpacity={0.85}>
                <Ionicons name="play" size={18} color={COLORS.text} />
                <Text style={styles.startPracticeText}>{startLabel}</Text>
              </TouchableOpacity>
            )}
            {preGigSetlist && (
              <TouchableOpacity style={styles.setlistLink} onPress={() => { setPickSetlistId(null); setSetlistAsk('pick'); }} activeOpacity={0.7}>
                <Ionicons name="musical-notes-outline" size={13} color={COLORS.primary} />
                <Text style={styles.setlistLinkText}>Practice setlist</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Ask Prova — a separate card, sitting below the start-practice box */}
        {isToday && (
          <TouchableOpacity style={styles.askCard} activeOpacity={0.85} onPress={() => navigation.navigate('AskProva')}>
            <View style={styles.askIcon}>
              <Ionicons name="sparkles" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.askTitle}>Ask Prova</Text>
              <Text style={styles.askSub} numberOfLines={1}>Your AI coach — ask anything about playing</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
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
                <Text style={styles.challengeTitle} numberOfLines={challengeOpen ? undefined : 2}>{dailyChallenge.title}</Text>
              </View>
              {challengeDoneToday
                ? <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                : <Text style={styles.challengePts}>+{CHALLENGE_POINTS} pts</Text>}
              <Ionicons name={challengeOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
            {challengeOpen && (
              <>
                <Text style={styles.challengeDetail}>{dailyChallenge.detail}</Text>
                <ReferenceLink reference={`${dailyChallenge.title} ${userData?.instrument || 'guitar'} lesson`} label={dailyChallenge.title} />
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
        {showRateToday && (
          <TouchableOpacity style={styles.rateTodayCard} onPress={openDayReview} activeOpacity={0.85}>
            <Ionicons name="clipboard-outline" size={18} color={COLORS.accent} />
            <Text style={styles.rateTodayText}>All done — tell Prova how today went</Text>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
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
              completed={completedIds.includes(session.id)}
              onPractice={(s) => openPlayerAt(`s_${s.id}`)}
            />
          ))
        ) : (
          selectedSessions.map((session, i) => (
            <PlanCard key={session.id || i} session={session} />
          ))
        )}

        {/* One-to-one tasks from the teacher (collapsible, like the class cards) */}
        {isToday && (soloTasks.length > 0 || nextLesson || lastAttended || userData?.teacherUid) && (
          <View style={[styles.teacherCard, { marginTop: SPACING.sm }]}>
            <TouchableOpacity style={[styles.teacherHeader, !soloOpen && { marginBottom: 0 }]} onPress={() => setSoloOpen((o) => !o)} activeOpacity={0.7}>
              <Ionicons name="school" size={16} color={COLORS.primary} />
              <Text style={[styles.teacherKicker, { flex: 1 }]}>FROM YOUR TEACHER</Text>
              {userData?.teacherUid && <NotesChip onPress={() => navigation.navigate('LessonNotes')} />}
              {soloTasks.length > 0 && <Text style={styles.classGroupSub}>{soloTasks.length} to do</Text>}
              <Ionicons name={soloOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
            {soloOpen && nextLesson && (
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
            {soloOpen && lastAttended && (
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
            {soloOpen && soloTasks.length > 0 && (
              <View style={styles.taskGroup}>
                {soloTasks.map((t, i) => (
                  <TeacherTaskCard
                    key={t.id}
                    task={t}
                    topDivider={i > 0}
                    expanded={expandedTask === t.id}
                    onToggle={() => setExpandedTask(expandedTask === t.id ? null : t.id)}
                    onPractice={(t) => openPlayerAt(`t_${t.id}`)}
                    openTaskLink={openTaskLink}
                    onOpenSong={openSongInLibrary}
                    onAttachProof={attachProof}
                    onViewProof={viewProof}
                    proofBusy={proofBusyId === t.id}
                    proofPct={proofBusyId === t.id ? proofPct : null}
                    proofStep={proofBusyId === t.id ? proofStep : null}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Class-assigned tasks, grouped per class with a collapsible header */}
        {isToday && classGroups.map((g) => {
          const collapsed = collapsedGroups.has(g.key);
          return (
            <View key={g.key} style={styles.teacherCard}>
              <TouchableOpacity style={[styles.classGroupHeader, collapsed && { marginBottom: 0 }]} onPress={() => toggleGroup(g.key)} activeOpacity={0.7}>
                <Ionicons name="people" size={16} color={COLORS.accent || COLORS.primary} />
                <Text style={[styles.classGroupKicker, { flex: 1 }]} numberOfLines={1}>{g.name.toUpperCase()}</Text>
                <Text style={styles.classGroupSub}>{g.tasks.length} to do</Text>
                <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} color={COLORS.textMuted} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
              {!collapsed && g.tasks.length > 0 && (
                <View style={styles.taskGroup}>
                  {g.tasks.map((t, i) => (
                    <TeacherTaskCard
                      key={t.id}
                      task={t}
                      topDivider={i > 0}
                      expanded={expandedTask === t.id}
                      onToggle={() => setExpandedTask(expandedTask === t.id ? null : t.id)}
                      onPractice={(t) => openPlayerAt(`t_${t.id}`)}
                      openTaskLink={openTaskLink}
                      onOpenSong={openSongInLibrary}
                      onAttachProof={attachProof}
                      onViewProof={viewProof}
                      proofBusy={proofBusyId === t.id}
                      proofPct={proofBusyId === t.id ? proofPct : null}
                      proofStep={proofBusyId === t.id ? proofStep : null}
                    />
                  ))}
                </View>
              )}
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
              <Ionicons name="musical-notes" size={20} color={COLORS.primary} />
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
            colors={[COLORS.primary + '3D', (COLORS.accent || '#06B6D4') + '1A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.upgradeHero}
          >
            <View style={styles.upgradeBadge}><Ionicons name="sparkles" size={20} color={COLORS.primary} /></View>
            <Text style={styles.upgradeTitle}>Unlock your own AI plan</Text>
            <Text style={styles.upgradeSub}>Your teacher’s tasks and the daily challenge are free — get a personalised plan that adapts to you with Personal.</Text>
            <TouchableOpacity style={styles.upgradeBtn} onPress={promptUpgrade} activeOpacity={0.85}>
              <Ionicons name="star" size={15} color={COLORS.text} />
              <Text style={styles.upgradeBtnText}>Upgrade to Personal</Text>
            </TouchableOpacity>
          </LinearGradient>
        )}

      </ScrollView>

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
            {proofView ? (() => {
              // Page through every clip attached to this task.
              const clips = Array.isArray(proofView.proofs) && proofView.proofs.length > 0
                ? proofView.proofs
                : [{ url: proofView.url, type: proofView.type }];
              const cur = clips[Math.min(proofIdx, clips.length - 1)];
              return (
                <>
                  <ProofMedia key={cur.url} url={cur.url} type={cur.type || 'video'} style={styles.proofMedia} />
                  {clips.length > 1 && (
                    <View style={styles.proofPager}>
                      <TouchableOpacity onPress={() => setProofIdx((i) => Math.max(0, i - 1))} disabled={proofIdx === 0} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="chevron-back-circle" size={26} color={proofIdx === 0 ? COLORS.border : COLORS.text} />
                      </TouchableOpacity>
                      <Text style={styles.proofPagerText}>{Math.min(proofIdx, clips.length - 1) + 1} of {clips.length}</Text>
                      <TouchableOpacity onPress={() => setProofIdx((i) => Math.min(clips.length - 1, i + 1))} disabled={proofIdx >= clips.length - 1} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="chevron-forward-circle" size={26} color={proofIdx >= clips.length - 1 ? COLORS.border : COLORS.text} />
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              );
            })() : null}
            <TouchableOpacity style={styles.proofCloseBtn} onPress={() => setProofView(null)} activeOpacity={0.85}>
              <Ionicons name="close" size={20} color="#fff" />
              <Text style={styles.proofCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <YouTubePlayerModal
        visible={!!taskWatch}
        query={taskWatch}
        title="Watch"
        onClose={() => setTaskWatch(null)}
      />

      {/* Guided practice player — the one place practicing happens */}
      <PracticePlayer
        visible={playerVisible}
        queue={gigSongItem ? [gigSongItem, ...playerQueue] : playerQueue}
        startId={playerStartId}
        savedElapsed={progressToday?.elapsedById || {}}
        onProgress={saveProgress}
        onBankSong={bankGigSong}
        streak={userData?.streak || 0}
        allSessionsDone={sessions.length > 0 && sessions.every((s) => completedIds.includes(s.id))}
        onCompleteSession={(sessionId) => handleComplete(sessionId, { silent: true })}
        onBankTeacher={(taskId, sec) => bankTeacherTask(taskId, sec, { silent: true })}
        onAttachProof={attachProof}
        proofBusyId={proofBusyId}
        proofPct={proofPct}
        proofStep={proofStep}
        onClose={() => { setPlayerVisible(false); setGigSongItem(null); }}
        onGigSongEnd={() => {
          // Back to the song picker so they choose: another song, or the tasks.
          setPlayerVisible(false);
          setGigSongItem(null);
          setTimeout(() => setSetlistAsk('pick'), 450); // wait out the player's dismissal (one modal at a time)
        }}
        onFinishReview={() => {
          setPlayerVisible(false);
          setGigSongItem(null);
          setTimeout(openDayReview, 400); // let the player dismiss before the sheet slides up
        }}
      />

      {/* Pre-gig: "practice your set first?" → pick a song from the setlist */}
      <SheetModal
        visible={!!setlistAsk}
        onRequestClose={() => setSetlistAsk(null)}
        cardStyle={styles.gigAskCard}
        dismissOnBackdrop
        onClosed={() => {
          const p = pendingPlayerRef.current;
          pendingPlayerRef.current = null;
          if (p) openPlayerAt(p === '__default__' ? null : p);
        }}
      >
        {setlistAsk === 'pick' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.gigAskTitle, { flex: 1 }]}>Pick a song to rehearse</Text>
              {rehearsableSetlists.length > 1 && (
                <TouchableOpacity style={styles.changeSetlistBtn} onPress={() => setSetlistAsk('lists')} activeOpacity={0.8}>
                  <Ionicons name="swap-horizontal" size={14} color={COLORS.primary} />
                  <Text style={styles.changeSetlistText}>Setlists</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.gigAskSub}>From “{activePickSetlist?.name}” — the clock runs and it counts for points.</Text>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {(activePickSetlist?.songs || []).map((s, i) => (
                <TouchableOpacity key={s.id || i} style={styles.gigSongRow} onPress={() => startGigSong(s)} activeOpacity={0.7}>
                  <Text style={styles.gigSongNum}>{i + 1}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.gigSongTitle} numberOfLines={1}>{s.title}</Text>
                    {!!s.artist && <Text style={styles.gigSongArtist} numberOfLines={1}>{s.artist}</Text>}
                  </View>
                  <Ionicons name="play-circle" size={22} color={COLORS.primary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.gigAskSkip} onPress={() => { pendingPlayerRef.current = '__default__'; setSetlistAsk(null); }} activeOpacity={0.7}>
              <Text style={styles.gigAskSkipText}>Skip to today's tasks</Text>
            </TouchableOpacity>
          </>
        ) : setlistAsk === 'lists' ? (
          <>
            <Text style={styles.gigAskTitle}>Your setlists</Text>
            <Text style={styles.gigAskSub}>Pick which set to rehearse from.</Text>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {rehearsableSetlists.map((s) => (
                <TouchableOpacity key={s.id} style={styles.gigSongRow} onPress={() => { setPickSetlistId(s.id); setSetlistAsk('pick'); }} activeOpacity={0.7}>
                  <Ionicons name="albums-outline" size={18} color={COLORS.primary} style={{ width: 20, textAlign: 'center' }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.gigSongTitle} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.gigSongArtist}>
                      {s.songs.length} song{s.songs.length === 1 ? '' : 's'}{activePickSetlist?.id === s.id ? '  ·  current' : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.gigAskSkip} onPress={() => setSetlistAsk('pick')} activeOpacity={0.7}>
              <Text style={styles.gigAskSkipText}>Back</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.gigAskKicker}>
              🎸 {(preGigSetlist?.gig.name || 'YOUR GIG').toUpperCase()} · {preGigSetlist?.days === 0 ? 'TODAY' : preGigSetlist?.days === 1 ? 'TOMORROW' : `IN ${preGigSetlist?.days} DAYS`}
            </Text>
            <Text style={styles.gigAskTitle}>Practice your set first?</Text>
            <Text style={styles.gigAskSub}>Rehearse songs from “{preGigSetlist?.setlist.name}” before today's tasks.</Text>
            <View style={styles.gigAskBtns}>
              <TouchableOpacity style={styles.gigAskNo} onPress={() => { pendingPlayerRef.current = '__default__'; setSetlistAsk(null); }} activeOpacity={0.85}>
                <Text style={styles.gigAskNoText}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.gigAskYes} onPress={() => { setPickSetlistId(null); setSetlistAsk('pick'); }} activeOpacity={0.85}>
                <Ionicons name="musical-notes" size={16} color={COLORS.text} />
                <Text style={styles.gigAskYesText}>Practice my set</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </SheetModal>

      {/* End-of-day review — rate every task in one place, then Submit */}
      <SheetModal visible={dayReviewOpen} onRequestClose={skipDayReview} cardStyle={styles.drSheet} keyboardAvoiding>
            <View style={styles.drHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.drTitle}>How did today go?</Text>
                <Text style={styles.drSubtitle}>Rate each task so Prova can shape next week. Optional — skip any.</Text>
              </View>
              <TouchableOpacity onPress={skipDayReview} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: SPACING.sm }} keyboardShouldPersistTaps="handled">
              {sessions.map((s) => (
                <View key={s.id} style={styles.drRow}>
                  <Text style={styles.drRowTitle} numberOfLines={1}>{s.title}</Text>
                  <View style={styles.drOptRow}>
                    {DIFF_OPTS.map((opt) => {
                      const on = dayRatings[s.id] === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          style={[styles.drOpt, on && styles.drOptOn]}
                          onPress={() => setDayRatings((prev) => ({ ...prev, [s.id]: prev[s.id] === opt.key ? undefined : opt.key }))}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.drOptText, on && styles.drOptTextOn]}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}

              <Text style={styles.drNoteLabel}>Anything to add? (optional)</Text>
              <TextInput
                style={styles.drNote}
                placeholder="e.g. want more improv, the warmups feel repetitive…"
                placeholderTextColor={COLORS.textMuted}
                value={dayNote}
                onChangeText={setDayNote}
                multiline
              />
            </ScrollView>

            <TouchableOpacity style={styles.drSubmit} onPress={submitDayReview} activeOpacity={0.85}>
              <Text style={styles.drSubmitText}>Submit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.drSkip} onPress={skipDayReview} activeOpacity={0.7}>
              <Text style={styles.drSkipText}>Skip for today</Text>
            </TouchableOpacity>
      </SheetModal>

      {/* Week in review — preview the adapted plan and approve or keep current */}
      <SheetModal visible={reviewOpen} onRequestClose={() => setReviewOpen(false)} cardStyle={styles.reviewSheet}>
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewSheetTitle}>Your week in review</Text>
              <TouchableOpacity onPress={() => setReviewOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {reviewLoading ? (
              <View style={styles.reviewLoading}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.reviewLoadingText}>Reading your week and adapting your plan…</Text>
              </View>
            ) : reviewData ? (
              <>
                <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: SPACING.md }}>
                  <View style={styles.reviewSummaryBox}>
                    <Ionicons name="sparkles" size={16} color={COLORS.primary} />
                    <Text style={styles.reviewSummaryText}>{reviewData.changeSummary}</Text>
                  </View>
                  <Text style={styles.reviewPreviewLabel}>NEXT WEEK'S PLAN</Text>
                  {DAY_ORDER.map((day) => {
                    const ses = reviewData.weeklyPlan?.[day]?.sessions;
                    if (!Array.isArray(ses) || ses.length === 0) return null;
                    return (
                      <View key={day} style={styles.reviewDay}>
                        <Text style={styles.reviewDayName}>{day.charAt(0).toUpperCase() + day.slice(1)}</Text>
                        {ses.map((s, i) => (
                          <Text key={i} style={styles.reviewSession} numberOfLines={1}>• {s.title} <Text style={styles.reviewSessionMin}>{s.duration}m</Text></Text>
                        ))}
                      </View>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity style={styles.reviewApplyBtn} onPress={applyNewPlan} activeOpacity={0.85}>
                  <Text style={styles.reviewApplyText}>Use this plan</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.reviewKeepBtn} onPress={keepPlan} activeOpacity={0.7}>
                  <Text style={styles.reviewKeepText}>Keep my current plan</Text>
                </TouchableOpacity>
              </>
            ) : null}
      </SheetModal>
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
  startPracticeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, marginTop: SPACING.md,
  },
  startPracticeText: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  gigAskCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: SPACING.xxl },
  gigAskKicker: { color: COLORS.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: SPACING.xs },
  gigAskTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginBottom: 4 },
  gigAskSub: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: SPACING.lg },
  gigAskBtns: { flexDirection: 'row', gap: SPACING.sm },
  gigAskNo: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  gigAskNoText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700' },
  gigAskYes: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: 14, backgroundColor: COLORS.primary },
  gigAskYesText: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  gigSongRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  gigSongNum: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700', width: 20, textAlign: 'center' },
  gigSongTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  gigSongArtist: { color: COLORS.textMuted, fontSize: 12, marginTop: 1 },
  gigAskSkip: { alignItems: 'center', paddingVertical: 14, marginTop: SPACING.xs },
  gigAskSkipText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
  bellBtn: { position: 'absolute', right: SPACING.xl, zIndex: 10 },
  setlistLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, marginTop: 12 },
  setlistLinkText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  changeSetlistBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: COLORS.primary + '55' },
  changeSetlistText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  bellDot: { position: 'absolute', top: -5, right: -7, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  bellDotText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  practiceThisBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.primaryDark, borderRadius: 12, paddingVertical: 12, marginTop: SPACING.md,
  },
  practiceThisText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  summaryStats: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 32, backgroundColor: COLORS.border },
  summaryStatValue: { color: COLORS.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summaryStatSuffix: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
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
  classGroupKicker: { color: COLORS.accent || COLORS.primary, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  classGroupSub: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', marginTop: 1 },
  // Tasks live flush inside one grouped inset panel (taskGroup); each row is
  // full-width with a hairline between rows, iOS-grouped-list style.
  taskGroup: {
    backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border + '66',
    marginTop: SPACING.sm, overflow: 'hidden',
    // Stretch past the parent card's padding so tasks get more width.
    marginHorizontal: -(SPACING.lg - SPACING.sm),
  },
  teacherTask: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.md },
  teacherTaskDivider: { borderTopWidth: 1, borderTopColor: COLORS.border + '55' },
  teacherTaskRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, justifyContent: 'space-between' },
  teacherTaskMain: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  teacherTaskTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  teacherTaskDone: { color: COLORS.textMuted },
  // Shared leading-icon slot so every row's text starts in the same column (18 + 6 gap = 24).
  taskLineIcon: { width: 18, textAlign: 'center' },
  teacherTaskDescRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: SPACING.sm },
  teacherTaskDesc: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18 },
  taskFeedback: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: SPACING.sm },
  taskFeedbackText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, fontStyle: 'italic' },
  taskFeedbackMore: { color: COLORS.primary, fontSize: 12, fontWeight: '700', marginTop: 4 },
  teacherTaskLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm },
  teacherTaskLinkText: { color: COLORS.textSecondary, fontSize: 13, textDecorationLine: 'underline', flexShrink: 1 },
  teacherTaskWatchText: { flex: 1, color: COLORS.primary, fontWeight: '600', textDecorationLine: 'none' },
  teacherTaskSongText: { flex: 1, color: COLORS.text, fontWeight: '600', textDecorationLine: 'none' },
  teacherDue: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  teacherDueOverdue: { color: COLORS.error },
  teacherDoneBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 999, paddingHorizontal: SPACING.md, paddingVertical: 8 },
  teacherDoneBtnLocked: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  teacherDoneText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  teacherDoneTextLocked: { color: COLORS.textMuted },
  ttTimer: { marginTop: SPACING.md },
  ttRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  ttTimerText: { color: COLORS.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  ttTimerTarget: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 1 },
  ttDurationLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700', marginLeft: 6 },
  ttLapPts: { color: COLORS.accent, fontSize: 13, fontWeight: '800' },
  ttTimerBtn: { backgroundColor: COLORS.primaryDark, borderRadius: 999, width: 100, justifyContent: 'center', paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  ttTimerBtnActive: { backgroundColor: COLORS.border },
  ttTimerBtnText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  ttBankBtn: { backgroundColor: COLORS.success + '1A', borderRadius: 999, width: 76, justifyContent: 'center', paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 18 },
  ttBankBtnDim: { backgroundColor: COLORS.card },
  ttBankBtnText: { color: COLORS.success, fontSize: 13, fontWeight: '700' },
  ttBankBtnTextDim: { color: COLORS.textMuted },
  teacherEarned: { color: COLORS.success, fontSize: 11, fontWeight: '700', marginTop: 2 },
  scoreboard: { marginTop: SPACING.md, backgroundColor: COLORS.background, borderRadius: 12, padding: SPACING.sm, marginHorizontal: -(SPACING.lg - SPACING.sm) },
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
  refRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.md, paddingVertical: 4 },
  refText: { flex: 1, color: COLORS.primary, fontSize: 13, fontWeight: '600' },
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

  rateTodayCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.accent + '55', padding: SPACING.md, marginBottom: SPACING.md },
  rateTodayText: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '700' },

  drSheet: { backgroundColor: COLORS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.xl + 40, marginBottom: -40, maxHeight: '88%' },
  drHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, marginBottom: SPACING.lg },
  drTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  drSubtitle: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 },
  drRow: { marginBottom: SPACING.md },
  drRowTitle: { color: COLORS.text, fontSize: 14, fontWeight: '600', marginBottom: SPACING.sm },
  drOptRow: { flexDirection: 'row', gap: SPACING.sm },
  drOpt: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  drOptOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  drOptText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  drOptTextOn: { color: '#FFFFFF' },
  drNoteLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: SPACING.sm, marginBottom: SPACING.sm },
  drNote: { backgroundColor: COLORS.surface, borderRadius: 10, color: COLORS.text, fontSize: 14, paddingHorizontal: SPACING.md, paddingVertical: 12, minHeight: 60, textAlignVertical: 'top' },
  drSubmit: { backgroundColor: COLORS.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginTop: SPACING.md },
  drSubmitText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  drSkip: { paddingVertical: SPACING.md, alignItems: 'center' },
  drSkipText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },

  reviewCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.primary + '55', padding: SPACING.md, marginBottom: SPACING.md },
  reviewIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary + '22', alignItems: 'center', justifyContent: 'center' },
  reviewTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  reviewSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 17 },

  reviewSheet: { backgroundColor: COLORS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xl, maxHeight: '86%' },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  reviewSheetTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  reviewLoading: { alignItems: 'center', paddingVertical: SPACING.xxl, gap: SPACING.md },
  reviewLoadingText: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center' },
  reviewSummaryBox: { flexDirection: 'row', gap: SPACING.sm, backgroundColor: COLORS.primary + '18', borderRadius: 12, padding: SPACING.md, marginBottom: SPACING.lg },
  reviewSummaryText: { flex: 1, color: COLORS.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  reviewPreviewLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: SPACING.sm },
  reviewDay: { marginBottom: SPACING.md },
  reviewDayName: { color: COLORS.primary, fontSize: 13, fontWeight: '800', marginBottom: 4 },
  reviewSession: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20 },
  reviewSessionMin: { color: COLORS.textMuted, fontSize: 12 },
  reviewApplyBtn: { backgroundColor: COLORS.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginTop: SPACING.sm },
  reviewApplyText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  reviewKeepBtn: { paddingVertical: SPACING.md, alignItems: 'center' },
  reviewKeepText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },

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
    padding: SPACING.md,
  },
  songIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary + '18',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
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
  lessonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 9, paddingHorizontal: 12, marginTop: SPACING.sm,
    backgroundColor: COLORS.primary + '12', borderRadius: 10,
    marginHorizontal: -(SPACING.lg - SPACING.sm), // full-width like the task group
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
  proofAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: SPACING.md, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.primary + '40', backgroundColor: COLORS.primary + '12' },
  proofAddIcon: { position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center' },
  proofAddText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  proofRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.md, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 10, backgroundColor: COLORS.card },
  proofRowText: { flex: 1, color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  proofViewLink: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  proofReplaceLink: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700' },
  proofBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  proofViewer: { width: '100%', alignItems: 'center' },
  proofPager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, marginTop: SPACING.sm },
  proofPagerText: { color: '#fff', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
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
  upgradeHero: {
    borderRadius: 20, padding: SPACING.xl, alignItems: 'center', marginTop: SPACING.md, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.primary + '55', overflow: 'hidden',
  },
  upgradeBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary + '1A', borderWidth: 1, borderColor: COLORS.primary + '33', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  upgradeTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  upgradeSub: { color: COLORS.textSecondary, fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.lg, paddingVertical: 12, paddingHorizontal: SPACING.xl, borderRadius: 999, backgroundColor: COLORS.primary },
  upgradeBtnText: { color: COLORS.text, fontSize: 14, fontWeight: '800' },

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
