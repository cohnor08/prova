// First-run guided tour: darkened overlay with a bright spotlight cut out
// around each bottom tab, a short card explaining what lives there, Next/Skip.
// Teaches the MAP only (which tab is what) — per-screen guidance is the empty
// states' job. Shows once (users.tourSeen), replayable from Profile.
//
// The spotlight is the classic border trick: a huge transparent-centre view
// whose massive dark border darkens everything EXCEPT a circle over the tab —
// no SVG masks needed, works identically on native and web.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { COLORS, themedStyles } from '../constants/theme';
import { track } from '../lib/analytics';

const TAB_H = 84;        // TAB_BAR_STYLE.height — bar is fixed, no insets
const TAB_CENTER_Y = 47; // icon+label visual centre, from the bottom edge
const R = 42;            // spotlight radius
const B = 1400;          // dark border thickness (the "everything else" part)
const DIM = 'rgba(2,4,10,0.88)';

// Replay hook for Profile's "Show me around" row. Pass 'full' for the
// feature-by-feature walkthrough; no argument = the quick first-run map.
const listeners = new Set();
export function replayTour(mode) { listeners.forEach((fn) => fn(mode)); }

const STUDENT_STEPS = [
  { tab: null, title: 'Welcome to Prova', text: 'Your practice coach. Twenty seconds — here’s where everything lives.' },
  { tab: 0, title: 'Today', text: 'Your daily practice. One button starts the session, and your plan adapts as you go.' },
  { tab: 1, title: 'Practice', text: 'Your toolkit — songs, setlists, chords and scales, ear training and the fretboard game.' },
  { tab: 2, title: 'Progress', text: 'Streaks, badges, your Prova Score and the skill tree. Practising fills this up.' },
  { tab: 3, title: 'Messages', text: 'Chats and tasks from your teacher land here. Connect one anytime with their join code, in Profile.' },
  { tab: null, title: 'That’s the map', text: 'Prova will guide you from here. Have fun.' },
];

const TEACHER_STEPS = [
  { tab: null, title: 'Welcome to Prova', text: 'Your studio, organised. Twenty seconds — here’s where everything lives.' },
  { tab: 0, title: 'Home', text: 'Your dashboard — today’s lessons, top students and your studio at a glance.' },
  { tab: 1, title: 'Students', text: 'Connect students with your join code, assign tasks and follow their practice.' },
  { tab: 2, title: 'Resources', text: 'Share sheet music, backing tracks and materials with your students.' },
  { tab: 3, title: 'Messages', text: 'Chat with your students — school-safe, teacher-to-student only.' },
  { tab: null, title: 'That’s the map', text: 'Prova handles the accountability between lessons. Enjoy teaching.' },
];

// The IN-DEPTH tour, from Profile's "Show me around again": same spotlight
// mechanics, but several cards per tab so every main feature gets a moment.
const STUDENT_STEPS_FULL = [
  { tab: null, title: 'The full tour', text: 'Every main feature, a couple of minutes. Tap anywhere to step through — skip whenever.' },
  { tab: 0, title: 'Today — your plan', text: 'Your AI practice plan lives here. One button starts a guided session with per-task timers, and the plan adapts weekly to how you actually practise.' },
  { tab: 0, title: 'Daily challenge & drills', text: 'A bonus challenge and two rotating mini-game drills every day — quick wins that bank points and keep your streak alive.' },
  { tab: 0, title: 'From your teacher', text: 'Tasks, class work and lesson info land on Today. Expand a task to watch its tutorial, practise it, or attach a video clip as proof.' },
  { tab: 0, title: 'Ask Prova', text: 'Your AI coach. Ask anything — technique, theory, what to practise next — straight from the card on Today.' },
  { tab: 1, title: 'Practice tools', text: 'Metronome with a speed trainer, and a tuner. The metronome keeps ticking when you leave the tab — the floating pill shows it’s running anywhere in the app.' },
  { tab: 1, title: 'Learn — the games', text: 'Chords & scales library, ear training, the fretboard game, rhythm tapper and theory quiz. Your first rounds each day earn points.' },
  { tab: 1, title: 'Songs & gigs', text: 'Pick any song and Prova builds the exact steps to learn it. Got a gig? It’ll build the setlist too.' },
  { tab: 2, title: 'Progress', text: 'Streak, hours, session history and a weekly Practice Wrapped recap of your week.' },
  { tab: 2, title: 'Score, badges & skill tree', text: 'Every session grows your Prova Score through the ranks. 32 badges to earn, a skill tree to climb, and personal goals to tick off.' },
  { tab: 2, title: 'Leaderboards', text: 'See where you stand — worldwide, against friends, or inside your class.' },
  { tab: 3, title: 'Messages', text: 'Chat with your teacher — photos and videos too — and get class announcements. Long stuck? React with the smiley under any message.' },
  { tab: 4, title: 'Profile', text: 'Light or dark theme with your accent colour, practice reminders, your teacher’s join code — and this tour, any time you want it.' },
  { tab: null, title: 'That’s everything', text: 'Now go practise — Prova takes it from here.' },
];

const TEACHER_STEPS_FULL = [
  { tab: null, title: 'The full tour', text: 'Every main feature, a couple of minutes. Tap anywhere to step through — skip whenever.' },
  { tab: 0, title: 'Home — your dashboard', text: 'Today’s lessons, your join code, and Practice Pulse — who’s practising and who’s gone quiet, at a glance.' },
  { tab: 0, title: 'Lessons & attendance', text: 'Schedule lessons on the calendar, mark attendance and marks, and keep per-lesson notes your students can see.' },
  { tab: 0, title: 'Packs & programs', text: 'Bundle tasks into reusable packs, or multi-week programs that assign themselves week by week.' },
  { tab: 1, title: 'Students', text: 'Your roster. Students connect with your join code; open anyone for their streak, practice chart and assigned work.' },
  { tab: 1, title: 'Assign work', text: 'Tasks with tutorials, songs, or a skill drill at the exact level you choose — to one student or a whole class. Tap any task for its overview or to edit it.' },
  { tab: 1, title: 'Proof & parent reports', text: 'Watch students’ practice clips and verify them. Add parent emails and Prova sends beautiful weekly progress reports automatically.' },
  { tab: 2, title: 'Resources', text: 'Your own materials, a full lesson library, and the skill drills — tap one to play it exactly as your students will.' },
  { tab: 3, title: 'Messages', text: 'Direct chats with students — photos and videos too — plus class announcement channels with reactions. School-safe by design.' },
  { tab: 4, title: 'Profile', text: 'Appearance, account settings — and this tour, any time you want it.' },
  { tab: null, title: 'That’s everything', text: 'Prova handles the accountability between lessons. Enjoy teaching.' },
];

export default function TourOverlay({ role }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [size, setSize] = useState(null);
  const [mode, setMode] = useState('quick'); // 'quick' first-run map | 'full' feature walkthrough
  const steps = role === 'teacher'
    ? (mode === 'full' ? TEACHER_STEPS_FULL : TEACHER_STEPS)
    : (mode === 'full' ? STUDENT_STEPS_FULL : STUDENT_STEPS);

  // First run: show once per account.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then((s) => {
        if (!(s.data() || {}).tourSeen) {
          setStep(0); setVisible(true);
          track('tour_started', { role });
        }
      })
      .catch(() => {});
  }, []);

  // Replay from Profile — 'full' gives the in-depth feature walkthrough.
  useEffect(() => {
    const fn = (m) => { setMode(m === 'full' ? 'full' : 'quick'); setStep(0); setVisible(true); track('tour_replayed', { mode: m || 'quick' }); };
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  if (!visible) return null;

  const finish = (skipped) => {
    setVisible(false);
    track(skipped ? 'tour_skipped' : 'tour_completed', { step });
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { tourSeen: true }).catch(() => {});
  };

  const s = steps[step];
  const isLast = step === steps.length - 1;
  const next = () => (isLast ? finish(false) : setStep(step + 1));

  const cx = size ? (size.width * (s.tab + 0.5)) / 5 : 0;
  const cy = size ? size.height - TAB_CENTER_Y : 0;

  const card = (
    <View style={[styles.card, s.tab == null ? styles.cardCentered : { position: 'absolute', bottom: TAB_H + 22, left: 20, right: 20 }]}>
      {s.tab != null && <Text style={styles.kicker}>{step} OF {steps.length - 2}</Text>}
      <Text style={styles.title}>{s.title}</Text>
      <Text style={styles.text}>{s.text}</Text>
      <View style={styles.btnRow}>
        {!isLast && (
          <TouchableOpacity onPress={() => finish(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.nextBtn} onPress={next} activeOpacity={0.85}>
          <Text style={styles.nextText}>{isLast ? 'Done' : step === 0 ? 'Show me around' : 'Next'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize(e.nativeEvent.layout)}
      onStartShouldSetResponder={() => true}
      onResponderRelease={next}
    >
      {s.tab == null ? (
        <View style={styles.dimFull}>{card}</View>
      ) : size && (
        <>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: cx - R - B, top: cy - R - B,
              width: 2 * (R + B), height: 2 * (R + B),
              borderWidth: B, borderRadius: B + R, borderColor: DIM,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: cx - R, top: cy - R,
              width: 2 * R, height: 2 * R,
              borderRadius: R, borderWidth: 2, borderColor: COLORS.primary,
            }}
          />
          <View pointerEvents="none" style={[styles.caret, { left: cx - 7, bottom: TAB_H + 16 }]} />
          {card}
        </>
      )}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  dimFull: { flex: 1, backgroundColor: DIM, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
    padding: 20, maxWidth: 380, alignSelf: 'center', width: '100%',
  },
  cardCentered: {},
  kicker: { color: COLORS.primary, fontSize: 10.5, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  title: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  text: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20.5, marginTop: 5 },
  btnRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  skip: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
  nextBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 22 },
  nextText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  caret: {
    position: 'absolute', width: 14, height: 14, backgroundColor: COLORS.surface,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border,
    transform: [{ rotate: '45deg' }],
  },
}));
