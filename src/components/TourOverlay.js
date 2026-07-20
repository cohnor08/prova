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
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { getTourTarget, getTourScroller, setTourPadding } from './TourSpot';
import { COLORS, themedStyles } from '../constants/theme';
import { track } from '../lib/analytics';

const TAB_H = 84;        // TAB_BAR_STYLE.height — bar is fixed, no insets
const TAB_CENTER_Y = 47; // icon+label visual centre, from the bottom edge
const R = 42;            // tab spotlight radius
const B = 1400;          // dark border thickness (the "everything else" part)
const PAD = 8;           // breathing room around a rect target
const CARD_SPACE = 248;  // fixed allowance for the bottom card — nothing re-clamps after landing
const DIM = 'rgba(2,4,10,0.88)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Log placement numbers to Metro while we chase device-specific offsets.
const TOUR_DEBUG = false;
const dbg = (...a) => { if (TOUR_DEBUG) console.log('[tour]', ...a); };

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
  { title: 'The full tour', text: 'Every main feature, right where it lives. Use Next to step through — skip whenever.' },
  { nav: { tab: 'Today', screen: 'TodayHome' }, target: 't-start', scroller: 'TodayHome', title: 'Your daily plan', text: 'Today’s summary — minutes, exercises, and the one button that starts a guided session. The plan adapts weekly to how you actually practise.' },
  { nav: { tab: 'Today', screen: 'TodayHome' }, target: 't-ask', scroller: 'TodayHome', title: 'Ask Prova', text: 'Your AI coach. Technique, theory, what to practise next — ask anything.' },
  { nav: { tab: 'Today', screen: 'TodayHome' }, target: 't-challenge', scroller: 'TodayHome', title: 'Daily challenge', text: 'A bonus task every day — quick points and an easy way to keep the streak alive.' },
  { nav: { tab: 'Today', screen: 'TodayHome' }, target: 't-drills', scroller: 'TodayHome', title: 'Today’s drills', text: 'Two rotating mini-games a day. First rounds bank points and count as real practice.' },
  { nav: { tab: 'Practice', screen: 'PracticeHome' }, target: 'p-learn', scroller: 'PracticeHome', title: 'Learn', text: 'The lesson library, chords & scales, ear training, the fretboard game, rhythm tapper and theory quiz.' },
  { nav: { tab: 'Practice', screen: 'PracticeHome' }, target: 'p-tools', scroller: 'PracticeHome', title: 'Tools', text: 'Metronome with a speed trainer, tuner, songs and your calendar. The metronome keeps ticking anywhere in the app — watch for the floating pill.' },
  { nav: { tab: 'Progress', screen: 'ProgressHome' }, target: 'g-stats', scroller: 'ProgressHome', title: 'Your numbers', text: 'Streak, hours, sessions — plus a Practice Wrapped recap of your week, every week.' },
  { nav: { tab: 'Progress', screen: 'ProgressHome' }, target: 'g-score', scroller: 'ProgressHome', title: 'Prova Score', text: 'Every session grows your score through the ranks. Badges and the skill tree grow with it.' },
  { nav: { tab: 'Progress', screen: 'ProgressHome' }, target: 'g-board', scroller: 'ProgressHome', title: 'Leaderboards', text: 'Where you stand — worldwide, against friends, or inside your class.' },
  { nav: { tab: 'Messages' }, target: 'm-chats', title: 'Messages', text: 'Chat with your teacher — photos and videos too — and get class announcements. React with the smiley under any message.' },
  { nav: { tab: 'Profile' }, target: 'pr-teacher', scroller: 'Profile', title: 'Your teacher', text: 'Connect a teacher with their join code and their tasks land on Today. You can link more than one.' },
  { nav: { tab: 'Profile' }, target: 'pr-appearance', scroller: 'Profile', title: 'Make it yours', text: 'Light or dark, your accent colour, practice reminders — and this tour, any time.' },
  { title: 'That’s everything', text: 'Now go practise — Prova takes it from here.' },
];

const TEACHER_STEPS_FULL = [
  { title: 'The full tour', text: 'Every main feature, right where it lives. Use Next to step through — skip whenever.' },
  { nav: { tab: 'Home', screen: 'TeacherHomeMain' }, target: 'th-code', scroller: 'TeacherHomeMain', title: 'Home — your dashboard', text: 'Today’s lessons, your join code, and Practice Pulse — who’s practising and who’s gone quiet, at a glance.' },
  { nav: { tab: 'Home', screen: 'TeacherHomeMain' }, target: 'th-lessons', scroller: 'TeacherHomeMain', title: 'Lessons, packs & programs', text: 'Schedule lessons and attendance on the calendar, keep lesson notes, and bundle work into reusable packs or multi-week programs.' },
  { nav: { tab: 'Teacher' }, target: 'ts-roster', scroller: 'TeacherStudents', title: 'Your students', text: 'Students connect with your join code. Open anyone for their streak, practice chart and assigned work.' },
  { nav: { tab: 'Teacher' }, target: 'ts-roster', scroller: 'TeacherStudents', title: 'Assign work', text: 'Open a student and hit Assign Task — tutorials, songs, or a skill drill at the exact level you choose, to one student or a whole class.' },
  { nav: { tab: 'Teacher' }, target: 'ts-roster', scroller: 'TeacherStudents', title: 'Proof & parent reports', text: 'Inside a student: watch their practice clips and verify them. Add a parent email and Prova sends beautiful weekly reports automatically.' },
  { nav: { tab: 'Resources', screen: 'ResourcesHome' }, target: 'r-mine', scroller: 'ResourcesHome', title: 'Your resources', text: 'Your own materials — links, photos, anything — ready to assign in two taps.' },
  { nav: { tab: 'Resources', screen: 'ResourcesHome' }, target: 'r-library', scroller: 'ResourcesHome', title: 'Lesson library', text: 'A searchable bank of ready-made lessons and tasks. Assign any of them straight to a student.' },
  { nav: { tab: 'Resources', screen: 'ResourcesHome' }, target: 'r-drills', scroller: 'ResourcesHome', title: 'Skill drills', text: 'The mini-games, assignable at a chosen level. Tap one to play it exactly as your students will.' },
  { nav: { tab: 'Messages' }, target: 'm-chats', title: 'Messages', text: 'Direct chats with students — photos and videos too — plus class announcement channels with reactions. School-safe by design.' },
  { nav: { tab: 'Profile' }, target: 'pr-appearance', scroller: 'Profile', title: 'Make it yours', text: 'Appearance, account settings — and this tour, any time you want it.' },
  { title: 'That’s everything', text: 'Prova handles the accountability between lessons. Enjoy teaching.' },
];

export default function TourOverlay({ role }) {
  const navigation = useNavigation();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [size, setSize] = useState(null);
  const [mode, setMode] = useState('quick'); // 'quick' map | 'full' walkthrough
  // What's actually SHOWN (may lag `step` while the next target is measured —
  // the old ring+card stay up until the new ones are ready, so nothing flashes).
  const [display, setDisplay] = useState(null); // { idx, rect } | null
  const displayRef = useRef(null);
  useEffect(() => { displayRef.current = display; }, [display]);

  const navKeyOf = (st) => (st?.nav ? `${st.nav.tab}/${st.nav.screen || ''}` : 'none');

  // Drive the spotlight frame from the displayed rect. useLayoutEffect so the
  // ring frame updates in the SAME paint as the card — never a frame where a
  // new card shows with the old ring.
  useLayoutEffect(() => {
    const rect = display?.rect || null;
    if (!rect || !size) { ringOnRef.current = false; setRingOn(false); return; }
    const clampTop = 54;
    const clampBottom = size.height - TAB_H - CARD_SPACE;
    const t = Math.max(rect.y, clampTop);
    const b = Math.min(rect.y + rect.h, clampBottom);
    const f = b - t > 30 ? { x: rect.x, y: t, w: rect.w, h: b - t } : rect;
    // SNAP, never slide — pressing Next puts the ring straight on the element.
    frame.x.setValue(f.x); frame.y.setValue(f.y); frame.w.setValue(f.w); frame.h.setValue(f.h);
    if (!ringOnRef.current) { ringOnRef.current = true; setRingOn(true); }
  }, [display, size]);
  const seqRef = useRef(0);                  // cancels stale async measurements
  // Animated spotlight frame: on same-screen steps the ring SLIDES from the
  // previous element to the next instead of teleporting.
  const frame = useRef({
    x: new Animated.Value(0), y: new Animated.Value(0),
    w: new Animated.Value(0), h: new Animated.Value(0),
  }).current;
  const [ringOn, setRingOn] = useState(false);
  const ringOnRef = useRef(false);

  // Tab route roots, indexed like the quick steps' `tab`.
  const TAB_ROOTS = role === 'teacher'
    ? [['Home', 'TeacherHomeMain'], ['Teacher'], ['Resources', 'ResourcesHome'], ['Messages'], ['Profile']]
    : [['Today', 'TodayHome'], ['Practice', 'PracticeHome'], ['Progress', 'ProgressHome'], ['Messages'], ['Profile']];

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
          setMode('quick'); setStep(0); setDisplay(null); setVisible(true);
          track('tour_started', { role });
        }
      })
      .catch(() => {});
  }, []);

  // Replay from Profile.
  useEffect(() => {
    const fn = (m) => {
      setMode(m === 'full' ? 'full' : 'quick');
      setStep(0); setDisplay(null); setVisible(true);
      track('tour_replayed', { mode: m === 'full' ? 'full' : 'quick' });
    };
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  // QUICK mode: actually switch to the tab being described, so the user sees
  // the screen while its tab glows.
  useEffect(() => {
    if (!visible || mode !== 'quick') return;
    const s = steps[step];
    if (s.tab == null) return;
    const [tab, screen] = TAB_ROOTS[s.tab] || [];
    if (!tab) return;
    try { navigation.navigate(tab, screen ? { screen } : undefined); } catch (e) { /* stay put */ }
  }, [visible, mode, step]);

  // FULL mode: pad the pages' bottoms while the tour runs, so end-of-page
  // targets can scroll up into the zone like everything else.
  useEffect(() => {
    if (visible && mode === 'full') {
      setTourPadding(300);
      return () => setTourPadding(0);
    }
  }, [visible, mode]);

  // FULL mode: on each step, navigate there, then find + measure the target
  // (scrolling it into view if the screen registered its ScrollView).
  // Anti-flash: the PREVIOUS ring + card stay fully visible while the next
  // step is prepared, then everything swaps in a single frame. The screen only
  // drops to plain dim when the step changes tab (the screen behind changes
  // anyway). A missing target falls back to a centered card on that screen.
  useEffect(() => {
    if (!visible || mode !== 'full') return;
    const s = steps[step];
    if (displayRef.current?.idx === step) { seqRef.current++; return; } // pre-placed by jump()
    const seq = ++seqRef.current;
    // Blink to dim rather than EVER showing the ring on the wrong element.
    setDisplay(null);
    (async () => {
      if (s.nav) {
        try {
          navigation.navigate(s.nav.tab, s.nav.screen ? { screen: s.nav.screen } : undefined);
        } catch (e) { /* stay put */ }
      }
      if (!s.target) { setDisplay({ idx: step, rect: null }); return; }
      // Existence + sanity + stability: inactive tabs are natively DETACHED, so
      // the first measurement after arriving can be a partial layout. Require
      // two agreeing, sane measurements before placing.
      let prevProbe = null;
      let stable = null;
      for (let i = 0; i < 16; i++) {
        if (i > 0) await sleep(80);
        if (seqRef.current !== seq) return;
        const r = await measure(s.target);
        if (!r || r.w < 40 || r.h < 20) { prevProbe = null; continue; }
        if (prevProbe && Math.abs(r.y - prevProbe.y) < 2 && Math.abs(r.h - prevProbe.h) < 2) { stable = r; break; }
        prevProbe = r;
      }
      if (seqRef.current !== seq) return;
      if (!stable && !prevProbe) { setDisplay({ idx: step, rect: null }); return; }
      const winH = size?.height || 800;
      const p = await placeStep(s, winH);
      if (seqRef.current !== seq) return;
      if (!p) { setDisplay({ idx: step, rect: null }); return; }
      // If the page will visibly jump, drop to dim for ~2 frames first — the
      // old ring must never be seen sitting on freshly-scrolled content.
      const willJump = p.offset != null && p.rect && Math.abs((p.curY ?? p.rect.y) - p.rect.y) > 6;
      if (willJump && displayRef.current) {
        setDisplay(null);
        await sleep(32);
        if (seqRef.current !== seq) return;
      }
      if (p.offset != null) doScroll(s, p.offset);
      const visTop = Math.max(p.rect.y, 54);
      const visBottom = Math.min(p.rect.y + p.rect.h, winH - TAB_H - 14);
      const rect = visBottom - visTop > 40 && p.rect.w > 100
        ? { x: p.rect.x, y: visTop, w: p.rect.w, h: visBottom - visTop }
        : null;
      setDisplay({ idx: step, rect }); // scroll + ring + card in one swap
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
    // Everything renders from `display` — which step is actually SHOWN. It
    // lags `step` while the next target is measured, so the old ring + card
    // stay up and the swap is a single frame.
    const d = display;
    const ds = d ? steps[d.idx] : null;
    const dIsLast = d ? d.idx === steps.length - 1 : false;
    const dIsIntro = d ? d.idx === 0 || dIsLast : true;
    const jump = (toIdx) => setStep(toIdx);
    const dNext = () => (dIsLast ? finish(false) : jump(d.idx + 1));
    const showRing = ringOn && !!d?.rect;
    // Fixed-footprint card (width overrides undo the base card's
    // width/maxWidth so it can't grow past the screen), always at the bottom.
    const card = ds && (
      <View
        style={[
          styles.card,
          dIsIntro
            ? styles.cardCentered
            : {
                position: 'absolute', left: 20, right: 20,
                bottom: TAB_H + 24,
                width: undefined, maxWidth: undefined, alignSelf: undefined,
              },
        ]}
      >
        {!dIsIntro && <Text style={styles.kicker}>{d.idx} OF {stepTotal}</Text>}
        <Text style={styles.title}>{ds.title}</Text>
        <Text style={styles.text}>{ds.text}</Text>
        <View style={styles.btnRow}>
          {!dIsLast && (
            <TouchableOpacity onPress={() => finish(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.skip}>Skip</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          {d.idx > 0 && !dIsLast && (
            <TouchableOpacity style={styles.backBtn} onPress={() => jump(d.idx - 1)} activeOpacity={0.85}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.nextBtn} onPress={dNext} activeOpacity={0.85}>
            <Text style={styles.nextText}>{dIsLast ? 'Done' : d.idx === 0 ? 'Start the tour' : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
    return (
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(e) => setSize(e.nativeEvent.layout)}
        // Claim (and swallow) touches so the app underneath can't be tapped
        // mid-tour — only the card's buttons advance.
        onStartShouldSetResponder={() => true}
      >
        {!d ? (
          // Switching screens: plain dim for a beat, then ring + card together.
          <View style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} />
        ) : showRing ? (
          <>
            {/* Rect spotlight: the border trick with a rectangular hole. The
                frame is Animated so the hole SLIDES between elements. */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: Animated.subtract(frame.x, PAD + B), top: Animated.subtract(frame.y, PAD + B),
                width: Animated.add(frame.w, 2 * (PAD + B)), height: Animated.add(frame.h, 2 * (PAD + B)),
                borderWidth: B, borderRadius: B + 18, borderColor: DIM,
              }}
            />
            {/* Soft outer glow so the lit element unmistakably pops. */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: Animated.subtract(frame.x, PAD + 5), top: Animated.subtract(frame.y, PAD + 5),
                width: Animated.add(frame.w, 2 * (PAD + 5)), height: Animated.add(frame.h, 2 * (PAD + 5)),
                borderRadius: 22, borderWidth: 5, borderColor: COLORS.primary + '44',
              }}
            />
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: Animated.subtract(frame.x, PAD), top: Animated.subtract(frame.y, PAD),
                width: Animated.add(frame.w, 2 * PAD), height: Animated.add(frame.h, 2 * PAD),
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
        {step > 0 && !isLast && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(step - 1)} activeOpacity={0.85}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        )}
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

function measureWin(node) {
  return new Promise((resolve) => {
    if (!node?.measureInWindow) return resolve(null);
    try { node.measureInWindow((x, y, w, h) => resolve({ x, y, w, h })); } catch (e) { resolve(null); }
  });
}

// CLOSED-FORM placement — exact by construction:
// content height is measured, so the maximum possible scroll is KNOWN and the
// requested offset is clamped to it; the predicted on-screen rect therefore
// always matches where the element really ends up. No verification loops.
async function placeStep(st, winH) {
  const sc = getTourScroller(st.scroller)?.current;
  const el = getTourTarget(st.target)?.current;
  if (!el) return null;
  const zoneTop = 54;
  const zoneBottom = winH - TAB_H - CARD_SPACE;
  const zh = zoneBottom - zoneTop;
  const inner = sc && sc.getInnerViewRef ? sc.getInnerViewRef() : null;
  const host = sc && sc.getNativeScrollRef ? sc.getNativeScrollRef() : sc;
  const [elW, inW, vpW] = await Promise.all([measureWin(el), measureWin(inner), measureWin(host)]);
  if (!elW || elW.w < 40 || elW.h < 20) return null; // never a garbage rect
  if (!inW || !vpW || inW.h <= 0 || vpW.h <= 0) {
    return { offset: null, rect: elW }; // no scroll math — light it where it is
  }
  const posY = elW.y - inW.y;                     // position inside the content
  const maxScroll = Math.max(0, inW.h - vpW.h);   // ← the clamp that was missing
  const desiredWinTop = elW.h >= zh ? zoneTop : zoneTop + (zh - elW.h) / 2;
  const offset = Math.min(Math.max(0, posY - (desiredWinTop - vpW.y)), maxScroll);
  dbg('place', st.target, 'posY', Math.round(posY), 'max', Math.round(maxScroll), 'offset', Math.round(offset));
  return { offset, curY: elW.y, rect: { x: elW.x, y: vpW.y + posY - offset, w: elW.w, h: elW.h } };
}

// Jump the screen's ScrollView to an absolute offset (no animation — the swap
// itself is the visible transition).
function doScroll(step, y) {
  const sc = getTourScroller(step.scroller)?.current;
  if (!sc) return;
  try { sc.scrollTo({ y, animated: false }); } catch (e) {}
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
  backBtn: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18, marginRight: 10 },
  backText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  caret: {
    position: 'absolute', width: 14, height: 14, backgroundColor: COLORS.surface,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border,
    transform: [{ rotate: '45deg' }],
  },
}));
