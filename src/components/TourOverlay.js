// Guided tours: a darkened overlay with a bright spotlight, a short card, and
// Next/Skip.
//
// Two flavours:
//  • QUICK (first run + Profile "Show me around"): teaches the MAP — one stop
//    per bottom tab, spotlight cut out around the tab icon.
//  • FULL (Profile "Full feature tour"): actually NAVIGATES into each tab and
//    lights up the real elements — the drills, the score card, the tools —
//    via the TourSpot registry (which can also scroll them into view).
//
// The spotlight is the classic border trick: a huge transparent-centre view
// whose massive dark border darkens everything EXCEPT the hole — no SVG masks
// needed, works identically on native and web.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { getTourTarget, getTourScroller } from './TourSpot';
import { COLORS, themedStyles } from '../constants/theme';
import { track } from '../lib/analytics';

const TAB_H = 84;        // TAB_BAR_STYLE.height — bar is fixed, no insets
const TAB_CENTER_Y = 47; // icon+label visual centre, from the bottom edge
const R = 42;            // tab spotlight radius
const B = 1400;          // dark border thickness (the "everything else" part)
const PAD = 8;           // breathing room around a rect target
const DIM = 'rgba(2,4,10,0.88)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Replay hook for Profile. 'full' = the in-depth walkthrough; default quick.
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

// FULL tour steps: `nav` = where to go, `target` = TourSpot id to light up
// (falls back to a centered card on that screen if the element isn't there —
// e.g. the teacher section for a student with no teacher).
const STUDENT_STEPS_FULL = [
  { title: 'The full tour', text: 'Every main feature, right where it lives. Tap anywhere to step through — skip whenever.' },
  { nav: { tab: 'Today', screen: 'TodayHome' }, target: 't-start', scroller: 'TodayHome', title: 'Your daily plan', text: 'Today’s summary — minutes, exercises, and the one button that starts a guided session. The plan adapts weekly to how you actually practise.' },
  { nav: { tab: 'Today', screen: 'TodayHome' }, target: 't-ask', scroller: 'TodayHome', title: 'Ask Prova', text: 'Your AI coach. Technique, theory, what to practise next — ask anything.' },
  { nav: { tab: 'Today', screen: 'TodayHome' }, target: 't-challenge', scroller: 'TodayHome', title: 'Daily challenge', text: 'A bonus task every day — quick points and an easy way to keep the streak alive.' },
  { nav: { tab: 'Today', screen: 'TodayHome' }, target: 't-drills', scroller: 'TodayHome', title: 'Today’s drills', text: 'Two rotating mini-games a day. First rounds bank points and count as real practice.' },
  { nav: { tab: 'Practice', screen: 'PracticeHome' }, target: 'p-learn', scroller: 'PracticeHome', title: 'Learn', text: 'The lesson library, chords & scales, ear training, the fretboard game, rhythm tapper and theory quiz.' },
  { nav: { tab: 'Practice', screen: 'PracticeHome' }, target: 'p-tools', scroller: 'PracticeHome', title: 'Tools', text: 'Metronome with a speed trainer, tuner, songs and your calendar. The metronome keeps ticking anywhere in the app — watch for the floating pill.' },
  { nav: { tab: 'Progress', screen: 'ProgressHome' }, target: 'g-stats', scroller: 'ProgressHome', title: 'Your numbers', text: 'Streak, hours, sessions — plus a Practice Wrapped recap of your week, every week.' },
  { nav: { tab: 'Progress', screen: 'ProgressHome' }, target: 'g-score', scroller: 'ProgressHome', title: 'Prova Score', text: 'Every session grows your score through the ranks. Badges and the skill tree grow with it.' },
  { nav: { tab: 'Progress', screen: 'ProgressHome' }, target: 'g-board', scroller: 'ProgressHome', title: 'Leaderboards', text: 'Where you stand — worldwide, against friends, or inside your class.' },
  { nav: { tab: 'Messages' }, title: 'Messages', text: 'Chat with your teacher — photos and videos too — and get class announcements. React with the smiley under any message.' },
  { nav: { tab: 'Profile' }, target: 'pr-teacher', scroller: 'Profile', title: 'Your teacher', text: 'Connect a teacher with their join code and their tasks land on Today. You can link more than one.' },
  { nav: { tab: 'Profile' }, target: 'pr-appearance', scroller: 'Profile', title: 'Make it yours', text: 'Light or dark, your accent colour, practice reminders — and this tour, any time.' },
  { title: 'That’s everything', text: 'Now go practise — Prova takes it from here.' },
];

const TEACHER_STEPS_FULL = [
  { title: 'The full tour', text: 'Every main feature, right where it lives. Tap anywhere to step through — skip whenever.' },
  { nav: { tab: 'Home', screen: 'TeacherHomeMain' }, title: 'Home — your dashboard', text: 'Today’s lessons, your join code, and Practice Pulse — who’s practising and who’s gone quiet, at a glance.' },
  { nav: { tab: 'Home', screen: 'TeacherHomeMain' }, title: 'Lessons, packs & programs', text: 'Schedule lessons and attendance on the calendar, keep lesson notes, and bundle work into reusable packs or multi-week programs.' },
  { nav: { tab: 'Teacher' }, title: 'Your students', text: 'Students connect with your join code. Open anyone for their streak, practice chart and assigned work.' },
  { nav: { tab: 'Teacher' }, title: 'Assign work', text: 'Tasks with tutorials, songs, or a skill drill at the exact level you choose — to one student or a whole class. Tap any task for its overview or to edit it.' },
  { nav: { tab: 'Teacher' }, title: 'Proof & parent reports', text: 'Watch students’ practice clips and verify them. Add parent emails and Prova emails beautiful weekly reports automatically.' },
  { nav: { tab: 'Resources', screen: 'ResourcesHome' }, target: 'r-mine', scroller: 'ResourcesHome', title: 'Your resources', text: 'Your own materials — links, photos, anything — ready to assign in two taps.' },
  { nav: { tab: 'Resources', screen: 'ResourcesHome' }, target: 'r-library', scroller: 'ResourcesHome', title: 'Lesson library', text: 'A searchable bank of ready-made lessons and tasks. Assign any of them straight to a student.' },
  { nav: { tab: 'Resources', screen: 'ResourcesHome' }, target: 'r-drills', scroller: 'ResourcesHome', title: 'Skill drills', text: 'The mini-games, assignable at a chosen level. Tap one to play it exactly as your students will.' },
  { nav: { tab: 'Messages' }, title: 'Messages', text: 'Direct chats with students — photos and videos too — plus class announcement channels with reactions. School-safe by design.' },
  { nav: { tab: 'Profile' }, target: 'pr-appearance', scroller: 'Profile', title: 'Make it yours', text: 'Appearance, account settings — and this tour, any time you want it.' },
  { title: 'That’s everything', text: 'Prova handles the accountability between lessons. Enjoy teaching.' },
];

export default function TourOverlay({ role }) {
  const navigation = useNavigation();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [size, setSize] = useState(null);
  const [mode, setMode] = useState('quick'); // 'quick' map | 'full' walkthrough
  const [rect, setRect] = useState(null);    // measured target box (full mode)
  const [cardH, setCardH] = useState(190);   // live card height → spotlight zone
  const seqRef = useRef(0);                  // cancels stale async measurements

  const steps = role === 'teacher'
    ? (mode === 'full' ? TEACHER_STEPS_FULL : TEACHER_STEPS)
    : (mode === 'full' ? STUDENT_STEPS_FULL : STUDENT_STEPS);

  // First run: show the quick map once per account.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then((s) => {
        if (!(s.data() || {}).tourSeen) {
          setMode('quick'); setStep(0); setVisible(true);
          track('tour_started', { role });
        }
      })
      .catch(() => {});
  }, []);

  // Replay from Profile.
  useEffect(() => {
    const fn = (m) => {
      setMode(m === 'full' ? 'full' : 'quick');
      setStep(0); setVisible(true);
      track('tour_replayed', { mode: m === 'full' ? 'full' : 'quick' });
    };
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  // FULL mode: on each step, navigate there, then find + measure the target
  // (scrolling it into view if the screen registered its ScrollView). Retries
  // cover the screen still rendering; a missing target falls back to a
  // centered card on that screen.
  useEffect(() => {
    if (!visible || mode !== 'full') return;
    const s = steps[step];
    const seq = ++seqRef.current;
    setRect(null);
    (async () => {
      if (s.nav) {
        try {
          navigation.navigate(s.nav.tab, s.nav.screen ? { screen: s.nav.screen } : undefined);
        } catch (e) { /* stay put */ }
      }
      if (!s.target) return;
      // The card is always anchored at the bottom, so the usable zone for the
      // spotlight runs from under the status bar to just above the card. The
      // scroll centres the target in that zone (never under the card); targets
      // taller than the zone pin to its top.
      const winH = size?.height || 800;
      const zoneTop = 54;
      const zoneBottom = winH - TAB_H - 36 - cardH;
      let scrolled = false;
      let best = null;
      for (let i = 0; i < 12; i++) {
        await sleep(i === 0 ? 60 : 90);
        if (seqRef.current !== seq) return;
        const r = await measure(s.target);
        if (!r) continue;
        best = r;
        const off = r.y < zoneTop - 6 || r.y + r.h > zoneBottom + 6;
        if (off && !scrolled) {
          scrolled = true;
          await scrollTo(s, { zoneTop, zoneBottom });
          continue; // remeasure after the scroll
        }
        break;
      }
      if (seqRef.current !== seq || !best) return;
      // Whatever happened with scrolling, the lit region must be ON screen —
      // clamp the hole to the zone so the user always sees it glow.
      const visTop = Math.max(best.y, zoneTop);
      const visBottom = Math.min(best.y + best.h, zoneBottom);
      if (visBottom - visTop > 40) {
        setRect({ x: best.x, y: visTop, w: best.w, h: visBottom - visTop });
      }
    })();
  }, [visible, mode, step]);

  if (!visible) return null;

  const finish = (skipped) => {
    setVisible(false);
    track(skipped ? 'tour_skipped' : 'tour_completed', { step, mode });
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { tourSeen: true }).catch(() => {});
  };

  const s = steps[step];
  const isLast = step === steps.length - 1;
  const next = () => (isLast ? finish(false) : setStep(step + 1));
  const isIntro = step === 0 || isLast;
  const stepNum = step;
  const stepTotal = steps.length - 2;

  // ── FULL mode render ──
  if (mode === 'full') {
    const hasRect = !!rect && !!size;
    // The card lives at the bottom from the FIRST frame of every step (only
    // the intro/outro are centered) — no jump when the spotlight lands.
    const card = (
      <View
        onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
        style={[
          styles.card,
          isIntro
            ? styles.cardCentered
            : { position: 'absolute', left: 20, right: 20, bottom: TAB_H + 24 },
        ]}
      >
        {!isIntro && <Text style={styles.kicker}>{stepNum} OF {stepTotal}</Text>}
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
            <Text style={styles.nextText}>{isLast ? 'Done' : step === 0 ? 'Start the tour' : 'Next'}</Text>
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
        {hasRect ? (
          <>
            {/* Rect spotlight: the border trick with a rectangular hole. */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: rect.x - PAD - B, top: rect.y - PAD - B,
                width: rect.w + 2 * (PAD + B), height: rect.h + 2 * (PAD + B),
                borderWidth: B, borderRadius: B + 18, borderColor: DIM,
              }}
            />
            {/* Soft outer glow so the lit element unmistakably pops. */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: rect.x - PAD - 5, top: rect.y - PAD - 5,
                width: rect.w + 2 * (PAD + 5), height: rect.h + 2 * (PAD + 5),
                borderRadius: 22, borderWidth: 5, borderColor: COLORS.primary + '44',
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: rect.x - PAD, top: rect.y - PAD,
                width: rect.w + 2 * PAD, height: rect.h + 2 * PAD,
                borderRadius: 18, borderWidth: 2.5, borderColor: COLORS.primary,
              }}
            />
            {card}
          </>
        ) : (
          <View style={styles.dimFull}>{card}</View>
        )}
      </View>
    );
  }

  // ── QUICK mode render (unchanged behaviour) ──
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

// Measure a TourSpot in window coordinates; null when absent/not laid out.
function measure(id) {
  return new Promise((resolve) => {
    const ref = getTourTarget(id);
    const node = ref?.current;
    if (!node?.measureInWindow) return resolve(null);
    node.measureInWindow((x, y, w, h) => resolve(w > 0 && h > 0 ? { x, y, w, h } : null));
  });
}

// Bring a target into view via its screen's registered ScrollView, centring
// it in the spotlight zone (targets taller than the zone pin to its top, so
// nothing ever slides under the card).
// measureLayout needs a REF to a native component on the new architecture
// (a bare node handle logs "must be called with a ref" and fails), so prefer
// getInnerViewRef; fall back to the node handle for the old architecture.
function scrollTo(step, zone) {
  return new Promise((resolve) => {
    const scRef = getTourScroller(step.scroller);
    const tRef = getTourTarget(step.target);
    const sc = scRef?.current;
    const node = tRef?.current;
    if (!sc || !node?.measureLayout) return resolve();
    const inner = (sc.getInnerViewRef && sc.getInnerViewRef()) || (sc.getInnerViewNode && sc.getInnerViewNode()) || null;
    if (!inner) return resolve();
    let settled = false;
    const done = () => { if (!settled) { settled = true; setTimeout(resolve, 80); } };
    try {
      node.measureLayout(
        inner,
        (x, y, w, h) => {
          const zh = Math.max(80, zone.zoneBottom - zone.zoneTop);
          const desiredTop = (h || 0) >= zh ? zone.zoneTop : zone.zoneTop + (zh - (h || 0)) / 2;
          try { sc.scrollTo({ y: Math.max(0, y - desiredTop), animated: false }); } catch (e) {}
          done();
        },
        done,
      );
    } catch (e) { done(); }
  });
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
