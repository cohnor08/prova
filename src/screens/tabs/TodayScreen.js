import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
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

const RATING_OPTIONS = [
  { key: 'too_easy', label: 'Too Easy', sub: 'Step it up next time', icon: 'trending-up' },
  { key: 'just_right', label: 'Just Right', sub: 'Perfect challenge level', icon: 'checkmark-circle' },
  { key: 'too_hard', label: 'Too Hard', sub: 'Dial it back a bit', icon: 'trending-down' },
];

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

function SessionCard({ session, onComplete, completed, onStart }) {
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
            <TouchableOpacity
              style={styles.timerBtn}
              onPress={() => onStart?.(session)}
              activeOpacity={0.8}
            >
              <Ionicons name="play" size={14} color={COLORS.text} />
              <Text style={styles.timerBtnText}>Start</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.completeBtn} onPress={() => onComplete(session.id)} activeOpacity={0.8}>
              <Ionicons name="checkmark" size={14} color={COLORS.success} />
              <Text style={styles.completeBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {completed && (
          <View style={styles.completedRow}>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
            <Text style={styles.completedBadge}>Completed</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function TodayScreen({ navigation }) {
  const [sessions, setSessions] = useState([]);
  const [completedIds, setCompletedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRating, setShowRating] = useState(false);
  const [userData, setUserData] = useState(null);
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => { loadTodaySessions(); }, []);

  useEffect(() => {
    if (showRating) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
    } else {
      slideAnim.setValue(300);
    }
  }, [showRating]);

  const loadTodaySessions = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const userDoc = await getDoc(doc(db, 'users', uid));
      const data = userDoc.data();

      // Reset streak if the user skipped yesterday and today hasn't been practiced yet
      const todayStr = new Date().toDateString();
      const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
      const lastStr = data?.lastSessionDate ? new Date(data.lastSessionDate).toDateString() : null;
      if (lastStr && lastStr !== todayStr && lastStr !== yesterdayStr && (data?.streak || 0) > 0) {
        await updateDoc(doc(db, 'users', uid), { streak: 0 });
        data.streak = 0;
      }

      setUserData(data);
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      setSessions(data?.practicePlan?.weeklyPlan?.[today]?.sessions || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = (sessionId) => {
    const newCompleted = [...completedIds, sessionId];
    setCompletedIds(newCompleted);
    if (sessions.every(s => newCompleted.includes(s.id))) setShowRating(true);
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
        : lastStr === yesterdayStr
          ? (userData?.streak || 0) + 1
          : 1;

      const sessionMins = sessions.reduce((sum, s) => sum + s.duration, 0);

      // Aggregate minutes per category for progress tracking
      const categories = {};
      sessions.forEach(s => {
        categories[s.category] = (categories[s.category] || 0) + s.duration;
      });

      const dateKey = new Date().toISOString().split('T')[0];
      await Promise.all([
        updateDoc(doc(db, 'users', uid), {
          lastSessionRating: rating,
          lastSessionDate: new Date().toISOString(),
          totalMinutes: increment(sessionMins),
          totalSessions: increment(1),
          streak: newStreak,
        }),
        // Session history log — powers ProgressScreen charts
        setDoc(doc(db, 'sessionHistory', uid, 'logs', dateKey), {
          date: dateKey,
          totalMinutes: increment(sessionMins),
          sessionCount: increment(1),
          categories: Object.fromEntries(
            Object.entries(categories).map(([k, v]) => [k, increment(v)])
          ),
          rating,
        }, { merge: true }),
      ]);

      const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      adjustSessionFromRating(sessions, rating, null)
        .then(adjusted => updateDoc(doc(db, 'users', uid), {
          [`practicePlan.weeklyPlan.${dayName}.sessions`]: adjusted,
        }))
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
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <SkeletonBlock width={160} height={12} style={{ marginBottom: SPACING.sm }} />
          <SkeletonBlock width={220} height={28} style={{ marginBottom: SPACING.lg }} />
          <View style={{ flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md }}>
            <SkeletonBlock width="30%" height={72} style={{ flex: 1 }} />
            <SkeletonBlock width="30%" height={72} style={{ flex: 1 }} />
            <SkeletonBlock width="30%" height={72} style={{ flex: 1 }} />
          </View>
          <SkeletonBlock width="100%" height={4} style={{ marginBottom: SPACING.xl }} />
          <SkeletonBlock width="100%" height={120} style={{ marginBottom: SPACING.md }} />
          <SkeletonBlock width="100%" height={120} style={{ marginBottom: SPACING.md }} />
          <SkeletonBlock width="100%" height={100} />
        </ScrollView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.date}>{today.toUpperCase()}</Text>
        <Text style={styles.title}>Today's Practice</Text>

        <View style={styles.statsRow}>
          {[
            { value: totalMins, label: 'MINUTES' },
            { value: sessions.length, label: 'EXERCISES' },
            { value: completedIds.length, label: 'DONE' },
          ].map(stat => (
            <View key={stat.label} style={styles.stat}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{completedIds.length} of {sessions.length} completed</Text>

        {sessions.length === 0 ? (
          <View style={styles.restDay}>
            <View style={styles.restIconWrap}>
              <Ionicons name="musical-notes" size={40} color={COLORS.primary} />
            </View>
            <Text style={styles.restTitle}>Rest Day</Text>
            <Text style={styles.restSubtitle}>No sessions scheduled today. Enjoy the break!</Text>
          </View>
        ) : (
          sessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              onComplete={handleComplete}
              completed={completedIds.includes(session.id)}
              onStart={(s) => navigation.navigate('Practice', { activeSession: s })}
            />
          ))
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  date: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.xs },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800', marginBottom: SPACING.lg },
  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  stat: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  statValue: { color: COLORS.primary, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  progressBar: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginBottom: SPACING.xs, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },
  progressLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', marginBottom: SPACING.lg },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardCompleted: { opacity: 0.45 },
  categoryBar: { width: 4 },
  cardContent: { flex: 1, padding: SPACING.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  categoryBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: 4 },
  categoryText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  duration: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  sessionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: SPACING.xs },
  sessionTitleCompleted: { textDecorationLine: 'line-through', color: COLORS.textMuted },
  sessionDesc: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: SPACING.md },
  timerProgress: { height: 3, backgroundColor: COLORS.border, borderRadius: 2, marginBottom: SPACING.sm, overflow: 'hidden' },
  timerProgressFill: { height: '100%', borderRadius: 2 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  timerText: { color: COLORS.text, fontSize: 18, fontWeight: '700', minWidth: 56, fontVariant: ['tabular-nums'] },
  timerBtn: {
    backgroundColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  timerBtnText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  completeBtn: {
    backgroundColor: COLORS.success + '1A',
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  completeBtnText: { color: COLORS.success, fontSize: 13, fontWeight: '700' },
  completedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  completedBadge: { color: COLORS.success, fontSize: 13, fontWeight: '700' },
  restDay: { alignItems: 'center', paddingTop: SPACING.xxl },
  restIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.primary + '33',
  },
  restTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800', marginBottom: SPACING.sm },
  restSubtitle: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  ratingBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  ratingSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.xl,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  ratingHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  ratingTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800', marginBottom: SPACING.xs },
  ratingSubtitle: { color: COLORS.textSecondary, fontSize: 14, marginBottom: SPACING.xl, lineHeight: 20 },
  ratingBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  ratingBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary + '1A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ratingBtnLabel: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  ratingBtnSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 1 },
});
