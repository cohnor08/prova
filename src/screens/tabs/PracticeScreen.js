import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, PanResponder, Alert, TextInput, Keyboard, Modal, Linking, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { PitchDetector } from 'pitchy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';
import { getRecommendedSongs, getDailySong, fetchSongPreview, fetchSongArtwork, appleMusicSearchUrl, spotifySearchUrl } from '../../constants/songs';

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

  // Song library — songs the user wants to learn
  const [songs, setSongs] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');

  // Player profile — drives level-matched song recommendations
  const [instrument, setInstrument] = useState('Guitar');
  const [level, setLevel] = useState('Beginner');

  // Song playback — 30s in-app preview (iTunes) + "open in" deep links
  const [playingSongId, setPlayingSongId] = useState(null);
  const [loadingSongId, setLoadingSongId] = useState(null);
  const songSoundRef = useRef(null);
  const [openInSong, setOpenInSong] = useState(null); // song shown in the "Open in…" sheet
  const [artwork, setArtwork] = useState({}); // "title|artist" → cover URL (null once fetched, none found)

  // Which tool is visible: 'timer' | 'metronome' | 'tuner' | 'songs'
  const [tool, setTool] = useState('timer');

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

  // Tuner
  const [tunerInstrument, setTunerInstrument] = useState('Guitar');
  const [stringIndex, setStringIndex] = useState(0);
  const [isTuning, setIsTuning] = useState(false);
  const [detectedHz, setDetectedHz] = useState(null);
  const [tunerCents, setTunerCents] = useState(0);
  const isTuningRef = useRef(false);
  const recordingRef = useRef(null);
  const targetFreqRef = useRef(0);
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
            // Smooth readings with an EMA, but snap if the pitch jumps (new string)
            const prev = smoothedHzRef.current;
            const smoothed = (prev && Math.abs(hz - prev) / prev < 0.15)
              ? prev * 0.6 + hz * 0.4
              : hz;
            smoothedHzRef.current = smoothed;
            setDetectedHz(smoothed);
            setTunerCents(centsOff(smoothed, targetFreqRef.current));
          } else {
            smoothedHzRef.current = null;
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
  const currentString = strings[stringIndex] || strings[0];
  targetFreqRef.current = currentString.freq;

  // Songs matched to the player's instrument + level, and the one to feature
  // today — rotates by day across the user's library plus the recommendations.
  const recommendedSongs = getRecommendedSongs(instrument, level);
  const recommendedIds = new Set(
    songs.map((s) => `${s.title.toLowerCase()}|${(s.artist || '').toLowerCase()}`)
  );
  const songOfTheDay = getDailySong(instrument, level);

  // Keyed by title|artist so a song shared across the library, recommendations,
  // and "song of the day" only fetches its cover once.
  const artKey = (s) => `${(s.title || '').toLowerCase()}|${(s.artist || '').toLowerCase()}`;

  // Lazily pull cover art for every song currently on screen (iTunes Search).
  // The `undefined` guard means each unique song is fetched at most once.
  useEffect(() => {
    const visible = [songOfTheDay, ...songs, ...recommendedSongs].filter(Boolean);
    const seen = new Set();
    const missing = [];
    for (const s of visible) {
      const k = artKey(s);
      if (seen.has(k)) continue;
      seen.add(k);
      if (artwork[k] === undefined) missing.push(s);
    }
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const updates = {};
      await Promise.all(
        missing.map(async (s) => { updates[artKey(s)] = await fetchSongArtwork(s.title, s.artist); })
      );
      if (!cancelled) setArtwork((prev) => ({ ...prev, ...updates }));
    })();
    return () => { cancelled = true; };
  }, [songs, instrument, level]);

  const categoryColor = activeSession
    ? (CATEGORY_COLORS[activeSession.category] || COLORS.primary)
    : COLORS.primary;

  // The song's real album cover (from the iTunes Search API). While it loads —
  // or for the rare song with no match — we show a generated gradient tile so
  // the layout never looks broken.
  const renderArtwork = (song, size, radius = 10) => {
    const uri = artwork[artKey(song)];
    if (uri) {
      return (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius, backgroundColor: COLORS.card }}
        />
      );
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

        {/* ── Song to practice ── */}
        {!loadingTasks && (
          songOfTheDay ? (
            <TouchableOpacity
              style={styles.songTaskCard}
              activeOpacity={0.8}
              onPress={() => selectTool('songs')}
            >
              {renderArtwork(songOfTheDay, 48, 10)}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.songTaskLabel}>SONG TO PRACTICE</Text>
                <Text style={styles.songTaskTitle} numberOfLines={1}>{songOfTheDay.title}</Text>
                {!!songOfTheDay.artist && (
                  <Text style={styles.songTaskArtist} numberOfLines={1}>{songOfTheDay.artist}</Text>
                )}
              </View>
              {renderSongControls(songOfTheDay, 32)}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.songCta} activeOpacity={0.8} onPress={() => selectTool('songs')}>
              <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} style={{ marginRight: 8 }} />
              <Text style={styles.songCtaText}>Add songs you want to learn to get a daily song to practice</Text>
            </TouchableOpacity>
          )
        )}

        {/* ── Tool selector ── */}
        <View style={styles.toolSelector}>
          {[
            { key: 'timer', label: 'Timer', icon: 'timer-outline' },
            { key: 'metronome', label: 'Metro', icon: 'pulse-outline' },
            { key: 'tuner', label: 'Tuner', icon: 'musical-note-outline' },
            { key: 'songs', label: 'Songs', icon: 'list-outline' },
          ].map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.toolBtn, tool === t.key && styles.toolBtnActive]}
              onPress={() => selectTool(t.key)}
              activeOpacity={0.8}
            >
              <Ionicons name={t.icon} size={22} color={tool === t.key ? COLORS.text : COLORS.textMuted} />
              <Text style={[styles.toolBtnText, tool === t.key && styles.toolBtnTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Timer ── */}
        {tool === 'timer' && (
          activeSession ? (
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
          ) : (
            <View style={styles.emptyTask}>
              <Ionicons name="musical-notes-outline" size={28} color={COLORS.textMuted} style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTaskText}>Pick a task above to start the timer</Text>
            </View>
          )
        )}

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

        {/* ── Tuner ── */}
        {tool === 'tuner' && (
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

          <Text style={styles.tunerFreq}>{currentString.label}</Text>

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
                      {inTune ? '✓ In tune' : tunerCents < 0 ? 'Tune up ↑' : 'Tune down ↓'}
                    </Text>
                    <View style={styles.needleTrack}>
                      <View style={styles.needleCenter} />
                      <View style={[styles.needleIndicator, { left: `${ratio * 100}%`, backgroundColor: color }]} />
                    </View>
                    <View style={styles.needleLabels}>
                      <Text style={styles.needleLabel}>flat</Text>
                      <Text style={styles.needleLabel}>♪</Text>
                      <Text style={styles.needleLabel}>sharp</Text>
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
        )}

        {/* ── Song Library ── */}
        {tool === 'songs' && (
        <View style={styles.card}>
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

          {/* List */}
          {songs.length === 0 ? (
            <View style={styles.songsEmpty}>
              <Ionicons name="musical-notes-outline" size={26} color={COLORS.textMuted} style={{ marginBottom: 6 }} />
              <Text style={styles.emptyTaskText}>No songs yet — add your first above</Text>
            </View>
          ) : (
            <View style={styles.songList}>
              {songs.map((s) => {
                const isToday = songOfTheDay && s.id === songOfTheDay.id;
                return (
                  <View key={s.id} style={[styles.songRow, isToday && styles.songRowToday]}>
                    {renderArtwork(s, 48, 10)}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.songRowTitle} numberOfLines={1}>{s.title}</Text>
                      {!!s.artist && <Text style={styles.songRowArtist} numberOfLines={1}>{s.artist}</Text>}
                    </View>
                    {isToday && <Text style={styles.songRowTodayTag}>TODAY</Text>}
                    {renderSongControls(s, 24)}
                    <TouchableOpacity
                      onPress={() => removeSong(s.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Recommended for the player's level */}
          <View style={styles.recHeaderRow}>
            <Ionicons name="sparkles" size={15} color={COLORS.accent} />
            <Text style={styles.recHeading}>Picked for your level</Text>
            <Text style={styles.recLevelTag}>{level} · {instrument}</Text>
          </View>
          <Text style={styles.songsSub}>
            Songs that fit a {level.toLowerCase()} {instrument.toLowerCase()} player. Tap a cover to preview, or add it to your library.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.recScrollOuter}
            contentContainerStyle={styles.recScroll}
          >
            {recommendedSongs.map((rec) => {
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
                    {renderArtwork(rec, REC_ART, 12)}
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
        </View>
        )}

      </ScrollView>

      {/* "Open in…" — play the full song in the user's music app */}
      <Modal
        visible={!!openInSong}
        transparent
        animationType="slide"
        onRequestClose={() => setOpenInSong(null)}
      >
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
      </Modal>
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

  // Song library panel
  songsHeading: { color: COLORS.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  songsSub: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: SPACING.lg },
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
