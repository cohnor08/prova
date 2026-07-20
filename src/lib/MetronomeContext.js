import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Animated } from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The metronome ENGINE, app-level — so the click keeps going when the student
// switches tabs or opens a practice task and plays along. PracticeScreen is
// just a control surface for this; the floating MetronomePill (App.js) shows
// it's running from anywhere and can stop it.
const MetronomeContext = createContext(null);

// The click voices. Classic = the original tick (played sharp via rate 1.26);
// the rest are synthesized samples in assets/click. Choice persists on-device.
export const CLICK_SETS = {
  classic:  { label: 'Classic',  tick: require('../../assets/tick.wav'),               accent: require('../../assets/tick-accent.wav'),               rate: 1.26 },
  wood:     { label: 'Wood',     tick: require('../../assets/click/wood.wav'),         accent: require('../../assets/click/wood-accent.wav'),         rate: 1 },
  beep:     { label: 'Beep',     tick: require('../../assets/click/beep.wav'),         accent: require('../../assets/click/beep-accent.wav'),         rate: 1 },
  clave:    { label: 'Clave',    tick: require('../../assets/click/clave.wav'),        accent: require('../../assets/click/clave-accent.wav'),        rate: 1 },
  hat:      { label: 'Hi-hat',   tick: require('../../assets/click/hat.wav'),          accent: require('../../assets/click/hat-accent.wav'),          rate: 1 },
  rim:      { label: 'Rimshot',  tick: require('../../assets/click/rim.wav'),          accent: require('../../assets/click/rim-accent.wav'),          rate: 1 },
  cowbell:  { label: 'Cowbell',  tick: require('../../assets/click/cowbell.wav'),      accent: require('../../assets/click/cowbell-accent.wav'),      rate: 1 },
  digital:  { label: 'Digital',  tick: require('../../assets/click/digital.wav'),      accent: require('../../assets/click/digital-accent.wav'),      rate: 1 },
  marimba:  { label: 'Marimba',  tick: require('../../assets/click/marimba.wav'),      accent: require('../../assets/click/marimba-accent.wav'),      rate: 1 },
  triangle: { label: 'Triangle', tick: require('../../assets/click/triangle.wav'),     accent: require('../../assets/click/triangle-accent.wav'),     rate: 1 },
};
const SOUND_PREF_KEY = 'prova:metroSound';

// Per-beat accent levels 1–4 → which sample + how loud. Level 1 = quiet tick,
// level 4 = the loud accent. Tapping a beat bar cycles it.
export const ACCENT_LEVELS = 4;
function levelSound(level) {
  if (level >= 4) return { accent: true, volume: 1.0 };
  if (level === 3) return { accent: true, volume: 0.78 };
  if (level === 2) return { accent: false, volume: 0.8 };
  return { accent: false, volume: 0.42 };
}
// A sensible default accent map for N beats: downbeat loud, the rest quiet.
function defaultAccents(n) {
  return Array.from({ length: n }, (_, i) => (i === 0 ? 3 : 1));
}

export function MetronomeProvider({ children }) {
  const [bpm, setBpm] = useState(80);
  const [clickSet, setClickSetState] = useState('classic');
  const [isPlaying, setIsPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const [beatsPerBar, setBeatsPerBarState] = useState(4);
  const [accents, setAccents] = useState(() => defaultAccents(4)); // per-beat level 1–4
  const accentsRef = useRef(accents);
  useEffect(() => { accentsRef.current = accents; }, [accents]);

  // Changing the time signature resizes the accent map, keeping existing beats'
  // levels and defaulting any new beats (quiet, downbeat loud).
  const setBeatsPerBar = useCallback((n) => {
    setBeatsPerBarState(n);
    setAccents((prev) => Array.from({ length: n }, (_, i) => prev[i] || (i === 0 ? 3 : 1)));
  }, []);
  // Tap a beat bar → cycle its accent level 1→2→3→4→1.
  const cycleAccent = useCallback((i) => {
    setAccents((prev) => prev.map((v, j) => (j === i ? (v % ACCENT_LEVELS) + 1 : v)));
  }, []);

  // Speed trainer — auto-ramps the tempo as you play (start → target, step every N bars)
  const [trainerOn, setTrainerOn] = useState(false);
  const [trainerStart, setTrainerStart] = useState(60);
  const [trainerTarget, setTrainerTarget] = useState(120);
  const [trainerStep, setTrainerStep] = useState(5);
  const [trainerBars, setTrainerBars] = useState(2);
  const [atTarget, setAtTarget] = useState(false);

  const intervalRef = useRef(null);
  const tickSound = useRef(null);
  const accentSound = useRef(null);
  const beatRef = useRef(0);
  const barCountRef = useRef(0);
  const trainerRef = useRef({ on: false, target: 120, step: 5, bars: 2 });
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    trainerRef.current = { on: trainerOn, target: trainerTarget, step: trainerStep, bars: trainerBars };
  }, [trainerOn, trainerTarget, trainerStep, trainerBars]);

  // Restore the saved click voice once.
  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
    AsyncStorage.getItem(SOUND_PREF_KEY)
      .then((v) => { if (v && CLICK_SETS[v]) setClickSetState(v); })
      .catch(() => {});
  }, []);

  // (Re)load the click samples whenever the voice changes. The tick loop reads
  // the refs, so a swap mid-play just changes the next click's sound.
  useEffect(() => {
    let alive = true;
    const set = CLICK_SETS[clickSet] || CLICK_SETS.classic;
    const opts = { rate: set.rate, shouldCorrectPitch: false };
    const prevTick = tickSound.current;
    const prevAccent = accentSound.current;
    Audio.Sound.createAsync(set.tick, opts)
      .then(({ sound }) => { if (alive) tickSound.current = sound; else sound.unloadAsync(); })
      .catch(() => {});
    Audio.Sound.createAsync(set.accent, opts)
      .then(({ sound }) => { if (alive) accentSound.current = sound; else sound.unloadAsync(); })
      .catch(() => {});
    prevTick?.unloadAsync?.();
    prevAccent?.unloadAsync?.();
    return () => { alive = false; };
  }, [clickSet]);

  // Unload on app teardown.
  useEffect(() => () => {
    tickSound.current?.unloadAsync();
    accentSound.current?.unloadAsync();
  }, []);

  // Pick a click voice (persists) and give immediate feedback with one tick.
  const setClickSet = useCallback((key) => {
    if (!CLICK_SETS[key]) return;
    setClickSetState(key);
    AsyncStorage.setItem(SOUND_PREF_KEY, key).catch(() => {});
    setTimeout(() => { tickSound.current?.replayAsync?.().catch(() => {}); }, 250);
  }, []);

  // The tick loop — restarts whenever bpm, beatsPerBar, or playing changes.
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!isPlaying) return;

    const ms = (60 / bpm) * 1000;
    intervalRef.current = setInterval(() => {
      const nextBeat = (beatRef.current + 1) % beatsPerBar;
      beatRef.current = nextBeat;
      setBeat(nextBeat);

      // Per-beat accent: the beat's level picks the sample (tick/accent) and
      // volume, so a louder-set beat clicks louder.
      const level = accentsRef.current[nextBeat] || 1;
      const { accent, volume } = levelSound(level);
      const sound = accent ? accentSound.current : tickSound.current;
      if (sound) {
        sound.setVolumeAsync(volume).catch(() => {});
        sound.replayAsync().catch(() => {});
      }

      // Speed trainer: every downbeat completes a bar — step the tempo up once
      // we've counted enough bars, until we reach the target.
      if (nextBeat === 0) {
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
        Animated.timing(pulseAnim, { toValue: 1, duration: 90, useNativeDriver: true }),
      ]).start();
    }, ms);

    return () => clearInterval(intervalRef.current);
  }, [isPlaying, bpm, beatsPerBar]);

  // Stop from anywhere (the pill, the tuner, games with their own audio).
  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
    setIsPlaying(false);
  }, []);

  const value = {
    bpm, setBpm, isPlaying, setIsPlaying, beat, setBeat, beatsPerBar, setBeatsPerBar,
    trainerOn, setTrainerOn, trainerStart, setTrainerStart,
    trainerTarget, setTrainerTarget, trainerStep, setTrainerStep,
    trainerBars, setTrainerBars, atTarget, setAtTarget,
    barCountRef, pulseAnim, stop,
    clickSet, setClickSet,
    accents, cycleAccent,
  };

  return <MetronomeContext.Provider value={value}>{children}</MetronomeContext.Provider>;
}

export const useMetronome = () => useContext(MetronomeContext);
