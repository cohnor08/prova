import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, PanResponder, Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import { PitchDetector } from 'pitchy';
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

const TIME_SIGNATURES = [2, 3, 4, 6];

const BPM_MIN = 20;
const BPM_MAX = 250;
const THUMB_SIZE = 26;
const REC_ART = 130; // cover-tile size for "Picked for your level" carousel cards

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

// ─── Stepper (−/+ number control) ───────────────────────────────────────────

function Stepper({ value, min, max, step, suffix, onChange }) {
  return (
    <View style={stepperStyles.row}>
      <TouchableOpacity
        style={stepperStyles.btn}
        onPress={() => onChange(Math.max(min, value - step))}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="remove" size={18} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={stepperStyles.val}>
        {value}<Text style={stepperStyles.suffix}> {suffix}</Text>
      </Text>
      <TouchableOpacity
        style={stepperStyles.btn}
        onPress={() => onChange(Math.min(max, value + step))}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="add" size={18} color={COLORS.text} />
      </TouchableOpacity>
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  btn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  val: { color: COLORS.text, fontSize: 15, fontWeight: '700', minWidth: 78, textAlign: 'center', fontVariant: ['tabular-nums'] },
  suffix: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
});

// ─── Gigs / Pre-Gig Mode ───────────────────────────────────────────────────────

const PRE_GIG_WINDOW = 14; // days before a gig that Pre-Gig Mode kicks in

// Whole days from today until a YYYY-MM-DD date (0 = today, negative = past).
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  return Math.round((d - today) / 86400000);
}

function countdownLabel(days) {
  if (days < 0) return 'Past';
  if (days === 0) return 'Today 🎤';
  if (days === 1) return 'Tomorrow';
  return `in ${days} days`;
}

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
  // pitchy works on power-of-two windows; take the largest that fits
  let n = 1;
  while (n * 2 <= int16Samples.length && n * 2 <= 16384) n *= 2;
  if (n < 1024) return null;

  let rms = 0;
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) { buf[i] = int16Samples[i] / 32768; rms += buf[i] * buf[i]; }
  if (Math.sqrt(rms / n) < 0.02) return null; // too quiet

  const detector = PitchDetector.forFloat32Array(n);
  detector.minVolumeDecibels = -45;
  const [pitch, clarity] = detector.findPitch(buf, sampleRate);

  // Reject low-confidence / out-of-range results (40–1500 Hz covers guitar & bass)
  if (clarity < 0.85 || pitch < 40 || pitch > 1500) return null;
  return pitch;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Map any frequency to its nearest musical note + how many cents sharp/flat it is.
// This is what makes the tuner chromatic: it figures out which note you played
// instead of needing you to pick a string first.
function hzToNote(hz) {
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const refHz = 440 * Math.pow(2, (midi - 69) / 12);
  return {
    name: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents: Math.round(1200 * Math.log2(hz / refHz)),
  };
}

// The tuning needle. Animates toward the target position so it glides smoothly
// instead of snapping with every (slightly noisy) pitch reading.
function TunerNeedle({ ratio, color, visible }) {
  const anim = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: ratio, duration: 260, useNativeDriver: false }).start();
  }, [ratio]);
  const left = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' });
  return (
    <View style={styles.needleWrap}>
      <View style={styles.needleTrack}>
        <View style={styles.needleZone} />
        <View style={styles.needleCenter} />
        {visible && (
          <Animated.View style={[styles.needleIndicator, { left, backgroundColor: color }]} />
        )}
      </View>
      <View style={styles.needleLabels}>
        <Text style={styles.needleLabel}>♭</Text>
        <Text style={styles.needleLabel}>0</Text>
        <Text style={styles.needleLabel}>♯</Text>
      </View>
    </View>
  );
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

export default function PracticeScreen({ route, navigation }) {
  // Gig setlists — AI-built playlists saved inside the library
  const [setlists, setSetlists] = useState([]);

  // Upcoming gigs (events) — drive Pre-Gig Mode. Loaded read-only here; the
  // managing UI (add/remove) lives on the pushed Gigs & Setlists screen.
  const [gigs, setGigs] = useState([]);


  // Which tool is visible: 'metronome' | 'tuner' | 'songs'
  // (practicing happens in the guided player on Today — the task card here is
  // a preview whose "Practice this" opens it)
  const [tool, setTool] = useState('metronome');

  // When navigated with a specific tool (e.g. from Today's song card), open it
  useEffect(() => {
    if (route?.params?.tool) {
      setTool(route.params.tool);
    }
  }, [route?.params?.tool]);

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

  // Speed trainer — auto-ramps the tempo as you play (start → target, step every N bars)
  const [trainerOn, setTrainerOn] = useState(false);
  const [trainerStart, setTrainerStart] = useState(60);
  const [trainerTarget, setTrainerTarget] = useState(120);
  const [trainerStep, setTrainerStep] = useState(5);
  const [trainerBars, setTrainerBars] = useState(2);
  const [atTarget, setAtTarget] = useState(false); // reached target → show "✓ at target"
  const barCountRef = useRef(0);
  const trainerRef = useRef({ on: false, target: 120, step: 5, bars: 2 });
  useEffect(() => {
    trainerRef.current = { on: trainerOn, target: trainerTarget, step: trainerStep, bars: trainerBars };
  }, [trainerOn, trainerTarget, trainerStep, trainerBars]);

  // Tuner
  const [tunerInstrument, setTunerInstrument] = useState('Guitar');
  const [isTuning, setIsTuning] = useState(false);
  const [detectedHz, setDetectedHz] = useState(null); // smoothed, auto-detected pitch
  const isTuningRef = useRef(false);
  const recordingRef = useRef(null);
  const smoothedHzRef = useRef(null);

  // Load click sounds once on mount. Played ~26% fast without pitch correction,
  // which shifts the click up about two whole tones (2^(4/12) ≈ 1.26) — the
  // stock sample sat too low in the mix.
  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    Audio.Sound.createAsync(require('../../../assets/tick.wav'), { rate: 1.26, shouldCorrectPitch: false })
      .then(({ sound }) => { tickSound.current = sound; });
    Audio.Sound.createAsync(require('../../../assets/tick-accent.wav'), { rate: 1.26, shouldCorrectPitch: false })
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

      // Speed trainer: every downbeat completes a bar — step the tempo up once
      // we've counted enough bars, until we reach the target.
      if (isAccent) {
        const t = trainerRef.current;
        if (t.on) {
          barCountRef.current += 1;
          if (barCountRef.current >= t.bars) {
            barCountRef.current = 0;
            setBpm((b) => {
              const next = Math.min(t.target, b + t.step);
              if (next >= t.target) setAtTarget(true);
              return next;
            });
          }
        }
      }

      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 55, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 90, useNativeDriver: true }),
      ]).start();
    }, ms);

    return () => clearInterval(intervalRef.current);
  }, [isPlaying, bpm, beatsPerBar]);

  const loadData = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'users', uid));
      const data = snap.data();
      setSetlists(Array.isArray(data?.setlists) ? data.setlists : []);
      setGigs(Array.isArray(data?.gigs) ? data.gigs : []);
      if (data?.instrument === 'Bass') setTunerInstrument('Bass');
    } catch (err) {
      console.error(err);
    }
  };

  const stopTuning = async () => {
    isTuningRef.current = false;
    setIsTuning(false);
    setDetectedHz(null);
    smoothedHzRef.current = null;
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
    let misses = 0;
    while (isTuningRef.current) {
      try {
        const rec = new Audio.Recording();
        await rec.prepareToRecordAsync(TUNER_RECORDING_OPTIONS);
        recordingRef.current = rec;
        await rec.startAsync();
        await new Promise(r => setTimeout(r, 240)); // shorter window = snappier readings
        if (!isTuningRef.current) { try { await rec.stopAndUnloadAsync(); } catch (_) {} break; }
        await rec.stopAndUnloadAsync();
        recordingRef.current = null;
        const uri = rec.getURI();
        if (!uri) continue;
        const resp = await fetch(uri);
        const buf = await resp.arrayBuffer();
        const parsed = parseWavSamples(buf);
        const hz = parsed ? detectPitchHz(parsed.samples, parsed.sampleRate) : null;
        if (hz && isTuningRef.current) {
          misses = 0;
          // Smooth readings with a heavy EMA so the needle glides instead of
          // jumping; snap straight to the new pitch if it jumps (new string).
          const prev = smoothedHzRef.current;
          const smoothed = (prev && Math.abs(hz - prev) / prev < 0.15)
            ? prev * 0.8 + hz * 0.2
            : hz;
          smoothedHzRef.current = smoothed;
          setDetectedHz(smoothed);
        } else if (++misses >= 4) {
          // A few empty windows in a row before we drop the note — keeps the
          // display from flickering to "listening" between pluck and ring-out.
          smoothedHzRef.current = null;
          setDetectedHz(null);
        }
      } catch (e) {
        console.warn('Tuner loop error:', e);
        await new Promise(r => setTimeout(r, 300));
      }
    }
  };

  const togglePlay = () => {
    setBeat(0);
    // Starting fresh with the trainer on? Reset to the start tempo and bar count.
    if (!isPlaying && trainerOn) {
      barCountRef.current = 0;
      setAtTarget(false);
      setBpm(trainerStart);
    }
    setIsPlaying((p) => !p);
  };

  // Switch tools — stop any audio from the tool we're leaving
  const selectTool = (next) => {
    if (next !== 'metronome' && isPlaying) {
      clearInterval(intervalRef.current);
      setIsPlaying(false);
    }
    if (next !== 'tuner' && isTuning) {
      stopTuning();
    }
    setTool(next);
  };

  const strings = tunerInstrument === 'Bass' ? BASS_STRINGS : GUITAR_STRINGS;

  // ── Pre-Gig Mode ──
  // Soonest upcoming gig; if it's within the window, the Practice tab flips
  // into Pre-Gig Mode (banner + song tasks pulled to the front). No AI.
  const upcomingGigs = [...gigs]
    .filter((g) => daysUntil(g.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextGig = upcomingGigs[0] || null;
  const daysToNextGig = nextGig ? daysUntil(nextGig.date) : null;
  const preGig = !!nextGig && daysToNextGig <= PRE_GIG_WINDOW;
  const nextGigSetlist = nextGig?.setlistId ? setlists.find((s) => s.id === nextGig.setlistId) : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Practice</Text>

        {/* ── LEARN: browse content ── */}
        <Text style={styles.sectionLabel}>LEARN</Text>
        <View style={[styles.learnRow, { marginBottom: 0 }]}>
          <TouchableOpacity style={styles.learnCard} onPress={() => navigation.navigate('Library')} activeOpacity={0.85}>
            <View style={styles.learnIcon}><Ionicons name="book-outline" size={20} color={COLORS.primary} /></View>
            <Text style={styles.learnCardText}>Lesson library</Text>
            <Text style={styles.learnCardSub}>Guided topics</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.learnCard} onPress={() => navigation.navigate('ChordLibrary')} activeOpacity={0.85}>
            <View style={styles.learnIcon}><Ionicons name="grid-outline" size={20} color={COLORS.primary} /></View>
            <Text style={styles.learnCardText}>Chords & scales</Text>
            <Text style={styles.learnCardSub}>Fretboard reference</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.learnRow, { marginTop: SPACING.md }]}>
          <TouchableOpacity style={styles.learnCard} onPress={() => navigation.navigate('EarTraining')} activeOpacity={0.85}>
            <View style={styles.learnIcon}><Ionicons name="ear-outline" size={20} color={COLORS.primary} /></View>
            <Text style={styles.learnCardText}>Ear training</Text>
            <Text style={styles.learnCardSub}>Intervals & chords</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.learnCard} onPress={() => navigation.navigate('FretboardGame')} activeOpacity={0.85}>
            <View style={styles.learnIcon}><Ionicons name="locate" size={20} color={COLORS.primary} /></View>
            <Text style={styles.learnCardText}>Fretboard game</Text>
            <Text style={styles.learnCardSub}>Find the note</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.learnRow, { marginTop: SPACING.md }]}>
          <TouchableOpacity style={styles.learnCard} onPress={() => navigation.navigate('RhythmTapper')} activeOpacity={0.85}>
            <View style={styles.learnIcon}><Ionicons name="pulse" size={20} color={COLORS.primary} /></View>
            <Text style={styles.learnCardText}>Rhythm tapper</Text>
            <Text style={styles.learnCardSub}>Train your timing</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
        </View>

        {/* ── Pre-Gig Mode banner ── */}
        {preGig && (
          <TouchableOpacity
            style={styles.preGigBanner}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Schedule', { date: nextGig.date })}
          >
            <View style={styles.preGigIcon}>
              <Ionicons name="megaphone" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.preGigLabel}>PRE-GIG MODE · {countdownLabel(daysToNextGig).toUpperCase()}</Text>
              <Text style={styles.preGigTitle} numberOfLines={1}>{nextGig.name}</Text>
              <Text style={styles.preGigSub} numberOfLines={1}>
                {nextGigSetlist
                  ? `Setlist: ${nextGigSetlist.name} · tap to rehearse`
                  : 'Focus on your songs — tap to manage gigs'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        )}

        {/* ── TOOLS: practice with ── */}
        <Text style={styles.sectionLabel}>TOOLS</Text>
        <View style={styles.toolSelector}>
          {[
            { key: 'metronome', label: 'Metro', icon: 'pulse-outline' },
            { key: 'tuner', label: 'Tuner', icon: 'musical-note-outline' },
            { key: 'songs', label: 'Songs', icon: 'list-outline', nav: 'Songs' },
            { key: 'schedule', label: 'Calendar', icon: 'calendar-outline', nav: 'Schedule' },
          ].map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.toolBtn, tool === t.key && styles.toolBtnActive]}
              onPress={() => (t.nav ? navigation.navigate(t.nav) : selectTool(t.key))}
              activeOpacity={0.8}
            >
              <Ionicons name={t.icon} size={22} color={tool === t.key ? COLORS.text : COLORS.textMuted} />
              <Text style={[styles.toolBtnText, tool === t.key && styles.toolBtnTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Metronome ── */}
        {tool === 'metronome' && (
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

          {/* Speed trainer */}
          <View style={[styles.trainerBox, trainerOn && styles.trainerBoxOn]}>
            <TouchableOpacity
              style={styles.trainerHeader}
              onPress={() => setTrainerOn((o) => !o)}
              activeOpacity={0.8}
            >
              <View style={styles.trainerTitleWrap}>
                <Ionicons name="trending-up" size={16} color={trainerOn ? COLORS.primary : COLORS.textMuted} />
                <Text style={[styles.trainerTitle, trainerOn && { color: COLORS.text }]}>Speed trainer</Text>
              </View>
              <View style={[styles.trainerSwitch, trainerOn && styles.trainerSwitchOn]}>
                <View style={[styles.trainerKnob, trainerOn && styles.trainerKnobOn]} />
              </View>
            </TouchableOpacity>

            {trainerOn && (
              <View style={styles.trainerBody}>
                <Text style={styles.trainerHint}>
                  {isPlaying
                    ? atTarget
                      ? `✓ At target — holding ${trainerTarget} BPM`
                      : `Ramping ${trainerStart} → ${trainerTarget} BPM`
                    : 'Speeds up automatically as you play'}
                </Text>
                <View style={styles.trainerRow}>
                  <Text style={styles.trainerLabel}>From</Text>
                  <Stepper value={trainerStart} min={BPM_MIN} max={BPM_MAX} step={5} suffix="BPM" onChange={setTrainerStart} />
                </View>
                <View style={styles.trainerRow}>
                  <Text style={styles.trainerLabel}>To</Text>
                  <Stepper value={trainerTarget} min={BPM_MIN} max={BPM_MAX} step={5} suffix="BPM" onChange={setTrainerTarget} />
                </View>
                <View style={styles.trainerRow}>
                  <Text style={styles.trainerLabel}>Increase by</Text>
                  <Stepper value={trainerStep} min={1} max={20} step={1} suffix="BPM" onChange={setTrainerStep} />
                </View>
                <View style={styles.trainerRow}>
                  <Text style={styles.trainerLabel}>Every</Text>
                  <Stepper value={trainerBars} min={1} max={16} step={1} suffix="bars" onChange={setTrainerBars} />
                </View>
              </View>
            )}
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
        )}

        {/* ── Tuner (chromatic, auto-detecting) ── */}
        {tool === 'tuner' && (() => {
          const note = detectedHz ? hzToNote(detectedHz) : null;
          const cents = note ? Math.max(-50, Math.min(50, note.cents)) : 0;
          const ratio = (cents + 50) / 100; // 0 (−50¢) … 1 (+50¢)
          const inTune = note && Math.abs(note.cents) <= 5;
          const close = note && Math.abs(note.cents) <= 15;
          const color = !note ? COLORS.textMuted : inTune ? COLORS.success : close ? '#F59E0B' : COLORS.error;
          // Which standard string are you nearest to? (closest by pitch, octave-aware)
          const nearest = note
            ? strings.reduce((best, s) => {
                const d = Math.abs(1200 * Math.log2(detectedHz / s.freq));
                return !best || d < best.d ? { num: s.number, d } : best;
              }, null)
            : null;

          return (
            <View style={styles.card}>
              {/* Guitar / Bass toggle */}
              <View style={styles.instRow}>
                {['Guitar', 'Bass'].map((inst) => (
                  <TouchableOpacity
                    key={inst}
                    style={[styles.instBtn, tunerInstrument === inst && styles.instBtnActive]}
                    onPress={() => setTunerInstrument(inst)}
                  >
                    <Text style={[styles.instBtnText, tunerInstrument === inst && styles.instBtnTextActive]}>
                      {inst}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Big auto-detected note */}
              <View style={styles.tunerNoteBlock}>
                <Text style={[styles.tunerBigNote, { color }]}>
                  {note ? note.name : '–'}
                  {note && <Text style={styles.tunerBigOctave}>{note.octave}</Text>}
                </Text>
                <Text style={[styles.tunerStatus, { color }]}>
                  {!isTuning
                    ? 'Tap Start, then play a string'
                    : !note
                      ? 'Listening…'
                      : inTune
                        ? '✓ In tune'
                        : note.cents < 0
                          ? 'Tune up'
                          : 'Tune down'}
                </Text>
              </View>

              {/* Needle / cents meter — the bar is the tuning indicator */}
              <TunerNeedle ratio={ratio} color={color} visible={!!note} />

              {/* Standard-tuning reference — highlights the string you're playing */}
              <View style={styles.tunerStringRow}>
                {strings.map((s) => {
                  const on = nearest?.num === s.number;
                  return (
                    <View
                      key={s.number}
                      style={[styles.tunerStringChip, on && { borderColor: color, backgroundColor: color + '22' }]}
                    >
                      <Text style={[styles.tunerStringChipText, on && { color }]}>{s.note}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Start / Stop */}
              <TouchableOpacity
                style={[styles.tunerBtn, isTuning && styles.tunerBtnActive]}
                onPress={isTuning ? stopTuning : startTuning}
                activeOpacity={0.8}
              >
                <Ionicons name={isTuning ? 'stop-circle' : 'mic'} size={18} color={COLORS.text} style={{ marginRight: 6 }} />
                <Text style={styles.tunerBtnText}>{isTuning ? 'Stop' : 'Start Tuning'}</Text>
              </TouchableOpacity>

              <Text style={styles.tunerCaption}>
                Auto-detects any note · Standard {tunerInstrument === 'Bass' ? 'EADG' : 'EADGBE'}
              </Text>
            </View>
          );
        })()}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.lg },
  card: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg },

  // Tool selector
  toolSelector: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  toolBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: SPACING.md, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border },
  toolBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  toolBtnText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },
  toolBtnTextActive: { color: COLORS.text },
  libraryRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 18, paddingHorizontal: SPACING.md, marginBottom: SPACING.lg },
  libraryRowText: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '700' },
  sectionLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: SPACING.sm, marginTop: SPACING.xs },
  learnRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
  learnCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md },
  learnIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  learnCardText: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  learnCardSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 1 },

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

  // Speed trainer
  trainerBox: { marginTop: SPACING.lg, marginBottom: SPACING.md, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, overflow: 'hidden' },
  trainerBoxOn: { borderColor: COLORS.primary + '55', backgroundColor: COLORS.primary + '12' },
  trainerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2 },
  trainerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trainerTitle: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  trainerSwitch: { width: 42, height: 24, borderRadius: 12, backgroundColor: COLORS.border, padding: 2, justifyContent: 'center' },
  trainerSwitchOn: { backgroundColor: COLORS.primary },
  trainerKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.text },
  trainerKnobOn: { alignSelf: 'flex-end' },
  trainerBody: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: SPACING.sm },
  trainerHint: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 2 },
  trainerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trainerLabel: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },

  // Tuner
  instRow: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 10, padding: 3, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  instBtn: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: 8 },
  instBtnActive: { backgroundColor: COLORS.primary },
  instBtnText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
  instBtnTextActive: { color: COLORS.text },

  tunerNoteBlock: { alignItems: 'center', marginTop: SPACING.sm, marginBottom: SPACING.sm },
  tunerBigNote: { fontSize: 76, fontWeight: '900', lineHeight: 84, letterSpacing: 1 },
  tunerBigOctave: { fontSize: 26, fontWeight: '700', color: COLORS.textMuted },
  tunerStatus: { fontSize: 14, fontWeight: '700', marginTop: 2 },

  tunerStringRow: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.md, marginBottom: SPACING.xs },
  tunerStringChip: { minWidth: 38, paddingVertical: 6, borderRadius: 9, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center' },
  tunerStringChipText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '800' },

  tunerCaption: { color: COLORS.textMuted, fontSize: 11, textAlign: 'center', letterSpacing: 0.5, marginTop: SPACING.sm },

  needleWrap: { marginVertical: SPACING.md, paddingHorizontal: 4 },
  needleTrack: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, position: 'relative', marginBottom: 6 },
  needleZone: { position: 'absolute', left: '44%', width: '12%', top: 0, bottom: 0, backgroundColor: COLORS.success + '40', borderRadius: 3 },
  needleCenter: { position: 'absolute', left: '50%', top: -5, width: 2, height: 16, backgroundColor: COLORS.textSecondary, borderRadius: 1, marginLeft: -1 },
  needleIndicator: { position: 'absolute', width: 18, height: 18, borderRadius: 9, top: -6, marginLeft: -9, borderWidth: 3, borderColor: COLORS.background },
  needleLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  needleLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },

  tunerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: SPACING.sm, marginTop: SPACING.md },
  tunerBtnActive: { backgroundColor: COLORS.error },
  tunerBtnText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },

  // Song to practice (in task section)
  songTaskCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary, padding: SPACING.md, marginTop: SPACING.md,
  },
  songTaskLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  songTaskTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  songTaskArtist: { color: COLORS.textSecondary, fontSize: 13, marginTop: 1 },
  songCta: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed', padding: SPACING.md, marginTop: SPACING.md,
  },
  songCtaText: { color: COLORS.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 },

  // ── Pre-Gig Mode banner ──
  preGigBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.lg,
    backgroundColor: COLORS.primary + '18', borderRadius: 16, borderWidth: 1, borderColor: COLORS.primary + '55',
    padding: SPACING.md,
  },
  preGigIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  preGigLabel: { color: COLORS.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 1 },
  preGigTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  preGigSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 1 },

  // ── Gigs (Pre-Gig Mode) ──
  gigForm: { gap: SPACING.sm, marginBottom: SPACING.md },
  gigInput: { backgroundColor: COLORS.surface, color: COLORS.text, borderRadius: 10, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  gigFormLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: SPACING.xs },
  gigSetlistChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  gigChip: { paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, maxWidth: '100%' },
  gigChipOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '22' },
  gigChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  gigChipTextOn: { color: COLORS.primary },
  gigFormBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  gigCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  gigCancelText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  gigSaveBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  gigSaveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  gigEmptyBox: { alignItems: 'center', paddingVertical: SPACING.xl },
  gigEmptyBoxText: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center' },
  gigRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  gigRowSoon: {},
  gigCountdown: { width: 46, height: 46, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  gigCountdownSoon: { borderColor: COLORS.primary + '66', backgroundColor: COLORS.primary + '14' },
  gigCountdownNum: { color: COLORS.text, fontSize: 18, fontWeight: '900', lineHeight: 20 },
  gigCountdownUnit: { color: COLORS.textMuted, fontSize: 9, fontWeight: '600' },
  gigName: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  gigMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 1 },

  // Song library panel
  songsHeading: { color: COLORS.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  songsSub: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: SPACING.lg },
  attribution: { color: COLORS.textMuted, fontSize: 11, lineHeight: 15, marginTop: SPACING.md },

  // ── Gig setlists ──
  gigNewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12, marginTop: SPACING.xs,
  },
  gigNewBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  gigEmpty: { color: COLORS.textMuted, fontSize: 13, marginTop: SPACING.md, textAlign: 'center' },
  setlistRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: 12, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  setlistIcon: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: COLORS.card,
    alignItems: 'center', justifyContent: 'center',
  },
  setlistName: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  setlistMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },

  // Gig form bottom sheet
  gigSheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.xs,
  },
  gigSheetTitle: { color: COLORS.text, fontWeight: '800', fontSize: 20, textAlign: 'center' },
  gigSheetSub: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: SPACING.sm },
  gigLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700', marginTop: SPACING.sm, marginBottom: 4 },
  gigStepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, alignSelf: 'flex-start', marginTop: 4 },
  gigStepBtn: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  gigStepValue: { color: COLORS.text, fontWeight: '800', fontSize: 20, minWidth: 28, textAlign: 'center' },
  gigGenerateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, marginTop: SPACING.lg,
  },
  gigGenerateText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Setlist detail sheet
  detailBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  detailSheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: SPACING.lg, paddingBottom: SPACING.xl,
  },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, marginBottom: SPACING.md },
  detailTitle: { color: COLORS.text, fontWeight: '800', fontSize: 19 },
  detailMeta: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  detailNum: { color: COLORS.textMuted, fontWeight: '700', fontSize: 13, width: 18, textAlign: 'center' },
  detailSongTitle: { color: COLORS.text, fontWeight: '600', fontSize: 15 },
  detailSongArtist: { color: COLORS.textSecondary, fontSize: 13, marginTop: 1 },
  detailSongNote: { color: COLORS.accent, fontSize: 11, marginTop: 2 },
  spotifyExportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: '#1DB954', borderRadius: 12, paddingVertical: 14, marginTop: SPACING.md,
  },
  spotifyExportText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  goLiveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, marginTop: SPACING.md,
  },
  goLiveText: { color: COLORS.text, fontWeight: '800', fontSize: 15 },
  detailDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    paddingVertical: 12, marginTop: SPACING.sm,
  },
  detailDeleteText: { color: COLORS.error, fontWeight: '600', fontSize: 14 },
  recHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.xl, marginBottom: 4 },
  recHeading: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  recLevelTag: { color: COLORS.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginLeft: 'auto' },

  // "Picked for your level" horizontal carousel
  recScrollOuter: { marginHorizontal: -SPACING.lg, marginTop: SPACING.xs },
  recScroll: { paddingHorizontal: SPACING.lg, gap: SPACING.md, paddingVertical: SPACING.sm },
  recCard: { width: REC_ART },
  recArtWrap: { width: REC_ART, height: REC_ART, borderRadius: 12, marginBottom: SPACING.sm },
  recPlayOverlay: {
    position: 'absolute', right: 8, bottom: 8, width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  recCardTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  recCardArtist: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  recAddBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginTop: SPACING.sm, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.primary,
  },
  recAddBtnDone: { backgroundColor: COLORS.success + '22' },
  recAddText: { color: COLORS.text, fontSize: 12, fontWeight: '700' },

  // Per-song controls (preview play/pause + open-in)
  songControls: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },

  // "Open in…" bottom sheet
  playerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  playerSheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: 40, borderTopWidth: 1, borderColor: COLORS.border },
  playerHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.lg },
  playerTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  playerArtist: { color: COLORS.textSecondary, fontSize: 14, marginTop: 2 },
  openInHint: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  openInBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, borderRadius: 12, paddingVertical: SPACING.md, marginTop: SPACING.sm },
  openInBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  openInCancel: { alignItems: 'center', paddingVertical: SPACING.md, marginTop: SPACING.sm },
  openInCancelText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' },
  addRow: { flexDirection: 'row', alignItems: 'stretch', gap: SPACING.sm, marginBottom: SPACING.lg },
  songInput: {
    backgroundColor: COLORS.surface, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: COLORS.text, fontSize: 15,
  },
  songAddBtn: {
    width: 52, borderRadius: 12, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  songAddBtnDisabled: { backgroundColor: COLORS.border },
  songsEmpty: { alignItems: 'center', paddingVertical: SPACING.lg },
  songList: { gap: SPACING.sm },
  songSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md,
  },
  songSearchInput: { flex: 1, color: COLORS.text, fontSize: 15, paddingVertical: 10 },
  songsToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, marginTop: 2,
  },
  songsToggleText: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  songRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  songRowToday: { borderColor: COLORS.accent + '66', backgroundColor: COLORS.accent + '12' },
  songRowTitle: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  songRowArtist: { color: COLORS.textMuted, fontSize: 12, marginTop: 1 },
  songRowTodayTag: { color: COLORS.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginRight: 4 },
});
