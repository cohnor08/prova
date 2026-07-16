// Fretboard game — "find the note". Prova names a note and a string; the
// student taps the right fret. Knowing the fretboard is the foundation every
// theory concept sits on, and most self-taught players never learn it.
// Instrument-aware (guitar 6 strings / bass 4), three levels widen the string
// set and fret range. Rounds of 10; first 3 rounds a day bank +20 points.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';
import { NOTE_FILES, NOTE_NAMES } from '../../constants/notes';
import { practiceStreakUpdates, logPracticeMinutes } from '../../lib/practiceLog';
import { useCelebration } from '../../components/Celebration';
import { track } from '../../lib/analytics';
import { allowGameRound, personalUpsell } from '../../lib/entitlements';

const ROUND_LEN = 10;
const ROUND_POINTS = 20;
const REWARDED_ROUNDS_PER_DAY = 3;

// Open-string MIDI numbers, low to high.
const GUITAR_STRINGS = [
  { label: 'low E', midi: 40 }, { label: 'A', midi: 45 }, { label: 'D', midi: 50 },
  { label: 'G', midi: 55 }, { label: 'B', midi: 59 }, { label: 'high E', midi: 64 },
];
const BASS_STRINGS = [
  { label: 'E', midi: 28 }, { label: 'A', midi: 33 }, { label: 'D', midi: 38 }, { label: 'G', midi: 43 },
];
const LEVELS = [
  { id: 1, label: 'Starter',  maxFret: 5,  naturalsOnly: true },
  { id: 2, label: 'Player',   maxFret: 7,  naturalsOnly: true },
  { id: 3, label: 'Complete', maxFret: 12, naturalsOnly: false },
  { id: 4, label: 'Master',   maxFret: 15, naturalsOnly: false },
];
const LEVEL_HINTS = {
  1: 'Natural notes · frets 1–5',
  2: 'Natural notes · frets 1–7',
  3: 'All notes incl. sharps · frets 1–12',
  4: 'All notes · the whole neck, frets 1–15',
};
const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const INLAY_FRETS = [3, 5, 7, 9, 12, 15];
const FRET_W = 52;                 // must match styles.fret width
const FRET_PAD = 8;                // must match styles.fretRow paddingHorizontal (SPACING.sm)

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export default function FretboardGameScreen({ navigation, route }) {
  useThemeSync();
  const celebrate = useCelebration();
  const [instrument, setInstrument] = useState('Guitar');
  const [level, setLevel] = useState(route?.params?.level || 1);
  // A teacher can assign this drill at a mode + level, which arrive as params.
  const [mode, setMode] = useState(route?.params?.mode || 'find'); // 'find' (tap the fret) | 'name' (pick the note)
  const [phase, setPhase] = useState('menu');
  const [qNum, setQNum] = useState(0);
  const [question, setQuestion] = useState(null); // { string, targetName, targetFret, choices }
  const [picked, setPicked] = useState(null);     // tapped fret
  const [score, setScore] = useState(0);
  const [rewarded, setRewarded] = useState(false);
  const [fretRowW, setFretRowW] = useState(0);      // viewport width
  const [fretContentW, setFretContentW] = useState(0); // content width
  const canScroll = fretContentW > fretRowW + 2;
  const neckScrollRef = useRef(null);

  // In "Name the note" mode the target fret can be anywhere on the neck, so
  // centre it in view on each new question — the player shouldn't have to hunt.
  useEffect(() => {
    if (phase !== 'playing' || mode !== 'name' || !question || !fretRowW) return;
    const center = FRET_PAD + question.targetFret * FRET_W + FRET_W / 2;
    const x = Math.max(0, center - fretRowW / 2);
    const id = setTimeout(() => neckScrollRef.current?.scrollTo({ x, animated: true }), 60);
    return () => clearTimeout(id);
  }, [question, phase, mode, fretRowW]);

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        const d = (await getDoc(doc(db, 'users', uid))).data() || {};
        if (d.instrument === 'Bass') setInstrument('Bass');
      } catch (e) { /* default guitar */ }
    })();
  }, []);

  const strings = instrument === 'Bass' ? BASS_STRINGS : GUITAR_STRINGS;

  const playNote = async (midi) => {
    let m = midi;
    while (m < 48) m += 12;   // samples span C3–C5; octave-up keeps the pitch class
    while (m > 72) m -= 12;
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      await Audio.Sound.createAsync(NOTE_FILES[m], { shouldPlay: true });
    } catch (e) { /* best effort */ }
  };

  const makeQuestion = () => {
    const lv = LEVELS.find((l) => l.id === level);
    const string = pick(strings);
    let fret = 1 + Math.floor(Math.random() * lv.maxFret); // skip open string — too easy
    if (lv.naturalsOnly) {
      // walk to the nearest natural note within range
      let tries = 0;
      while (NOTE_NAMES[(string.midi + fret) % 12].includes('#') && tries < 12) {
        fret = 1 + Math.floor(Math.random() * lv.maxFret); tries++;
      }
      if (NOTE_NAMES[(string.midi + fret) % 12].includes('#')) fret = fret > 1 ? fret - 1 : fret + 1;
    }
    const targetName = NOTE_NAMES[(string.midi + fret) % 12];
    // For "Name the note" mode: four answer choices (naturals-only when the
    // level is naturals-only, so we never offer a sharp that can't be the answer).
    const pool = lv.naturalsOnly ? NATURALS : NOTE_NAMES;
    const wrong = pool.filter((n) => n !== targetName).sort(() => Math.random() - 0.5).slice(0, 3);
    const choices = [targetName, ...wrong].sort(() => Math.random() - 0.5);
    return { string, targetFret: fret, targetName, maxFret: lv.maxFret, choices };
  };

  const startRound = async () => {
    if (!(await allowGameRound('fretGame'))) {
      personalUpsell(navigation, "You've played today's free round — Prova Personal unlocks unlimited fretboard rounds.");
      return;
    }
    setScore(0); setQNum(1); setPicked(null); setRewarded(false);
    setQuestion(makeQuestion()); setPhase('playing');
  };

  const tapFret = (fret) => {
    if (picked !== null) return;
    setPicked(fret);
    const right = (question.string.midi + fret) % 12 === (question.string.midi + question.targetFret) % 12;
    if (right) setScore((s) => s + 1);
    playNote(question.string.midi + fret);
  };

  // "Name the note" mode: the target fret is shown; the student picks its name.
  const answerName = (choice) => {
    if (picked !== null) return;
    setPicked(choice);
    if (choice === question.targetName) setScore((s) => s + 1);
    playNote(question.string.midi + question.targetFret);
  };

  const next = async () => {
    if (qNum >= ROUND_LEN) {
      setPhase('done');
      track('fretboard_round_completed', { level, score });
      try {
        const uid = auth.currentUser?.uid;
        if (uid) {
          const today = new Date().toISOString().split('T')[0];
          const cur = (await getDoc(doc(db, 'users', uid))).data() || {};
          const fg = cur.fretGame || {};
          const rounds = fg.date === today ? (fg.rounds || 0) : 0;
          if (rounds < REWARDED_ROUNDS_PER_DAY) {
            await updateDoc(doc(db, 'users', uid), {
              fretGame: { date: today, rounds: rounds + 1 },
              provaScore: increment(ROUND_POINTS),
              totalMinutes: increment(2),
              ...practiceStreakUpdates(cur),
            });
            logPracticeMinutes(uid, 2, 'fretboard');
            setRewarded(true);
            celebrate({ points: ROUND_POINTS, title: 'Round complete!', subtitle: `${score}/${ROUND_LEN} correct`, emoji: '🎸' });
          }
        }
      } catch (e) { /* best effort */ }
      return;
    }
    setQNum((n) => n + 1); setPicked(null);
    setQuestion(makeQuestion());
  };

  const renderFretRow = () => {
    const cells = [];
    const isRightFret = (f) => (question.string.midi + f) % 12 === (question.string.midi + question.targetFret) % 12;
    for (let f = 0; f <= question.maxFret; f++) {
      const showRight = picked !== null && isRightFret(f);
      const showWrong = picked === f && !isRightFret(f);
      cells.push(
        <TouchableOpacity
          key={f}
          style={[styles.fret, f === 0 && styles.nut, showRight && styles.fretRight, showWrong && styles.fretWrong]}
          onPress={() => tapFret(f)}
          disabled={picked !== null}
          activeOpacity={0.7}
        >
          <Text style={[styles.fretNum, (showRight || showWrong) && { color: '#fff' }]}>{f}</Text>
          {INLAY_FRETS.includes(f) && <View style={styles.inlay} />}
        </TouchableOpacity>
      );
    }
    return cells;
  };

  // Read-only neck for "Name the note": marks the fret the student must name.
  const renderMarkedNeck = () => {
    const cells = [];
    for (let f = 0; f <= question.maxFret; f++) {
      const isTarget = f === question.targetFret;
      cells.push(
        <View key={f} style={[styles.fret, f === 0 && styles.nut, isTarget && styles.fretMarked]}>
          {isTarget && <View style={styles.marker} />}
          <Text style={[styles.fretNum, isTarget && { color: '#fff', fontWeight: '900' }]}>{f}</Text>
          {!isTarget && INLAY_FRETS.includes(f) && <View style={styles.inlay} />}
        </View>
      );
    }
    return cells;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Fretboard Game</Text>
        <View style={{ width: 24 }} />
      </View>

      {phase === 'menu' && (
        <ScrollView contentContainerStyle={styles.menu}>
          <View style={styles.heroIcon}><Ionicons name="locate" size={34} color={COLORS.primary} /></View>
          <Text style={styles.heroTitle}>Know every note</Text>
          <Text style={styles.heroSub}>Learn every note on the {instrument.toLowerCase()} neck. Ten questions a round; your first {REWARDED_ROUNDS_PER_DAY} rounds each day earn +{ROUND_POINTS} points.</Text>
          <Text style={styles.menuLabel}>GAME</Text>
          <View style={styles.segRow}>
            {[['find', 'Find the note'], ['name', 'Name the note']].map(([m, label]) => (
              <TouchableOpacity key={m} style={[styles.seg, mode === m && styles.segOn]} onPress={() => setMode(m)}>
                <Text style={[styles.segText, mode === m && styles.segTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.menuLabel}>LEVEL</Text>
          <View style={styles.segRow}>
            {LEVELS.map((l) => (
              <TouchableOpacity key={l.id} style={[styles.seg, level === l.id && styles.segOn]} onPress={() => setLevel(l.id)}>
                <Text style={[styles.segText, level === l.id && styles.segTextOn]}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.levelHint}>{LEVEL_HINTS[level]}</Text>
          <TouchableOpacity style={styles.startBtn} onPress={startRound} activeOpacity={0.85}>
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={styles.startText}>Start round</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {phase === 'playing' && question && (
        <View style={styles.game}>
          <Text style={styles.qNum}>Question {qNum} of {ROUND_LEN}</Text>
          <Text style={styles.scoreLine}>{score} correct</Text>
          {mode === 'find' ? (
            <Text style={styles.prompt}>
              Find <Text style={styles.promptNote}>{question.targetName}</Text> on the{' '}
              <Text style={styles.promptString}>{question.string.label}</Text> string
            </Text>
          ) : (
            <Text style={styles.prompt}>
              What note is the marked fret on the{' '}
              <Text style={styles.promptString}>{question.string.label}</Text> string?
            </Text>
          )}
          {canScroll && (
            <Text style={styles.swipeHint}>← Swipe to see all frets →</Text>
          )}
          <ScrollView
            ref={neckScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.fretRow}
            onLayout={(e) => setFretRowW(e.nativeEvent.layout.width)}
            onContentSizeChange={(w) => setFretContentW(w)}
          >
            {mode === 'find' ? renderFretRow() : renderMarkedNeck()}
          </ScrollView>
          {mode === 'find' ? (
            <Text style={styles.fretHint}>Tap a fret — 0 is the open string</Text>
          ) : (
            <View style={styles.choices}>
              {question.choices.map((c) => {
                const isPicked = picked === c;
                const isRight = picked !== null && c === question.targetName;
                const isWrongPick = isPicked && c !== question.targetName;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.choice, isRight && styles.choiceRight, isWrongPick && styles.choiceWrong]}
                    onPress={() => answerName(c)}
                    activeOpacity={0.8}
                    disabled={picked !== null}
                  >
                    <Text style={[styles.choiceText, (isRight || isWrongPick) && { color: '#fff' }]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {picked !== null && (
            <TouchableOpacity style={styles.nextBtn} onPress={next} activeOpacity={0.85}>
              <Text style={styles.nextText}>{qNum >= ROUND_LEN ? 'Finish' : 'Next ›'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {phase === 'done' && (
        <View style={styles.game}>
          <View style={styles.heroIcon}><Ionicons name={score >= 8 ? 'trophy' : 'locate'} size={34} color={score >= 8 ? '#F5C044' : COLORS.primary} /></View>
          <Text style={styles.heroTitle}>{score}/{ROUND_LEN}</Text>
          <Text style={styles.heroSub}>
            {score >= 9 ? 'You own that neck.' : score >= 7 ? 'Sharp — the map is forming.' : score >= 5 ? 'Good start — repetition builds it.' : 'Keep at it — every pro started lost.'}
            {rewarded ? `  +${ROUND_POINTS} pts banked.` : ''}
          </Text>
          <TouchableOpacity style={styles.startBtn} onPress={startRound} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.startText}>Play again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPhase('menu')} hitSlop={{ top: 8, bottom: 8 }}>
            <Text style={styles.backLink}>Change level</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  menu: { padding: SPACING.xl, alignItems: 'center' },
  heroIcon: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.primary + '14', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  heroTitle: { color: COLORS.text, fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  heroSub: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: SPACING.xl, maxWidth: 320 },
  menuLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2, alignSelf: 'flex-start', marginBottom: SPACING.sm },
  segRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm, alignSelf: 'stretch' },
  seg: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center' },
  segOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  segText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  segTextOn: { color: '#fff' },
  levelHint: { color: COLORS.textMuted, fontSize: 12, marginBottom: SPACING.lg, alignSelf: 'flex-start' },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, alignSelf: 'stretch', marginTop: SPACING.md },
  startText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  game: { flex: 1, padding: SPACING.xl, alignItems: 'center' },
  qNum: { color: COLORS.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  scoreLine: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, marginBottom: SPACING.xl },
  prompt: { color: COLORS.text, fontSize: 20, textAlign: 'center', marginBottom: SPACING.xl, lineHeight: 30 },
  promptNote: { color: COLORS.primary, fontWeight: '900', fontSize: 24 },
  promptString: { fontWeight: '800' },
  fretRow: { alignItems: 'center', paddingHorizontal: SPACING.sm },
  fret: { width: 52, height: 84, borderRightWidth: 2, borderRightColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' },
  nut: { backgroundColor: COLORS.background, borderRightWidth: 5, borderRightColor: COLORS.textMuted },
  fretRight: { backgroundColor: '#16a34a' },
  fretWrong: { backgroundColor: '#dc2626' },
  fretMarked: { backgroundColor: COLORS.primary + '22' },
  marker: { position: 'absolute', top: 29, left: 13, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary },
  fretNum: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700' },
  inlay: { position: 'absolute', bottom: 8, width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.textMuted },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, justifyContent: 'center', marginTop: SPACING.lg },
  choice: { width: '47%', paddingVertical: 16, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center' },
  choiceRight: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  choiceWrong: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  choiceText: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  fretHint: { color: COLORS.textMuted, fontSize: 12, marginTop: SPACING.md },
  swipeHint: { color: COLORS.textMuted, fontSize: 11.5, marginBottom: SPACING.sm },
  nextBtn: { marginTop: SPACING.xl, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 60 },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  backLink: { color: COLORS.textSecondary, fontSize: 14, marginTop: SPACING.lg },
}));
