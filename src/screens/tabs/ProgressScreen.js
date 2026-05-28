import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { doc, getDoc, getDocs, collection, query, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';

const SCREEN_W = Dimensions.get('window').width;
const CHART_W = SCREEN_W - SPACING.xl * 2;
const GRAPH_H = 120;
const GRAPH_PAD = 8;
const CACHE_TTL = 5 * 60 * 1000;

const LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];

const CATEGORY_COLORS = {
  warmup: '#06B6D4',
  technique: '#3B82F6',
  theory: '#8B5CF6',
  ear_training: '#10B981',
  repertoire: '#0EA5E9',
  improvisation: '#6366F1',
};

// Hours of practice needed to "fill" the progress bar for each level
const LEVEL_HOURS = { Beginner: 10, Novice: 25, Intermediate: 60, Advanced: 120, Elite: 120 };

// ─── Data helpers ─────────────────────────────────────────────────────────────

function computeProvaScore(streak, totalMinutes, totalSessions, lastRating) {
  const streakPts  = Math.min(streak * 10, 300);
  const volumePts  = Math.min(Math.floor(totalMinutes / 12), 300);
  const sessionPts = Math.min(totalSessions * 5, 250);
  const qualityPts = lastRating === 'just_right' ? 150
    : lastRating === 'too_hard' ? 100
    : lastRating === 'too_easy' ? 75 : 0;
  return Math.min(1000, streakPts + volumePts + sessionPts + qualityPts);
}

function computeLevelXP(level, totalMinutes) {
  const needed = (LEVEL_HOURS[level] || 10) * 60;
  return level === 'Elite' ? 1 : Math.min(1, totalMinutes / needed);
}

function buildDailyData(logMap) {
  const result = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    result.push({ day: String(d.getDate()), mins: logMap[key]?.totalMinutes || 0 });
  }
  return result;
}

function buildWeeklyData(logMap) {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // 0 = Mon
  const monStart = new Date(today);
  monStart.setDate(today.getDate() - dow);
  monStart.setHours(0, 0, 0, 0);

  const weeks = [];
  for (let w = 3; w >= 0; w--) {
    let mins = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(monStart);
      day.setDate(monStart.getDate() - w * 7 + d);
      if (day <= today) {
        mins += logMap[day.toISOString().split('T')[0]]?.totalMinutes || 0;
      }
    }
    const label = (() => {
      const start = new Date(monStart);
      start.setDate(monStart.getDate() - w * 7);
      return start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    })();
    weeks.push({ week: label, hours: Math.round(mins / 60 * 10) / 10 });
  }
  return weeks;
}

function buildHeatmapData(logMap) {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const monStart = new Date(today);
  monStart.setDate(today.getDate() - dow);
  monStart.setHours(0, 0, 0, 0);

  const weeks = [];
  for (let w = 4; w >= 0; w--) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(monStart);
      day.setDate(monStart.getDate() - w * 7 + d);
      if (day > today) { row.push(-1); continue; }
      const mins = logMap[day.toISOString().split('T')[0]]?.totalMinutes || 0;
      row.push(mins === 0 ? 0 : mins < 20 ? 0.5 : 1);
    }
    weeks.push(row);
  }
  return weeks;
}

function buildCategoryData(logMap) {
  const totals = {};
  Object.values(logMap).forEach(log => {
    Object.entries(log.categories || {}).forEach(([cat, mins]) => {
      totals[cat] = (totals[cat] || 0) + mins;
    });
  });
  return Object.entries(totals)
    .map(([cat, mins]) => ({
      label: cat.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
      mins,
      color: CATEGORY_COLORS[cat] || COLORS.primary,
    }))
    .sort((a, b) => b.mins - a.mins);
}

function computeMilestones(streak, totalMinutes, totalSessions) {
  const hours = totalMinutes / 60;
  return [
    { icon: '🎸', label: 'First Session', earned: totalSessions >= 1 },
    { icon: '🔥', label: '7-Day Streak', earned: streak >= 7 },
    { icon: '⏱️', label: '10 Hours', earned: hours >= 10 },
    { icon: '📅', label: '30 Sessions', earned: totalSessions >= 30 },
    { icon: '⭐', label: '25 Hours', earned: hours >= 25 },
    { icon: '🏆', label: '30-Day Streak', earned: streak >= 30 },
  ];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProvaScore({ score }) {
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
        <Text style={styles.scoreDesc}>Practice consistency, volume, and quality — in one number.</Text>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreBadgeText}>
            {score > 700 ? '🔥 On Fire' : score > 400 ? '📈 Improving' : '🌱 Getting Started'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function LineGraph({ data }) {
  if (!data || data.every(d => d.mins === 0)) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DAILY PRACTICE — LAST 14 DAYS</Text>
        <View style={[styles.emptyChart, { height: GRAPH_H }]}>
          <Text style={styles.emptyText}>Complete sessions to see your chart</Text>
        </View>
      </View>
    );
  }

  const maxMins = Math.max(...data.map(d => d.mins), 1);
  const spacing = (CHART_W - GRAPH_PAD * 2) / (data.length - 1);
  const getX = i => GRAPH_PAD + i * spacing;
  const getY = mins => GRAPH_H - GRAPH_PAD - (mins / maxMins) * (GRAPH_H - GRAPH_PAD * 2);

  const lines = data.slice(0, -1).map((d, i) => {
    const x1 = getX(i), y1 = getY(d.mins);
    const x2 = getX(i + 1), y2 = getY(data[i + 1].mins);
    const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const ang = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
    return { cx: (x1 + x2) / 2 - len / 2, cy: (y1 + y2) / 2 - 1.25, len, ang };
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>DAILY PRACTICE — LAST 14 DAYS</Text>
      <View style={[styles.graphContainer, { height: GRAPH_H + 24 }]}>
        {[0, 0.5, 1].map(pct => (
          <View key={pct} style={[styles.graphGuideLine, { top: GRAPH_PAD + (1 - pct) * (GRAPH_H - GRAPH_PAD * 2) }]} />
        ))}
        {lines.map((seg, i) => (
          <View key={i} style={{
            position: 'absolute', left: seg.cx, top: seg.cy,
            width: seg.len, height: 2.5, backgroundColor: COLORS.primary,
            borderRadius: 2, transform: [{ rotate: `${seg.ang}deg` }],
          }} />
        ))}
        {data.map((d, i) => {
          const x = getX(i), y = getY(d.mins);
          const isToday = i === data.length - 1;
          return (
            <View key={i} style={[
              styles.graphDot,
              d.mins === 0 && styles.graphDotEmpty,
              isToday && styles.graphDotToday,
              { left: x - (isToday ? 7 : 4), top: y - (isToday ? 7 : 4) },
            ]} />
          );
        })}
        <View style={[styles.graphXAxis, { top: GRAPH_H }]}>
          {data.map((d, i) => (
            <Text key={i} style={[styles.graphXLabel, { width: spacing, marginLeft: i === 0 ? GRAPH_PAD : 0 }]}>
              {i % 2 === 0 ? d.day : ''}
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.graphLegend}>
        <View style={styles.graphLegendItem}>
          <View style={[styles.graphLegendDot, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.graphLegendText}>Practice day</Text>
        </View>
        <Text style={styles.graphPeak}>Peak: {Math.max(...data.map(d => d.mins))} min</Text>
      </View>
    </View>
  );
}

function WeeklyBarChart({ data }) {
  const maxH = Math.max(...data.map(w => w.hours), 0.1);
  const barW = (CHART_W - SPACING.md * (data.length - 1)) / data.length;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>WEEKLY PRACTICE HOURS</Text>
      <View style={styles.barChart}>
        {data.map((w, i) => {
          const barH = (w.hours / maxH) * 120;
          const isLatest = i === data.length - 1;
          return (
            <View key={w.week} style={[styles.barCol, { width: barW }]}>
              <Text style={[styles.barValue, isLatest && { color: COLORS.primary }]}>{w.hours}h</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { height: Math.max(barH, 2), backgroundColor: isLatest ? COLORS.primary : COLORS.card }, isLatest && styles.barFillActive]} />
              </View>
              <Text style={styles.barLabel}>{w.week}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ActivityHeatmap({ data }) {
  const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>ACTIVITY — LAST 5 WEEKS</Text>
      <View style={styles.heatmapDays}>
        {DAYS.map((d, i) => <Text key={i} style={styles.heatmapDayLabel}>{d}</Text>)}
      </View>
      {data.map((week, wi) => (
        <View key={wi} style={styles.heatmapRow}>
          {week.map((val, di) => (
            <View key={di} style={[
              styles.heatmapCell,
              val === 1 && styles.heatmapCellFull,
              val === 0.5 && styles.heatmapCellHalf,
              val === -1 && styles.heatmapCellFuture,
            ]} />
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

function CategoryBreakdown({ data }) {
  if (!data.length) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TIME BY CATEGORY</Text>
        <View style={styles.emptyChart}>
          <Text style={styles.emptyText}>Complete sessions to see your breakdown</Text>
        </View>
      </View>
    );
  }
  const total = data.reduce((s, c) => s + c.mins, 0);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>TIME BY CATEGORY</Text>
      {data.map(cat => (
        <View key={cat.label} style={styles.catRow}>
          <Text style={styles.catLabel}>{cat.label}</Text>
          <View style={styles.catTrack}>
            <View style={[styles.catBar, { width: `${(cat.mins / total) * 100}%`, backgroundColor: cat.color }]} />
          </View>
          <Text style={styles.catMins}>{Math.round(cat.mins / 60 * 10) / 10}h</Text>
        </View>
      ))}
    </View>
  );
}

function LevelProgress({ level, xp }) {
  const idx = LEVELS.indexOf(level);
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
        <View style={[styles.xpBar, { width: `${Math.min(xp * 100, 100)}%` }]} />
      </View>
      <Text style={styles.xpLabel}>
        {level === 'Elite' ? 'Maximum level reached' : `${Math.round(xp * 100)}% to ${nextLevel}`}
      </Text>
    </View>
  );
}

function Milestones({ data }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>MILESTONES</Text>
      <View style={styles.milestoneGrid}>
        {data.map(m => (
          <View key={m.label} style={[styles.milestoneBadge, !m.earned && styles.milestoneLocked]}>
            <Text style={styles.milestoneIcon}>{m.earned ? m.icon : '🔒'}</Text>
            <Text style={[styles.milestoneLabel, !m.earned && styles.milestoneLabelLocked]}>{m.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const [userData, setUserData] = useState(null);
  const [logMap, setLogMap] = useState({});
  const [loading, setLoading] = useState(true);
  const lastFetchRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastFetchRef.current > CACHE_TTL) loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const [userSnap, logsSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDocs(query(
          collection(db, 'sessionHistory', uid, 'logs'),
          orderBy('date', 'desc'),
          limit(35)
        )),
      ]);

      setUserData(userSnap.data());

      const map = {};
      logsSnap.forEach(d => { map[d.id] = d.data(); });
      setLogMap(map);

      lastFetchRef.current = Date.now();
    } catch (e) {
      console.error(e);
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

  const streak       = userData?.streak || 0;
  const totalMins    = userData?.totalMinutes || 0;
  const totalSessions = userData?.totalSessions || 0;
  const level        = userData?.level || 'Beginner';
  const lastRating   = userData?.lastSessionRating;
  const avgMins      = totalSessions > 0 ? Math.round(totalMins / totalSessions) : 0;

  const provaScore   = computeProvaScore(streak, totalMins, totalSessions, lastRating);
  const xp           = computeLevelXP(level, totalMins);
  const dailyData    = buildDailyData(logMap);
  const weeklyData   = buildWeeklyData(logMap);
  const heatmapData  = buildHeatmapData(logMap);
  const categoryData = buildCategoryData(logMap);
  const milestones   = computeMilestones(streak, totalMins, totalSessions);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Progress</Text>

        <View style={styles.statsRow}>
          {[
            { value: streak, unit: '🔥', label: 'Day Streak' },
            { value: Math.floor(totalMins / 60), unit: 'HRS', label: 'Total Time' },
            { value: totalSessions, unit: 'SESSIONS', label: 'All Time' },
            { value: avgMins, unit: 'MIN AVG', label: 'Per Session' },
          ].map(s => (
            <View key={s.label} style={styles.statCard}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statUnit}>{s.unit}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <ProvaScore score={provaScore} />
        <LevelProgress level={level} xp={xp} />
        <LineGraph data={dailyData} />
        <WeeklyBarChart data={weeklyData} />
        <ActivityHeatmap data={heatmapData} />
        <CategoryBreakdown data={categoryData} />
        <Milestones data={milestones} />

        {userData?.goals?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>YOUR GOALS</Text>
            {userData.goals.map(goal => (
              <View key={goal} style={styles.goalItem}>
                <View style={styles.goalDot} />
                <Text style={styles.goalText}>{goal}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.lg },

  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  statCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: SPACING.sm, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  statValue: { color: COLORS.text, fontSize: 22, fontWeight: '900' },
  statUnit: { color: COLORS.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  statLabel: { color: COLORS.textMuted, fontSize: 9, marginTop: 2, textAlign: 'center' },

  scoreCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, marginBottom: SPACING.lg },
  scoreRingWrapper: { alignItems: 'center', justifyContent: 'center' },
  scoreRingOuter: { width: 110, height: 110, borderRadius: 55, borderWidth: 8, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  scoreRingFill: { position: 'absolute', width: 110, height: 110, borderRadius: 55, borderWidth: 8, borderTopColor: 'transparent', borderRightColor: 'transparent', transform: [{ rotate: '-45deg' }] },
  scoreCenter: { alignItems: 'center' },
  scoreNumber: { color: COLORS.text, fontSize: 28, fontWeight: '900' },
  scoreMax: { color: COLORS.textMuted, fontSize: 11 },
  scoreRight: { flex: 1 },
  scoreTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800', marginBottom: SPACING.xs },
  scoreDesc: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: SPACING.sm },
  scoreBadge: { backgroundColor: COLORS.surface, borderRadius: 8, paddingHorizontal: SPACING.sm, paddingVertical: 4, alignSelf: 'flex-start', borderWidth: 1, borderColor: COLORS.border },
  scoreBadgeText: { color: COLORS.text, fontSize: 12, fontWeight: '700' },

  levelCard: { backgroundColor: COLORS.primary + '22', borderRadius: 16, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.primary + '44', marginBottom: SPACING.lg },
  levelTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.md },
  levelSub: { color: COLORS.primary, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  levelValue: { color: COLORS.text, fontSize: 28, fontWeight: '900' },
  nextLevelBadge: { backgroundColor: COLORS.primary + '33', borderRadius: 8, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  nextLevelText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  xpTrack: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginBottom: SPACING.xs },
  xpBar: { height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  xpLabel: { color: COLORS.textSecondary, fontSize: 12 },

  section: { marginBottom: SPACING.xl },
  sectionTitle: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.md },

  emptyChart: { height: 80, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: COLORS.textMuted, fontSize: 13 },

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
  graphPeak: { color: COLORS.textSecondary, fontSize: 11, flex: 1, textAlign: 'right' },

  barChart: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.md, height: 180 },
  barCol: { alignItems: 'center', flex: 1 },
  barValue: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  barTrack: { width: '100%', height: 120, justifyContent: 'flex-end', backgroundColor: COLORS.card, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  barFill: { width: '100%', borderRadius: 8 },
  barFillActive: { shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowRadius: 8 },
  barLabel: { color: COLORS.textMuted, fontSize: 9, marginTop: 6, textAlign: 'center' },

  heatmapDays: { flexDirection: 'row', marginBottom: SPACING.xs },
  heatmapDayLabel: { flex: 1, color: COLORS.textMuted, fontSize: 10, textAlign: 'center' },
  heatmapRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  heatmapCell: { flex: 1, height: 28, borderRadius: 6, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  heatmapCellHalf: { backgroundColor: COLORS.primary + '55', borderColor: COLORS.primary + '44' },
  heatmapCellFull: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  heatmapCellFuture: { backgroundColor: 'transparent', borderColor: 'transparent' },
  heatmapLegend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm, justifyContent: 'flex-end' },
  heatmapLegendText: { color: COLORS.textMuted, fontSize: 10 },

  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm, gap: SPACING.sm },
  catLabel: { color: COLORS.textSecondary, fontSize: 12, width: 90 },
  catTrack: { flex: 1, height: 8, backgroundColor: COLORS.card, borderRadius: 4, overflow: 'hidden' },
  catBar: { height: 8, borderRadius: 4 },
  catMins: { color: COLORS.textMuted, fontSize: 11, width: 30, textAlign: 'right' },

  milestoneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  milestoneBadge: { backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.primary + '44', width: (CHART_W - SPACING.sm * 2) / 3 },
  milestoneLocked: { borderColor: COLORS.border, opacity: 0.4 },
  milestoneIcon: { fontSize: 24, marginBottom: 4 },
  milestoneLabel: { color: COLORS.text, fontSize: 10, fontWeight: '600', textAlign: 'center' },
  milestoneLabelLocked: { color: COLORS.textMuted },

  goalItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  goalDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  goalText: { color: COLORS.text, fontSize: 15 },
});
