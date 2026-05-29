import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Vibration, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';

// ─── Data ─────────────────────────────────────────────────────────────────────

const GUITAR_STRINGS = [
  { number: 6, note: 'E', octave: '2', freq: 82.41,  label: '6th string (low E)' },
  { number: 5, note: 'A', octave: '2', freq: 110.00, label: '5th string (A)' },
  { number: 4, note: 'D', octave: '3', freq: 146.83, label: '4th string (D)' },
  { number: 3, note: 'G', octave: '3', freq: 196.00, label: '3rd string (G)' },
  { number: 2, note: 'B', octave: '3', freq: 246.94, label: '2nd string (B)' },
  { number: 1, note: 'E', octave: '4', freq: 329.63, label: '1st string (high e)' },
];

const BASS_STRINGS = [
  { number: 4, note: 'E', octave: '1', freq: 41.20,  label: '4th string (low E)' },
  { number: 3, note: 'A', octave: '1', freq: 55.00,  label: '3rd string (A)' },
  { number: 2, note: 'D', octave: '2', freq: 73.42,  label: '2nd string (D)' },
  { number: 1, note: 'G', octave: '2', freq: 98.00,  label: '1st string (G)' },
];

const CATEGORY_COLORS = {
  warmup: '#06B6D4',
  technique: '#3B82F6',
  theory: '#8B5CF6',
  ear_training: '#10B981',
  repertoire: '#0EA5E9',
  improvisation: '#6366F1',
};

const TIME_SIGNATURES = [2, 3, 4, 6];

const BPM_MIN = 20;
const BPM_MAX = 300;
const KNOB_SIZE = 190;
const RING_WIDTH = 26;
const INDICATOR_SIZE = RING_WIDTH - 6;
const TICK_COUNT = 36;

// ─── Rotary Knob ──────────────────────────────────────────────────────────────

function RotaryKnob({ bpm, onChange }) {
  const center = useRef({ x: 0, y: 0 });
  const lastAngle = useRef(null);
  const bpmRef = useRef(bpm);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const getAngle = (pageX, pageY) =>
    Math.atan2(pageY - center.current.y, pageX - center.current.x) * (180 / Math.PI);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (e) => {
        lastAngle.current = getAngle(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderMove: (e) => {
        const angle = getAngle(e.nativeEvent.pageX, e.nativeEvent.pageY);
        let delta = angle - lastAngle.current;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        const next = Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, bpmRef.current + delta * 3)));
        if (next !== bpmRef.current) {
          onChange(next);
          bpmRef.current = next;
        }
        lastAngle.current = angle;
      },
    })
  ).current;

  // maps BPM_MIN→-135°, BPM_MAX→+135°
  const indicatorAngle = ((bpm - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 270 - 135;
  const tickRadius = KNOB_SIZE / 2 - RING_WIDTH / 2;

  return (
    <View
      style={knobStyles.knob}
      onLayout={(e) =>
        e.target.measure((_, __, ___, ____, pageX, pageY) => {
          center.current = { x: pageX + KNOB_SIZE / 2, y: pageY + KNOB_SIZE / 2 };
        })
      }
      {...pan.panHandlers}
    >
      {/* Ring track */}
      <View style={knobStyles.ring} pointerEvents="none" />

      {/* Tick marks on the ring */}
      {Array.from({ length: TICK_COUNT }).map((_, i) => {
        const deg = (i / TICK_COUNT) * 360;
        const rad = ((deg - 90) * Math.PI) / 180;
        const isMajor = i % 6 === 0;
        const tW = isMajor ? 3 : 2;
        const tH = isMajor ? 10 : 6;
        return (
          <View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: KNOB_SIZE / 2 + tickRadius * Math.cos(rad) - tW / 2,
              top: KNOB_SIZE / 2 + tickRadius * Math.sin(rad) - tH / 2,
              width: tW, height: tH,
              borderRadius: tW / 2,
              backgroundColor: COLORS.border,
              transform: [{ rotate: `${deg}deg` }],
            }}
          />
        );
      })}

      {/* Rotating indicator dot */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingTop: RING_WIDTH / 2 - INDICATOR_SIZE / 2,
            transform: [{ rotate: `${indicatorAngle}deg` }],
          },
        ]}
      >
        <View style={knobStyles.indicator} />
      </View>

      {/* BPM center */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
      >
        <Text style={knobStyles.bpmValue}>{bpm}</Text>
        <Text style={knobStyles.bpmUnit}>BPM</Text>
      </View>
    </View>
  );
}

const knobStyles = StyleSheet.create({
  knob: {
    width: KNOB_SIZE, height: KNOB_SIZE,
    alignSelf: 'center',
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: KNOB_SIZE / 2,
    borderWidth: RING_WIDTH,
    borderColor: COLORS.surface,
  },
  indicator: {
    width: INDICATOR_SIZE, height: INDICATOR_SIZE,
    borderRadius: INDICATOR_SIZE / 2,
    backgroundColor: COLORS.primary,
  },
  bpmValue: {
    color: COLORS.text, fontSize: 40, fontWeight: '900',
    fontVariant: ['tabular-nums'], lineHeight: 44,
  },
  bpmUnit: {
    color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PracticeScreen({ route }) {
  // Tasks
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // When navigated from Today with a specific session, snap to it
  useEffect(() => {
    if (route?.params?.activeSession) {
      setActiveSession(route.params.activeSession);
    }
  }, [route?.params?.activeSession]);

  // Reset timer when active session changes
  useEffect(() => {
    clearInterval(timerRef.current);
    setTimerActive(false);
    setTimerSeconds(activeSession ? activeSession.duration * 60 : 0);
  }, [activeSession?.id]);

  // Countdown
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!timerActive) return;
    if (timerSeconds <= 0) { setTimerActive(false); return; }
    timerRef.current = setInterval(() => {
      setTimerSeconds((s) => {
        if (s <= 1) { clearInterval(timerRef.current); setTimerActive(false); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [timerActive]);

  // Timer
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef(null);

  // Metronome
  const [bpm, setBpm] = useState(80);
  const [isPlaying, setIsPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const intervalRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Tuner
  const [tunerInstrument, setTunerInstrument] = useState('Guitar');
  const [stringIndex, setStringIndex] = useState(0);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
      return () => {
        clearInterval(intervalRef.current);
        setIsPlaying(false);
      };
    }, [])
  );

  // Restart interval whenever bpm, beatsPerBar, or playing changes
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!isPlaying) return;

    const ms = (60 / bpm) * 1000;
    intervalRef.current = setInterval(() => {
      setBeat((prev) => (prev + 1) % beatsPerBar);
      Vibration.vibrate(8);
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 55, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 90, useNativeDriver: true }),
      ]).start();
    }, ms);

    return () => clearInterval(intervalRef.current);
  }, [isPlaying, bpm, beatsPerBar]);

  const loadData = async () => {
    setLoadingTasks(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'users', uid));
      const data = snap.data();
      const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const todaySessions = data?.practicePlan?.weeklyPlan?.[todayName]?.sessions || [];
      setSessions(todaySessions);
      setActiveSession(todaySessions[0] || null);
      if (data?.instrument === 'Bass') setTunerInstrument('Bass');
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const togglePlay = () => {
    setBeat(0);
    setIsPlaying((p) => !p);
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const strings = tunerInstrument === 'Bass' ? BASS_STRINGS : GUITAR_STRINGS;
  const currentString = strings[stringIndex] || strings[0];
  const categoryColor = activeSession
    ? (CATEGORY_COLORS[activeSession.category] || COLORS.primary)
    : COLORS.primary;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Practice</Text>

        {/* ── Task Instructions ── */}
        <Text style={styles.sectionLabel}>CURRENT TASK</Text>

        {loadingTasks ? (
          <View style={styles.taskPlaceholder} />
        ) : sessions.length === 0 ? (
          <View style={styles.emptyTask}>
            <Ionicons name="musical-notes-outline" size={28} color={COLORS.textMuted} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTaskText}>No sessions scheduled today</Text>
          </View>
        ) : (
          <>
            {sessions.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillsRow}
                style={{ marginBottom: SPACING.md }}
              >
                {sessions.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.taskPill, activeSession?.id === s.id && styles.taskPillActive]}
                    onPress={() => setActiveSession(s)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[styles.taskPillText, activeSession?.id === s.id && styles.taskPillTextActive]}
                      numberOfLines={1}
                    >
                      {s.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {activeSession && (
              <View style={[styles.taskCard, { borderLeftColor: categoryColor }]}>
                <View style={styles.taskCardTop}>
                  <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '22' }]}>
                    <Text style={[styles.categoryText, { color: categoryColor }]}>
                      {activeSession.category?.replace('_', ' ').toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.taskDuration}>
                    <Ionicons name="time-outline" size={12} color={COLORS.textMuted} /> {activeSession.duration} min
                  </Text>
                </View>
                <Text style={styles.taskTitle}>{activeSession.title}</Text>
                <Text style={styles.taskDesc}>{activeSession.description}</Text>
              </View>
            )}
          </>
        )}

        {/* ── Timer ── */}
        {activeSession && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>TIMER</Text>
            <View style={styles.card}>
              {/* Progress bar */}
              <View style={styles.timerBarTrack}>
                <View
                  style={[
                    styles.timerBarFill,
                    {
                      width: activeSession.duration * 60 > 0
                        ? `${(1 - timerSeconds / (activeSession.duration * 60)) * 100}%`
                        : '0%',
                      backgroundColor: categoryColor,
                    },
                  ]}
                />
              </View>

              {/* Countdown */}
              <Text style={styles.timerCountdown}>{formatTime(timerSeconds)}</Text>
              <Text style={styles.timerTotal}>{activeSession.duration} min total</Text>

              {/* Controls */}
              <View style={styles.timerControls}>
                <TouchableOpacity
                  style={styles.timerResetBtn}
                  onPress={() => {
                    clearInterval(timerRef.current);
                    setTimerActive(false);
                    setTimerSeconds(activeSession.duration * 60);
                  }}
                >
                  <Ionicons name="refresh" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.timerPlayBtn, { backgroundColor: timerActive ? COLORS.error : categoryColor }]}
                  onPress={() => setTimerActive((p) => !p)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={timerActive ? 'pause' : 'play'} size={26} color={COLORS.text} />
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* ── Metronome ── */}
        <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>METRONOME</Text>
        <View style={styles.card}>

          {/* Beat dots */}
          <View style={styles.beatRow}>
            {Array.from({ length: beatsPerBar }).map((_, i) => {
              const isActive = isPlaying && i === beat % beatsPerBar;
              const isAccent = i === 0;
              return (
                <Animated.View
                  key={i}
                  style={[
                    styles.beatDot,
                    isAccent && styles.beatDotAccent,
                    isActive && styles.beatDotOn,
                    isActive && isAccent && styles.beatDotAccentOn,
                    isActive && { transform: [{ scale: pulseAnim }] },
                  ]}
                />
              );
            })}
          </View>

          {/* Rotary knob + fine-tune */}
          <View style={styles.knobRow}>
            <TouchableOpacity
              style={styles.bpmAdj}
              onPress={() => setBpm((b) => Math.max(BPM_MIN, b - 1))}
            >
              <Ionicons name="remove" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <RotaryKnob bpm={bpm} onChange={setBpm} />
            <TouchableOpacity
              style={styles.bpmAdj}
              onPress={() => setBpm((b) => Math.min(BPM_MAX, b + 1))}
            >
              <Ionicons name="add" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Time signature */}
          <View style={styles.timeSigRow}>
            <Text style={styles.timeSigLabel}>Time sig</Text>
            <View style={styles.timeSigBtns}>
              {TIME_SIGNATURES.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.timeSigBtn, beatsPerBar === n && styles.timeSigBtnActive]}
                  onPress={() => { setBeatsPerBar(n); setBeat(0); }}
                >
                  <Text style={[styles.timeSigText, beatsPerBar === n && styles.timeSigTextActive]}>
                    {n}/4
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Play */}
          <TouchableOpacity
            style={[styles.playBtn, isPlaying && styles.playBtnActive]}
            onPress={togglePlay}
            activeOpacity={0.8}
          >
            <Ionicons name={isPlaying ? 'stop' : 'play'} size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* ── Tuner ── */}
        <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>REFERENCE TUNER</Text>
        <View style={styles.card}>

          {/* Guitar / Bass toggle */}
          <View style={styles.instRow}>
            {['Guitar', 'Bass'].map((inst) => (
              <TouchableOpacity
                key={inst}
                style={[styles.instBtn, tunerInstrument === inst && styles.instBtnActive]}
                onPress={() => { setTunerInstrument(inst); setStringIndex(0); }}
              >
                <Text style={[styles.instBtnText, tunerInstrument === inst && styles.instBtnTextActive]}>
                  {inst}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Note display */}
          <View style={styles.tunerDisplay}>
            <TouchableOpacity
              style={styles.tunerArrow}
              onPress={() => setStringIndex((i) => (i - 1 + strings.length) % strings.length)}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={32} color={COLORS.textSecondary} />
            </TouchableOpacity>

            <View style={styles.tunerNoteWrap}>
              <Text style={styles.tunerNote}>{currentString.note}</Text>
              <Text style={styles.tunerOctave}>{currentString.octave}</Text>
            </View>

            <TouchableOpacity
              style={styles.tunerArrow}
              onPress={() => setStringIndex((i) => (i + 1) % strings.length)}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-forward" size={32} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.tunerFreq}>{currentString.freq.toFixed(2)} Hz</Text>
          <Text style={styles.tunerStringLabel}>{currentString.label}</Text>

          {/* String dots */}
          <View style={styles.tunerDots}>
            {strings.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => setStringIndex(i)}>
                <View style={[styles.tunerDot, i === stringIndex && styles.tunerDotActive]} />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.tunerCaption}>
            Standard {tunerInstrument === 'Bass' ? 'EADG' : 'EADGBE'} tuning · reference only
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.lg },
  sectionLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: SPACING.sm },
  card: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg },

  // Task
  taskPlaceholder: { height: 100, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  emptyTask: { alignItems: 'center', paddingVertical: SPACING.xl, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  emptyTaskText: { color: COLORS.textMuted, fontSize: 14 },
  pillsRow: { gap: SPACING.sm, paddingRight: SPACING.xl },
  taskPill: { backgroundColor: COLORS.card, borderRadius: 20, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderWidth: 1, borderColor: COLORS.border },
  taskPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  taskPillText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  taskPillTextActive: { color: COLORS.text },
  taskCard: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4, padding: SPACING.md },
  taskCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  categoryBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: 4 },
  categoryText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  taskDuration: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  taskTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700', marginBottom: SPACING.xs },
  taskDesc: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21 },

  // Timer
  timerBarTrack: { height: 3, backgroundColor: COLORS.border, borderRadius: 2, marginBottom: SPACING.md, overflow: 'hidden' },
  timerBarFill: { height: '100%', borderRadius: 2 },
  timerCountdown: { color: COLORS.text, fontSize: 38, fontWeight: '900', textAlign: 'center', fontVariant: ['tabular-nums'], lineHeight: 44 },
  timerTotal: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', textAlign: 'center', letterSpacing: 1, marginBottom: SPACING.md },
  timerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.lg },
  timerResetBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  timerPlayBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },

  // Metronome
  beatRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, marginBottom: SPACING.lg },
  beatDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.border },
  beatDotAccent: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.border },
  beatDotOn: { backgroundColor: COLORS.primary },
  beatDotAccentOn: { backgroundColor: COLORS.accent },

  knobRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.lg, marginBottom: SPACING.lg },
  bpmAdj: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },

  timeSigRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, marginBottom: SPACING.lg },
  timeSigLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  timeSigBtns: { flexDirection: 'row', gap: SPACING.sm },
  timeSigBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  timeSigBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  timeSigText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  timeSigTextActive: { color: COLORS.text },

  playBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  playBtnActive: { backgroundColor: COLORS.error },

  // Tuner
  instRow: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 10, padding: 3, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  instBtn: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: 8 },
  instBtnActive: { backgroundColor: COLORS.primary },
  instBtnText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
  instBtnTextActive: { color: COLORS.text },

  tunerDisplay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  tunerArrow: { padding: SPACING.md },
  tunerNoteWrap: { flexDirection: 'row', alignItems: 'flex-start', minWidth: 100, justifyContent: 'center' },
  tunerNote: { color: COLORS.text, fontSize: 72, fontWeight: '900', lineHeight: 80 },
  tunerOctave: { color: COLORS.textMuted, fontSize: 22, fontWeight: '700', marginTop: 10 },
  tunerFreq: { color: COLORS.primary, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  tunerStringLabel: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: SPACING.md },

  tunerDots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: SPACING.md },
  tunerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  tunerDotActive: { backgroundColor: COLORS.primary, width: 20, borderRadius: 4 },

  tunerCaption: { color: COLORS.textMuted, fontSize: 11, textAlign: 'center', letterSpacing: 0.5 },
});
