import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';

function StatCard({ label, value, unit }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ProgressScreen() {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const uid = auth.currentUser.uid;
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
        <Text style={styles.loadingText}>Loading progress...</Text>
      </View>
    );
  }

  const totalHours = Math.floor((userData?.totalMinutes || 0) / 60);
  const streak = userData?.streak || 0;
  const level = userData?.level || 'Beginner';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Your Progress</Text>

      <View style={styles.levelCard}>
        <Text style={styles.levelLabel}>CURRENT LEVEL</Text>
        <Text style={styles.levelValue}>{level}</Text>
        <Text style={styles.levelSub}>Keep practicing to level up</Text>
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Day Streak" value={streak} unit="days" />
        <StatCard label="Total Time" value={totalHours} unit="hours" />
      </View>

      <View style={styles.goalsSection}>
        <Text style={styles.sectionTitle}>YOUR GOALS</Text>
        {(userData?.goals || []).map((goal) => (
          <View key={goal} style={styles.goalItem}>
            <View style={styles.goalDot} />
            <Text style={styles.goalText}>{goal}</Text>
          </View>
        ))}
      </View>

      <View style={styles.goalsSection}>
        <Text style={styles.sectionTitle}>SKILLS IN FOCUS</Text>
        {(userData?.skills || []).map((skill) => (
          <View key={skill} style={styles.skillChip}>
            <Text style={styles.skillText}>{skill}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: COLORS.textSecondary },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.xl },
  levelCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  levelLabel: { color: COLORS.text + 'AA', fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.xs },
  levelValue: { color: COLORS.text, fontSize: 36, fontWeight: '900', marginBottom: SPACING.xs },
  levelSub: { color: COLORS.text + 'CC', fontSize: 13 },
  statsGrid: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: { color: COLORS.text, fontSize: 40, fontWeight: '900' },
  statUnit: { color: COLORS.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  statLabel: { color: COLORS.textMuted, fontSize: 11, marginTop: SPACING.xs },
  goalsSection: { marginBottom: SPACING.xl },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: SPACING.md,
  },
  goalItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  goalDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  goalText: { color: COLORS.text, fontSize: 15 },
  skillChip: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  skillText: { color: COLORS.textSecondary, fontSize: 14 },
});
