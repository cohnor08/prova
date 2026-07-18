// Rhythm tapper — a click track plays; the student taps in time and gets scored
// on how close each tap lands to the beat. Timing is the one fundamental most
// self-taught players never actually train, and — like the fretboard game — it's
// fully verifiable with NO microphone: we compare each tap to a driftless
// mathematical beat grid, so the score is honest and it works everywhere.
// Three levels widen the tempo and subdivision. Rounds bank +20 points for the
// first 3 a day, exactly like the other mini-games.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Pressable, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';
import { useMetronome } from '../../lib/MetronomeContext';
import { practiceStreakUpdates, logPracticeMinutes } from '../../lib/practiceLog';
import { useCelebration } from '../../components/Celebration';
import { track } from '../../lib/analytics';
import { allowGameRound, personalUpsell } from '../../lib/entitlements';

const ROUND_POINTS = 20;
const REWARDED_ROUNDS_PER_DAY = 3;
const COUNT_IN = 4;          // unscored lead-in clicks
const LEAD_MS = 550;         // delay before the first click so Start isn't instant
const MAX_WINDOW = 260;      // widest a tap can miss a beat by and still count (slow levels)

// Each level is really just an interval (ms between clicks) and a length. The
// note-value labels are flavour; what changes is how fast the grid comes.
// `div` = clicks per beat (1 = quarters, 2 = eighths, 4 = sixteenths); the
// actual interval is computed from the user-adjustable tempo.
const LEVELS = [
  { id: 1, label: 'Steady',     bpm: 70, div: 1, taps: 16, accentEvery: 4, note: 'Quarter notes' },
  { id: 2, label: 'Groove',     bpm: 96, div: 1, taps: 20, accentEvery: 4, note: 'Quarter notes' },
  { id: 3, label: 'Eighths',    bpm: 84, div: 2, taps: 24, accentEvery: 8, note: 'Eighth notes' },
  { id: 4, label: '16ths',      bpm: 66, div: 4, taps: 32, accentEvery: 8, note: 'Sixteenth notes' },
];
const BPM_MIN = 40;
const BPM_MAX = 200;
// Two ways to play: 'click' keeps the metronome the whole way; 'hold' plays one
// bar of click then goes SILENT — you keep the time on your own (real internal-
// clock training). The beats are scored the same either way.
const MODES = [['click', 'With click'], ['hold', 'Hold the time']];

// Distance (ms) between a tap and its beat → quality band.
function quality(err) {
  if (err <= 45)  return { key: 'perfect', label: 'Perfect', color: '#16a34a',       pts: 100 };
  if (err <= 90)  return { key: 'great',   label: 'Great',   color: '#22D3EE',       pts: 75 };
  if (err <= 160) return { key: 'good',    label: 'Good',    color: COLORS.primary,  pts: 45 };
  return            { key: 'off',     label: 'Off',     color: '#F5C044',       pts: 15 };
}

export default function RhythmTapperScreen({ navigation, route }) {
  useThemeSync();
  const celebrate = useCelebration();
  const [level, setLevel] = useState(route?.params?.level || 1);
  // A teacher can assign this drill at a mode + level, which arrive as params.
  const [mode, setMode] = useState(route?.params?.mode || 'click'); // 'click' | 'hold'
  const [phase, setPhase] = useState('menu');       // 'menu' | 'playing' | 'done'
  const [countIn, setCountIn] = useState(COUNT_IN);  // 4..1 during lead-in, 0 once scoring
  const [beatNum, setBeatNum] = useState(0);         // scored beats elapsed (shown while audible)
  const [held, setHeld] = useState(false);           // hold mode: click has dropped out
  const [feedback, setFeedback] = useState(null);    // { label, color } flash on each tap
  const [accuracy, setAccuracy] = useState(0);
  const [tally, setTally] = useState(null);
  const [rewarded, setRewarded] = useState(false);

  const tickRef = useRef(null);
  const accentRef = useRef(null);
  const timeoutRef = useRef(null);
  const fbTimeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const startRef = useRef(0);        // absolute ms of click index 0
  const beatTimesRef = useRef([]);   // absolute ms of each scored beat
  const matchedRef = useRef([]);     // per scored beat: null | { pts, qkey }
  const windowRef = useRef(MAX_WINDOW); // per-round match window (tightens on fast levels)
  const pulse = useRef(new Animated.Value(1)).current;

  // The game's click IS the metronome here — a second one ticking would wreck it.
  const metronome = useMetronome();
  useEffect(() => { metronome?.stop?.(); }, []);

  const base = LEVELS.find((l) => l.id === level);
  // Tempo is the user's to set — each level just supplies its default.
  const [bpm, setBpm] = useState(base.bpm);
  useEffect(() => { setBpm(LEVELS.find((l) => l.id === level).bpm); }, [level]);
  const cfg = { ...base, bpm, interval: Math.round(60000 / bpm / base.div) };

  // Load the metronome clicks once (same assets/rate as the Practice metronome).
  useEffect(() => {
    mountedRef.current = true;
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    Audio.Sound.createAsync(require('../../../assets/tick.wav'), { rate: 1.26, shouldCorrectPitch: false })
      .then(({ sound }) => { tickRef.current = sound; }).catch(() => {});
    Audio.Sound.createAsync(require('../../../assets/tick-accent.wav'), { rate: 1.26, shouldCorrectPitch: false })
      .then(({ sound }) => { accentRef.current = sound; }).catch(() => {});
    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutRef.current);
      clearTimeout(fbTimeoutRef.current);
      tickRef.current?.unloadAsync();
      accentRef.current?.unloadAsync();
    };
  }, []);

  const playClick = (accent) => {
    const s = accent ? accentRef.current : tickRef.current;
    s?.replayAsync().catch(() => {});
  };

  const pulseOnce = useCallback(() => {
    pulse.setValue(0.82);
    Animated.spring(pulse, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start();
  }, [pulse]);

  const flash = (q) => {
    setFeedback(q);
    clearTimeout(fbTimeoutRef.current);
    fbTimeoutRef.current = setTimeout(() => { if (mountedRef.current) setFeedback(null); }, 300);
  };

  // Driftless scheduler: each click's delay is recomputed from its absolute
  // target time, so small timer jitter never accumulates over the round.
  const scheduleTick = useCallback((i) => {
    const total = COUNT_IN + cfg.taps;
    const holdLead = cfg.accentEvery;                 // hold mode: one bar of click, then silence
    const target = startRef.current + i * cfg.interval;
    const delay = Math.max(0, target - Date.now());
    timeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      const isCountIn = i < COUNT_IN;
      const scoredIdx = i - COUNT_IN;
      const accent = isCountIn || scoredIdx % cfg.accentEvery === 0;
      // In 'hold' mode the click and the beat pulse stop after the lead bar, so
      // there's no external reference — you have to keep the time yourself.
      const audible = isCountIn || mode === 'click' || scoredIdx < holdLead;
      if (audible) { playClick(accent); pulseOnce(); }
      if (isCountIn) setCountIn(COUNT_IN - i);
      else {
        setCountIn(0);
        if (mode === 'hold' && scoredIdx === holdLead) setHeld(true);
        if (audible) setBeatNum(scoredIdx + 1);        // hide the counter once the click drops
      }

      if (i + 1 < total) scheduleTick(i + 1);
      else timeoutRef.current = setTimeout(() => { if (mountedRef.current) finishRound(); }, windowRef.current + 140);
    }, delay);
  }, [cfg, mode, pulseOnce]);

  const startRound = async () => {
    if (!(await allowGameRound('rhythmTapper'))) {
      personalUpsell(navigation, "You've played today's free round — Prova Personal unlocks unlimited rhythm rounds.");
      return;
    }
    startRef.current = Date.now() + LEAD_MS;
    beatTimesRef.current = Array.from({ length: cfg.taps }, (_, k) => startRef.current + (COUNT_IN + k) * cfg.interval);
    matchedRef.current = new Array(cfg.taps).fill(null);
    windowRef.current = Math.min(MAX_WINDOW, Math.round(cfg.interval * 0.5)); // never overlap adjacent beats
    setBeatNum(0); setCountIn(COUNT_IN); setHeld(false); setFeedback(null); setAccuracy(0); setTally(null); setRewarded(false);
    setPhase('playing');
    scheduleTick(0);
  };

  const onTap = () => {
    if (phase !== 'playing') return;
    const t = Date.now();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    pulseOnce();
    const times = beatTimesRef.current;
    const matched = matchedRef.current;
    let best = -1, bestErr = Infinity;
    for (let k = 0; k < times.length; k++) {
      if (matched[k]) continue;
      const e = Math.abs(t - times[k]);
      if (e < bestErr) { bestErr = e; best = k; }
    }
    if (best === -1 || bestErr > windowRef.current) { flash({ label: '·', color: COLORS.textMuted }); return; }
    const q = quality(bestErr);
    matched[best] = { pts: q.pts, qkey: q.key };
    flash(q);
  };

  const finishRound = async () => {
    const results = matchedRef.current;
    const t = { perfect: 0, great: 0, good: 0, off: 0, miss: 0 };
    let pts = 0;
    results.forEach((r) => { if (!r) t.miss++; else { pts += r.pts; t[r.qkey]++; } });
    const acc = Math.round((pts / (cfg.taps * 100)) * 100);
    setTally(t); setAccuracy(acc); setPhase('done');
    track('rhythm_round_completed', { level, accuracy: acc });
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        const today = new Date().toISOString().split('T')[0];
        const cur = (await getDoc(doc(db, 'users', uid))).data() || {};
        if (cur.role === 'teacher') {
          celebrate({ title: 'Round complete!', subtitle: `Worth ${ROUND_POINTS} pts for students`, emoji: '🥁' });
        } else {
          const rt = cur.rhythmTapper || {};
          const rounds = rt.date === today ? (rt.rounds || 0) : 0;
          if (rounds < REWARDED_ROUNDS_PER_DAY) {
            await updateDoc(doc(db, 'users', uid), {
              rhythmTapper: { date: today, rounds: rounds + 1 },
              provaScore: increment(ROUND_POINTS),
              totalMinutes: increment(2),
              ...practiceStreakUpdates(cur),
            });
            logPracticeMinutes(uid, 2, 'rhythm');
            setRewarded(true);
            celebrate({ points: ROUND_POINTS, title: 'Round complete!', subtitle: `${acc}% in time`, emoji: '🥁' });
          }
        }
      }
    } catch (e) { /* best effort */ }
  };

  const ringColor = feedback ? feedback.color : COLORS.primary;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Rhythm Tapper</Text>
        <View style={{ width: 24 }} />
      </View>

      {phase === 'menu' && (
        <ScrollView contentContainerStyle={styles.menu}>
          <View style={styles.heroIcon}><Ionicons name="pulse" size={34} color={COLORS.primary} /></View>
          <Text style={styles.heroTitle}>Lock in your timing</Text>
          <Text style={styles.heroSub}>A click plays — you tap along. Prova scores how close each tap lands to the beat. Your first {REWARDED_ROUNDS_PER_DAY} rounds each day earn +{ROUND_POINTS} points.</Text>
          <Text style={styles.menuLabel}>MODE</Text>
          <View style={styles.segRow}>
            {MODES.map(([m, label]) => (
              <TouchableOpacity key={m} style={[styles.seg, mode === m && styles.segOn]} onPress={() => setMode(m)}>
                <Text style={[styles.segText, mode === m && styles.segTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.menuLabel}>LEVEL</Text>
          <View style={styles.segRow}>
            {LEVELS.map((l) => (
              <TouchableOpacity key={l.id} style={[styles.seg, level === l.id && styles.segOn]} onPress={() => setLevel(l.id)}>
                <Text style={[styles.segText, level === l.id && styles.segTextOn]}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.menuLabel}>TEMPO</Text>
          <View style={styles.bpmRow}>
            <TouchableOpacity
              style={styles.bpmBtn}
              onPress={() => setBpm((b) => Math.max(BPM_MIN, b - 5))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="remove" size={18} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.bpmValue}>{bpm}<Text style={styles.bpmUnit}> BPM</Text></Text>
            <TouchableOpacity
              style={styles.bpmBtn}
              onPress={() => setBpm((b) => Math.min(BPM_MAX, b + 5))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="add" size={18} color={COLORS.text} />
            </TouchableOpacity>
            {bpm !== base.bpm && (
              <TouchableOpacity onPress={() => setBpm(base.bpm)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.bpmReset}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.levelHint}>
            {cfg.note} · {cfg.taps} beats{mode === 'hold' ? ' · click drops after one bar' : ''}
          </Text>
          <TouchableOpacity style={styles.startBtn} onPress={startRound} activeOpacity={0.85}>
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={styles.startText}>Start round</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {phase === 'playing' && (
        <Pressable style={styles.game} onPressIn={onTap}>
          <Text style={styles.qNum}>{countIn > 0 ? 'GET READY' : held ? 'KEEP THE TIME' : `BEAT ${beatNum} OF ${cfg.taps}`}</Text>
          <Text style={styles.scoreLine}>{cfg.bpm} BPM · {cfg.note}{mode === 'hold' && held ? ' · no click' : ''}</Text>
          <View style={styles.padWrap}>
            <Animated.View style={[styles.pad, { borderColor: ringColor, backgroundColor: ringColor + '14', transform: [{ scale: pulse }] }]}>
              {countIn > 0 ? (
                <Text style={styles.countIn}>{countIn}</Text>
              ) : feedback ? (
                <Text style={[styles.fbText, { color: feedback.color }]}>{feedback.label}</Text>
              ) : (
                <Ionicons name="hand-left-outline" size={40} color={COLORS.textSecondary} />
              )}
            </Animated.View>
          </View>
          <Text style={styles.tapHint}>Tap anywhere on every click</Text>
        </Pressable>
      )}

      {phase === 'done' && (
        <View style={styles.game}>
          <View style={styles.heroIcon}><Ionicons name={accuracy >= 85 ? 'trophy' : 'pulse'} size={34} color={accuracy >= 85 ? '#F5C044' : COLORS.primary} /></View>
          <Text style={styles.heroTitle}>{accuracy}%</Text>
          <Text style={styles.heroSub}>
            {accuracy >= 90 ? 'Locked in — that is real pocket.' : accuracy >= 75 ? 'Solid time. It is settling in.' : accuracy >= 55 ? 'Coming together — keep the pulse steady.' : 'Timing takes reps. Tap along daily.'}
            {rewarded ? `  +${ROUND_POINTS} pts banked.` : ''}
          </Text>
          {tally && (
            <View style={styles.tallyRow}>
              {[
                { k: 'perfect', label: 'Perfect', color: '#16a34a' },
                { k: 'great', label: 'Great', color: '#22D3EE' },
                { k: 'good', label: 'Good', color: COLORS.primary },
                { k: 'off', label: 'Off', color: '#F5C044' },
                { k: 'miss', label: 'Miss', color: '#dc2626' },
              ].map((b) => (
                <View key={b.k} style={styles.tallyCell}>
                  <Text style={[styles.tallyNum, { color: b.color }]}>{tally[b.k]}</Text>
                  <Text style={styles.tallyLabel}>{b.label}</Text>
                </View>
              ))}
            </View>
          )}
          <TouchableOpacity style={styles.startBtn} onPress={startRound} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.startText}>Play again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPhase('menu')} hitSlop={{ top: 8, bottom: 8 }}>
            <Text style={styles.backLink}>Change level</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  menu: { padding: SPACING.xl, alignItems: 'center' },
  heroIcon: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.primary + '14', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  heroTitle: { color: COLORS.text, fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  heroSub: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: SPACING.xl, maxWidth: 320 },
  menuLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2, alignSelf: 'flex-start', marginBottom: SPACING.sm },
  segRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm, alignSelf: 'stretch' },
  seg: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center' },
  segOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  segText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  segTextOn: { color: '#fff' },
  levelHint: { color: COLORS.textMuted, fontSize: 12, marginBottom: SPACING.lg, alignSelf: 'flex-start' },
  bpmRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, alignSelf: 'flex-start', marginBottom: SPACING.md },
  bpmBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  bpmValue: { color: COLORS.text, fontSize: 18, fontWeight: '800', minWidth: 86, textAlign: 'center', fontVariant: ['tabular-nums'] },
  bpmUnit: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },
  bpmReset: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, alignSelf: 'stretch', marginTop: SPACING.md },
  startText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  game: { flex: 1, padding: SPACING.xl, alignItems: 'center' },
  qNum: { color: COLORS.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  scoreLine: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, marginBottom: SPACING.xl },
  padWrap: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  pad: { width: 220, height: 220, borderRadius: 110, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  countIn: { color: COLORS.text, fontSize: 72, fontWeight: '900' },
  fbText: { fontSize: 30, fontWeight: '900' },
  tapHint: { color: COLORS.textMuted, fontSize: 12, marginTop: SPACING.md },
  tallyRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg, marginBottom: SPACING.xl, alignSelf: 'stretch', justifyContent: 'center' },
  tallyCell: { alignItems: 'center', minWidth: 52 },
  tallyNum: { fontSize: 22, fontWeight: '900' },
  tallyLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  backLink: { color: COLORS.textSecondary, fontSize: 14, marginTop: SPACING.lg },
}));
