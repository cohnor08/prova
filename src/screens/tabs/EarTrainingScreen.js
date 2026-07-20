// Ear training — the app plays, you answer. No microphone needed.
// Two games: INTERVALS (root note then a second note — name the distance) and
// CHORDS (three notes together — name the quality). Rounds of 10; the first
// three completed rounds each day bank +20 Prova points and count a couple of
// practice minutes toward the daily log.
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';
import { useMetronome } from '../../lib/MetronomeContext';
import { PIANO_FILES as NOTE_FILES } from '../../constants/pianoNotes';
import { practiceStreakUpdates, logPracticeMinutes } from '../../lib/practiceLog';
import { useCelebration } from '../../components/Celebration';
import { track } from '../../lib/analytics';
import { allowGameRound, personalUpsell } from '../../lib/entitlements';

const ROUND_LEN = 10;
const ROUND_POINTS = 20;
const REWARDED_ROUNDS_PER_DAY = 3;
const LOW = 48, HIGH = 72; // available sample range (C3–C5)

const INTERVALS = [
  { semis: 1,  name: 'Minor 2nd' },
  { semis: 2,  name: 'Major 2nd' },
  { semis: 3,  name: 'Minor 3rd' },
  { semis: 4,  name: 'Major 3rd' },
  { semis: 5,  name: 'Perfect 4th' },
  { semis: 6,  name: 'Tritone' },
  { semis: 7,  name: 'Perfect 5th' },
  { semis: 8,  name: 'Minor 6th' },
  { semis: 9,  name: 'Major 6th' },
  { semis: 10, name: 'Minor 7th' },
  { semis: 11, name: 'Major 7th' },
  { semis: 12, name: 'Octave' },
];
const LEVELS = [
  { id: 1, label: 'Starter',   semis: [4, 5, 7, 12] },
  { id: 2, label: 'Melodic',   semis: [2, 3, 4, 5, 7, 9] },
  { id: 3, label: 'Complete',  semis: [2, 3, 4, 5, 7, 9, 11, 12] },
  { id: 4, label: 'Chromatic', semis: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
];
const CHORDS = [
  { name: 'Major',      offsets: [0, 4, 7] },
  { name: 'Minor',      offsets: [0, 3, 7] },
  { name: 'Diminished', offsets: [0, 3, 6] },
  { name: 'Augmented',  offsets: [0, 4, 8] },
  { name: 'Sus4',       offsets: [0, 5, 7] },
  { name: 'Major 7th',  offsets: [0, 4, 7, 11] },
  { name: 'Minor 7th',  offsets: [0, 3, 7, 10] },
  { name: 'Dom 7th',    offsets: [0, 4, 7, 10] },
];
const CHORD_LEVELS = [
  { id: 1, label: 'Starter',  names: ['Major', 'Minor'] },
  { id: 2, label: 'Quality',  names: ['Major', 'Minor', 'Diminished'] },
  { id: 3, label: 'Complete', names: ['Major', 'Minor', 'Diminished', 'Augmented', 'Sus4'] },
  { id: 4, label: 'Sevenths', names: ['Major 7th', 'Minor 7th', 'Dom 7th', 'Major', 'Minor'] },
];
// Scales are played one note at a time, ascending; name what you heard.
const SCALES = [
  { name: 'Major',           steps: [0, 2, 4, 5, 7, 9, 11, 12] },
  { name: 'Natural Minor',   steps: [0, 2, 3, 5, 7, 8, 10, 12] },
  { name: 'Dorian',          steps: [0, 2, 3, 5, 7, 9, 10, 12] },
  { name: 'Mixolydian',      steps: [0, 2, 4, 5, 7, 9, 10, 12] },
  { name: 'Harmonic Minor',  steps: [0, 2, 3, 5, 7, 8, 11, 12] },
  { name: 'Major Pentatonic',steps: [0, 2, 4, 7, 9, 12] },
  { name: 'Minor Pentatonic',steps: [0, 3, 5, 7, 10, 12] },
  { name: 'Blues',           steps: [0, 3, 5, 6, 7, 10, 12] },
];
const SCALE_LEVELS = [
  { id: 1, label: 'Starter', names: ['Major', 'Natural Minor'] },
  { id: 2, label: 'Modes',   names: ['Major', 'Natural Minor', 'Dorian', 'Mixolydian'] },
  { id: 3, label: 'Complete', names: ['Major', 'Natural Minor', 'Dorian', 'Mixolydian', 'Harmonic Minor', 'Major Pentatonic', 'Minor Pentatonic', 'Blues'] },
];
const LEVEL_SETS = { intervals: LEVELS, chords: CHORD_LEVELS, scales: SCALE_LEVELS };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export default function EarTrainingScreen({ navigation, route }) {
  useThemeSync();
  const celebrate = useCelebration();
  // A teacher can assign this drill at a mode + level, which arrive as params.
  const [mode, setMode] = useState(route?.params?.mode || 'intervals'); // intervals | chords | scales
  const [level, setLevel] = useState(route?.params?.level || 1);
  const [phase, setPhase] = useState('menu');          // menu | playing | done
  const [qNum, setQNum] = useState(0);
  const [question, setQuestion] = useState(null);      // { answer, choices }
  const [picked, setPicked] = useState(null);          // chosen answer (locks the question)
  const [score, setScore] = useState(0);
  const [rewarded, setRewarded] = useState(false);
  const soundsRef = useRef([]);
  const playScrollRef = useRef(null);

  const unloadAll = async () => {
    const sounds = soundsRef.current; soundsRef.current = [];
    for (const s of sounds) { try { await s.unloadAsync(); } catch (e) {} }
  };
  useEffect(() => () => { unloadAll(); }, []);

  // A running metronome would drown the notes you're trying to identify.
  const metronome = useMetronome();
  useEffect(() => { metronome?.stop?.(); }, []);

  // Activate the audio session ONCE on mount and warm the pipeline with a
  // silent note — iOS pops audibly if the session spins up right as the first
  // real note starts (the "click" at the start of a scale).
  useEffect(() => {
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(NOTE_FILES[60], { shouldPlay: true, volume: 0 });
        setTimeout(() => { sound.unloadAsync().catch(() => {}); }, 400);
      } catch (e) { /* best effort */ }
    })();
  }, []);

  const playMidi = async (midis, gapMs) => {
    await unloadAll();
    try {
      for (let i = 0; i < midis.length; i++) {
        const { sound } = await Audio.Sound.createAsync(NOTE_FILES[midis[i]], { shouldPlay: true });
        soundsRef.current.push(sound);
        if (gapMs && i < midis.length - 1) await new Promise((r) => setTimeout(r, gapMs));
      }
    } catch (e) { /* audio is best-effort */ }
  };

  // On the hardest level of each mode, drop the 4-way multiple choice and show
  // EVERY possible answer (recall mode) — real recognition, not a 1-in-4 guess.
  const shuffle = (arr) => arr.slice().sort(() => Math.random() - 0.5);

  const makeQuestion = () => {
    if (mode === 'intervals') {
      const set = LEVELS.find((l) => l.id === level).semis;
      const recall = level === LEVELS[LEVELS.length - 1].id;
      const semis = pick(set);
      const root = LOW + Math.floor(Math.random() * (HIGH - LOW - semis + 1));
      const answerName = INTERVALS.find((iv) => iv.semis === semis).name;
      const choices = recall
        ? shuffle(set.map((x) => INTERVALS.find((iv) => iv.semis === x).name))
        : shuffle([semis, ...set.filter((x) => x !== semis).sort(() => Math.random() - 0.5).slice(0, 3)])
            .map((x) => INTERVALS.find((iv) => iv.semis === x).name);
      return { midis: [root, root + semis], gap: 650, answer: answerName, choices, recall };
    }
    if (mode === 'scales') {
      const names = SCALE_LEVELS.find((l) => l.id === level).names;
      const recall = level === SCALE_LEVELS[SCALE_LEVELS.length - 1].id;
      const set = SCALES.filter((s) => names.includes(s.name));
      const scale = pick(set);
      const root = LOW + Math.floor(Math.random() * (HIGH - LOW - 12 + 1));
      const wrong = set.filter((s) => s.name !== scale.name).sort(() => Math.random() - 0.5).slice(0, 3);
      return {
        midis: scale.steps.map((s) => root + s), gap: 300,
        answer: scale.name,
        choices: recall ? shuffle(names) : shuffle([scale.name, ...wrong.map((s) => s.name)]),
        recall,
      };
    }
    const names = CHORD_LEVELS.find((l) => l.id === level).names;
    const recall = level === CHORD_LEVELS[CHORD_LEVELS.length - 1].id;
    const set = CHORDS.filter((c) => names.includes(c.name));
    const chord = pick(set);
    const maxOff = Math.max(...chord.offsets);
    const root = LOW + Math.floor(Math.random() * (HIGH - LOW - maxOff + 1));
    const wrong = set.filter((c) => c.name !== chord.name).sort(() => Math.random() - 0.5).slice(0, 3);
    return {
      midis: chord.offsets.map((o) => root + o), gap: 0,
      answer: chord.name,
      choices: recall ? shuffle(names) : shuffle([chord.name, ...wrong.map((c) => c.name)]),
      recall,
    };
  };

  const startRound = async () => {
    if (!(await allowGameRound('earTraining'))) {
      personalUpsell(navigation, "You've played today's free round — Prova Personal unlocks unlimited ear training.");
      return;
    }
    setScore(0); setQNum(1); setPicked(null); setRewarded(false);
    const q = makeQuestion();
    setQuestion(q); setPhase('playing');
    setTimeout(() => playMidi(q.midis, q.gap), 350);
  };

  const answer = (choice) => {
    if (picked) return;
    setPicked(choice);
    if (choice === question.answer) setScore((s) => s + 1);
    // Bring the Next button into view for the long recall answer lists.
    setTimeout(() => playScrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const next = async () => {
    unloadAll(); // cut the current note the instant we advance/finish
    if (qNum >= ROUND_LEN) {
      setPhase('done');
      track('ear_round_completed', { mode, level, score });
      // Reward the first few rounds of the day + count it as real practice.
      try {
        const uid = auth.currentUser?.uid;
        if (uid) {
          const today = new Date().toISOString().split('T')[0];
          const cur = (await getDoc(doc(db, 'users', uid))).data() || {};
          if (cur.role === 'teacher') {
            // Teachers are previewing — bank nothing; just show what it's worth.
            celebrate({ title: 'Round complete!', subtitle: `Worth ${ROUND_POINTS} pts for students`, emoji: '🎧' });
          } else {
            const et = cur.earTraining || {};
            const rounds = et.date === today ? (et.rounds || 0) : 0;
            if (rounds < REWARDED_ROUNDS_PER_DAY) {
              await updateDoc(doc(db, 'users', uid), {
                earTraining: { date: today, rounds: rounds + 1 },
                provaScore: increment(ROUND_POINTS),
                totalMinutes: increment(2),
                ...practiceStreakUpdates(cur),
              });
              logPracticeMinutes(uid, 2, 'ear');
              setRewarded(true);
              celebrate({ points: ROUND_POINTS, title: 'Round complete!', subtitle: `${score}/${ROUND_LEN} correct`, emoji: '🎧' });
            }
          }
        }
      } catch (e) { /* reward is best-effort */ }
      return;
    }
    setQNum((n) => n + 1); setPicked(null);
    const q = makeQuestion();
    setQuestion(q);
    setTimeout(() => playMidi(q.midis, q.gap), 250);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => { unloadAll(); if (phase === 'menu') navigation.goBack(); else setPhase('menu'); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Ear Training</Text>
        <View style={{ width: 24 }} />
      </View>

      {phase === 'menu' && (
        <ScrollView contentContainerStyle={styles.menu}>
          <View style={styles.heroIcon}><Ionicons name="ear" size={34} color={COLORS.primary} /></View>
          <Text style={styles.heroTitle}>Train your ears</Text>
          <Text style={styles.heroSub}>Prova plays — you name what you heard. Ten questions a round; your first {REWARDED_ROUNDS_PER_DAY} rounds each day earn +{ROUND_POINTS} points.</Text>

          <Text style={styles.menuLabel}>GAME</Text>
          <View style={styles.segRow}>
            {[['intervals', 'Intervals'], ['chords', 'Chords'], ['scales', 'Scales']].map(([m, label]) => (
              <TouchableOpacity key={m} style={[styles.seg, mode === m && styles.segOn]} onPress={() => { setMode(m); setLevel(1); }}>
                <Text style={[styles.segText, mode === m && styles.segTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.menuLabel}>LEVEL</Text>
          <View style={styles.segRow}>
            {LEVEL_SETS[mode].map((l) => (
              <TouchableOpacity key={l.id} style={[styles.seg, level === l.id && styles.segOn]} onPress={() => setLevel(l.id)}>
                <Text style={[styles.segText, level === l.id && styles.segTextOn]}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.startBtn} onPress={startRound} activeOpacity={0.85}>
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={styles.startText}>Start round</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {phase === 'playing' && question && (
        <ScrollView ref={playScrollRef} style={{ flex: 1 }} contentContainerStyle={styles.gamePlay} showsVerticalScrollIndicator={false}>
          <Text style={styles.qNum}>Question {qNum} of {ROUND_LEN}</Text>
          <Text style={styles.scoreLine}>{score} correct</Text>

          <TouchableOpacity style={styles.playBig} onPress={() => playMidi(question.midis, question.gap)} activeOpacity={0.8}>
            <Ionicons name="volume-high" size={40} color={COLORS.primary} />
            <Text style={styles.playBigText}>Tap to replay</Text>
          </TouchableOpacity>

          {question.recall && <Text style={styles.recallHint}>Recall mode — no multiple choice, name it from them all</Text>}
          <View style={styles.choices}>
            {question.choices.map((c) => {
              const isPicked = picked === c;
              const isRight = picked && c === question.answer;
              const isWrongPick = isPicked && c !== question.answer;
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.choice, isRight && styles.choiceRight, isWrongPick && styles.choiceWrong]}
                  onPress={() => answer(c)}
                  activeOpacity={0.8}
                  disabled={!!picked}
                >
                  <Text style={[styles.choiceText, (isRight || isWrongPick) && { color: '#fff' }]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {picked && (
            <TouchableOpacity style={styles.nextBtn} onPress={next} activeOpacity={0.85}>
              <Text style={styles.nextText}>{qNum >= ROUND_LEN ? 'Finish' : 'Next ›'}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {phase === 'done' && (
        <View style={styles.game}>
          <View style={styles.heroIcon}><Ionicons name={score >= 8 ? 'trophy' : 'ear'} size={34} color={score >= 8 ? '#F5C044' : COLORS.primary} /></View>
          <Text style={styles.heroTitle}>{score}/{ROUND_LEN}</Text>
          <Text style={styles.heroSub}>
            {score >= 9 ? 'Golden ears. Seriously.' : score >= 7 ? 'Sharp — keep it up.' : score >= 5 ? 'Solid start — ears grow fast.' : 'Tough round — replay each sound before answering.'}
            {rewarded ? `  +${ROUND_POINTS} pts banked.` : ''}
          </Text>
          <TouchableOpacity style={styles.startBtn} onPress={startRound} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.startText}>Play again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPhase('menu')} hitSlop={{ top: 8, bottom: 8 }}>
            <Text style={styles.backLink}>Change game</Text>
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
  heroIcon: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.primary + '14', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md, alignSelf: 'center' },
  heroTitle: { color: COLORS.text, fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  heroSub: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: SPACING.xl, maxWidth: 320 },
  menuLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2, alignSelf: 'flex-start', marginBottom: SPACING.sm },
  segRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg, alignSelf: 'stretch' },
  seg: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center' },
  segOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  segText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  segTextOn: { color: '#fff' },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, alignSelf: 'stretch', marginTop: SPACING.md },
  startText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  game: { flex: 1, padding: SPACING.xl, alignItems: 'center' },
  gamePlay: { padding: SPACING.xl, alignItems: 'center', flexGrow: 1, paddingBottom: SPACING.xxl },
  qNum: { color: COLORS.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  scoreLine: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, marginBottom: SPACING.xl },
  playBig: { width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.primary + '10', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xl },
  playBigText: { color: COLORS.textSecondary, fontSize: 12, marginTop: 6 },
  recallHint: { color: COLORS.accent || COLORS.primary, fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: SPACING.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, justifyContent: 'center' },
  choice: { width: '47%', paddingVertical: 16, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center' },
  choiceRight: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  choiceWrong: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  choiceText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  nextBtn: { marginTop: SPACING.xl, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 60 },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  backLink: { color: COLORS.textSecondary, fontSize: 14, marginTop: SPACING.lg },
}));
