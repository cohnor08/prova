import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';
import { adjustSessionFromRating } from '../../lib/claude';

const CATEGORY_COLORS = {
  warmup: '#06B6D4',
  technique: '#3B82F6',
  theory: '#8B5CF6',
  ear_training: '#10B981',
  repertoire: '#0EA5E9',
  improvisation: '#6366F1',
};

function SessionCard({ session, onComplete, completed }) {
  const [timerActive, setTimerActive] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(session.duration * 60);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (timerActive && secondsLeft > 0) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => s - 1);
      }, 1000);
    } else if (secondsLeft === 0) {
      clearInterval(intervalRef.current);
      setTimerActive(false);
    }
    return () => clearInterval(intervalRef.current);
  }, [timerActive, secondsLeft]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const categoryColor = CATEGORY_COLORS[session.category] || COLORS.primary;

  return (
    <View style={[styles.card, completed && styles.cardCompleted]}>
      <View style={[styles.categoryBar, { backgroundColor: categoryColor }]} />
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '22' }]}>
            <Text style={[styles.categoryText, { color: categoryColor }]}>
              {session.category.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
          <Text style={styles.duration}>{session.duration} min</Text>
        </View>

        <Text style={[styles.sessionTitle, completed && styles.sessionTitleCompleted]}>
          {session.title}
        </Text>
        <Text style={styles.sessionDesc}>{session.description}</Text>

        {!completed && (
          <View style={styles.timerRow}>
            <Text style={styles.timerText}>{formatTime(secondsLeft)}</Text>
            <TouchableOpacity
              style={[styles.timerBtn, timerActive && styles.timerBtnActive]}
              onPress={() => setTimerActive(!timerActive)}
            >
              <Text style={styles.timerBtnText}>{timerActive ? 'Pause' : 'Start'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.completeBtn} onPress={() => onComplete(session.id)}>
              <Text style={styles.completeBtnText}>Done ✓</Text>
            </TouchableOpacity>
          </View>
        )}

        {completed && <Text style={styles.completedBadge}>Completed ✓</Text>}
      </View>
    </View>
  );
}

export default function TodayScreen() {
  const [sessions, setSessions] = useState([]);
  const [completedIds, setCompletedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRating, setShowRating] = useState(false);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    loadTodaySessions();
  }, []);

  const loadTodaySessions = async () => {
    try {
      const uid = auth.currentUser.uid;
      const userDoc = await getDoc(doc(db, 'users', uid));
      const data = userDoc.data();

      setUserData(data);
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const todayPlan = data?.practicePlan?.weeklyPlan?.[today];
      setSessions(todayPlan?.sessions || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = (sessionId) => {
    setCompletedIds((prev) => [...prev, sessionId]);
    const allDone = sessions.every((s) => [...completedIds, sessionId].includes(s.id));
    if (allDone) setShowRating(true);
  };

  const handleRating = async (rating) => {
    try {
      const uid = auth.currentUser.uid;

      const todayStr = new Date().toDateString();
      const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
      const lastStr = userData?.lastSessionDate
        ? new Date(userData.lastSessionDate).toDateString()
        : null;

      let newStreak;
      if (lastStr === todayStr) {
        newStreak = userData?.streak || 1;
      } else if (lastStr === yesterdayStr) {
        newStreak = (userData?.streak || 0) + 1;
      } else {
        newStreak = 1;
      }

      await updateDoc(doc(db, 'users', uid), {
        lastSessionRating: rating,
        lastSessionDate: new Date().toISOString(),
        totalMinutes: increment(sessions.reduce((sum, s) => sum + s.duration, 0)),
        streak: newStreak,
      });

      setShowRating(false);
      Alert.alert('Session logged!', "Prova will adjust your next plan based on your feedback.");

      const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      adjustSessionFromRating(sessions, rating, null)
        .then((adjusted) =>
          updateDoc(doc(db, 'users', uid), {
            [`practicePlan.weeklyPlan.${dayName}.sessions`]: adjusted,
          })
        )
        .catch(console.error);
    } catch (error) {
      console.error(error);
    }
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const totalMins = sessions.reduce((sum, s) => sum + s.duration, 0);
  const progress = sessions.length > 0 ? completedIds.length / sessions.length : 0;

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading your plan...</Text>
      </View>
    );
  }

  if (showRating) {
    return (
      <View style={styles.ratingContainer}>
        <Text style={styles.ratingTitle}>How was that session?</Text>
        <Text style={styles.ratingSubtitle}>Prova will adjust your next session based on this</Text>
        {['too_easy', 'just_right', 'too_hard'].map((r) => (
          <TouchableOpacity key={r} style={styles.ratingBtn} onPress={() => handleRating(r)}>
            <Text style={styles.ratingBtnText}>
              {r === 'too_easy' ? 'Too Easy — step it up' : r === 'just_right' ? 'Just Right' : 'Too Hard — slow down'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.date}>{today}</Text>
      <Text style={styles.title}>Today's Practice</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{totalMins}</Text>
          <Text style={styles.statLabel}>minutes</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{sessions.length}</Text>
          <Text style={styles.statLabel}>exercises</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{completedIds.length}</Text>
          <Text style={styles.statLabel}>done</Text>
        </View>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {sessions.length === 0 ? (
        <View style={styles.restDay}>
          <Text style={styles.restIcon}>🎸</Text>
          <Text style={styles.restTitle}>Rest Day</Text>
          <Text style={styles.restSubtitle}>No sessions scheduled today. Enjoy the break!</Text>
        </View>
      ) : (
        sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onComplete={handleComplete}
            completed={completedIds.includes(session.id)}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: COLORS.textSecondary, fontSize: 16 },
  date: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 2, marginBottom: SPACING.xs },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.lg },
  statsRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  stat: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, alignItems: 'center' },
  statValue: { color: COLORS.primary, fontSize: 24, fontWeight: '800' },
  statLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  progressBar: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    marginBottom: SPACING.xl,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardCompleted: { opacity: 0.5 },
  categoryBar: { width: 4 },
  cardContent: { flex: 1, padding: SPACING.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  categoryBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: 4 },
  categoryText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  duration: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  sessionTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700', marginBottom: SPACING.xs },
  sessionTitleCompleted: { textDecorationLine: 'line-through', color: COLORS.textMuted },
  sessionDesc: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: SPACING.md },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  timerText: { color: COLORS.text, fontSize: 20, fontWeight: '700', minWidth: 60 },
  timerBtn: {
    backgroundColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  timerBtnActive: { backgroundColor: COLORS.primary },
  timerBtnText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  completeBtn: {
    backgroundColor: COLORS.success + '22',
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  completeBtnText: { color: COLORS.success, fontSize: 13, fontWeight: '700' },
  completedBadge: { color: COLORS.success, fontSize: 13, fontWeight: '700' },
  restDay: { alignItems: 'center', paddingTop: SPACING.xxl },
  restIcon: { fontSize: 64, marginBottom: SPACING.md },
  restTitle: { color: COLORS.text, fontSize: 24, fontWeight: '800', marginBottom: SPACING.sm },
  restSubtitle: { color: COLORS.textSecondary, fontSize: 15, textAlign: 'center' },
  ratingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.xl,
    justifyContent: 'center',
  },
  ratingTitle: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.sm },
  ratingSubtitle: { color: COLORS.textSecondary, fontSize: 15, marginBottom: SPACING.xxl },
  ratingBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  ratingBtnText: { color: COLORS.text, fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
