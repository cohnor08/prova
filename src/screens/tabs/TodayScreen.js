import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Modal, Animated, Alert, Linking, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../lib/firebase';
import { scheduleStreakSaver, cancelStreakSaver, notifyNewTasks } from '../../lib/notifications';
import { COLORS, SPACING } from '../../constants/theme';
import { adjustSessionFromRating, generatePracticePlan } from '../../lib/claude';
import { getDailySong } from '../../constants/songs';
import { getDailyChallenge, CHALLENGE_POINTS } from '../../constants/challenges';
import { taskPoints, completionBonus, displayScore, formatScore, scoreRank, restoreState, spendRestore } from '../../lib/score';

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

// One teacher-assigned task on the student's Today screen. If the teacher set a
// timer (durationMin), the "Done" button is locked until the countdown finishes,
// so the student can't just tap Done without practising.
function TeacherTaskCard({ task, expanded, onToggle, onComplete, openTaskLink, onOpenSong }) {
  const hasTimer = (task.durationMin || 0) > 0;
  const [secondsLeft, setSecondsLeft] = useState((task.durationMin || 0) * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (running && secondsLeft > 0) {
      intervalRef.current = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    } else if (secondsLeft === 0) {
      clearInterval(intervalRef.current);
      setRunning(false);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, secondsLeft]);

  const fmt = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  const timerDone = secondsLeft === 0;
  const canComplete = !hasTimer || timerDone;
  const due = assignedDueLabel(task.dueDate);

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
          </View>
        </TouchableOpacity>
        {task.completed ? (
          <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
        ) : (
          <TouchableOpacity
            style={[styles.teacherDoneBtn, !canComplete && styles.teacherDoneBtnLocked]}
            onPress={() => canComplete && onComplete(task.id)}
            activeOpacity={canComplete ? 0.85 : 1}
          >
            {!canComplete && <Ionicons name="lock-closed" size={12} color={COLORS.textMuted} style={{ marginRight: 3 }} />}
            <Text style={[styles.teacherDoneText, !canComplete && styles.teacherDoneTextLocked]}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {hasTimer && !task.completed && (
        <View style={styles.ttTimer}>
          <View style={styles.ttTimerBarBg}>
            <View style={[styles.ttTimerBarFill, { width: `${(1 - secondsLeft / ((task.durationMin || 1) * 60)) * 100}%` }]} />
          </View>
          <View style={styles.ttTimerRow}>
            <Text style={styles.ttTimerText}>{fmt(secondsLeft)}</Text>
            <TouchableOpacity
              style={[styles.ttTimerBtn, timerDone && { opacity: 0.5 }]}
              onPress={() => { if (!timerDone) setRunning((r) => !r); }}
              activeOpacity={timerDone ? 1 : 0.8}
            >
              <Ionicons name={running ? 'pause' : 'play'} size={13} color={COLORS.text} />
              <Text style={styles.ttTimerBtnText}>{timerDone ? 'Finished' : running ? 'Pause' : `Start ${task.durationMin}m`}</Text>
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
  const [loading, setLoading] = useState(true);
  const [showRating, setShowRating] = useState(false);
  const [userData, setUserData] = useState(null);
  const [selectedDay, setSelectedDay] = useState(TODAY_NAME);
  const [regenerating, setRegenerating] = useState(false);
  const [expandedTask, setExpandedTask] = useState(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
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
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const runRegenerate = async () => {
    if (regenerating || !userData) return;
    setRegenerating(true);
    try {
      const uid = auth.currentUser.uid;
      const newPlan = await generatePracticePlan(userData);
      await setDoc(doc(db, 'users', uid), {
        practicePlan: newPlan,
        planGeneratedAt: new Date().toISOString(),
      }, { merge: true });
      const weeklyPlan = newPlan?.weeklyPlan || {};
      setPlan(weeklyPlan);
      setSessions(weeklyPlan[TODAY_NAME]?.sessions || []);
      setCompletedIds([]);
      Alert.alert('Done!', 'Your fresh practice plan is ready.');
    } catch (err) {
      Alert.alert('Could not regenerate', err.message || 'Please try again.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleRegeneratePlan = () => {
    Alert.alert(
      'Regenerate plan?',
      'Build a fresh practice plan from your current settings. This replaces your existing plan.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Regenerate', onPress: runRegenerate },
      ]
    );
  };

  const handleComplete = (sessionId) => {
    if (completedIds.includes(sessionId)) return;
    const next = [...completedIds, sessionId];
    setCompletedIds(next);

    // Bank this task's own points immediately, based on how long + hard it is.
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      const pts = taskPoints(session);
      const newScore = displayScore(userData) + pts;
      setUserData(p => ({ ...p, provaScore: newScore }));
      const uid = auth.currentUser?.uid;
      if (uid) updateDoc(doc(db, 'users', uid), { provaScore: newScore }).catch(() => {});
      Alert.alert('Task done', `+${formatScore(pts)} Prova points 🎸`);
    }

    if (sessions.every(s => next.includes(s.id))) setShowRating(true);
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

  // Mark a teacher-assigned task complete (writes back so the teacher sees it).
  const completeAssignedTask = async (taskId) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const next = (userData?.assignedTasks || []).map((t) =>
      t.id === taskId ? { ...t, completed: true, completedAt: new Date().toISOString() } : t
    );
    setUserData((p) => ({ ...p, assignedTasks: next }));
    try {
      await updateDoc(doc(db, 'users', uid), { assignedTasks: next });
    } catch (e) {
      Alert.alert('Error', "Couldn't save. Please try again.");
    }
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
  const totalMins = sessions.reduce((s, x) => s + x.duration, 0);
  const progress = sessions.length > 0 ? completedIds.length / sessions.length : 0;
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const songOfTheDay = getDailySong(userData?.instrument, userData?.level);

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
          <View style={styles.restDay}>
            <View style={styles.restIconWrap}>
              <Ionicons name="bed-outline" size={36} color={COLORS.textMuted} />
            </View>
            <Text style={styles.restTitle}>Rest Day</Text>
            <Text style={styles.restSubtitle}>No sessions scheduled. Enjoy the break!</Text>
          </View>
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
        {isToday && soloTasks.length > 0 && (
          <View style={styles.teacherCard}>
            {soloTasks.length >= 3 ? (
              <TouchableOpacity style={styles.teacherHeader} onPress={() => setSoloOpen((o) => !o)} activeOpacity={0.7}>
                <Ionicons name="school" size={16} color={COLORS.primary} />
                <Text style={[styles.teacherKicker, { flex: 1 }]}>FROM YOUR TEACHER</Text>
                <Text style={styles.classGroupSub}>{soloTasks.filter((t) => t.completed).length}/{soloTasks.length} done</Text>
                <Ionicons name={soloOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ) : (
              <View style={styles.teacherHeader}>
                <Ionicons name="school" size={16} color={COLORS.primary} />
                <Text style={styles.teacherKicker}>FROM YOUR TEACHER</Text>
              </View>
            )}
            {(soloTasks.length < 3 || soloOpen) && soloTasks.map((t) => (
              <TeacherTaskCard
                key={t.id}
                task={t}
                expanded={expandedTask === t.id}
                onToggle={() => setExpandedTask(expandedTask === t.id ? null : t.id)}
                onComplete={completeAssignedTask}
                openTaskLink={openTaskLink}
                onOpenSong={openSongInLibrary}
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
              <TouchableOpacity style={styles.classGroupHeader} onPress={() => toggleGroup(g.key)} activeOpacity={0.7}>
                <Ionicons name="people" size={16} color={COLORS.accent || COLORS.primary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.classGroupKicker} numberOfLines={1}>{g.name.toUpperCase()}</Text>
                  <Text style={styles.classGroupSub}>Class task · {doneCount}/{g.tasks.length} done</Text>
                </View>
                <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
              {!collapsed && g.tasks.map((t) => (
                <TeacherTaskCard
                  key={t.id}
                  task={t}
                  expanded={expandedTask === t.id}
                  onToggle={() => setExpandedTask(expandedTask === t.id ? null : t.id)}
                  onComplete={completeAssignedTask}
                  openTaskLink={openTaskLink}
                onOpenSong={openSongInLibrary}
                />
              ))}
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

        {/* Regenerate plan — rebuilds the AI plan from your current settings */}
        {isToday && (
          <>
            <TouchableOpacity
              style={[styles.regenBtn, regenerating && styles.regenBtnDisabled]}
              onPress={handleRegeneratePlan}
              disabled={regenerating}
              activeOpacity={0.8}
            >
              {regenerating
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <Ionicons name="refresh" size={16} color={COLORS.primary} />}
              <Text style={styles.regenBtnText}>{regenerating ? 'Building your plan…' : 'Regenerate plan'}</Text>
            </TouchableOpacity>
            {regenerating && (
              <Text style={styles.regenHint}>Writing your plan with AI — this can take up to a minute. Keep the app open.</Text>
            )}
          </>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  date: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.xs },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800', marginBottom: SPACING.xl },
  headerCentered: { textAlign: 'center', alignSelf: 'center' },
  regenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    alignSelf: 'center', marginTop: SPACING.lg,
    paddingVertical: 11, paddingHorizontal: SPACING.lg, borderRadius: 999,
    backgroundColor: COLORS.primary + '1A', borderWidth: 1, borderColor: COLORS.primary + '40',
  },
  regenBtnDisabled: { opacity: 0.6 },
  regenBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  regenHint: { color: COLORS.textSecondary, fontSize: 12, marginTop: SPACING.sm, textAlign: 'center', fontStyle: 'italic' },

  dayRow: { flexDirection: 'row', gap: 6, marginBottom: SPACING.lg },
  dayBtn: { flex: 1, paddingVertical: SPACING.sm, borderRadius: 10, backgroundColor: COLORS.card, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  dayBtnSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayBtnToday: { borderColor: COLORS.primary },
  dayBtnText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  dayBtnTextSelected: { color: COLORS.text },
  dayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.textMuted, marginTop: 3 },
  dayDotSelected: { backgroundColor: COLORS.text },

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
  teacherTaskDone: { color: COLORS.textMuted, textDecorationLine: 'line-through' },
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
  ttTimerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  ttTimerText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  ttTimerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.primaryDark || COLORS.primary, borderRadius: 999, paddingHorizontal: SPACING.md, paddingVertical: 7 },
  ttTimerBtnText: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
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
  cardContent: { flex: 1, padding: SPACING.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  categoryBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: 4 },
  categoryText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  duration: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  sessionPtsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: SPACING.md },
  sessionPts: { color: COLORS.accent, fontSize: 12, fontWeight: '800' },
  sessionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: SPACING.xs },
  sessionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  sessionTitleCompleted: { textDecorationLine: 'line-through', color: COLORS.textMuted },
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
  songLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  songTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  songArtist: { color: COLORS.textSecondary, fontSize: 13, marginTop: 1 },

  restDay: { alignItems: 'center', paddingTop: SPACING.xxl },
  restIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  restTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginBottom: SPACING.sm },
  restSubtitle: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 21 },

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
