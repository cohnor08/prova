import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Animated } from 'react-native';
import { Audio } from 'expo-av';

// The metronome ENGINE, app-level — so the click keeps going when the student
// switches tabs or opens a practice task and plays along. PracticeScreen is
// just a control surface for this; the floating MetronomePill (App.js) shows
// it's running from anywhere and can stop it.
const MetronomeContext = createContext(null);

export function MetronomeProvider({ children }) {
  const [bpm, setBpm] = useState(80);
  const [isPlaying, setIsPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const [beatsPerBar, setBeatsPerBar] = useState(4);

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

  // Load the click sounds once for the whole app. Played ~26% fast without
  // pitch correction, which shifts the click up about two whole tones
  // (2^(4/12) ≈ 1.26) — the stock sample sat too low in the mix.
  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
    Audio.Sound.createAsync(require('../../assets/tick.wav'), { rate: 1.26, shouldCorrectPitch: false })
      .then(({ sound }) => { tickSound.current = sound; })
      .catch(() => {});
    Audio.Sound.createAsync(require('../../assets/tick-accent.wav'), { rate: 1.26, shouldCorrectPitch: false })
      .then(({ sound }) => { accentSound.current = sound; })
      .catch(() => {});
    return () => {
      tickSound.current?.unloadAsync();
      accentSound.current?.unloadAsync();
    };
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
  };

  return <MetronomeContext.Provider value={value}>{children}</MetronomeContext.Provider>;
}

export const useMetronome = () => useContext(MetronomeContext);
