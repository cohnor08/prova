import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';

// Shared audio for the practice games.
//
// The bug this exists to fix: a game's play function would unload the previous
// sounds and then loop, awaiting a gap between each note. Because both halves
// are async, pressing play twice quickly meant the second call's unload ran
// while the FIRST loop was still scheduling — so the old sequence kept creating
// sounds after being "stopped" and the two played over each other.
//
// The fix is a generation token. Every play() takes the next token, and the loop
// checks it before each note: if another play (or a stop) has happened since, it
// abandons the rest of the sequence instead of racing it.
//
// play() is a TOGGLE by design: pressing it while something is playing stops it
// rather than layering a second copy on top. Audio also stops on unmount and
// whenever the screen loses focus, so leaving mid-sequence never leaves a note
// ringing behind you.
export function useGameAudio() {
  const gen = useRef(0);            // bumped by every play/stop
  const sounds = useRef([]);        // everything currently loaded
  const [playing, setPlaying] = useState(false);

  const unload = useCallback(async () => {
    const list = sounds.current;
    sounds.current = [];
    for (const s of list) { try { await s.unloadAsync(); } catch (e) { /* already gone */ } }
  }, []);

  const stop = useCallback(async () => {
    gen.current += 1;               // invalidates any sequence mid-flight
    setPlaying(false);
    await unload();
  }, [unload]);

  // Play a sequence of require()'d assets, `gapMs` apart.
  // Returns true if it ran to the end, false if it was superseded or toggled off.
  const play = useCallback(async (assets, gapMs = 0, opts = {}) => {
    if (playing && !opts.restart) { await stop(); return false; }   // toggle off
    gen.current += 1;
    const mine = gen.current;
    await unload();
    if (gen.current !== mine) return false;
    setPlaying(true);
    try {
      for (let i = 0; i < assets.length; i++) {
        if (gen.current !== mine) return false;                      // superseded
        const { sound } = await Audio.Sound.createAsync(assets[i], { shouldPlay: true, ...(opts.soundOpts || {}) });
        if (gen.current !== mine) { try { await sound.unloadAsync(); } catch (e) {} return false; }
        sounds.current.push(sound);
        if (gapMs && i < assets.length - 1) await new Promise((r) => setTimeout(r, gapMs));
      }
    } catch (e) { /* audio is best-effort */ }
    if (gen.current === mine) setPlaying(false);
    return gen.current === mine;
  }, [playing, stop, unload]);

  // Stop on unmount…
  useEffect(() => () => { gen.current += 1; unload(); }, [unload]);
  // …and whenever the screen is navigated away from.
  useFocusEffect(React.useCallback(() => () => { gen.current += 1; unload(); }, [unload]));

  return { play, stop, playing };
}
