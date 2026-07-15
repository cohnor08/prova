// App-wide theme: the current colour palette (mode + accent) plus setters.
//
// The choice is cached in AsyncStorage so it applies instantly on the next
// launch (before Firebase Auth resolves), and mirrored to the user's Firestore
// doc so it follows them across devices. Screens read colours at render time:
//
//   const COLORS = useThemeColors();          // shadows the static import
//   const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
//
// Falling back to the static COLORS keeps any not-yet-converted screen working.
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { buildColors, COLORS as DEFAULT_COLORS } from '../constants/theme';

const STORE_KEY = 'prova_theme';

const ThemeContext = createContext({
  colors: DEFAULT_COLORS, mode: 'dark', accent: 'blue',
  setMode: () => {}, setAccent: () => {}, ready: false,
});

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState('dark');
  const [accent, setAccentState] = useState('blue');
  const [ready, setReady] = useState(false);

  // Load the cached choice immediately, then reconcile with the user's doc.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (alive && raw) {
          const t = JSON.parse(raw);
          if (t.mode) setModeState(t.mode);
          if (t.accent) setAccentState(t.accent);
        }
      } catch (e) { /* defaults */ }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  // When a user signs in, pull their saved theme (device cache wins only if the
  // doc has nothing).
  const syncFromUser = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const t = (await getDoc(doc(db, 'users', uid))).data()?.theme;
      if (t && (t.mode || t.accent)) {
        if (t.mode) setModeState(t.mode);
        if (t.accent) setAccentState(t.accent);
        AsyncStorage.setItem(STORE_KEY, JSON.stringify({ mode: t.mode || mode, accent: t.accent || accent })).catch(() => {});
      }
    } catch (e) { /* keep local */ }
  }, [mode, accent]);
  useEffect(() => { syncFromUser(); }, [syncFromUser]);

  const persist = useCallback((next) => {
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)).catch(() => {});
    const uid = auth.currentUser?.uid;
    if (uid) setDoc(doc(db, 'users', uid), { theme: next }, { merge: true }).catch(() => {});
  }, []);

  const setMode = useCallback((m) => { setModeState(m); persist({ mode: m, accent }); }, [accent, persist]);
  const setAccent = useCallback((a) => { setAccentState(a); persist({ mode, accent: a }); }, [mode, persist]);

  const colors = useMemo(() => buildColors(mode, accent), [mode, accent]);
  const value = useMemo(() => ({ colors, mode, accent, setMode, setAccent, ready }), [colors, mode, accent, setMode, setAccent, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
export const useThemeColors = () => useContext(ThemeContext).colors;
