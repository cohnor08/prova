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
const BPM_MAX = 200;
const THUMB_SIZE = 26;

// ─── BPM Slider ───────────────────────────────────────────────────────────────

function BpmSlider({ bpm, onChange }) {
  const trackWidth = useRef(0);
  const trackPageX = useRef(0);
  const bpmRef = useRef(bpm);
  const startTrackX = useRef(0);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const xToBpm = (x) =>
    Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX,
      BPM_MIN + (x / Math.max(1, trackWidth.current)) * (BPM_MAX - BPM_MIN)
    )));

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (e) => {
        // Use pageX so touching the thumb doesn't give a near-zero locationX
        const trackX = e.nativeEvent.pageX - trackPageX.current;
        startTrackX.current = trackX;
        const next = xToBpm(trackX);
        onChange(next);
        bpmRef.current = next;
      },
      onPanResponderMove: (_, gs) => {
        const next = xToBpm(startTrackX.current + gs.dx);
        if (next !== bpmRef.current) {
          onChange(next);
          bpmRef.current = next;
        }
      },
    })
  ).current;

  const ratio = (bpm - BPM_MIN) / (BPM_MAX - BPM_MIN);

  return (
    <View
      onLayout={(e) => {
        trackWidth.current = e.nativeEvent.layout.width;
        e.target.measure((_, __, ___, ____, pageX) => { trackPageX.current = pageX; });
      }}
      {...pan.panHandlers}
      style={sliderStyles.container}
    >
      <View style={sliderStyles.track} />
      <View style={[sliderStyles.fill, { width: `${ratio * 100}%` }]} />
      <View style={[sliderStyles.thumb, { left: `${ratio * 100}%`, marginLeft: -THUMB_SIZE / 2 }]} />
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: {
    height: THUMB_SIZE + 16,
    justifyContent: 'center',
  },
  track: {
    height: 3,
    backgroundColor: COLORS.border,
    borderRadius: 2,
  },
  fill: {
    position: 'absolute',
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    top: '50%',
    marginTop: -1.5,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE, height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.background,
    top: '50%',
    marginTop: -THUMB_SIZE / 2,
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

          {/* BPM display */}
          <View style={styles.bpmDisplay}>
            <Text style={styles.bpmValue}>{bpm}</Text>
            <Text style={styles.bpmUnitLabel}>BPM</Text>
          </View>

          {/* Horizontal slider */}
          <BpmSlider bpm={bpm} onChange={setBpm} />
          <View style={styles.bpmRange}>
            <Text style={styles.bpmRangeLabel}>{BPM_MIN}</Text>
            <Text style={styles.bpmRangeLabel}>{BPM_MAX}</Text>
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

  bpmDisplay: { alignItems: 'center', marginBottom: SPACING.sm },
  bpmValue: { color: COLORS.text, fontSize: 48, fontWeight: '900', fontVariant: ['tabular-nums'], lineHeight: 52 },
  bpmUnitLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  bpmRange: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.xs, marginBottom: SPACING.md },
  bpmRangeLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },

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
