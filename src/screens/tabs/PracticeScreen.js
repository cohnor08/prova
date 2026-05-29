import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, PanResponder, Alert,
} from 'react-native';
import { Audio } from 'expo-av';
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

// ─── Pitch detection ──────────────────────────────────────────────────────────

function parseWavSamples(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.getUint32(0, false) !== 0x52494646) return null; // not RIFF
  let offset = 12;
  let dataOffset = -1, dataLen = 0, sampleRate = 44100;
  while (offset < arrayBuffer.byteLength - 8) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    if (id === 0x666d7420) sampleRate = view.getUint32(offset + 12, true); // fmt
    if (id === 0x64617461) { dataOffset = offset + 8; dataLen = size; break; } // data
    offset += 8 + size;
  }
  if (dataOffset < 0) return null;
  return { samples: new Int16Array(arrayBuffer, dataOffset, Math.floor(dataLen / 2)), sampleRate };
}

function detectPitchHz(int16Samples, sampleRate) {
  const n = Math.min(8192, int16Samples.length);
  let rms = 0;
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) { buf[i] = int16Samples[i] / 32768; rms += buf[i] * buf[i]; }
  if (Math.sqrt(rms / n) < 0.02) return null; // too quiet
  const minLag = Math.floor(sampleRate / 1500);
  const maxLag = Math.min(Math.ceil(sampleRate / 40), Math.floor(n / 2));
  let best = -1, bestCorr = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i < n - lag; i++) c += buf[i] * buf[i + lag];
    if (c > bestCorr) { bestCorr = c; best = lag; }
  }
  return best > 0 ? sampleRate / best : null;
}

function centsOff(detectedHz, targetHz) {
  return Math.round(1200 * Math.log2(detectedHz / targetHz));
}

const TUNER_RECORDING_OPTIONS = {
  ios: {
    extension: '.wav',
    outputFormat: 'lpcm',
    audioQuality: 0,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  android: {
    extension: '.wav',
    outputFormat: 6,
    audioEncoder: 4,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PracticeScreen({ route }) {
  // Tasks
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Timer — declared before effects so closures always capture the right bindings
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef(null);
  const timerSecondsRef = useRef(0); // always-current mirror of timerSeconds

  // When navigated from Today with a specific session, snap to it
  useEffect(() => {
    if (route?.params?.activeSession) {
      setActiveSession(route.params.activeSession);
    }
  }, [route?.params?.activeSession]);

  // Reset timer when active session changes
  useEffect(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    const secs = activeSession ? activeSession.duration * 60 : 0;
    setTimerActive(false);
    setTimerSeconds(secs);
    timerSecondsRef.current = secs; // update ref synchronously so play works immediately
  }, [activeSession?.id]);

  // Countdown
  useEffect(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    if (!timerActive) return;
    if (timerSecondsRef.current <= 0) { setTimerActive(false); return; }

    timerRef.current = setInterval(() => {
      setTimerSeconds((s) => {
        const next = s - 1;
        timerSecondsRef.current = next;
        if (next <= 0) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setTimerActive(false);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => { clearInterval(timerRef.current); timerRef.current = null; };
  }, [timerActive]);

  // Metronome
  const [bpm, setBpm] = useState(80);
  const [isPlaying, setIsPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const intervalRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const tickSound = useRef(null);
  const accentSound = useRef(null);
  const beatRef = useRef(0);

  // Tuner
  const [tunerInstrument, setTunerInstrument] = useState('Guitar');
  const [stringIndex, setStringIndex] = useState(0);
  const [isTuning, setIsTuning] = useState(false);
  const [detectedHz, setDetectedHz] = useState(null);
  const [tunerCents, setTunerCents] = useState(0);
  const isTuningRef = useRef(false);
  const recordingRef = useRef(null);
  const targetFreqRef = useRef(0);

  // Load click sounds once on mount
  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    Audio.Sound.createAsync(require('../../../assets/tick.wav'))
      .then(({ sound }) => { tickSound.current = sound; });
    Audio.Sound.createAsync(require('../../../assets/tick-accent.wav'))
      .then(({ sound }) => { accentSound.current = sound; });
    return () => {
      tickSound.current?.unloadAsync();
      accentSound.current?.unloadAsync();
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
      return () => {
        clearInterval(intervalRef.current);
        setIsPlaying(false);
        stopTuning();
      };
    }, [])
  );

  // Restart interval whenever bpm, beatsPerBar, or playing changes
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!isPlaying) return;

    const ms = (60 / bpm) * 1000;
    intervalRef.current = setInterval(() => {
      const nextBeat = (beatRef.current + 1) % beatsPerBar;
      beatRef.current = nextBeat;
      setBeat(nextBeat);

      const isAccent = nextBeat === 0;
      const sound = isAccent ? accentSound.current : tickSound.current;
      if (sound) {
        sound.replayAsync().catch(() => {});
      }

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

  const stopTuning = async () => {
    isTuningRef.current = false;
    setIsTuning(false);
    setDetectedHz(null);
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
      recordingRef.current = null;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
  };

  const startTuning = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Microphone needed', 'Allow microphone access in Settings to use the tuner.');
      return;
    }
    setIsPlaying(false); // stop metronome — can't record and play simultaneously on iOS
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    isTuningRef.current = true;
    setIsTuning(true);
    tunerLoop();
  };

  const tunerLoop = async () => {
    while (isTuningRef.current) {
      try {
        const rec = new Audio.Recording();
        await rec.prepareToRecordAsync(TUNER_RECORDING_OPTIONS);
        recordingRef.current = rec;
        await rec.startAsync();
        await new Promise(r => setTimeout(r, 350));
        if (!isTuningRef.current) { try { await rec.stopAndUnloadAsync(); } catch (_) {} break; }
        await rec.stopAndUnloadAsync();
        recordingRef.current = null;
        const uri = rec.getURI();
        if (!uri) continue;
        const resp = await fetch(uri);
        const buf = await resp.arrayBuffer();
        const parsed = parseWavSamples(buf);
        if (parsed) {
          const hz = detectPitchHz(parsed.samples, parsed.sampleRate);
          if (hz && isTuningRef.current) {
            setDetectedHz(hz);
            setTunerCents(centsOff(hz, targetFreqRef.current));
          } else {
            setDetectedHz(null);
          }
        }
      } catch (e) {
        console.warn('Tuner loop error:', e);
        await new Promise(r => setTimeout(r, 400));
      }
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
  targetFreqRef.current = currentString.freq;
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
        <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>TUNER</Text>
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

          <Text style={styles.tunerFreq}>{currentString.freq.toFixed(2)} Hz · {currentString.label}</Text>

          {/* String dots */}
          <View style={styles.tunerDots}>
            {strings.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => setStringIndex(i)}>
                <View style={[styles.tunerDot, i === stringIndex && styles.tunerDotActive]} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Needle — only shown when tuning */}
          {isTuning && (
            <View style={styles.needleWrap}>
              {detectedHz ? (() => {
                const cents = Math.max(-50, Math.min(50, tunerCents));
                const ratio = (cents + 50) / 100;
                const inTune = Math.abs(cents) <= 5;
                const color = inTune ? COLORS.success : Math.abs(cents) <= 20 ? '#F59E0B' : COLORS.error;
                return (
                  <>
                    <Text style={[styles.needleHz, { color }]}>
                      {detectedHz.toFixed(1)} Hz · {inTune ? 'In tune' : `${Math.abs(tunerCents)}¢ ${tunerCents < 0 ? 'flat' : 'sharp'}`}
                    </Text>
                    <View style={styles.needleTrack}>
                      <View style={styles.needleCenter} />
                      <View style={[styles.needleIndicator, { left: `${ratio * 100}%`, backgroundColor: color }]} />
                    </View>
                    <View style={styles.needleLabels}>
                      <Text style={styles.needleLabel}>-50¢</Text>
                      <Text style={styles.needleLabel}>0</Text>
                      <Text style={styles.needleLabel}>+50¢</Text>
                    </View>
                  </>
                );
              })() : (
                <Text style={styles.needleListening}>Listening… play a note</Text>
              )}
            </View>
          )}

          {/* Start / Stop tuning button */}
          <TouchableOpacity
            style={[styles.tunerBtn, isTuning && styles.tunerBtnActive]}
            onPress={isTuning ? stopTuning : startTuning}
            activeOpacity={0.8}
          >
            <Ionicons name={isTuning ? 'stop-circle' : 'mic'} size={18} color={COLORS.text} style={{ marginRight: 6 }} />
            <Text style={styles.tunerBtnText}>{isTuning ? 'Stop Tuning' : 'Start Tuning'}</Text>
          </TouchableOpacity>

          <Text style={styles.tunerCaption}>
            Standard {tunerInstrument === 'Bass' ? 'EADG' : 'EADGBE'} tuning
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
  tunerDots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: SPACING.md },
  tunerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  tunerDotActive: { backgroundColor: COLORS.primary, width: 20, borderRadius: 4 },

  tunerCaption: { color: COLORS.textMuted, fontSize: 11, textAlign: 'center', letterSpacing: 0.5, marginTop: SPACING.sm },

  needleWrap: { marginVertical: SPACING.md },
  needleHz: { fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: SPACING.sm },
  needleTrack: { height: 4, backgroundColor: COLORS.border, borderRadius: 2, position: 'relative', marginBottom: 4 },
  needleCenter: { position: 'absolute', left: '50%', top: -4, width: 2, height: 12, backgroundColor: COLORS.textMuted, borderRadius: 1 },
  needleIndicator: { position: 'absolute', width: 14, height: 14, borderRadius: 7, top: -5, marginLeft: -7, borderWidth: 2, borderColor: COLORS.background },
  needleLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  needleLabel: { color: COLORS.textMuted, fontSize: 10 },
  needleListening: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: SPACING.md, fontStyle: 'italic' },

  tunerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: SPACING.sm, marginTop: SPACING.md },
  tunerBtnActive: { backgroundColor: COLORS.error },
  tunerBtnText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
});
