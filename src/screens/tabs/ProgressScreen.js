import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator, TouchableOpacity, TextInput, Modal, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { doc, getDoc, getDocs, collection, query, orderBy, limit, where, updateDoc, arrayUnion } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';
import { displayScore, scoreRank, formatScore, RANKS } from '../../lib/score';
import { makeChatId, sendChatMessage } from '../../lib/chat';
import { displayName } from '../../lib/displayName';
import { formatProgressReport } from '../../lib/progressReport';

const SCREEN_W = Dimensions.get('window').width;
const CHART_W = SCREEN_W - SPACING.xl * 2;
const GRAPH_H = 120;
const GRAPH_PAD = 8;
const CACHE_TTL = 5 * 60 * 1000;

// Practice heatmap: 12 weeks of small squares (GitHub-contributions style)
const HEATMAP_WEEKS = 12;
const HEAT_CELL = 14;
const HEAT_GAP = 3;

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

// Prova Score for a raw user doc — used to rank leaderboards. The score itself
// lives in src/lib/score.js (banked per session; never decreases).
function entryScore(e) {
  return displayScore(e);
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

// Weekly practice hours over the last N weeks (oldest first) for the trend graph.
function buildWeeklySeries(logMap, weeks = 12) {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const monStart = new Date(today);
  monStart.setDate(today.getDate() - dow);
  monStart.setHours(0, 0, 0, 0);
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    let mins = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(monStart);
      day.setDate(monStart.getDate() - w * 7 + d);
      if (day <= today) mins += logMap[day.toISOString().split('T')[0]]?.totalMinutes || 0;
    }
    out.push({ hours: Math.round(mins / 60 * 10) / 10 });
  }
  return out;
}

// Smooth cubic path through points (flat control handles at segment midpoints).
function smoothLinePath(pts) {
  if (!pts.length) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i]; const p1 = pts[i + 1];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

// Build a 7-row (Mon→Sun) × N-week grid of intensity buckets, oldest week first.
// Buckets: -1 future · 0 none · 1 <15m · 2 15–30m · 3 30m+. Also returns how many
// days were practiced in the window and the hours logged, for the footer.
function buildHeatmapData(logMap) {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // 0 = Mon
  const monStart = new Date(today);
  monStart.setDate(today.getDate() - dow);
  monStart.setHours(0, 0, 0, 0);

  const rows = Array.from({ length: 7 }, () => []);
  let daysPracticed = 0;
  let totalMins = 0;
  for (let w = HEATMAP_WEEKS - 1; w >= 0; w--) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(monStart);
      day.setDate(monStart.getDate() - w * 7 + d);
      if (day > today) { rows[d].push(-1); continue; }
      const mins = logMap[day.toISOString().split('T')[0]]?.totalMinutes || 0;
      if (mins > 0) { daysPracticed++; totalMins += mins; }
      rows[d].push(mins === 0 ? 0 : mins < 15 ? 1 : mins < 30 ? 2 : 3);
    }
  }
  return { rows, daysPracticed, totalHours: Math.round(totalMins / 60) };
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

// Circular progress ring that fills clockwise from the top based on `progress`
// (0–1) — empty at a fresh rank, full just before the next one.
function ScoreRing({ progress, color, size = 110, stroke = 8, children }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={COLORS.border} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

function ProvaScore({ score, onPress }) {
  const rank = scoreRank(score);
  return (
    <TouchableOpacity style={styles.scoreCard} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.scoreRingWrapper}>
        <ScoreRing progress={rank.progress} color={rank.color}>
          <Text style={styles.scoreEmoji}>{rank.emoji}</Text>
        </ScoreRing>
      </View>
      <View style={styles.scoreRight}>
        <Text style={styles.scoreTitle}>Prova Score</Text>
        <Text style={[styles.scoreRankName, { color: rank.color }]}>{rank.name}</Text>
        <Text style={styles.scoreValue}>{formatScore(score)} <Text style={styles.scorePts}>pts</Text></Text>
        {/* Progress toward the next rank — always something to chase. */}
        <View style={styles.scoreProgressTrack}>
          <View style={[styles.scoreProgressFill, { width: `${Math.round(rank.progress * 100)}%`, backgroundColor: rank.color }]} />
        </View>
        <Text style={styles.scoreDesc}>
          {rank.isMax
            ? 'Max rank — you\'re a legend 🏆'
            : `${formatScore(rank.toNext)} pts to ${rank.next.emoji} ${rank.next.name}`}
        </Text>
        <Text style={styles.scoreAllLink}>View all ranks ›</Text>
      </View>
    </TouchableOpacity>
  );
}

// Full ladder viewer — every rank, its threshold, and where you stand.
function RanksModal({ visible, score, onClose }) {
  const current = scoreRank(score);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.ranksBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.ranksSheet}>
          <View style={styles.ranksHeader}>
            <Text style={styles.ranksTitle}>Ranks</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            {[...RANKS].reverse().map((r) => {
              const isCurrent = r.name === current.name;
              const reached = score >= r.min;
              return (
                <View key={r.name} style={[styles.rankRow, isCurrent && styles.rankRowCurrent]}>
                  <Text style={[styles.rankRowEmoji, !reached && { opacity: 0.35 }]}>{r.emoji}</Text>
                  <Text style={[styles.rankRowName, { color: reached ? r.color : COLORS.textMuted }]}>
                    {r.name}
                  </Text>
                  {isCurrent && <Text style={styles.rankRowYou}>YOU</Text>}
                  <Text style={styles.rankRowMin}>{formatScore(r.min)}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// A friendly chart placeholder — an icon, a headline and a hint — so a new
// account doesn't see a wall of blank boxes that reads as "broken".
function ChartEmpty({ icon, title, hint }) {
  return (
    <View style={styles.emptyChart}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name={icon} size={22} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyHint}>{hint}</Text>
    </View>
  );
}

function LineGraph({ data }) {
  if (!data || data.every(d => d.mins === 0)) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DAILY PRACTICE — LAST 14 DAYS</Text>
        <ChartEmpty
          icon="musical-notes-outline"
          title="Your first session starts the story"
          hint="Finish a practice session and your daily activity fills in right here."
        />
      </View>
    );
  }

  const maxMins = Math.max(...data.map(d => d.mins), 1);
  const totalMinsSum = data.reduce((s, d) => s + d.mins, 0);
  const fmtDur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);
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
        <Text style={styles.graphPeak}>{fmtDur(totalMinsSum)} total · peak {maxMins} min</Text>
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

function HeatCell({ val }) {
  return (
    <View style={[
      styles.heatCell,
      val === 0 && styles.heatCell0,
      val === 1 && styles.heatCell1,
      val === 2 && styles.heatCell2,
      val === 3 && styles.heatCell3,
      val === -1 && styles.heatCellFuture,
    ]} />
  );
}

// Smooth SVG area chart of weekly practice hours over 12 weeks.
function ActivityGraph({ data, streak }) {
  const H = 120;
  const PAD_TOP = 14;
  const PAD_BOTTOM = 10;
  const W = CHART_W - 2; // inside the card's 1px border
  const n = data.length;
  const hasData = data.some((d) => d.hours > 0);
  const maxH = Math.max(1, ...data.map((d) => d.hours));
  const totalH = Math.round(data.reduce((s, d) => s + d.hours, 0) * 10) / 10;
  const peak = Math.round(Math.max(0, ...data.map((d) => d.hours)) * 10) / 10;
  const stepX = n > 1 ? (W - 8) / (n - 1) : 0;
  const pts = data.map((d, i) => ({
    x: 4 + i * stepX,
    y: PAD_TOP + (1 - d.hours / maxH) * (H - PAD_TOP - PAD_BOTTOM),
  }));
  const line = smoothLinePath(pts);
  const area = n ? `${line} L ${pts[n - 1].x} ${H} L ${pts[0].x} ${H} Z` : '';
  const last = pts[n - 1] || { x: 0, y: 0 };

  return (
    <View style={styles.section}>
      <View style={styles.heatHeader}>
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>PRACTICE TREND · 12 WEEKS</Text>
        {streak > 0 && (
          <Text style={styles.heatStreak}>🔥 {streak} day{streak === 1 ? '' : 's'}</Text>
        )}
      </View>

      {hasData ? (
        <View style={styles.trendWrap}>
          <Svg width={W} height={H}>
            <Defs>
              <SvgGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={COLORS.primary} stopOpacity="0.45" />
                <Stop offset="1" stopColor={COLORS.primary} stopOpacity="0" />
              </SvgGradient>
            </Defs>
            <Path d={area} fill="url(#trendFill)" />
            <Path d={line} stroke={COLORS.primary} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={last.x} cy={last.y} r={8} fill={COLORS.primary} opacity={0.2} />
            <Circle cx={last.x} cy={last.y} r={4} fill={COLORS.primary} />
          </Svg>
          <Text style={styles.trendSummary}>{totalH}h total · peak {peak}h/week</Text>
        </View>
      ) : (
        <ChartEmpty
          icon="trending-up-outline"
          title="Your trend is taking shape"
          hint="Log a few sessions and your 12-week practice trend appears here."
        />
      )}
    </View>
  );
}

function CategoryBreakdown({ data }) {
  if (!data.length) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TIME BY CATEGORY</Text>
        <ChartEmpty
          icon="pie-chart-outline"
          title="See where your time goes"
          hint="Once you practise, this breaks your minutes down by technique, theory, songs and more."
        />
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

function LevelProgress({ totalMins }) {
  const mins = Math.max(0, Math.round(totalMins || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return (
    <View style={styles.levelCard}>
      <Text style={styles.levelSub}>TOTAL PRACTICE</Text>
      <Text style={styles.levelValue}>{h}h {m}m</Text>
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

// ─── Leaderboard ─────────────────────────────────────────────────────────────

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

function LeaderboardRow({ entry, rank, isMe }) {
  const score = displayScore(entry);
  const name = entry.username || (isMe ? auth.currentUser?.email?.split('@')[0].replace(/\d+/g, '') : entry.email?.split('@')[0].replace(/\d+/g, '')) || '?';
  const initial = (name[0] || '?').toUpperCase();
  return (
    <View style={[styles.lbRow, isMe && styles.lbRowMe]}>
      <Text style={styles.lbRank}>{rank <= 3 ? RANK_MEDALS[rank - 1] : `#${rank}`}</Text>
      <View style={[styles.lbAvatar, isMe && { backgroundColor: COLORS.primary }]}>
        <Text style={styles.lbAvatarText}>{initial}</Text>
      </View>
      <View style={styles.lbInfo}>
        <Text style={[styles.lbName, isMe && { color: COLORS.primary }]}>{isMe ? `${name} (you)` : name}</Text>
        <Text style={styles.lbMeta}>{entry.level || 'Beginner'} · {entry.streak || 0}🔥</Text>
      </View>
      <Text style={[styles.lbScore, isMe && { color: COLORS.primary }]}>{score}</Text>
    </View>
  );
}

function Leaderboard({ myUid, myData, worldBoard, friendsBoard, classBoard = [], className, onAddFriend }) {
  const inClass = classBoard.length > 0;
  // Joining a class auto-selects its leaderboard.
  const [tab, setTab] = useState(inClass ? 'class' : 'world');
  const [open, setOpen] = useState(true);     // collapsible section
  const [showAll, setShowAll] = useState(false); // expand the row list past the top few
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setAdding(true);
    try {
      const q = query(collection(db, 'users'), where('email', '==', trimmed));
      const snap = await getDocs(q);
      if (snap.empty) { Alert.alert('Not found', 'No Prova user with that email.'); return; }
      const friendUid = snap.docs[0].id;
      if (friendUid === myUid) { Alert.alert('Hmm', "That's you!"); return; }
      await updateDoc(doc(db, 'users', myUid), { friends: arrayUnion(friendUid) });
      setEmail('');
      setShowAdd(false);
      onAddFriend();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setAdding(false);
    }
  };

  const rows = tab === 'world' ? worldBoard : tab === 'class' ? classBoard : friendsBoard;
  const isEmpty = rows.length === 0;

  // Collapse long boards to the top few, with a "Show all" toggle. If the
  // current user is ranked below the cutoff, pin their row so they can always
  // see where they stand.
  const LB_COLLAPSED = 3;
  const myIndex = rows.findIndex(e => e.uid === myUid);
  const visibleRows = showAll ? rows : rows.slice(0, LB_COLLAPSED);
  const pinMe = !showAll && myIndex >= LB_COLLAPSED;

  return (
    <View style={styles.section}>
      {/* Collapsible header */}
      <TouchableOpacity style={styles.lbHeader} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>LEADERBOARD</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
      </TouchableOpacity>

      {open && (
        <>
          {/* Tab toggle */}
          <View style={styles.lbTabs}>
            {(inClass ? ['world', 'friends', 'class'] : ['world', 'friends']).map(t => (
              <TouchableOpacity key={t} style={[styles.lbTab, tab === t && styles.lbTabActive]} onPress={() => { setTab(t); setShowAll(false); }}>
                <Ionicons
                  name={t === 'world' ? 'globe-outline' : t === 'class' ? 'school-outline' : 'people-outline'}
                  size={14}
                  color={tab === t ? COLORS.text : COLORS.textMuted}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.lbTabText, tab === t && styles.lbTabTextActive]} numberOfLines={1}>
                  {t === 'world' ? 'World' : t === 'class' ? (className || 'Class') : 'Friends'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Board */}
          <View style={styles.lbCard}>
            {isEmpty ? (
              <View style={styles.lbEmpty}>
                <Text style={styles.lbEmptyIcon}>{tab === 'friends' ? '👥' : '🌍'}</Text>
                <Text style={styles.lbEmptyText}>
                  {tab === 'friends' ? 'Add friends to see how you stack up' : 'No data yet'}
                </Text>
              </View>
            ) : (
              <>
                {visibleRows.map((entry, i) => (
                  <LeaderboardRow key={entry.uid} entry={entry} rank={i + 1} isMe={entry.uid === myUid} />
                ))}
                {pinMe && (
                  <>
                    <View style={styles.lbGap}><Text style={styles.lbGapText}>•••</Text></View>
                    <LeaderboardRow entry={rows[myIndex]} rank={myIndex + 1} isMe />
                  </>
                )}
              </>
            )}
          </View>

          {/* Show all / less (only when the board is longer than the cutoff) */}
          {rows.length > LB_COLLAPSED && (
            <TouchableOpacity style={styles.lbShowAll} onPress={() => setShowAll(s => !s)} activeOpacity={0.7}>
              <Text style={styles.lbShowAllText}>{showAll ? 'Show less' : `Show all ${rows.length}`}</Text>
              <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.primary} />
            </TouchableOpacity>
          )}

          {/* Add friend button (friends tab) */}
          {tab === 'friends' && (
            <TouchableOpacity style={styles.addFriendBtn} onPress={() => setShowAdd(true)}>
              <Ionicons name="person-add-outline" size={15} color={COLORS.primary} />
              <Text style={styles.addFriendText}>Add Friend by Email</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Add friend modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a Friend</Text>
            <Text style={styles.modalSub}>Enter their Prova account email</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="friend@email.com"
              placeholderTextColor={COLORS.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setShowAdd(false); setEmail(''); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, adding && { opacity: 0.6 }]} onPress={handleAdd} disabled={adding}>
                {adding ? <ActivityIndicator color={COLORS.text} size="small" /> : <Text style={styles.modalConfirmText}>Add</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

// Progress is composed of cards the student can show/hide and reorder.
const DEFAULT_WIDGETS = [
  { id: 'stats', enabled: true },
  { id: 'score', enabled: true },
  { id: 'leaderboard', enabled: true },
  { id: 'level', enabled: true },
  { id: 'daily', enabled: true },
  { id: 'heatmap', enabled: true },
  { id: 'categories', enabled: true },
  { id: 'milestones', enabled: true },
  { id: 'goals', enabled: true },
];
const WIDGET_LABELS = {
  stats: 'Stats', score: 'Prova Score', leaderboard: 'Leaderboard', level: 'Level',
  daily: 'Daily graph', heatmap: 'Activity graph',
  categories: 'Categories', milestones: 'Milestones', goals: 'Goals',
};
function mergeLayout(saved) {
  if (!Array.isArray(saved)) return DEFAULT_WIDGETS;
  const known = new Set(Object.keys(WIDGET_LABELS));
  const kept = saved.filter((w) => w && known.has(w.id)).map((w) => ({ id: w.id, enabled: w.enabled !== false }));
  const have = new Set(kept.map((w) => w.id));
  DEFAULT_WIDGETS.forEach((d) => { if (!have.has(d.id)) kept.push({ ...d }); });
  return kept;
}

export default function ProgressScreen() {
  const [userData, setUserData] = useState(null);
  const [logMap, setLogMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [worldBoard, setWorldBoard] = useState([]);
  const [friendsBoard, setFriendsBoard] = useState([]);
  const [classBoard, setClassBoard] = useState([]);
  const [className, setClassName] = useState('');
  const [showRanks, setShowRanks] = useState(false);
  const [layout, setLayout] = useState(DEFAULT_WIDGETS);
  const [editMode, setEditMode] = useState(false);
  const [weekPoints, setWeekPoints] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [convos, setConvos] = useState([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState(null);
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

      const [userSnap, logsSnap, boardSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDocs(query(collection(db, 'sessionHistory', uid, 'logs'), orderBy('date', 'desc'), limit(HEATMAP_WEEKS * 7))),
        getDocs(query(collection(db, 'users'), orderBy('totalMinutes', 'desc'), limit(20))),
      ]);

      const data = userSnap.data();
      setUserData(data);
      setLayout(mergeLayout(data?.studentWidgets));

      // Rolling 7-day Prova-point gain. We anchor a baseline score on the user
      // doc; if it's missing or older than a week, restart the window from the
      // current score (so "this week" stays a true 7-day figure).
      const score = displayScore(data);
      const now = Date.now();
      const baseDate = data?.weekScoreDate ? new Date(data.weekScoreDate).getTime() : null;
      if (data?.weekScoreBaseline == null || !baseDate || now - baseDate >= 7 * 86400000) {
        setWeekPoints(0);
        updateDoc(doc(db, 'users', uid), { weekScoreBaseline: score, weekScoreDate: new Date().toISOString() }).catch(() => {});
      } else {
        setWeekPoints(Math.max(0, score - data.weekScoreBaseline));
      }

      const map = {};
      logsSnap.forEach(d => { map[d.id] = d.data(); });
      setLogMap(map);

      // Fetched by totalMinutes for a cheap top-N, then ranked by Prova Score
      const world = boardSnap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .sort((a, b) => entryScore(b) - entryScore(a));
      setWorldBoard(world);

      // Fetch friends
      const friendUids = data?.friends || [];
      if (friendUids.length > 0) {
        const friendDocs = await Promise.all(friendUids.map(fuid => getDoc(doc(db, 'users', fuid))));
        const friends = friendDocs.filter(d => d.exists()).map(d => ({ uid: d.id, ...d.data() }));
        const board = [{ uid, ...data }, ...friends].sort((a, b) => entryScore(b) - entryScore(a));
        setFriendsBoard(board);
      } else {
        setFriendsBoard([{ uid, ...data }]);
      }

      // Class leaderboard: if linked to a teacher and placed in one of their
      // classes, rank that class's members by Prova Score.
      const teacherUid = data?.teacherUid;
      if (teacherUid) {
        const teacherSnap = await getDoc(doc(db, 'users', teacherUid));
        const classes = Array.isArray(teacherSnap.data()?.classes) ? teacherSnap.data().classes : [];
        const myClass = classes.find((c) => (c.studentUids || []).includes(uid));
        if (myClass) {
          const memberDocs = await Promise.all((myClass.studentUids || []).map((suid) => getDoc(doc(db, 'users', suid))));
          const board = memberDocs.filter((d) => d.exists()).map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => entryScore(b) - entryScore(a));
          setClassBoard(board);
          setClassName(myClass.name || 'Class');
        } else {
          setClassBoard([]);
          setClassName('');
        }
      } else {
        setClassBoard([]);
        setClassName('');
      }

      lastFetchRef.current = Date.now();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const moveWidget = (id, dir) => {
    setLayout((prev) => {
      const i = prev.findIndex((w) => w.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const toggleWidget = (id) => setLayout((prev) => prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)));
  const saveLayout = async () => {
    setEditMode(false);
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { studentWidgets: layout }).catch(() => {});
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

  const provaScore   = displayScore(userData);
  const xp           = computeLevelXP(level, totalMins);
  const dailyData    = buildDailyData(logMap);
  const weeklyData   = buildWeeklyData(logMap);
  const weeklyTrend  = buildWeeklySeries(logMap);
  const categoryData = buildCategoryData(logMap);
  const milestones   = computeMilestones(streak, totalMins, totalSessions);

  // This week's practice from the daily logs (last 7 calendar days).
  const wkCut = new Date(); wkCut.setDate(wkCut.getDate() - 6);
  const cutoffYmd = `${wkCut.getFullYear()}-${String(wkCut.getMonth() + 1).padStart(2, '0')}-${String(wkCut.getDate()).padStart(2, '0')}`;
  let weekMins = 0; let daysPracticed = 0;
  Object.entries(logMap).forEach(([date, log]) => {
    if (date >= cutoffYmd && (log.totalMinutes || 0) > 0) { weekMins += log.totalMinutes; daysPracticed += 1; }
  });

  const buildReportText = () => formatProgressReport({
    weekPoints, daysPracticed, weekMins, streak, provaScore,
    rankName: scoreRank(provaScore).name, level,
  });

  // Open the share sheet: load the user's in-app conversations so they can send
  // the report straight to a friend, with "share outside the app" as a fallback.
  const openShare = async () => {
    setShareOpen(true);
    setShareLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      const snap = await getDocs(collection(db, 'userChats', uid, 'conversations'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.otherUid);
      const withNames = await Promise.all(list.map(async (c) => {
        let name = c.otherEmail ? c.otherEmail.split('@')[0] : 'Someone';
        try { const us = await getDoc(doc(db, 'users', c.otherUid)); name = displayName({ uid: c.otherUid, ...us.data() }); } catch (e) { /* fall back to email */ }
        return { ...c, name };
      }));
      withNames.sort((a, b) => a.name.localeCompare(b.name));
      setConvos(withNames);
    } catch (e) {
      setConvos([]);
    } finally {
      setShareLoading(false);
    }
  };

  const shareExternal = async () => {
    setShareOpen(false);
    try { await Share.share({ message: buildReportText() }); } catch (e) { /* user cancelled */ }
  };

  const sendToConversation = async (c) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSendingTo(c.otherUid);
    try {
      await sendChatMessage({
        chatId: c.chatId || makeChatId(uid, c.otherUid),
        senderUid: uid,
        senderEmail: auth.currentUser?.email || '',
        otherUid: c.otherUid,
        otherEmail: c.otherEmail || '',
        text: buildReportText(),
      });
      setShareOpen(false);
      Alert.alert('Sent!', `Your progress was sent to ${c.name}.`);
    } catch (e) {
      Alert.alert('Error', "Couldn't send. Please try again.");
    } finally {
      setSendingTo(null);
    }
  };

  const renderWidget = (id) => {
    switch (id) {
      case 'stats':
        return (
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
        );
      case 'score':
        return <ProvaScore score={provaScore} onPress={() => setShowRanks(true)} />;
      case 'leaderboard':
        return (
          <Leaderboard
            myUid={auth.currentUser?.uid}
            myData={userData}
            worldBoard={worldBoard}
            friendsBoard={friendsBoard}
            classBoard={classBoard}
            className={className}
            onAddFriend={() => { lastFetchRef.current = 0; loadData(); }}
          />
        );
      case 'level': return <LevelProgress totalMins={totalMins} />;
      // Charts hide themselves until there's data, so new users don't see empty boxes.
      case 'daily': return dailyData.some(d => d.mins > 0) ? <LineGraph data={dailyData} /> : null;
      case 'heatmap': return weeklyTrend.some(d => d.hours > 0) ? <ActivityGraph data={weeklyTrend} streak={streak} /> : null;
      case 'categories': return categoryData.length ? <CategoryBreakdown data={categoryData} /> : null;
      case 'milestones': return <Milestones data={milestones} />;
      case 'goals':
        return userData?.goals?.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>YOUR GOALS</Text>
            {userData.goals.map(goal => (
              <View key={goal} style={styles.goalItem}>
                <View style={styles.goalDot} />
                <Text style={styles.goalText}>{goal}</Text>
              </View>
            ))}
          </View>
        ) : null;
      default: return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Progress</Text>
          <TouchableOpacity
            style={[styles.editBtn, editMode && styles.editBtnActive]}
            onPress={() => (editMode ? saveLayout() : setEditMode(true))}
            activeOpacity={0.85}
          >
            <Ionicons name={editMode ? 'checkmark' : 'create-outline'} size={16} color={editMode ? '#fff' : COLORS.primary} />
            <Text style={[styles.editBtnText, editMode && { color: '#fff' }]}>{editMode ? 'Done' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>

        {editMode && (
          <Text style={styles.editHelp}>Reorder with the arrows or hide a card with the eye. Tap Done to save.</Text>
        )}

        {!editMode && (
          <TouchableOpacity style={styles.shareBtn} onPress={openShare} activeOpacity={0.85}>
            <Ionicons name="share-outline" size={16} color="#fff" />
            <Text style={styles.shareBtnText}>Share my progress</Text>
            <Text style={styles.shareBtnPts}>+{formatScore(weekPoints)} pts this week</Text>
          </TouchableOpacity>
        )}

        <RanksModal visible={showRanks} score={provaScore} onClose={() => setShowRanks(false)} />

        {layout.map((w, i) => {
          const content = renderWidget(w.id);
          if (!content) return null;
          if (editMode) {
            return (
              <View key={w.id} style={styles.editWrap}>
                <View style={styles.editBar}>
                  <Text style={styles.editName}>{WIDGET_LABELS[w.id]}</Text>
                  <View style={styles.editControls}>
                    <TouchableOpacity onPress={() => moveWidget(w.id, -1)} disabled={i === 0} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Ionicons name="arrow-up" size={20} color={i === 0 ? COLORS.textMuted : COLORS.text} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveWidget(w.id, 1)} disabled={i === layout.length - 1} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Ionicons name="arrow-down" size={20} color={i === layout.length - 1 ? COLORS.textMuted : COLORS.text} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => toggleWidget(w.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Ionicons name={w.enabled ? 'eye' : 'eye-off'} size={20} color={w.enabled ? COLORS.primary : COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View pointerEvents="none" style={!w.enabled && { opacity: 0.35 }}>{content}</View>
              </View>
            );
          }
          return w.enabled ? <View key={w.id}>{content}</View> : null;
        })}

        {!editMode && !dailyData.some(d => d.mins > 0) && (
          <View style={styles.section}>
            <ChartEmpty
              icon="bar-chart-outline"
              title="Your practice charts will appear here"
              hint="Finish your first session and your daily activity, trend and category breakdown all fill in automatically."
            />
          </View>
        )}
      </ScrollView>

      <Modal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)}>
        <TouchableOpacity style={styles.shareBackdrop} activeOpacity={1} onPress={() => setShareOpen(false)}>
          <TouchableOpacity style={styles.shareSheet} activeOpacity={1}>
            <View style={styles.shareSheetHandle} />
            <Text style={styles.shareSheetTitle}>Share my progress</Text>
            <Text style={styles.shareSheetSub}>Send it to a friend in the app, or share it anywhere.</Text>

            {shareLoading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginVertical: SPACING.lg }} />
            ) : convos.length === 0 ? (
              <Text style={styles.shareEmpty}>No chats yet — start a conversation in Messages first, or share outside the app below.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 260 }}>
                {convos.map((c) => (
                  <TouchableOpacity key={c.id} style={styles.shareRow} onPress={() => sendToConversation(c)} disabled={sendingTo != null} activeOpacity={0.7}>
                    <View style={styles.shareAvatar}><Text style={styles.shareAvatarText}>{c.name.charAt(0).toUpperCase()}</Text></View>
                    <Text style={styles.shareRowName} numberOfLines={1}>{c.name}</Text>
                    {sendingTo === c.otherUid
                      ? <ActivityIndicator size="small" color={COLORS.primary} />
                      : <Ionicons name="send" size={16} color={COLORS.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.shareExternalBtn} onPress={shareExternal} activeOpacity={0.85}>
              <Ionicons name="share-outline" size={16} color={COLORS.text} />
              <Text style={styles.shareExternalText}>Share outside the app</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.surface, marginBottom: SPACING.lg },
  editBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  editBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  editHelp: { color: COLORS.textMuted, fontSize: 12, lineHeight: 17, marginBottom: SPACING.md, marginTop: -SPACING.sm },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 13, paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg,
  },
  shareBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', flex: 1 },
  shareBtnPts: { color: '#fff', fontSize: 12, fontWeight: '700', opacity: 0.85 },
  shareBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  shareSheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: SPACING.xxl },
  shareSheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, marginBottom: SPACING.md },
  shareSheetTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  shareSheetSub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, marginBottom: SPACING.md },
  shareEmpty: { color: COLORS.textMuted, fontSize: 13, lineHeight: 19, marginVertical: SPACING.md },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  shareAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primary + '22', alignItems: 'center', justifyContent: 'center' },
  shareAvatarText: { color: COLORS.primary, fontSize: 16, fontWeight: '800' },
  shareRowName: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '600' },
  shareExternalBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: SPACING.lg, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border },
  shareExternalText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  editWrap: { borderWidth: 1, borderColor: COLORS.primary + '55', borderRadius: 16, padding: SPACING.sm, marginBottom: SPACING.md, backgroundColor: COLORS.primary + '0C' },
  editBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm, paddingHorizontal: 4 },
  editName: { color: COLORS.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  editControls: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },

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
  scoreEmoji: { fontSize: 34 },
  scoreRight: { flex: 1 },
  scoreTitle: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  scoreRankName: { fontSize: 20, fontWeight: '900', marginBottom: 2 },
  scoreValue: { color: COLORS.text, fontSize: 22, fontWeight: '900', marginBottom: SPACING.sm },
  scorePts: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  scoreProgressTrack: { height: 8, borderRadius: 4, backgroundColor: COLORS.surface, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  scoreProgressFill: { height: '100%', borderRadius: 4 },
  scoreAllLink: { color: COLORS.primary, fontSize: 12, fontWeight: '700', marginTop: SPACING.sm },

  // Ranks ladder modal
  ranksBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  ranksSheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, paddingBottom: SPACING.xl },
  ranksHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  ranksTitle: { color: COLORS.text, fontSize: 20, fontWeight: '900' },
  rankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: SPACING.sm, borderRadius: 10, gap: SPACING.md },
  rankRowCurrent: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  rankRowEmoji: { fontSize: 22, width: 28, textAlign: 'center' },
  rankRowName: { flex: 1, fontSize: 16, fontWeight: '800' },
  rankRowYou: { color: COLORS.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginRight: SPACING.sm },
  rankRowMin: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  scoreDesc: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17, marginTop: SPACING.xs, marginBottom: SPACING.sm },
  scoreBadge: { backgroundColor: COLORS.surface, borderRadius: 8, paddingHorizontal: SPACING.sm, paddingVertical: 4, alignSelf: 'flex-start', borderWidth: 1, borderColor: COLORS.border },
  scoreBadgeText: { color: COLORS.text, fontSize: 12, fontWeight: '700' },

  levelCard: { backgroundColor: COLORS.primary + '22', borderRadius: 14, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, borderWidth: 1, borderColor: COLORS.primary + '44', marginBottom: SPACING.lg },
  levelSub: { color: COLORS.primary, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 3 },
  levelValue: { color: COLORS.text, fontSize: 22, fontWeight: '800' },
  nextLevelBadge: { backgroundColor: COLORS.primary + '33', borderRadius: 8, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  nextLevelText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  xpTrack: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginBottom: SPACING.xs },
  xpBar: { height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  xpLabel: { color: COLORS.textSecondary, fontSize: 12 },

  section: { marginBottom: SPACING.xl },
  sectionTitle: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.md },

  emptyChart: { minHeight: 132, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.lg, paddingHorizontal: SPACING.xl, gap: 6 },
  emptyIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  emptyTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptyHint: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 18 },
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

  heatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  heatStreak: { color: COLORS.primary, fontSize: 12, fontWeight: '800' },
  trendWrap: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  trendSummary: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600', paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, paddingTop: 2 },
  heatGrid: { flexDirection: 'row' },
  heatDayCol: { marginRight: 6, justifyContent: 'flex-start' },
  heatDayLabel: { height: HEAT_CELL, lineHeight: HEAT_CELL, marginBottom: HEAT_GAP, color: COLORS.textMuted, fontSize: 9, fontWeight: '600' },
  heatRow: { flexDirection: 'row', gap: HEAT_GAP, marginBottom: HEAT_GAP },
  heatCell: { width: HEAT_CELL, height: HEAT_CELL, borderRadius: 3 },
  heatCell0: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  heatCell1: { backgroundColor: COLORS.primary + '40' },
  heatCell2: { backgroundColor: COLORS.primary + '80' },
  heatCell3: { backgroundColor: COLORS.primary },
  heatCellFuture: { backgroundColor: 'transparent' },
  heatFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md, flexWrap: 'wrap', gap: SPACING.sm },
  heatFooterText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600' },
  heatLegend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heatLegendText: { color: COLORS.textMuted, fontSize: 10 },

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

  lbHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  lbTabs: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 12, padding: 4, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  lbTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.sm, borderRadius: 9 },
  lbTabActive: { backgroundColor: COLORS.surface },
  lbTabText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  lbTabTextActive: { color: COLORS.text },

  lbCard: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', marginBottom: SPACING.sm },
  lbRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border + '66', gap: SPACING.sm },
  lbRowMe: { backgroundColor: COLORS.primary + '12' },
  lbRank: { width: 28, fontSize: 14, fontWeight: '800', color: COLORS.textMuted, textAlign: 'center' },
  lbAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  lbAvatarText: { color: COLORS.text, fontWeight: '800', fontSize: 14 },
  lbInfo: { flex: 1 },
  lbName: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  lbMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  lbScore: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '900' },

  lbEmpty: { alignItems: 'center', paddingVertical: SPACING.xxl },
  lbEmptyIcon: { fontSize: 36, marginBottom: SPACING.sm },
  lbEmptyText: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center' },

  lbGap: { alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border + '66' },
  lbGapText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  lbShowAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: SPACING.sm, marginBottom: SPACING.sm },
  lbShowAllText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },

  addFriendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, backgroundColor: COLORS.primary + '15', borderRadius: 12, borderWidth: 1, borderColor: COLORS.primary + '33' },
  addFriendText: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: 40, borderTopWidth: 1, borderColor: COLORS.border },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginBottom: 4 },
  modalSub: { color: COLORS.textSecondary, fontSize: 13, marginBottom: SPACING.lg },
  modalInput: { backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 12, padding: SPACING.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg },
  modalBtns: { flexDirection: 'row', gap: SPACING.md },
  modalCancel: { flex: 1, padding: SPACING.md, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  modalCancelText: { color: COLORS.textSecondary, fontWeight: '600' },
  modalConfirm: { flex: 1, padding: SPACING.md, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center' },
  modalConfirmText: { color: COLORS.text, fontWeight: '700' },
});
