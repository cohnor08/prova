import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';

function formatTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return { value: `${m}`, unit: 'min' };
  if (m === 0) return { value: `${h}`, unit: h === 1 ? 'hour' : 'hours' };
  return { value: `${h}h ${m}m`, unit: 'total' };
}

function StatCard({ label, value, unit, icon }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIconWrap}>
        <Ionicons name={icon} size={20} color={COLORS.primary} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ProgressScreen() {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadUserData(); }, []);

  const loadUserData = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'users', uid));
      setUserData(snap.data());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  const streak = userData?.streak || 0;
  const time = formatTime(userData?.totalMinutes || 0);
  const level = userData?.level || 'Beginner';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Your Progress</Text>

      <View style={styles.levelCard}>
        <View style={styles.levelCardInner}>
          <Text style={styles.levelLabel}>CURRENT LEVEL</Text>
          <Text style={styles.levelValue}>{level}</Text>
          <Text style={styles.levelSub}>Keep practicing to level up</Text>
        </View>
        <View style={styles.levelIcon}>
          <Ionicons name="ribbon" size={32} color={COLORS.text} />
        </View>
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Day Streak" value={streak} unit={streak === 1 ? 'day' : 'days'} icon="flame" />
        <StatCard label="Total Time" value={time.value} unit={time.unit} icon="time" />
      </View>

      {(userData?.goals?.length > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>YOUR GOALS</Text>
          {userData.goals.map((goal) => (
            <View key={goal} style={styles.goalItem}>
              <View style={styles.goalDot} />
              <Text style={styles.goalText}>{goal}</Text>
            </View>
          ))}
        </View>
      )}

      {(userData?.skills?.length > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SKILLS IN FOCUS</Text>
          <View style={styles.skillsWrap}>
            {userData.skills.map((skill) => (
              <View key={skill} style={styles.skillChip}>
                <Text style={styles.skillText}>{skill}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800', marginBottom: SPACING.xl },
  levelCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelCardInner: { flex: 1 },
  levelLabel: { color: COLORS.text + 'AA', fontSize: 10, fontWeight: '700', letterSpacing: 2.5, marginBottom: SPACING.xs },
  levelValue: { color: COLORS.text, fontSize: 34, fontWeight: '900', marginBottom: SPACING.xs },
  levelSub: { color: COLORS.text + 'CC', fontSize: 13 },
  levelIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.text + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.xs,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary + '1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  statValue: { color: COLORS.text, fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statUnit: { color: COLORS.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  statLabel: { color: COLORS.textMuted, fontSize: 11, textAlign: 'center' },
  section: { marginBottom: SPACING.xl },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.5,
    marginBottom: SPACING.md,
  },
  goalItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  goalDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary, flexShrink: 0 },
  goalText: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  skillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  skillChip: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  skillText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '500' },
});
