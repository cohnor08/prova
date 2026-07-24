import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, PanResponder, Alert, TextInput, Keyboard, Modal, Linking, Image, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import Ghost from '../../components/Ghost';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { PitchDetector } from 'pitchy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync, useThemeColors } from '../../lib/ThemeContext';
import { getRecommendedSongs, getDailySong, fetchSongPreview, fetchSongArtwork, appleMusicSearchUrl, spotifySearchUrl, searchTrack } from '../../constants/songs';
import { generateSetlist } from '../../lib/claude';
import EmptyState from '../../components/EmptyState';
import PerformanceMode from '../../components/PerformanceMode';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {
  SPOTIFY_CLIENT_ID, SPOTIFY_SCOPES, SPOTIFY_DISCOVERY,
  SPOTIFY_EXPORT_ENABLED, isSpotifyConfigured, exportSetlistToSpotify,
} from '../../lib/spotify';
import SheetModal from '../../components/SheetModal';

// Lets the OAuth popup hand control back to the app when Spotify redirects.
WebBrowser.maybeCompleteAuthSession();

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
const REC_ART = 130; // cover-tile size for "Picked for your level" carousel cards

// Generated cover tiles — our own artwork, so there's no third-party/album-art
// licensing to worry about. A song's title deterministically picks one gradient.
const ART_GRADIENTS = [
  ['#3B82F6', '#06B6D4'],
  ['#6366F1', '#8B5CF6'],
  ['#0EA5E9', '#22D3EE'],
  ['#8B5CF6', '#EC4899'],
  ['#10B981', '#06B6D4'],
  ['#F59E0B', '#F43F5E'],
  ['#3B82F6', '#1D4ED8'],
  ['#14B8A6', '#3B82F6'],
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ─── BPM Slider ───────────────────────────────────────────────────────────────

function BpmSlider({ bpm, onChange }) {
  const COLORS = useThemeColors();
  const sliderStyles = React.useMemo(() => makeSliderStyles(COLORS), [COLORS]);
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
        // e.target is undefined on react-native-web (native has .measure); guard it.
        e.target?.measure?.((_, __, ___, ____, pageX) => { trackPageX.current = pageX; });
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

const makeSliderStyles = (COLORS) => StyleSheet.create({
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
  const COLORS = useThemeColors();
  const stepperStyles = React.useMemo(() => makeStepperStyles(COLORS), [COLORS]);
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

const makeStepperStyles = (COLORS) => StyleSheet.create({
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

export default function SongsScreen({ route, navigation }) {
  useThemeSync();
  // Tasks
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Song library — songs the user wants to learn
  const [songs, setSongs] = useState([]);
  const [assignedTasks, setAssignedTasks] = useState([]); // teacher-assigned tasks (for their attached songs)
  const [songsExpanded, setSongsExpanded] = useState(false); // collapse long libraries
  const [expandedSongId, setExpandedSongId] = useState(null); // song expanded into the big player card
  const [songSearch, setSongSearch] = useState('');          // filter the library
  const [trackResult, setTrackResult] = useState(null);      // canonical match from iTunes for the current search
  const [searchingTrack, setSearchingTrack] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');

  // Gig setlists — AI-built playlists saved inside the library
  const [setlists, setSetlists] = useState([]);
  const [showGigForm, setShowGigForm] = useState(false);   // "new gig setlist" modal

  // Hand-built setlists — name it, search any song (iTunes), stack the list.
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualSearch, setManualSearch] = useState('');
  const [manualResult, setManualResult] = useState(null); // resolved track | 'none'
  const [manualSearching, setManualSearching] = useState(false);
  const [manualSongs, setManualSongs] = useState([]);
  const [gigSetting, setGigSetting] = useState('');
  const [gigAudience, setGigAudience] = useState('');
  const [gigVibe, setGigVibe] = useState('');       // genres
  const [gigArtists, setGigArtists] = useState(''); // inspiration artists (optional)
  const [gigSongCount, setGigSongCount] = useState(10);
  const [generatingSetlist, setGeneratingSetlist] = useState(false);
  const [viewingSetlist, setViewingSetlist] = useState(null); // setlist shown in detail modal
  // A freshly generated setlist waiting for the gig-form sheet to finish its
  // exit animation. iOS freezes if the detail modal presents while the sheet
  // is still dismissing — the detail opens from the sheet's onClosed instead.
  const pendingSetlistRef = useRef(null);
  const [performingSetlist, setPerformingSetlist] = useState(null); // setlist in live performance mode
  const [tipLink, setTipLink] = useState(''); // performer's payment link, shown as a tip QR on stage

  // Upcoming gigs (events) — drive Pre-Gig Mode. Loaded read-only here; the
  // managing UI (add/remove) lives on the pushed Gigs & Setlists screen.
  const [gigs, setGigs] = useState([]);

  // Spotify export — OAuth (PKCE) + "create this playlist in Spotify"
  const [spotifyToken, setSpotifyToken] = useState(null);
  const spotifyScopeRef = useRef('');
  const [exportingSetlistId, setExportingSetlistId] = useState(null);
  const pendingExportRef = useRef(null);
  const spotifyRedirectUri = AuthSession.makeRedirectUri({ scheme: 'prova' });
  const [spotifyRequest, spotifyResponse, promptSpotify] = AuthSession.useAuthRequest(
    {
      clientId: SPOTIFY_CLIENT_ID,
      scopes: SPOTIFY_SCOPES,
      usePKCE: true,
      redirectUri: spotifyRedirectUri,
      // Force the consent screen every time so the playlist permissions are
      // always (re)granted — Spotify silently skips consent once authorized,
      // which can leave a token without the needed scopes.
      extraParams: { show_dialog: 'true' },
    },
    SPOTIFY_DISCOVERY,
  );

  // Player profile — drives level-matched song recommendations
  const [instrument, setInstrument] = useState('Guitar');
  const [level, setLevel] = useState('Beginner');
  const [role, setRole] = useState(null); // 'student' (free) | 'personal' | undefined (legacy = personal)

  // Song playback — 30s in-app preview (iTunes) + "open in" deep links
  const [playingSongId, setPlayingSongId] = useState(null);
  const [loadingSongId, setLoadingSongId] = useState(null);
  const songSoundRef = useRef(null);
  const [openInSong, setOpenInSong] = useState(null); // song shown in the "Open in…" sheet
  const [artwork, setArtwork] = useState({}); // "title|artist" → cover URL (null once fetched, none found)
  const [playable, setPlayable] = useState({}); // "title|artist" → true/false once known (has a 30s preview)

  // Which tool is visible: 'metronome' | 'tuner' | 'songs'
  // (the practice timer now lives inline on the task card above)
  const [tool, setTool] = useState('metronome');

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

  // When navigated with a specific tool (e.g. from Today's song card), open it
  useEffect(() => {
    if (route?.params?.tool) {
      setTool(route.params.tool);
    }
  }, [route?.params?.tool]);

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
        stopSongPlayback();
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
      setSongs(Array.isArray(data?.songLibrary) ? data.songLibrary : []);
      setAssignedTasks(Array.isArray(data?.assignedTasks) ? data.assignedTasks : []);
      setSetlists(Array.isArray(data?.setlists) ? data.setlists : []);
      setGigs(Array.isArray(data?.gigs) ? data.gigs : []);
      setTipLink(data?.tipLink || '');
      setRole(data?.role || null);
      if (data?.instrument) setInstrument(data.instrument);
      if (data?.level) setLevel(data.level);
      if (data?.instrument === 'Bass') setTunerInstrument('Bass');
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTasks(false);
    }
  };

  // Persist the song library to the user doc (owner-only write per Firestore rules)
  const saveSongs = async (next) => {
    setSongs(next);
    try {
      const uid = auth.currentUser?.uid;
      if (uid) await setDoc(doc(db, 'users', uid), { songLibrary: next }, { merge: true });
    } catch (err) {
      console.warn('Failed to save songs:', err);
      Alert.alert('Error', "Couldn't save your song. Check your connection and try again.");
    }
  };

  // Persist gig setlists to the user doc (same owner-only write as the library)
  const saveSetlists = async (next) => {
    setSetlists(next);
    try {
      const uid = auth.currentUser?.uid;
      if (uid) await setDoc(doc(db, 'users', uid), { setlists: next }, { merge: true });
    } catch (err) {
      console.warn('Failed to save setlists:', err);
      Alert.alert('Error', "Couldn't save your setlist. Check your connection and try again.");
    }
  };

  // Ask Claude for a gig setlist, then save it as a playlist. Any suggested song
  // not already in the library is also copied in, so previews/covers light up and
  // the user can practice it.
  const handleGenerateSetlist = async () => {
    // Free launch: AI setlists are open to everyone. The generateSetlist
    // function still rate-limits per account server-side.
    const setting = gigSetting.trim();
    const audience = gigAudience.trim();
    if (!setting || !audience) {
      Alert.alert('Almost there', 'Describe the setting and the audience so Prova can tailor the setlist.');
      return;
    }
    Keyboard.dismiss();
    setGeneratingSetlist(true);
    try {
      const result = await generateSetlist({
        instrument, level,
        setting, audience,
        vibe: gigVibe.trim() || null,
        artists: gigArtists.trim() || null,
        songCount: gigSongCount,
        library: songs.map((s) => ({ title: s.title, artist: s.artist || '' })),
      });

      const inLibrary = (t, a) => songs.some(
        (s) => s.title.toLowerCase() === (t || '').toLowerCase()
          && (s.artist || '').toLowerCase() === (a || '').toLowerCase()
      );
      const picks = (result?.songs || [])
        .filter((s) => s && s.title)
        .map((s, i) => ({
          id: `setsong_${Date.now()}_${i}`,
          title: String(s.title).slice(0, 120),
          artist: String(s.artist || '').slice(0, 120),
          note: String(s.note || '').slice(0, 80),
          fromLibrary: inLibrary(s.title, s.artist),
        }));
      if (picks.length === 0) {
        Alert.alert('No setlist', "Prova couldn't build a setlist this time. Try adding more detail.");
        return;
      }

      const setlist = {
        id: `setlist_${Date.now()}`,
        name: String(result?.name || 'Gig setlist').slice(0, 50),
        setting, audience,
        vibe: gigVibe.trim(),
        artists: gigArtists.trim(),
        songs: picks,
        createdAt: new Date().toISOString(),
      };
      const nextSetlists = [setlist, ...setlists];
      await saveSetlists(nextSetlists);

      // Fold any brand-new songs into the library too.
      const additions = picks
        .filter((p) => !inLibrary(p.title, p.artist))
        .map((p) => ({ id: p.id, title: p.title, artist: p.artist, addedAt: new Date().toISOString() }));
      if (additions.length > 0) await saveSongs([...additions, ...songs]);

      // Reset the form; the detail modal opens from the sheet's onClosed once
      // the exit animation finishes (opening it here freezes iOS — two modals
      // can't present/dismiss in the same tick).
      setGigSetting(''); setGigAudience(''); setGigVibe(''); setGigArtists(''); setGigSongCount(10);
      pendingSetlistRef.current = setlist;
      setShowGigForm(false);
    } catch (err) {
      console.warn('Setlist generation failed:', err);
      Alert.alert('Error', err.message?.includes('limit')
        ? err.message
        : "Couldn't build your setlist right now. Please try again.");
    } finally {
      setGeneratingSetlist(false);
    }
  };

  const deleteSetlist = (id) => {
    saveSetlists(setlists.filter((s) => s.id !== id));
    setViewingSetlist(null);
  };

  // Closing the setlist detail stops any preview still playing and dismisses the
  // open-in overlay, so nothing keeps running behind the scenes.
  const closeSetlistDetail = () => {
    stopSongPlayback();
    setOpenInSong(null);
    setViewingSetlist(null);
  };

  // ── Spotify export ──
  // Build the real Spotify playlist and report what made it / what was skipped.
  const runSpotifyExport = async (token, setlist) => {
    setExportingSetlistId(setlist.id);
    try {
      const { url, addedCount, missed } = await exportSetlistToSpotify(token, setlist, spotifyScopeRef.current);
      const missText = missed.length
        ? `\n\n${missed.length} song${missed.length === 1 ? " wasn't" : "s weren't"} found on Spotify and ${missed.length === 1 ? 'was' : 'were'} skipped.`
        : '';
      Alert.alert(
        'Added to Spotify ✅',
        `"${setlist.name}" — ${addedCount} song${addedCount === 1 ? '' : 's'} added.${missText}`,
        [
          ...(url ? [{ text: 'Open in Spotify', onPress: () => Linking.openURL(url) }] : []),
          { text: 'Done', style: 'cancel' },
        ],
      );
    } catch (e) {
      if (String(e.message).includes('expired')) setSpotifyToken(null);
      Alert.alert('Spotify', e.message || 'Export failed. Please try again.');
    } finally {
      setExportingSetlistId(null);
    }
  };

  const handleExportToSpotify = (setlist) => {
    if (!isSpotifyConfigured()) {
      Alert.alert(
        'Spotify not connected yet',
        'Spotify export needs a one-time setup (a free Spotify Developer Client ID). Ask your developer to finish connecting Spotify, then this button will work.',
      );
      return;
    }
    if (spotifyToken) { runSpotifyExport(spotifyToken, setlist); return; }
    // Not signed in yet — remember the setlist and launch the Spotify login.
    pendingExportRef.current = setlist;
    setExportingSetlistId(setlist.id);
    promptSpotify();
  };

  // When the Spotify login returns, exchange the code for a token (PKCE) and run
  // any export the user was waiting on.
  useEffect(() => {
    if (!spotifyResponse) return;
    if (spotifyResponse.type === 'success' && spotifyRequest?.codeVerifier) {
      (async () => {
        try {
          const tokenResult = await AuthSession.exchangeCodeAsync(
            {
              clientId: SPOTIFY_CLIENT_ID,
              code: spotifyResponse.params.code,
              redirectUri: spotifyRedirectUri,
              extraParams: { code_verifier: spotifyRequest.codeVerifier },
            },
            SPOTIFY_DISCOVERY,
          );
          console.log('[Spotify] granted scopes:', tokenResult.scope || '(none returned)');
          spotifyScopeRef.current = tokenResult.scope || '';
          setSpotifyToken(tokenResult.accessToken);
          const pending = pendingExportRef.current;
          pendingExportRef.current = null;
          if (pending) await runSpotifyExport(tokenResult.accessToken, pending);
          else setExportingSetlistId(null);
        } catch (e) {
          setExportingSetlistId(null);
          pendingExportRef.current = null;
          Alert.alert('Spotify', e.message || "Couldn't connect to Spotify.");
        }
      })();
    } else {
      // Dismissed or errored — clear the pending state.
      setExportingSetlistId(null);
      pendingExportRef.current = null;
    }
  }, [spotifyResponse]);

  // ── Hand-built setlist helpers ──────────────────────────────────────────────
  const runManualSearch = async () => {
    const q = manualSearch.trim();
    if (!q || manualSearching) return;
    setManualSearching(true);
    try {
      const r = await searchTrack(q);
      setManualResult(r || 'none');
    } catch (e) {
      setManualResult('none');
    } finally {
      setManualSearching(false);
    }
  };
  const addManualSong = (title, artist) => {
    const t = (title || '').trim();
    if (!t) return;
    setManualSongs((prev) => [...prev, {
      id: `setsong_${Date.now()}_${prev.length}`,
      title: t,
      artist: (artist || '').trim(),
      note: '',
      fromLibrary: false,
    }]);
    setManualSearch('');
    setManualResult(null);
  };
  const saveManualSetlist = async () => {
    const name = manualName.trim();
    if (!name) { Alert.alert('Name it', 'Give your setlist a name first.'); return; }
    if (manualSongs.length === 0) { Alert.alert('Add songs', 'Search and add at least one song.'); return; }
    const sl = {
      id: `setlist_${Date.now()}`,
      name: name.slice(0, 60),
      setting: 'Custom',
      audience: '',
      vibe: '',
      createdAt: new Date().toISOString(),
      songs: manualSongs,
    };
    await saveSetlists([sl, ...setlists]);
    setShowManualForm(false);
    setManualName(''); setManualSearch(''); setManualResult(null); setManualSongs([]);
  };

  const addSong = () => {
    const title = newTitle.trim();
    if (!title) return;
    const song = {
      id: `song_${Date.now()}`,
      title,
      artist: newArtist.trim(),
      addedAt: new Date().toISOString(),
    };
    saveSongs([song, ...songs]);
    setNewTitle('');
    setNewArtist('');
    Keyboard.dismiss();
  };

  const removeSong = (id) => saveSongs(songs.filter((s) => s.id !== id));

  // Resolve the typed query to a real track (canonical title + full artist name)
  // via the iTunes Search API. Triggered when the user submits the search.
  const runTrackSearch = async () => {
    const q = songSearch.trim();
    if (!q) { setTrackResult(null); return; }
    setSearchingTrack(true);
    try {
      const r = await searchTrack(q);
      setTrackResult(r);
      // Prime the artwork map (keyed exactly like artKey) so the result card and
      // the song, once added, show the real cover immediately.
      if (r) setArtwork((m) => ({ ...m, [`${(r.title || '').toLowerCase()}|${(r.artist || '').toLowerCase()}`]: r.artwork || null }));
    } catch (e) {
      setTrackResult(null);
    } finally {
      setSearchingTrack(false);
    }
  };

  // Add the resolved song to the library (with its proper title/artist) if it's
  // not there yet, then open it — "taking the user to the song in the library".
  const addAndOpenResult = (r) => {
    if (!r) return;
    const existing = songs.find(
      (s) => (s.title || '').toLowerCase() === r.title.toLowerCase()
        && (s.artist || '').toLowerCase() === (r.artist || '').toLowerCase()
    );
    let id;
    if (existing) {
      id = existing.id;
    } else {
      const song = { id: `song_${Date.now()}`, title: r.title, artist: r.artist || '', addedAt: new Date().toISOString() };
      saveSongs([song, ...songs]);
      id = song.id;
    }
    setTrackResult(null);
    setSongSearch(r.title);   // filter the library to the resolved song so it's front and centre
    setSongsExpanded(true);
    setExpandedSongId(id);    // open it
    Keyboard.dismiss();
  };

  // Copy a level-matched recommendation into the user's own library
  const addRecommendedSong = (rec) => {
    const exists = songs.some(
      (s) => s.title.toLowerCase() === rec.title.toLowerCase()
        && (s.artist || '').toLowerCase() === (rec.artist || '').toLowerCase()
    );
    if (exists) return;
    const song = {
      id: `song_${Date.now()}`,
      title: rec.title,
      artist: rec.artist || '',
      addedAt: new Date().toISOString(),
    };
    saveSongs([song, ...songs]);
  };

  const stopSongPlayback = async () => {
    if (songSoundRef.current) {
      try { await songSoundRef.current.stopAsync(); } catch (_) {}
      try { await songSoundRef.current.unloadAsync(); } catch (_) {}
      songSoundRef.current = null;
    }
    setPlayingSongId(null);
  };

  // Play (or stop) a 30-second preview of a song in-app
  const toggleSongPlayback = async (song) => {
    if (playingSongId === song.id) { await stopSongPlayback(); return; }
    await stopSongPlayback();
    // Free up audio from the other tools first
    if (isPlaying) { clearInterval(intervalRef.current); setIsPlaying(false); }
    if (isTuning) await stopTuning();

    setLoadingSongId(song.id);
    try {
      const previewUrl = await fetchSongPreview(song.title, song.artist);
      if (!previewUrl) {
        Alert.alert('No preview', `Couldn't find a preview for "${song.title}". Try "Open in…" to play the full song.`);
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: previewUrl }, { shouldPlay: true });
      songSoundRef.current = sound;
      setPlayingSongId(song.id);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) stopSongPlayback();
      });
    } catch (e) {
      console.warn('Song playback error:', e);
      Alert.alert('Playback error', "Couldn't play this song preview.");
    } finally {
      setLoadingSongId(null);
    }
  };

  // Open the full song in the user's music app
  const openSongIn = async (song, service) => {
    setOpenInSong(null);
    const url = service === 'spotify'
      ? spotifySearchUrl(song.title, song.artist)
      : appleMusicSearchUrl(song.title, song.artist);
    try {
      await Linking.openURL(url);
    } catch (e) {
      console.warn('Open in failed:', e);
      Alert.alert('Error', `Couldn't open ${service === 'spotify' ? 'Spotify' : 'Apple Music'}.`);
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
          // Smooth readings with an EMA, but snap if the pitch jumps (new string)
          const prev = smoothedHzRef.current;
          const smoothed = (prev && Math.abs(hz - prev) / prev < 0.15)
            ? prev * 0.5 + hz * 0.5
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
    if (next !== 'songs' && playingSongId) {
      stopSongPlayback();
    }
    setTool(next);
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
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

  // In Pre-Gig Mode, surface song/performance tasks first (repertoire + improv).
  const SONG_TASK_CATEGORIES = new Set(['repertoire', 'improvisation']);
  const displaySessions = preGig
    ? [...sessions].sort((a, b) =>
        (SONG_TASK_CATEGORIES.has(b.category) ? 1 : 0) - (SONG_TASK_CATEGORIES.has(a.category) ? 1 : 0))
    : sessions;

  // Songs matched to the player's instrument + level, and the one to feature
  // today — rotates by day across the user's library plus the recommendations.
  const recommendedSongs = getRecommendedSongs(instrument, level);
  const recommendedIds = new Set(
    songs.map((s) => `${s.title.toLowerCase()}|${(s.artist || '').toLowerCase()}`)
  );
  const songOfTheDay = getDailySong(instrument, level);

  // Library shown alphabetically by title, optionally filtered by the search
  // box, and collapsed to a few rows until expanded — keeps a big library from
  // dominating the screen. Searching shows all matches (no collapse).
  const SONGS_COLLAPSED = 4;
  const songQuery = songSearch.trim().toLowerCase();
  const songKey = (s) => `${(s.title || '').toLowerCase()}|${(s.artist || '').toLowerCase()}`;

  // Songs the teacher attached to assignments — surfaced here so the student can
  // practice them, tagged "From your teacher". Not written into songLibrary, and
  // deduped against songs already in the library.
  const parseSong = (str) => {
    const s = String(str).trim();
    const m = s.match(/^(.*?)\s+(?:-|–|—|by)\s+(.*)$/i);
    return m ? { title: m[1].trim(), artist: m[2].trim() } : { title: s, artist: '' };
  };
  const libKeys = new Set(songs.map(songKey));
  const teacherSongs = [];
  const tSeen = new Set();
  for (const t of assignedTasks) {
    if (!t || !t.song) continue;
    const parsed = parseSong(t.song);
    const k = songKey(parsed);
    if (!k || tSeen.has(k) || libKeys.has(k)) continue;
    tSeen.add(k);
    teacherSongs.push({ id: `teacher-${t.id}`, ...parsed, fromTeacher: true });
  }

  // The song the user tapped on Today — pinned to the very top so it's easy to find.
  const focusSong = route?.params?.focusSong || null;
  const focusKey = focusSong ? songKey(focusSong) : null;

  const rank = (s) => {
    if (focusKey && songKey(s) === focusKey) return 0; // tapped song first
    if (s.fromTeacher) return 1;                       // then teacher assignments
    return 2;                                          // then the rest, alphabetical
  };
  const baseSongs = [...teacherSongs, ...songs];
  const sortedSongs = [...baseSongs].sort((a, b) =>
    rank(a) - rank(b)
    || (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
  );
  const filteredSongs = songQuery
    ? sortedSongs.filter((s) =>
        (s.title || '').toLowerCase().includes(songQuery)
        || (s.artist || '').toLowerCase().includes(songQuery))
    : sortedSongs;
  const shownSongs = songQuery || songsExpanded ? filteredSongs : filteredSongs.slice(0, SONGS_COLLAPSED);

  // Keyed by title|artist so a song shared across the library, recommendations,
  // and "song of the day" only fetches its cover once.
  const artKey = (s) => `${(s.title || '').toLowerCase()}|${(s.artist || '').toLowerCase()}`;
  // Hide songs with no playable 30s preview (they'd just sit there not playing).
  // Teacher-assigned + today's song are always kept; unknown-yet (still loading)
  // songs stay visible until confirmed unplayable. Playable songs all have a cover.
  const playOK = (s) => s.fromTeacher || (songOfTheDay && s.id === songOfTheDay.id) || playable[artKey(s)] !== false;

  // Lazily pull cover art for every song currently on screen (iTunes Search).
  // The `undefined` guard means each unique song is fetched at most once.
  useEffect(() => {
    const visible = [songOfTheDay, ...songs, ...recommendedSongs, ...(viewingSetlist?.songs || [])].filter(Boolean);
    const seen = new Set();
    const missing = [];
    for (const s of visible) {
      const k = artKey(s);
      if (seen.has(k)) continue;
      seen.add(k);
      // Retry nulls too (== null covers undefined): a null may be a stale cached
      // miss, but the shared iTunes cache could since have the real cover (e.g.
      // fetched by Learn-a-Song). Genuine misses just re-hit the cache — cheap.
      if (artwork[k] == null) missing.push(s);
    }
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const artUpdates = {};
      const playUpdates = {};
      await Promise.all(
        // Both hit the same cached iTunes lookup — one network call per song gives
        // us the cover AND whether it has a playable 30s preview.
        missing.map(async (s) => {
          const [art, prev] = await Promise.all([
            fetchSongArtwork(s.title, s.artist),
            fetchSongPreview(s.title, s.artist),
          ]);
          artUpdates[artKey(s)] = art;
          playUpdates[artKey(s)] = !!prev;
        })
      );
      if (!cancelled) {
        setArtwork((prev) => ({ ...prev, ...artUpdates }));
        setPlayable((prev) => ({ ...prev, ...playUpdates }));
      }
    })();
    return () => { cancelled = true; };
  }, [songs, instrument, level, viewingSetlist]);

  const categoryColor = activeSession
    ? (CATEGORY_COLORS[activeSession.category] || COLORS.primary)
    : COLORS.primary;

  // The song's real album cover (from the iTunes Search API). While it loads —
  // or for the rare song with no match — we show a generated gradient tile so
  // the layout never looks broken.
  // `linkToStore` wraps a real cover in a tap → "Open in…" sheet, which Apple's
  // terms require (album art must link to the content on a store). It's off only
  // where the cover already sits inside another tap target (the carousel, whose
  // cover taps to preview — store access there is via the per-song Add/Open-in).
  const renderArtwork = (song, size, radius = 10, linkToStore = true) => {
    const uri = artwork[artKey(song)];
    if (uri) {
      const img = (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius, backgroundColor: COLORS.card }}
        />
      );
      return linkToStore ? (
        <TouchableOpacity activeOpacity={0.8} onPress={() => setOpenInSong(song)}>
          {img}
        </TouchableOpacity>
      ) : img;
    }
    const isTodaySong = songOfTheDay && song.id === songOfTheDay.id;
    const colors = ART_GRADIENTS[hashString(artKey(song)) % ART_GRADIENTS.length];
    const initial = (song.title || '?').trim().charAt(0).toUpperCase() || '?';
    return (
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: size, height: size, borderRadius: radius,
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        {isTodaySong ? (
          <Ionicons name="star" size={Math.round(size * 0.4)} color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: Math.round(size * 0.44) }}>
            {initial}
          </Text>
        )}
      </LinearGradient>
    );
  };

  // Preview play/pause button + an "Open in…" (full song) button
  const renderSongControls = (song, size = 26) => {
    const isLoading = loadingSongId === song.id;
    const isThisPlaying = playingSongId === song.id;
    return (
      <View style={styles.songControls}>
        <TouchableOpacity
          onPress={() => toggleSongPlayback(song)}
          disabled={isLoading}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isLoading ? 'ellipsis-horizontal-circle-outline' : isThisPlaying ? 'pause-circle' : 'play-circle'}
            size={size}
            color={COLORS.primary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setOpenInSong(song)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="open-outline" size={size - 6} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  };

  // The "Open in Spotify / Apple Music" bottom sheet contents. Rendered either
  // inside a standalone Modal (from the main screen) or as a plain overlay inside
  // the setlist detail Modal — iOS can't stack one Modal on top of another, so we
  // never nest Modals; we drop this View into whichever surface is already open.
  const renderOpenInSheet = () => (
    <View style={styles.playerBackdrop}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setOpenInSong(null)} />
      <View style={styles.playerSheet}>
        <View style={styles.playerHandle} />
        <Text style={styles.playerTitle} numberOfLines={1}>{openInSong?.title}</Text>
        {!!openInSong?.artist && (
          <Text style={styles.playerArtist} numberOfLines={1}>{openInSong.artist}</Text>
        )}
        <Text style={styles.openInHint}>Play the full song in:</Text>

        <TouchableOpacity
          style={[styles.openInBtn, { backgroundColor: '#1DB954' }]}
          onPress={() => openSongIn(openInSong, 'spotify')}
          activeOpacity={0.85}
        >
          <Ionicons name="musical-notes" size={20} color="#fff" />
          <Text style={styles.openInBtnText}>Spotify</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.openInBtn, { backgroundColor: '#FA243C' }]}
          onPress={() => openSongIn(openInSong, 'apple')}
          activeOpacity={0.85}
        >
          <Ionicons name="musical-note" size={20} color="#fff" />
          <Text style={styles.openInBtnText}>Apple Music</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.openInCancel} onPress={() => setOpenInSong(null)} activeOpacity={0.7}>
          <Text style={styles.openInCancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {/* ── Learn a song ── */}
        {role !== 'student' && (
          <TouchableOpacity
            style={styles.learnCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('LearnSong')}
          >
            <View style={styles.learnIcon}>
              <Ionicons name="school" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.learnTitle}>Learn a song</Text>
              <Text style={styles.learnSub}>Pick any song → get the step-by-step plan to play it</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}

        {/* ── Gig Setlists ── */}
        {(
        <View style={styles.card}>
          <Text style={styles.songsHeading}>Gig Setlists</Text>
          <Text style={styles.songsSub}>
            Describe a gig and Prova builds you an ordered setlist — saved here as a playlist.
          </Text>

          <TouchableOpacity style={styles.gigNewBtn} activeOpacity={0.85} onPress={() => setShowGigForm(true)}>
            <Ionicons name="sparkles" size={16} color="#fff" />
            <Text style={styles.gigNewBtnText}>New gig setlist</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.manualLink} activeOpacity={0.7} onPress={() => setShowManualForm(true)}>
            <Text style={styles.manualLinkText}>Build my own</Text>
          </TouchableOpacity>

          {setlists.length === 0 ? (
            <EmptyState
              icon="list-outline"
              title="No setlists yet"
              subtitle="Plan your first gig above — Prova builds the set, or you can pick songs yourself."
              style={{ paddingVertical: SPACING.lg }}
            />
          ) : (
            <View style={{ gap: SPACING.sm, marginTop: SPACING.md }}>
              {setlists.map((sl) => (
                <TouchableOpacity
                  key={sl.id}
                  style={styles.setlistRow}
                  activeOpacity={0.7}
                  onPress={() => setViewingSetlist(sl)}
                >
                  <View style={styles.setlistIcon}>
                    <Ionicons name="list" size={18} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.setlistName} numberOfLines={1}>{sl.name}</Text>
                    <Text style={styles.setlistMeta} numberOfLines={1}>
                      {sl.songs.length} songs · {sl.setting}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        )}

        {/* ── Song Library ── */}
        {(
        <View style={[styles.card, { marginTop: SPACING.lg }]}>
          <Text style={styles.songsHeading}>My Song Library</Text>
          <Text style={styles.songsSub}>
            Add songs you want to learn. Prova features one to practice each day.
          </Text>

          {/* Add form */}
          <View style={styles.addRow}>
            <View style={{ flex: 1, gap: SPACING.sm }}>
              <TextInput
                style={styles.songInput}
                placeholder="Song title"
                placeholderTextColor={COLORS.textMuted}
                value={newTitle}
                onChangeText={setNewTitle}
                returnKeyType="next"
              />
              <TextInput
                style={styles.songInput}
                placeholder="Artist (optional)"
                placeholderTextColor={COLORS.textMuted}
                value={newArtist}
                onChangeText={setNewArtist}
                returnKeyType="done"
                onSubmitEditing={addSong}
              />
            </View>
            <TouchableOpacity
              style={[styles.songAddBtn, !newTitle.trim() && styles.songAddBtnDisabled]}
              onPress={addSong}
              disabled={!newTitle.trim()}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={28} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Search box — filters your library, and (on enter) finds any song
              on iTunes so you can add it with its proper title + artist. */}
          <View style={styles.songSearchRow}>
            <Ionicons name="search" size={16} color={COLORS.textMuted} />
            <TextInput
              style={styles.songSearchInput}
              placeholder="Search a song (e.g. Good Times Bad Times)"
              placeholderTextColor={COLORS.textMuted}
              value={songSearch}
              onChangeText={(t) => { setSongSearch(t); setTrackResult(null); }}
              onSubmitEditing={runTrackSearch}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchingTrack
              ? <Ghost size="small" color={COLORS.primary} />
              : songSearch.length > 0 && (
                <TouchableOpacity onPress={() => { setSongSearch(''); setTrackResult(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
          </View>

          {/* Canonical match from iTunes — tap to add it to the library + open it. */}
          {!!trackResult && (
            <TouchableOpacity style={styles.trackResult} onPress={() => addAndOpenResult(trackResult)} activeOpacity={0.85}>
              {renderArtwork(trackResult, 44, 8, false)}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.trackResultTitle} numberOfLines={1}>{trackResult.title}</Text>
                {!!trackResult.artist && <Text style={styles.trackResultArtist} numberOfLines={1}>{trackResult.artist}</Text>}
              </View>
              <View style={styles.trackResultAdd}>
                <Ionicons name="add" size={15} color={COLORS.primary} />
                <Text style={styles.trackResultAddText}>Add</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* List */}
          {baseSongs.length === 0 ? (
            <View style={styles.songsEmpty}>
              <Ionicons name="musical-notes-outline" size={26} color={COLORS.textMuted} style={{ marginBottom: 6 }} />
              <Text style={styles.emptyTaskText}>No songs yet — add your first above</Text>
            </View>
          ) : songQuery && filteredSongs.length === 0 && !trackResult ? (
            <View style={styles.songsEmpty}>
              <Ionicons name="search-outline" size={24} color={COLORS.textMuted} style={{ marginBottom: 6 }} />
              <Text style={styles.emptyTaskText}>Not in your library yet</Text>
              <TouchableOpacity style={styles.searchWebBtn} onPress={runTrackSearch} disabled={searchingTrack} activeOpacity={0.85}>
                {searchingTrack
                  ? <Ghost size="small" color={COLORS.primary} />
                  : <Ionicons name="cloud-outline" size={15} color={COLORS.primary} />}
                <Text style={styles.searchWebText}>Find “{songSearch.trim()}” online</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.songList}>
              {shownSongs.filter(playOK).map((s) => {
                const isToday = songOfTheDay && s.id === songOfTheDay.id;
                const isFocus = focusKey && songKey(s) === focusKey;
                const isExpanded = expandedSongId === s.id;
                const isLoading = loadingSongId === s.id;
                const isThisPlaying = playingSongId === s.id;
                return (
                  <View key={s.id} style={[styles.songItem, (isToday || isFocus) && styles.songRowToday]}>
                    <TouchableOpacity
                      style={styles.songRowInner}
                      activeOpacity={0.7}
                      onPress={() => setExpandedSongId(isExpanded ? null : s.id)}
                    >
                      {renderArtwork(s, 48, 10, false)}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.songRowTitle} numberOfLines={1}>{s.title}</Text>
                        {!!s.artist && <Text style={styles.songRowArtist} numberOfLines={1}>{s.artist}</Text>}
                      </View>
                      {!s.fromTeacher && isToday && <Text style={styles.songRowTodayTag}>TODAY</Text>}
                      {!isExpanded && (
                        <TouchableOpacity
                          onPress={() => toggleSongPlayback(s)}
                          disabled={isLoading}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons
                            name={isLoading ? 'ellipsis-horizontal-circle-outline' : isThisPlaying ? 'pause-circle' : 'play-circle'}
                            size={26} color={COLORS.primary}
                          />
                        </TouchableOpacity>
                      )}
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.songExpanded}>
                        {s.fromTeacher && <Text style={styles.songExpTeacherTag}>FROM YOUR TEACHER</Text>}
                        {renderArtwork(s, 120, 14, false)}
                        <Text style={styles.songExpTitle} numberOfLines={2}>{s.title}</Text>
                        {!!s.artist && <Text style={styles.songExpArtist} numberOfLines={1}>{s.artist}</Text>}

                        <TouchableOpacity
                          style={styles.songExpPlay}
                          onPress={() => toggleSongPlayback(s)}
                          disabled={isLoading}
                          activeOpacity={0.85}
                        >
                          <Ionicons
                            name={isLoading ? 'ellipsis-horizontal' : isThisPlaying ? 'pause' : 'play'}
                            size={22} color="#fff" style={{ marginLeft: isThisPlaying || isLoading ? 0 : 2 }}
                          />
                          <Text style={styles.songExpPlayText}>
                            {isLoading ? 'Loading…' : isThisPlaying ? 'Pause preview' : 'Play preview'}
                          </Text>
                        </TouchableOpacity>

                        <View style={styles.songExpActions}>
                          <TouchableOpacity style={styles.songExpBtn} onPress={() => setOpenInSong(s)} activeOpacity={0.8}>
                            <Ionicons name="open-outline" size={16} color={COLORS.primary} />
                            <Text style={styles.songExpBtnText}>Open in…</Text>
                          </TouchableOpacity>
                          {!s.fromTeacher && (
                            <TouchableOpacity style={styles.songExpBtn} onPress={() => removeSong(s.id)} activeOpacity={0.8}>
                              <Ionicons name="trash-outline" size={16} color={COLORS.textMuted} />
                              <Text style={[styles.songExpBtnText, { color: COLORS.textMuted }]}>Remove</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
              {!songQuery && baseSongs.length > SONGS_COLLAPSED && (
                <TouchableOpacity
                  style={styles.songsToggle}
                  activeOpacity={0.7}
                  onPress={() => setSongsExpanded((v) => !v)}
                >
                  <Text style={styles.songsToggleText}>
                    {songsExpanded ? 'Show less' : `Show all ${baseSongs.length} songs`}
                  </Text>
                  <Ionicons
                    name={songsExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={COLORS.primary}
                  />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Recommended for the player's level */}
          <View style={styles.recHeaderRow}>
            <Ionicons name="sparkles" size={15} color={COLORS.accent} />
            <Text style={styles.recHeading}>Picked for your level</Text>
            <Text style={styles.recLevelTag}>{level} · {instrument}</Text>
          </View>
          <Text style={styles.songsSub}>
            Songs that fit {/^[aeiou]/i.test(level || '') ? 'an' : 'a'} {level.toLowerCase()} {instrument.toLowerCase()} player. Tap a cover to preview, or add it to your library.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.recScrollOuter}
            contentContainerStyle={styles.recScroll}
          >
            {recommendedSongs.filter(playOK).map((rec) => {
              const added = recommendedIds.has(artKey(rec));
              const isLoading = loadingSongId === rec.id;
              const isThisPlaying = playingSongId === rec.id;
              return (
                <View key={rec.id} style={styles.recCard}>
                  <TouchableOpacity
                    style={styles.recArtWrap}
                    activeOpacity={0.85}
                    onPress={() => toggleSongPlayback(rec)}
                    disabled={isLoading}
                  >
                    {renderArtwork(rec, REC_ART, 12, false)}
                    <View style={styles.recPlayOverlay}>
                      <Ionicons
                        name={isLoading ? 'ellipsis-horizontal' : isThisPlaying ? 'pause' : 'play'}
                        size={20}
                        color="#fff"
                      />
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.recCardTitle} numberOfLines={1}>{rec.title}</Text>
                  {!!rec.artist && <Text style={styles.recCardArtist} numberOfLines={1}>{rec.artist}</Text>}
                  <TouchableOpacity
                    style={[styles.recAddBtn, added && styles.recAddBtnDone]}
                    onPress={() => addRecommendedSong(rec)}
                    disabled={added}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={added ? 'checkmark' : 'add'}
                      size={16}
                      color={added ? COLORS.success : COLORS.text}
                    />
                    <Text style={[styles.recAddText, added && { color: COLORS.success }]}>
                      {added ? 'Added' : 'Add'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
          <Text style={styles.attribution}>
            Song previews and album artwork provided by Apple Music. Tap any cover to open the full track.
          </Text>
        </View>
        )}

      </ScrollView>

      {/* "Open in…" — play the full song in the user's music app. Suppressed
          while the setlist detail Modal is open (iOS can't stack Modals); in that
          case the same sheet is rendered as an overlay inside the detail Modal. */}
      <Modal
        visible={!!openInSong && !viewingSetlist}
        transparent
        animationType="slide"
        onRequestClose={() => setOpenInSong(null)}
      >
        {renderOpenInSheet()}
      </Modal>

      {/* "New gig setlist" — describe the gig, Prova builds the setlist */}
      <SheetModal
        visible={showGigForm}
        onRequestClose={() => !generatingSetlist && setShowGigForm(false)}
        onClosed={() => {
          if (pendingSetlistRef.current) {
            const sl = pendingSetlistRef.current;
            pendingSetlistRef.current = null;
            setViewingSetlist(sl);
          }
        }}
        cardStyle={[styles.gigSheet, { maxHeight: '85%' }]}
        dismissOnBackdrop
      >
            <View style={styles.playerHandle} />
            <Text style={styles.gigSheetTitle}>Plan a gig</Text>
            <Text style={styles.gigSheetSub}>The more you describe, the better the setlist.</Text>

            {/* The form scrolls: focusing a field slides it up just above the
                keyboard instead of lifting (and overflowing) the whole sheet. */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: SPACING.xs, paddingBottom: SPACING.md }}
            >
            <Text style={styles.gigLabel}>Setting</Text>
            <TextInput
              style={styles.songInput}
              placeholder="e.g. Friday night bar, wedding reception, coffee shop"
              placeholderTextColor={COLORS.textMuted}
              value={gigSetting}
              onChangeText={setGigSetting}
              editable={!generatingSetlist}
            />

            <Text style={styles.gigLabel}>Audience</Text>
            <TextInput
              style={styles.songInput}
              placeholder="e.g. 20–40s, up for dancing; mixed-age family crowd"
              placeholderTextColor={COLORS.textMuted}
              value={gigAudience}
              onChangeText={setGigAudience}
              editable={!generatingSetlist}
            />

            <Text style={styles.gigLabel}>Genres (optional)</Text>
            <TextInput
              style={styles.songInput}
              placeholder="e.g. house & UK garage; laid-back acoustic; high-energy rock"
              placeholderTextColor={COLORS.textMuted}
              value={gigVibe}
              onChangeText={setGigVibe}
              editable={!generatingSetlist}
            />

            <Text style={styles.gigLabel}>Inspiration artists (optional)</Text>
            <TextInput
              style={styles.songInput}
              placeholder="e.g. KETTAMA, Fred again.., Disclosure"
              placeholderTextColor={COLORS.textMuted}
              value={gigArtists}
              onChangeText={setGigArtists}
              editable={!generatingSetlist}
            />

            <Text style={styles.gigLabel}>Number of songs</Text>
            <View style={styles.gigStepper}>
              <TouchableOpacity
                style={styles.gigStepBtn}
                onPress={() => setGigSongCount((n) => Math.max(3, n - 1))}
                disabled={generatingSetlist || gigSongCount <= 3}
              >
                <Ionicons name="remove" size={20} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.gigStepValue}>{gigSongCount}</Text>
              <TouchableOpacity
                style={styles.gigStepBtn}
                onPress={() => setGigSongCount((n) => Math.min(30, n + 1))}
                disabled={generatingSetlist || gigSongCount >= 30}
              >
                <Ionicons name="add" size={20} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.gigGenerateBtn, generatingSetlist && { opacity: 0.7 }]}
              onPress={handleGenerateSetlist}
              disabled={generatingSetlist}
              activeOpacity={0.85}
            >
              {generatingSetlist ? (
                <>
                  <Ghost color="#fff" size="small" />
                  <Text style={styles.gigGenerateText}>Building your setlist…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text style={styles.gigGenerateText}>Generate setlist</Text>
                </>
              )}
            </TouchableOpacity>

            {!generatingSetlist && (
              <TouchableOpacity style={styles.openInCancel} onPress={() => setShowGigForm(false)} activeOpacity={0.7}>
                <Text style={styles.openInCancelText}>Cancel</Text>
              </TouchableOpacity>
            )}
            </ScrollView>
      </SheetModal>

      {/* Hand-built setlist — name it, search any song, stack the list. Same
          keyboard pattern as the gig form: inner ScrollView with insets, no KAV. */}
      <SheetModal
        visible={showManualForm}
        onRequestClose={() => setShowManualForm(false)}
        cardStyle={[styles.gigSheet, { maxHeight: '88%' }]}
        dismissOnBackdrop
      >
        <View style={styles.playerHandle} />
        <Text style={styles.gigSheetTitle}>Build a setlist</Text>
        <Text style={styles.gigSheetSub}>Search any song and add it — the order is your set order.</Text>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: SPACING.xs, paddingBottom: SPACING.md }}
        >
          <TextInput
            style={styles.songInput}
            placeholder="Setlist name (e.g. Saturday acoustic set)"
            placeholderTextColor={COLORS.textMuted}
            value={manualName}
            onChangeText={setManualName}
            maxLength={60}
          />
          <View style={styles.manualSearchRow}>
            <TextInput
              style={[styles.songInput, { flex: 1 }]}
              placeholder="Search any song…"
              placeholderTextColor={COLORS.textMuted}
              value={manualSearch}
              onChangeText={(t) => { setManualSearch(t); if (manualResult) setManualResult(null); }}
              onSubmitEditing={runManualSearch}
              returnKeyType="search"
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.manualSearchBtn} onPress={runManualSearch} disabled={manualSearching} activeOpacity={0.85}>
              {manualSearching
                ? <Ghost size="small" color={COLORS.text} />
                : <Ionicons name="search" size={17} color={COLORS.text} />}
            </TouchableOpacity>
          </View>

          {manualResult && manualResult !== 'none' && (
            <TouchableOpacity style={styles.manualResultRow} onPress={() => addManualSong(manualResult.title, manualResult.artist)} activeOpacity={0.8}>
              <Ionicons name="musical-note" size={16} color={COLORS.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.manualResultTitle} numberOfLines={1}>{manualResult.title}</Text>
                {!!manualResult.artist && <Text style={styles.manualResultArtist} numberOfLines={1}>{manualResult.artist}</Text>}
              </View>
              <Ionicons name="add-circle" size={22} color={COLORS.primary} />
            </TouchableOpacity>
          )}
          {manualResult === 'none' && !!manualSearch.trim() && (
            <TouchableOpacity style={styles.manualResultRow} onPress={() => addManualSong(manualSearch, '')} activeOpacity={0.8}>
              <Ionicons name="help-circle-outline" size={16} color={COLORS.textMuted} />
              <Text style={[styles.manualResultTitle, { flex: 1 }]} numberOfLines={1}>No match — add “{manualSearch.trim()}” as typed</Text>
              <Ionicons name="add-circle-outline" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}

          {manualSongs.length > 0 && <Text style={styles.gigLabel}>YOUR SET ({manualSongs.length})</Text>}
          {manualSongs.map((s, i) => (
            <View key={s.id} style={styles.manualSongRow}>
              <Text style={styles.manualSongNum}>{i + 1}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.manualResultTitle} numberOfLines={1}>{s.title}</Text>
                {!!s.artist && <Text style={styles.manualResultArtist} numberOfLines={1}>{s.artist}</Text>}
              </View>
              <TouchableOpacity onPress={() => setManualSongs((prev) => prev.filter((x) => x.id !== s.id))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.gigGenerateBtn, (!manualName.trim() || manualSongs.length === 0) && { opacity: 0.5 }]}
            onPress={saveManualSetlist}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.gigGenerateText}>Save setlist</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.openInCancel} onPress={() => setShowManualForm(false)} activeOpacity={0.7}>
            <Text style={styles.openInCancelText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </SheetModal>

      {/* Setlist detail — the ordered songs, each previewable + openable */}
      <Modal
        visible={!!viewingSetlist}
        transparent
        animationType="slide"
        onRequestClose={closeSetlistDetail}
      >
        <View style={styles.detailBackdrop}>
          <View style={styles.detailSheet}>
            <View style={styles.playerHandle} />
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailTitle} numberOfLines={2}>{viewingSetlist?.name}</Text>
                <Text style={styles.detailMeta} numberOfLines={2}>
                  {viewingSetlist?.songs?.length} songs · {viewingSetlist?.setting}
                </Text>
              </View>
              <TouchableOpacity onPress={closeSetlistDetail} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={26} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: SPACING.md }}>
              {viewingSetlist?.songs?.map((s, i) => (
                <View key={s.id || i} style={styles.detailRow}>
                  <Text style={styles.detailNum}>{i + 1}</Text>
                  {renderArtwork(s, 44, 8)}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailSongTitle} numberOfLines={1}>{s.title}</Text>
                    {!!s.artist && <Text style={styles.detailSongArtist} numberOfLines={1}>{s.artist}</Text>}
                    {!!s.note && <Text style={styles.detailSongNote} numberOfLines={1}>{s.note}</Text>}
                  </View>
                  {renderSongControls(s, 24)}
                </View>
              ))}
            </ScrollView>

            {viewingSetlist?.songs?.length > 0 && (
              <TouchableOpacity
                style={styles.goLiveBtn}
                onPress={() => { const sl = viewingSetlist; setViewingSetlist(null); setPerformingSetlist(sl); }}
                activeOpacity={0.85}
              >
                <Ionicons name="radio" size={18} color={COLORS.text} />
                <Text style={styles.goLiveText}>Go live — perform this set</Text>
              </TouchableOpacity>
            )}

            {SPOTIFY_EXPORT_ENABLED && (
              <TouchableOpacity
                style={[styles.spotifyExportBtn, exportingSetlistId === viewingSetlist?.id && { opacity: 0.7 }]}
                onPress={() => handleExportToSpotify(viewingSetlist)}
                disabled={exportingSetlistId === viewingSetlist?.id}
                activeOpacity={0.85}
              >
                {exportingSetlistId === viewingSetlist?.id ? (
                  <>
                    <Ghost color="#fff" size="small" />
                    <Text style={styles.spotifyExportText}>Adding to Spotify…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="musical-notes" size={18} color="#fff" />
                    <Text style={styles.spotifyExportText}>Create this playlist in Spotify</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.detailDeleteBtn}
              onPress={() => Alert.alert(
                'Delete setlist?',
                `"${viewingSetlist?.name}" will be removed. Songs stay in your library.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => deleteSetlist(viewingSetlist.id) },
                ]
              )}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color={COLORS.error} />
              <Text style={styles.detailDeleteText}>Delete setlist</Text>
            </TouchableOpacity>
          </View>

          {/* Open-in sheet rendered in-place (not a nested Modal) so it can sit
              on top of the setlist detail without iOS dropping it. */}
          {!!openInSong && (
            <View style={StyleSheet.absoluteFill}>{renderOpenInSheet()}</View>
          )}
        </View>
      </Modal>

      {performingSetlist && (
        <PerformanceMode
          setlist={performingSetlist}
          tipLink={tipLink}
          onUpdateSongs={(newSongs) => {
            const next = { ...performingSetlist, songs: newSongs };
            setPerformingSetlist(next);
            saveSetlists(setlists.map((s) => (s.id === next.id ? next : s)));
          }}
          onClose={() => { stopSongPlayback(); setPerformingSetlist(null); }}
          playingSongId={playingSongId}
          loadingSongId={loadingSongId}
          onTogglePreview={toggleSongPlayback}
          onStopPreview={stopSongPlayback}
          onOpenSpotify={(song) => openSongIn(song, 'spotify')}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.lg },
  sectionLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: SPACING.sm },
  card: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg },
  learnCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.primary,
    padding: SPACING.lg, marginBottom: SPACING.lg,
  },
  learnIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  learnTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  learnSub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },

  // Tool selector
  toolSelector: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xl, marginBottom: SPACING.lg },
  toolBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: SPACING.md, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border },
  toolBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  toolBtnText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },
  toolBtnTextActive: { color: COLORS.text },

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

  // Inline practice timer (lives on the task card)
  inlineTimerBox: { marginTop: SPACING.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2, borderRadius: 14, borderWidth: 1 },
  inlineTimer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inlineTimerLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  inlineTimerTime: { fontSize: 27, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  inlineTimerTotal: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginLeft: 1 },
  inlineTimerControls: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  inlineResetBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  inlinePlayBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  inlineTimerBarTrack: { height: 4, backgroundColor: COLORS.border, borderRadius: 2, marginTop: SPACING.sm + 2, overflow: 'hidden' },
  inlineTimerBarFill: { height: '100%', borderRadius: 2 },

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
  manualLink: { alignItems: 'center', paddingVertical: 8, marginTop: 12 },
  manualLinkText: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  manualSearchRow: { flexDirection: 'row', gap: SPACING.sm },
  manualSearchBtn: { width: 48, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  manualResultRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md },
  manualResultTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  manualResultArtist: { color: COLORS.textMuted, fontSize: 12, marginTop: 1 },
  manualSongRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 8 },
  manualSongNum: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700', width: 18, textAlign: 'center' },
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
  trackResult: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: 12, padding: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.primary + '40', marginBottom: SPACING.md,
  },
  trackResultTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  trackResultArtist: { color: COLORS.textSecondary, fontSize: 12, marginTop: 1 },
  trackResultAdd: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: COLORS.primary + '1A' },
  trackResultAddText: { color: COLORS.primary, fontSize: 13, fontWeight: '800' },
  searchWebBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm, paddingVertical: 9, paddingHorizontal: SPACING.md, borderRadius: 999, borderWidth: 1, borderColor: COLORS.primary + '40' },
  searchWebText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  songsToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, marginTop: 2,
  },
  songsToggleText: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  songItem: {
    backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
  },
  songRowInner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  songExpanded: {
    alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.lg,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  songExpTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: SPACING.md },
  songExpArtist: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 2 },
  songExpPlay: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 999,
    paddingVertical: 12, paddingHorizontal: 28, marginTop: SPACING.md,
  },
  songExpPlayText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  songExpActions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md },
  songExpBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.card, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 8, paddingHorizontal: 14,
  },
  songExpBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  songRowToday: { borderColor: COLORS.accent + '66', backgroundColor: COLORS.accent + '12' },
  songRowTitle: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  songRowArtist: { color: COLORS.textMuted, fontSize: 12, marginTop: 1 },
  songRowTodayTag: { color: COLORS.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginRight: 4 },
  songExpTeacherTag: { color: COLORS.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: SPACING.sm },
}));
