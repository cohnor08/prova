import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Modal, Animated, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';
import { adjustSessionFromRating } from '../../lib/claude';
import { getDailySong } from '../../constants/songs';
import { sessionPoints, displayScore, formatScore } from '../../lib/score';

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
  const [timerActive, setTimerActive] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(session.duration * 60);
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
        <View style={styles.cardHeader}>
          <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '22' }]}>
            <Text style={[styles.categoryText, { color: categoryColor }]}>
              {session.category.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
          <Text style={styles.duration}>{session.duration} min</Text>
        </View>
        <Text style={[styles.sessionTitle, completed && styles.sessionTitleCompleted]}>{session.title}</Text>
        <Text style={styles.sessionDesc}>{session.description}</Text>
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
        <View style={styles.sessionMeta}>
          <Text style={styles.sessionDuration}>{session.duration} min</Text>
          <Text style={[styles.sessionCategory, { color }]}>{session.category.replace('_', ' ')}</Text>
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
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => { loadData(); }, []);

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

  const handleComplete = (sessionId) => {
    const next = [...completedIds, sessionId];
    setCompletedIds(next);
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
      // Bank Prova Score for this session (XP — only ever goes up). Start from the
      // existing total, or backfill it from lifetime stats for older accounts.
      const earnedPoints = sessionPoints(sessionMins, newStreak, rating);
      const newScore = displayScore(userData) + earnedPoints;
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
      Alert.alert(
        `+${formatScore(earnedPoints)} Prova points! 🎸`,
        `Nice work — your Prova Score is now ${formatScore(newScore)}.${newStreak > 1 ? `\n🔥 ${newStreak}-day streak — keep it alive!` : ''}`,
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

  const isToday = selectedDay === TODAY_NAME;
  const selectedSessions = isToday ? sessions : (plan?.[selectedDay]?.sessions || []);
  const totalMins = sessions.reduce((s, x) => s + x.duration, 0);
  const progress = sessions.length > 0 ? completedIds.length / sessions.length : 0;
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const songOfTheDay = getDailySong(userData?.instrument, userData?.level);

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

        <Text style={styles.date}>{todayLabel.toUpperCase()}</Text>
        <Text style={styles.title}>
          {isToday ? "Today's Practice" : selectedDay.charAt(0).toUpperCase() + selectedDay.slice(1)}
        </Text>

        {/* Day picker */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dayScroll}
          contentContainerStyle={styles.dayScrollContent}
        >
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
        </ScrollView>

        {/* Stats + progress — today only */}
        {isToday && (
          <>
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
          </>
        )}

        {/* Sessions */}
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
              onStart={(s) => navigation.navigate('Practice', { activeSession: s })}
            />
          ))
        ) : (
          selectedSessions.map((session, i) => (
            <PlanCard key={session.id || i} session={session} />
          ))
        )}

        {/* Song to practice — matched to the player's level */}
        {isToday && songOfTheDay && (
          <TouchableOpacity
            style={styles.songCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Practice', { tool: 'songs' })}
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

  dayScroll: { marginHorizontal: -SPACING.xl, marginBottom: SPACING.lg },
  dayScrollContent: { paddingHorizontal: SPACING.xl, gap: SPACING.sm },
  dayBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 10, backgroundColor: COLORS.card, alignItems: 'center', minWidth: 52, borderWidth: 1, borderColor: COLORS.border },
  dayBtnSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayBtnToday: { borderColor: COLORS.primary },
  dayBtnText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  dayBtnTextSelected: { color: COLORS.text },
  dayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.textMuted, marginTop: 3 },
  dayDotSelected: { backgroundColor: COLORS.text },

  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  stat: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  statValue: { color: COLORS.primary, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  progressBar: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginBottom: SPACING.xs, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },
  progressLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', marginBottom: SPACING.lg },

  card: { backgroundColor: COLORS.card, borderRadius: 16, marginBottom: SPACING.md, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
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
