// Theory quiz — multiple-choice music theory across four categories (intervals,
// chords, keys, scales), three difficulty levels each. Questions are generated
// on the fly (src/constants/theory.js) so they never run out. No audio needed.
// Same daily economy as the other mini-games: the first three rounds a day bank
// +20 Prova points and a couple of practice minutes.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';
import { CATEGORIES, makeTheoryQuestion } from '../../constants/theory';
import { practiceStreakUpdates, logPracticeMinutes } from '../../lib/practiceLog';
import { useCelebration } from '../../components/Celebration';
import { track } from '../../lib/analytics';
import { allowGameRound, personalUpsell } from '../../lib/entitlements';

const ROUND_LEN = 10;
const ROUND_POINTS = 20;
const REWARDED_ROUNDS_PER_DAY = 3;
const LEVELS = [{ id: 1, label: 'Basics' }, { id: 2, label: 'Player' }, { id: 3, label: 'Advanced' }];

export default function TheoryQuizScreen({ navigation }) {
  useThemeSync();
  const celebrate = useCelebration();
  const [category, setCategory] = useState('intervals');
  const [level, setLevel] = useState(1);
  const [phase, setPhase] = useState('menu');          // menu | playing | done
  const [qNum, setQNum] = useState(0);
  const [question, setQuestion] = useState(null);      // { prompt, answer, choices }
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [rewarded, setRewarded] = useState(false);

  const startRound = async () => {
    if (!(await allowGameRound('theoryQuiz'))) {
      personalUpsell(navigation, "You've played today's free round — Prova Personal unlocks unlimited theory quizzes.");
      return;
    }
    setScore(0); setQNum(1); setPicked(null); setRewarded(false);
    setQuestion(makeTheoryQuestion(category, level)); setPhase('playing');
  };

  const answer = (choice) => {
    if (picked !== null) return;
    setPicked(choice);
    if (choice === question.answer) setScore((s) => s + 1);
  };

  const next = async () => {
    if (qNum >= ROUND_LEN) {
      setPhase('done');
      track('theory_round_completed', { category, level, score });
      try {
        const uid = auth.currentUser?.uid;
        if (uid) {
          const today = new Date().toISOString().split('T')[0];
          const cur = (await getDoc(doc(db, 'users', uid))).data() || {};
          const tq = cur.theoryQuiz || {};
          const rounds = tq.date === today ? (tq.rounds || 0) : 0;
          if (rounds < REWARDED_ROUNDS_PER_DAY) {
            await updateDoc(doc(db, 'users', uid), {
              theoryQuiz: { date: today, rounds: rounds + 1 },
              provaScore: increment(ROUND_POINTS),
              totalMinutes: increment(2),
              ...practiceStreakUpdates(cur),
            });
            logPracticeMinutes(uid, 2, 'theory');
            setRewarded(true);
            celebrate({ points: ROUND_POINTS, title: 'Round complete!', subtitle: `${score}/${ROUND_LEN} correct`, emoji: '🧠' });
          }
        }
      } catch (e) { /* reward is best-effort */ }
      return;
    }
    setQNum((n) => n + 1); setPicked(null);
    setQuestion(makeTheoryQuestion(category, level));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Theory Quiz</Text>
        <View style={{ width: 24 }} />
      </View>

      {phase === 'menu' && (
        <ScrollView contentContainerStyle={styles.menu}>
          <View style={styles.heroIcon}><Ionicons name="school" size={34} color={COLORS.primary} /></View>
          <Text style={styles.heroTitle}>Know your theory</Text>
          <Text style={styles.heroSub}>Ten questions a round across intervals, chords, keys and scales. Your first {REWARDED_ROUNDS_PER_DAY} rounds each day earn +{ROUND_POINTS} points.</Text>

          <Text style={styles.menuLabel}>TOPIC</Text>
          <View style={styles.topicGrid}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity key={c.id} style={[styles.topic, category === c.id && styles.segOn]} onPress={() => setCategory(c.id)}>
                <Text style={[styles.segText, category === c.id && styles.segTextOn]}>{c.label}</Text>
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

          <View style={styles.promptCard}>
            <Text style={styles.prompt}>{question.prompt}</Text>
          </View>

          <View style={styles.choices}>
            {question.choices.map((c) => {
              const isPicked = picked === c;
              const isRight = picked !== null && c === question.answer;
              const isWrongPick = isPicked && c !== question.answer;
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.choice, isRight && styles.choiceRight, isWrongPick && styles.choiceWrong]}
                  onPress={() => answer(c)}
                  activeOpacity={0.8}
                  disabled={picked !== null}
                >
                  <Text style={[styles.choiceText, (isRight || isWrongPick) && { color: '#fff' }]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {picked !== null && (
            <TouchableOpacity style={styles.nextBtn} onPress={next} activeOpacity={0.85}>
              <Text style={styles.nextText}>{qNum >= ROUND_LEN ? 'Finish' : 'Next ›'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {phase === 'done' && (
        <View style={styles.game}>
          <View style={styles.heroIcon}><Ionicons name={score >= 8 ? 'trophy' : 'school'} size={34} color={score >= 8 ? '#F5C044' : COLORS.primary} /></View>
          <Text style={styles.heroTitle}>{score}/{ROUND_LEN}</Text>
          <Text style={styles.heroSub}>
            {score >= 9 ? 'Textbook. Your theory is sharp.' : score >= 7 ? 'Strong — it is clicking.' : score >= 5 ? 'Good base — keep drilling.' : 'Theory grows fast with reps.'}
            {rewarded ? `  +${ROUND_POINTS} pts banked.` : ''}
          </Text>
          <TouchableOpacity style={styles.startBtn} onPress={startRound} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.startText}>Play again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPhase('menu')} hitSlop={{ top: 8, bottom: 8 }}>
            <Text style={styles.backLink}>Change topic</Text>
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
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg, alignSelf: 'stretch' },
  topic: { width: '47.5%', flexGrow: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center' },
  segRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg, alignSelf: 'stretch' },
  seg: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center' },
  segOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  segText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  segTextOn: { color: '#fff' },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, alignSelf: 'stretch', marginTop: SPACING.md },
  startText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  game: { flex: 1, padding: SPACING.xl, alignItems: 'center' },
  qNum: { color: COLORS.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  scoreLine: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, marginBottom: SPACING.xl },
  promptCard: { alignSelf: 'stretch', backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, paddingVertical: SPACING.xl, paddingHorizontal: SPACING.lg, marginBottom: SPACING.xl, minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  prompt: { color: COLORS.text, fontSize: 19, textAlign: 'center', lineHeight: 27, fontWeight: '700' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, justifyContent: 'center', alignSelf: 'stretch' },
  choice: { width: '47%', flexGrow: 1, paddingVertical: 16, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center' },
  choiceRight: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  choiceWrong: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  choiceText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  nextBtn: { marginTop: SPACING.xl, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 60 },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  backLink: { color: COLORS.textSecondary, fontSize: 14, marginTop: SPACING.lg },
}));
