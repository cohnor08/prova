import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';

const SCREEN_W = Dimensions.get('window').width;
const CHART_W = SCREEN_W - SPACING.xl * 2;

// Demo data — 4 weeks of practice history
const WEEKLY_HOURS = [
  { week: '5 May', hours: 3.5 },
  { week: '12 May', hours: 5.0 },
  { week: '19 May', hours: 4.0 },
  { week: '26 May', hours: 6.5 },
];

const CATEGORY_BREAKDOWN = [
  { label: 'Technique', mins: 420, color: '#3B82F6' },
  { label: 'Repertoire', mins: 310, color: '#0EA5E9' },
  { label: 'Theory', mins: 180, color: '#8B5CF6' },
  { label: 'Ear Training', mins: 140, color: '#10B981' },
  { label: 'Warmup', mins: 100, color: '#06B6D4' },
  { label: 'Improvisation', mins: 70, color: '#6366F1' },
];

// Last 5 weeks heatmap (35 days), 1 = practiced, 0 = rest, 0.5 = short session
const HEATMAP = [
  [0, 1, 1, 0, 1, 1, 0],
  [1, 1, 0, 1, 1, 0, 1],
  [0, 1, 1, 1, 0, 1, 1],
  [1, 0, 1, 1, 1, 1, 0],
  [1, 1, 1, 0, 1, 1, 1],
];

const MILESTONES = [
  { icon: '🔥', label: '7-Day Streak', earned: true },
  { icon: '⏱️', label: '10 Hours', earned: true },
  { icon: '🎸', label: 'First Session', earned: true },
  { icon: '📅', label: '30 Sessions', earned: true },
  { icon: '⭐', label: '25 Hours', earned: false },
  { icon: '🏆', label: '30-Day Streak', earned: false },
];

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];
const LEVEL_XP = { Beginner: 0.72, Novice: 0.45, Intermediate: 0.28, Advanced: 0.15, Elite: 1.0 };

// Daily practice minutes — last 14 days
const DAILY_MINS = [
  { day: '13', mins: 0 },
  { day: '14', mins: 45 },
  { day: '15', mins: 60 },
  { day: '16', mins: 30 },
  { day: '17', mins: 0 },
  { day: '18', mins: 75 },
  { day: '19', mins: 90 },
  { day: '20', mins: 50 },
  { day: '21', mins: 65 },
  { day: '22', mins: 0 },
  { day: '23', mins: 80 },
  { day: '24', mins: 110 },
  { day: '25', mins: 70 },
  { day: '26', mins: 95 },
];

const GRAPH_H = 120;
const GRAPH_PAD = 8;

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProvaScore({ score }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 1000) * circumference;

  return (
    <View style={styles.scoreCard}>
      <View style={styles.scoreRingWrapper}>
        <View style={styles.scoreRingOuter}>
          <View style={[styles.scoreRingFill, {
            borderColor: score > 700 ? '#10B981' : score > 400 ? COLORS.primary : '#F59E0B',
          }]} />
          <View style={styles.scoreCenter}>
            <Text style={styles.scoreNumber}>{score}</Text>
            <Text style={styles.scoreMax}>/1000</Text>
          </View>
        </View>
      </View>
      <View style={styles.scoreRight}>
        <Text style={styles.scoreTitle}>Prova Score</Text>
        <Text style={styles.scoreDesc}>Your overall practice quality, consistency and growth combined into one number.</Text>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreBadgeText}>
            {score > 700 ? '🔥 On Fire' : score > 400 ? '📈 Improving' : '🌱 Getting Started'}
          </Text>
        </View>
      </View>    </View>
  );
}

function LineGraph() {
  const maxMins = Math.max(...DAILY_MINS.map((d) => d.mins), 1);
  const pointSpacing = (CHART_W - GRAPH_PAD * 2) / (DAILY_MINS.length - 1);

  const getX = (i) => GRAPH_PAD + i * pointSpacing;
  const getY = (mins) => GRAPH_H - GRAPH_PAD - ((mins / maxMins) * (GRAPH_H - GRAPH_PAD * 2));

  const lines = DAILY_MINS.slice(0, -1).map((d, i) => {
    const x1 = getX(i);
    const y1 = getY(d.mins);
    const x2 = getX(i + 1);
    const y2 = getY(DAILY_MINS[i + 1].mins);
    const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
    return { x1, y1, length, angle };
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>DAILY PRACTICE — LAST 14 DAYS</Text>
      <View style={[styles.graphContainer, { height: GRAPH_H + 24 }]}>
        {/* Y-axis guide lines */}
        {[0, 0.5, 1].map((pct) => (
          <View
            key={pct}
            style={[styles.graphGuideLine, { top: GRAPH_PAD + (1 - pct) * (GRAPH_H - GRAPH_PAD * 2) }]}
          />
        ))}

        {/* Line segments */}
        {lines.map((seg, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: seg.x1,
              top: seg.y1,
              width: seg.length,
              height: 2.5,
              backgroundColor: COLORS.primary,
              borderRadius: 2,
              transform: [{ rotate: `${seg.angle}deg` }],
              transformOrigin: '0 50%',
            }}
          />
        ))}

        {/* Data points */}
        {DAILY_MINS.map((d, i) => {
          const x = getX(i);
          const y = getY(d.mins);
          const isToday = i === DAILY_MINS.length - 1;
          return (
            <View
              key={i}
              style={[
                styles.graphDot,
                d.mins === 0 && styles.graphDotEmpty,
                isToday && styles.graphDotToday,
                { left: x - (isToday ? 7 : 4), top: y - (isToday ? 7 : 4) },
              ]}
            />
          );
        })}

        {/* X-axis labels — every other day */}
        <View style={[styles.graphXAxis, { top: GRAPH_H }]}>
          {DAILY_MINS.map((d, i) => (
            <Text
              key={i}
              style={[styles.graphXLabel, { width: pointSpacing, marginLeft: i === 0 ? GRAPH_PAD : 0 }]}
            >
              {i % 2 === 0 ? d.day : ''}
            </Text>
          ))}
        </View>
      </View>

      {/* Legend */}
      <View style={styles.graphLegend}>
        <View style={styles.graphLegendItem}>
          <View style={[styles.graphLegendDot, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.graphLegendText}>Practice day</Text>
        </View>
        <Text style={styles.graphPeak}>Peak: {Math.max(...DAILY_MINS.map(d => d.mins))} min</Text>
      </View>
    </View>
  );
}

function WeeklyBarChart() {
  const maxH = Math.max(...WEEKLY_HOURS.map((w) => w.hours));
  const barW = (CHART_W - SPACING.md * (WEEKLY_HOURS.length - 1)) / WEEKLY_HOURS.length;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>WEEKLY PRACTICE HOURS</Text>
      <View style={styles.barChart}>
        {WEEKLY_HOURS.map((w, i) => {
          const barH = (w.hours / maxH) * 120;
          const isLatest = i === WEEKLY_HOURS.length - 1;
          return (
            <View key={w.week} style={[styles.barCol, { width: barW }]}>
              <Text style={[styles.barValue, isLatest && { color: COLORS.primary }]}>
                {w.hours}h
              </Text>
              <View style={styles.barTrack}>
                <View style={[
                  styles.barFill,
                  { height: barH, backgroundColor: isLatest ? COLORS.primary : COLORS.card },
                  isLatest && styles.barFillActive,
                ]} />
              </View>
              <Text style={styles.barLabel}>{w.week}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ActivityHeatmap() {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>ACTIVITY — LAST 5 WEEKS</Text>
      <View style={styles.heatmapDays}>
        {DAYS.map((d, i) => (
          <Text key={i} style={styles.heatmapDayLabel}>{d}</Text>
        ))}
      </View>
      {HEATMAP.map((week, wi) => (
        <View key={wi} style={styles.heatmapRow}>
          {week.map((val, di) => (
            <View
              key={di}
              style={[
                styles.heatmapCell,
                val === 1 && styles.heatmapCellFull,
                val === 0.5 && styles.heatmapCellHalf,
              ]}
            />
          ))}
        </View>
      ))}
      <View style={styles.heatmapLegend}>
        <Text style={styles.heatmapLegendText}>Less</Text>
        <View style={styles.heatmapCell} />
        <View style={[styles.heatmapCell, styles.heatmapCellHalf]} />
        <View style={[styles.heatmapCell, styles.heatmapCellFull]} />
        <Text style={styles.heatmapLegendText}>More</Text>
      </View>
    </View>
  );
}

function CategoryBreakdown() {
  const total = CATEGORY_BREAKDOWN.reduce((s, c) => s + c.mins, 0);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>TIME BY CATEGORY</Text>
      {CATEGORY_BREAKDOWN.map((cat) => {
        const pct = cat.mins / total;
        return (
          <View key={cat.label} style={styles.catRow}>
            <Text style={styles.catLabel}>{cat.label}</Text>
            <View style={styles.catTrack}>
              <View style={[styles.catBar, { width: `${pct * 100}%`, backgroundColor: cat.color }]} />
            </View>
            <Text style={styles.catMins}>{Math.round(cat.mins / 60 * 10) / 10}h</Text>
          </View>
        );
      })}
    </View>
  );
}

function LevelProgress({ level }) {
  const idx = LEVELS.indexOf(level);
  const xp = LEVEL_XP[level] ?? 0.3;
  const nextLevel = LEVELS[Math.min(idx + 1, LEVELS.length - 1)];
  return (
    <View style={styles.levelCard}>
      <View style={styles.levelTop}>
        <View>
          <Text style={styles.levelSub}>CURRENT LEVEL</Text>
          <Text style={styles.levelValue}>{level}</Text>
        </View>
        {idx < LEVELS.length - 1 && (
          <View style={styles.nextLevelBadge}>
            <Text style={styles.nextLevelText}>Next: {nextLevel}</Text>
          </View>
        )}
      </View>
      <View style={styles.xpTrack}>
        <View style={[styles.xpBar, { width: `${xp * 100}%` }]} />
      </View>
      <Text style={styles.xpLabel}>{Math.round(xp * 100)}% to {nextLevel}</Text>
    </View>
  );
}

function Milestones() {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>MILESTONES</Text>
      <View style={styles.milestoneGrid}>
        {MILESTONES.map((m) => (
          <View key={m.label} style={[styles.milestoneBadge, !m.earned && styles.milestoneLocked]}>
            <Text style={styles.milestoneIcon}>{m.earned ? m.icon : '🔒'}</Text>
            <Text style={[styles.milestoneLabel, !m.earned && styles.milestoneLabelLocked]}>
              {m.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

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

  const streak = userData?.streak || 12;
  const totalMins = userData?.totalMinutes || 1220;
  const totalHours = Math.floor(totalMins / 60);
  const level = userData?.level || 'Intermediate';
  const sessions = 24;
  const avgMins = Math.round(totalMins / sessions);
  const provaScore = 634;
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Progress</Text>

        {/* Top stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{streak}</Text>
            <Text style={styles.statUnit}>🔥</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalHours}</Text>
            <Text style={styles.statUnit}>HRS</Text>
            <Text style={styles.statLabel}>Total Time</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{sessions}</Text>
            <Text style={styles.statUnit}>SESSIONS</Text>
            <Text style={styles.statLabel}>All Time</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{avgMins}</Text>
            <Text style={styles.statUnit}>MIN AVG</Text>
            <Text style={styles.statLabel}>Per Session</Text>
          </View>
        </View>

        <ProvaScore score={provaScore} />
        <LevelProgress level={level} />
        <LineGraph />
        <WeeklyBarChart />
        <ActivityHeatmap />
        <CategoryBreakdown />
        <Milestones />

        {/* Goals */}
        {userData?.goals?.length > 0 && (
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
      </ScrollView>
    </SafeAreaView>  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: COLORS.textSecondary },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.lg },

  // Stats row
  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  statCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: SPACING.sm,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  statValue: { color: COLORS.text, fontSize: 22, fontWeight: '900' },
  statUnit: { color: COLORS.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  statLabel: { color: COLORS.textMuted, fontSize: 9, marginTop: 2, textAlign: 'center' },

  // Prova Score
  scoreCard: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row',
    alignItems: 'center', gap: SPACING.lg, marginBottom: SPACING.lg,  },
  scoreRingWrapper: { alignItems: 'center', justifyContent: 'center' },
  scoreRingOuter: {
    width: 110, height: 110, borderRadius: 55, borderWidth: 8,
    borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
  },
  scoreRingFill: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    borderWidth: 8, borderTopColor: 'transparent', borderRightColor: 'transparent',
    transform: [{ rotate: '-45deg' }],
  },
  scoreCenter: { alignItems: 'center' },
  scoreNumber: { color: COLORS.text, fontSize: 28, fontWeight: '900' },
  scoreMax: { color: COLORS.textMuted, fontSize: 11 },
  scoreRight: { flex: 1 },
  scoreTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800', marginBottom: SPACING.xs },
  scoreDesc: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: SPACING.sm },
  scoreBadge: {
    backgroundColor: COLORS.surface, borderRadius: 8, paddingHorizontal: SPACING.sm,
    paddingVertical: 4, alignSelf: 'flex-start', borderWidth: 1, borderColor: COLORS.border,
  },
  scoreBadgeText: { color: COLORS.text, fontSize: 12, fontWeight: '700' },

  // Level
  levelCard: {
    backgroundColor: COLORS.primary + '22', borderRadius: 16, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.primary + '44', marginBottom: SPACING.lg,
  },
  levelTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.md },
  levelSub: { color: COLORS.primary, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  levelValue: { color: COLORS.text, fontSize: 28, fontWeight: '900' },
  nextLevelBadge: { backgroundColor: COLORS.primary + '33', borderRadius: 8, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  nextLevelText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  xpTrack: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginBottom: SPACING.xs },
  xpBar: { height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  xpLabel: { color: COLORS.textSecondary, fontSize: 12 },

  // Section
  section: { marginBottom: SPACING.xl },
  sectionTitle: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.md },

  // Line graph
  graphContainer: { position: 'relative', width: '100%', backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  graphGuideLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COLORS.border + '55' },
  graphDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  graphDotEmpty: { backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border },
  graphDotToday: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: COLORS.text, backgroundColor: COLORS.primary },
  graphXAxis: { position: 'absolute', left: 0, right: 0, flexDirection: 'row' },
  graphXLabel: { color: COLORS.textMuted, fontSize: 9, textAlign: 'center' },
  graphLegend: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.sm },
  graphLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  graphLegendDot: { width: 8, height: 8, borderRadius: 4 },
  graphLegendText: { color: COLORS.textMuted, fontSize: 11 },
  graphPeak: { color: COLORS.textSecondary, fontSize: 11, marginLeft: 'auto' },

  // Bar chart
  barChart: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.md, height: 180 },
  barCol: { alignItems: 'center', flex: 1 },
  barValue: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  barTrack: { width: '100%', height: 120, justifyContent: 'flex-end', backgroundColor: COLORS.card, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  barFill: { width: '100%', borderRadius: 8 },
  barFillActive: { shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowRadius: 8 },
  barLabel: { color: COLORS.textMuted, fontSize: 9, marginTop: 6, textAlign: 'center' },

  // Heatmap
  heatmapDays: { flexDirection: 'row', marginBottom: SPACING.xs },
  heatmapDayLabel: { flex: 1, color: COLORS.textMuted, fontSize: 10, textAlign: 'center' },
  heatmapRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  heatmapCell: { flex: 1, height: 28, borderRadius: 6, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  heatmapCellHalf: { backgroundColor: COLORS.primary + '55', borderColor: COLORS.primary + '44' },
  heatmapCellFull: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  heatmapLegend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm, justifyContent: 'flex-end' },
  heatmapLegendText: { color: COLORS.textMuted, fontSize: 10 },

  // Category
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm, gap: SPACING.sm },
  catLabel: { color: COLORS.textSecondary, fontSize: 12, width: 90 },
  catTrack: { flex: 1, height: 8, backgroundColor: COLORS.card, borderRadius: 4, overflow: 'hidden' },
  catBar: { height: 8, borderRadius: 4 },
  catMins: { color: COLORS.textMuted, fontSize: 11, width: 30, textAlign: 'right' },

  // Milestones
  milestoneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  milestoneBadge: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.primary + '44',
    width: (CHART_W - SPACING.sm * 2) / 3,
  },
  milestoneLocked: { borderColor: COLORS.border, opacity: 0.4 },
  milestoneIcon: { fontSize: 24, marginBottom: 4 },
  milestoneLabel: { color: COLORS.text, fontSize: 10, fontWeight: '600', textAlign: 'center' },
  milestoneLabelLocked: { color: COLORS.textMuted },

  // Goals
  goalItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  goalDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  goalText: { color: COLORS.text, fontSize: 15 },});
