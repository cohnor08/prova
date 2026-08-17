import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import Ghost from './Ghost';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, themedStyles, CATEGORY_COLORS } from '../constants/theme';
import YouTubePlayerModal from './YouTubePlayerModal';
import Celebration from './Celebration';
import ProofMedia from './ProofMedia';
import SheetModal from './SheetModal';
import { setAppBusy } from '../lib/appBusy';

// Full-screen guided practice player. One task at a time: big timer, the
// instructions, watch link, then Done/Skip — the student drives, nothing
// auto-advances. All completion/banking logic lives in TodayScreen; the player
// only calls the callbacks it's given, so data writes stay identical to the
// rest of the app.
//
// Queue items (normalized by the parent):
//   { id, kind: 'session'|'teacher', title, description, category,
//     targetSec, priorSec, watch, song, taskId, proofUrl, proofVerified }

const fmt = (s) => {
  const v = Math.max(0, Math.round(s));
  return `${Math.floor(v / 60).toString().padStart(2, '0')}:${(v % 60).toString().padStart(2, '0')}`;
};

// Whichever of card/surface actually stands off the page in the current theme.
// The two swap round between palettes — in Sky `surface` is the raised well and
// `card` sits a hair off the background; in the darkest theme it's reversed — so
// picking one by name gives a box that looks solid in one theme and transparent
// in another. Measured, not guessed.
const relLum = (hex) => {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return 0;
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const raisedSurface = (C) => {
  const bg = relLum(C.background);
  // Furthest from the page, in whichever direction the theme runs.
  const dCard = Math.abs(relLum(C.card) - bg);
  const dSurf = Math.abs(relLum(C.surface) - bg);
  return dSurf > dCard ? C.surface : C.card;
};


// Safe-area insets are unreliable inside an RN Modal (they intermittently read
// as 0, which is why the close/skip buttons sometimes sat under the notch or
// home indicator). A fresh SafeAreaProvider inside the modal + minimum
// fallbacks keeps the frame steady every time.
function InsetShell({ children }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.background,
        paddingTop: Math.max(insets.top, 24),
        paddingBottom: Math.max(insets.bottom, 16),
      }}
    >
      {children}
    </View>
  );
}

export default function PracticePlayer({
  visible,
  queue,
  startId,
  streak,
  allSessionsDone,
  onCompleteSession, // (sessionId) -> Promise<pts>
  onBankTeacher,     // (taskId, seconds) -> Promise<pts>
  onBankSong,        // (seconds) -> Promise<pts> — pre-gig setlist rehearsal
  onBankStep,        // (stepId, seconds) -> Promise<pts> — learn-a-song step
  onGigSongEnd,      // Done/Next on a setlist song → back to the song picker
  onAttachProof,
  onDeleteProof,      // (taskId, index) -> Promise<boolean>, confirms then removes
  assignedTasks,      // the raw tasks, so the sheet reads live clip data
  proofBusyId,
  proofPct,
  proofStep,
  onClose,
  onFinishReview,    // close + open the "How did today go?" review
  savedElapsed,      // { itemId: seconds } persisted from an earlier run today
  onProgress,        // ({ elapsedById, lastItemId } | null) -> parent persists it
}) {
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState('play'); // 'play' | 'summary'
  const [paused, setPaused] = useState(false);
  const [, setTick] = useState(0);            // re-render pulse for the clock
  const [watch, setWatch] = useState(null);   // { query, title }
  const [celeb, setCeleb] = useState(null);   // per-task celebration payload
  const [note, setNote] = useState(null);     // { title, body } — teacher comment, in full
  const [proofFor, setProofFor] = useState(null); // taskId whose proof sheet is open
  const [proofIdx, setProofIdx] = useState(0);    // which clip, when there are several

  // A task's clips, normalised — older tasks only ever had a single proofUrl.
  const clipsFor = (taskId) => {
    const t = (assignedTasks || []).find((x) => x.id === taskId);
    if (!t) return [];
    if (Array.isArray(t.proofs) && t.proofs.length) return t.proofs;
    return t.proofUrl ? [{ url: t.proofUrl, type: t.proofType || 'video', at: t.proofAt || null }] : [];
  };
  const proofCount = (taskId) => clipsFor(taskId).length;

  // Start from the newest whenever the sheet opens — that's the one you just
  // recorded and the one you're most likely judging.
  useEffect(() => {
    if (proofFor == null) return;
    setProofIdx(Math.max(0, proofCount(proofFor) - 1));
  }, [proofFor]);

  // Close the sheet once the last clip is gone.
  useEffect(() => {
    if (proofFor != null && proofCount(proofFor) === 0) setProofFor(null);
  }, [assignedTasks, proofFor]);

  // While the player is open the app must not restart under it — see
  // src/lib/appBusy.js and useStaleReload.
  useEffect(() => {
    setAppBusy(true);
    return () => setAppBusy(false);
  }, []);

  // Timestamp-based timing so a locked phone doesn't drift the clock.
  const startedAtRef = useRef(null);
  const accumRef = useRef(0);
  const buzzedRef = useRef(false);
  const advancingRef = useRef(false); // swallow double-taps during a transition
  const statsRef = useRef({ sec: 0, pts: 0, done: 0, skipped: 0 });
  const savedElapsedRef = useRef({}); // itemId -> seconds on the clock, resumes on revisit

  const elapsed = () => accumRef.current + (startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0);

  // Build the run when the player opens. The queue KEEPS plan order — opening
  // at a specific task jumps to its real position (so the counter reads
  // "6 of 12", and Previous walks back toward the start). Clocks stashed in an
  // earlier run today carry over, so exiting never loses time.
  useEffect(() => {
    if (!visible) return;
    const q = [...(queue || [])];
    const at = startId ? q.findIndex((it) => it.id === startId) : -1;
    setItems(q);
    setIdx(at > 0 ? at : 0);
    setPhase(q.length === 0 ? 'summary' : 'play');
    statsRef.current = { sec: 0, pts: 0, done: 0, skipped: 0 };
    savedElapsedRef.current = { ...(savedElapsed || {}) };
    setPaused(false);
  }, [visible]);

  const item = items[idx];

  // Auto-start the clock whenever a task appears — resuming from where it was
  // if the student skipped away from it earlier.
  useEffect(() => {
    if (!visible || phase !== 'play' || !item) return;
    accumRef.current = savedElapsedRef.current[item.id] || 0;
    startedAtRef.current = Date.now();
    buzzedRef.current = false;
    advancingRef.current = false;
    setPaused(false);
  }, [idx, phase, visible, item?.id]);

  // The 500ms pulse that redraws the clock and fires the target buzz.
  useEffect(() => {
    if (!visible || phase !== 'play') return;
    const t = setInterval(() => {
      setTick((n) => n + 1);
      if (item && item.targetSec > 0 && !buzzedRef.current) {
        const remaining = Math.max(0, item.targetSec - (item.priorSec || 0)) - elapsed();
        if (remaining <= 0) {
          buzzedRef.current = true;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      }
    }, 500);
    return () => clearInterval(t);
  }, [visible, phase, item?.id]);

  if (!visible) return null;

  const pauseClock = () => {
    if (startedAtRef.current) {
      accumRef.current += (Date.now() - startedAtRef.current) / 1000;
      startedAtRef.current = null;
    }
    setPaused(true);
  };
  const resumeClock = () => {
    if (!startedAtRef.current) startedAtRef.current = Date.now();
    setPaused(false);
  };

  // Tell the parent where the run stands so it survives closing the player
  // (and the app): every task's stashed clock + which task the student was on.
  const reportProgress = (lastItemId) => {
    if (!onProgress) return;
    onProgress({ elapsedById: { ...savedElapsedRef.current }, lastItemId: lastItemId || null });
  };

  const advance = () => {
    if (idx + 1 < items.length) setIdx(idx + 1);
    else { setPhase('summary'); reportProgress(null); }
  };

  // Save the current task's clock when leaving it WITHOUT completing (skip,
  // back, exit) — the student never has to press pause. Teacher tasks bank
  // their real seconds to Firestore in the background (points included,
  // partial pays); plan sessions stash the clock so it resumes on revisit.
  // Never awaited — transitions must feel instant.
  const stashCurrent = () => {
    if (!item) return;
    const sec = elapsed();
    pauseClock();
    if (sec <= 1) return;
    statsRef.current.sec += sec;
    if (item.kind === 'teacher') {
      const itemId = item.id;
      // Keep this run's copy in sync so revisiting shows the right remaining time.
      setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, priorSec: (it.priorSec || 0) + sec } : it)));
      delete savedElapsedRef.current[itemId];
      Promise.resolve(onBankTeacher(item.taskId, sec))
        .then((pts) => { statsRef.current.pts += pts || 0; })
        .catch(() => { /* best-effort; the old surfaces re-sync */ });
    } else if (item.kind === 'gigsong') {
      // Rehearsal time banks immediately — the song item doesn't persist
      // across runs, so a local stash would lose it.
      delete savedElapsedRef.current[item.id];
      Promise.resolve(onBankSong && onBankSong(sec))
        .then((pts) => { statsRef.current.pts += pts || 0; })
        .catch(() => {});
    } else {
      savedElapsedRef.current[item.id] = sec;
    }
  };

  // Done: sessions award via the normal completion path; teacher tasks bank the
  // real seconds practiced (partial pays, target auto-completes) — the same
  // writes the old cards made, but fired in the background so the next task
  // appears instantly.
  const handleDone = () => {
    if (!item || advancingRef.current) return;
    advancingRef.current = true;
    const cur = item;
    const sec = elapsed();
    pauseClock();
    statsRef.current.sec += sec;
    statsRef.current.done += 1;
    delete savedElapsedRef.current[cur.id];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const write = cur.kind === 'session' ? onCompleteSession(cur.sessionId)
      : cur.kind === 'gigsong' ? onBankSong(sec)
      : cur.kind === 'songstep' ? onBankStep(cur.stepId, sec)
      : onBankTeacher(cur.taskId, sec);
    Promise.resolve(write)
      .then((pts) => {
        statsRef.current.pts += pts || 0;
        const emoji = cur.kind === 'teacher' ? '⭐' : cur.kind === 'gigsong' ? '🎤' : '🎸';
        setCeleb({ points: pts || 0, emoji, subtitle: 'Prova points' });
      })
      .catch(() => { /* keep flowing; the old surfaces will re-sync */ });
    // A finished set song hands back to the song picker — the student chooses
    // to rehearse another or move on to the day's tasks.
    if (cur.kind === 'gigsong' && onGigSongEnd) { reportProgress(null); onGigSongEnd(); return; }
    reportProgress(idx + 1 < items.length ? items[idx + 1].id : null);
    advance();
  };

  // Skip: the time already on the clock is saved automatically, then move on.
  const handleSkip = () => {
    if (!item || advancingRef.current) return;
    advancingRef.current = true;
    const wasGigSong = item.kind === 'gigsong';
    stashCurrent();
    statsRef.current.skipped += 1;
    if (wasGigSong && onGigSongEnd) { reportProgress(null); onGigSongEnd(); return; }
    reportProgress(idx + 1 < items.length ? items[idx + 1].id : null);
    advance();
  };

  // Leaving mid-task keeps the progress too — clock stashed, position saved —
  // so the parent can offer "Resume practice" at this exact task.
  const handleClose = () => {
    if (phase === 'play' && item) {
      stashCurrent();
      reportProgress(item.id);
    }
    onClose();
  };

  const target = item ? Math.max(0, (item.targetSec || 0) - (item.priorSec || 0)) : 0;
  const remaining = target > 0 ? Math.max(0, target - elapsed()) : 0;
  const reached = target > 0 && remaining <= 0;
  const color = item ? (CATEGORY_COLORS[item.category] || COLORS.primary) : COLORS.primary;
  // Any task with a set time locks Done until the clock runs out (banked time
  // from earlier laps counts). Open-ended teacher tasks and setlist rehearsals
  // just need real time on the clock.
  const doneEnabled = item && (target > 0 ? reached : (item.kind === 'session' ? true : elapsed() > 0));

  const stats = statsRef.current;

  const goBack = () => {
    if (idx === 0 || advancingRef.current) return;
    advancingRef.current = true;
    stashCurrent(); // going back also keeps this task's time
    reportProgress(items[idx - 1].id);
    setIdx(idx - 1);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaProvider>
      <InsetShell>
        {phase === 'play' && item ? (
          <>
            <View style={styles.topBar}>
              <TouchableOpacity style={styles.closeBtn} onPress={handleClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
                <Ionicons name="close" size={26} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.progressText}>{idx + 1} of {items.length}</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
              <View style={[styles.kickerPill, { backgroundColor: color + '22' }]}>
                <Text style={[styles.kickerText, { color }]}>
                  {item.kind === 'teacher' ? 'FROM YOUR TEACHER'
                    : item.kind === 'gigsong' ? 'GIG REHEARSAL'
                    : item.kind === 'songstep' ? 'LEARN A SONG'
                    : (item.category || '').replace('_', ' ').toUpperCase()}
                </Text>
              </View>
              <Text style={styles.title}>{item.title}</Text>

              {/* The clock: counts DOWN when there's a set time, up otherwise. */}
              <View style={[styles.clockRing, { borderColor: reached ? COLORS.success : color }]}>
                <Text style={[styles.clock, reached && { color: COLORS.success }]}>
                  {target > 0 ? fmt(remaining) : fmt(elapsed())}
                </Text>
                <Text style={styles.clockSub}>
                  {/* Always show the task's actual set time — the countdown already
                      accounts for minutes banked earlier. */}
                  {reached ? 'Time — tap Done when ready' : target > 0 ? `of ${fmt(item.targetSec)}` : 'open practice'}
                </Text>
              </View>

              {!!item.description && <Text style={styles.desc}>{item.description}</Text>}

              {!!item.watch && (
                <TouchableOpacity
                  style={styles.watchRow}
                  onPress={() => { pauseClock(); setWatch({ query: item.watch, title: item.title }); }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="play-circle" size={20} color={COLORS.primary} />
                  <Text style={styles.watchText} numberOfLines={1}>Watch a tutorial</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}

              {/* Your teacher's comment on this task. Capped to three lines
                  so a long one can't push the clock and controls off screen;
                  tap to read the whole thing. */}
              {item.kind === 'teacher' && !!(item.feedback || '').trim() && (
                <TouchableOpacity
                  style={styles.fbCard}
                  onPress={() => { pauseClock(); setNote({ title: item.title, body: item.feedback }); }}
                  activeOpacity={0.8}
                >
                  <View style={styles.fbHead}>
                    <Ionicons name="chatbubble-ellipses" size={13} color={COLORS.primary} />
                    <Text style={styles.fbWho}>From your teacher</Text>
                    <Text style={styles.fbMore}>Read</Text>
                  </View>
                  <Text style={styles.fbBody} numberOfLines={3}>{item.feedback.trim()}</Text>
                </TouchableOpacity>
              )}

              {/* Proof is one button. Nothing plays until you ask it to —
                  opening a video unprompted in the middle of a timed task is
                  the last thing you want. */}
              {item.kind === 'teacher' && (
                item.proofUrl ? (
                  <TouchableOpacity
                    style={styles.proofBtn}
                    onPress={() => { pauseClock(); setProofFor(item.taskId); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={item.proofVerified ? 'checkmark-circle' : 'videocam'}
                      size={15}
                      color={item.proofVerified ? COLORS.success : COLORS.primary}
                    />
                    <Text style={styles.proofBtnText}>
                      {item.proofVerified ? 'Proof verified' : 'Your proof'}
                      {proofCount(item.taskId) > 1 ? ` · ${proofCount(item.taskId)}` : ''}
                    </Text>
                    <Ionicons name="chevron-forward" size={15} color={COLORS.primary} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.proofBtn}
                    onPress={() => onAttachProof(item.taskId)}
                    disabled={proofBusyId === item.taskId}
                    activeOpacity={0.8}
                  >
                    {proofBusyId === item.taskId
                      ? <Ghost size="small" color={COLORS.primary} />
                      : <Ionicons name="videocam-outline" size={15} color={COLORS.primary} />}
                    <Text style={styles.proofBtnText}>
                      {proofBusyId === item.taskId
                        ? (proofPct != null ? `Uploading… ${proofPct}%` : (proofStep || 'Uploading…'))
                        : 'Add proof of practice'}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </ScrollView>

            <View style={styles.controls}>
              <TouchableOpacity style={styles.pauseBtn} onPress={paused ? resumeClock : pauseClock} activeOpacity={0.8}>
                <Ionicons name={paused ? 'play' : 'pause'} size={18} color={COLORS.text} />
                <Text style={styles.pauseText}>{paused ? 'Resume' : 'Pause'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.doneBtn, { backgroundColor: doneEnabled ? color : COLORS.card }]}
                onPress={handleDone}
                disabled={!doneEnabled}
                activeOpacity={0.85}
              >
                <Ionicons name={doneEnabled ? 'checkmark' : 'lock-closed'} size={18} color={doneEnabled ? COLORS.text : COLORS.textMuted} />
                <Text style={[styles.doneText, !doneEnabled && { color: COLORS.textMuted }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.bottomRow}>
              {idx > 0 ? (
                <TouchableOpacity style={styles.backBtn} onPress={goBack} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10 }}>
                  <Ionicons name="chevron-back" size={15} color={COLORS.textMuted} />
                  <Text style={styles.skipText}>Previous</Text>
                </TouchableOpacity>
              ) : <View style={{ width: 90 }} />}
              <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10 }}>
                <Text style={styles.skipText}>{idx + 1 < items.length ? 'Next' : 'Finish'}</Text>
                <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          // ── Summary ──
          <View style={styles.summaryWrap}>
            <Text style={styles.summaryEmoji}>{stats.done > 0 ? '🎉' : '👋'}</Text>
            <Text style={styles.summaryTitle}>{stats.done > 0 ? 'Practice done!' : 'See you next time'}</Text>
            <View style={styles.summaryStatsRow}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryNum}>{Math.max(1, Math.round(stats.sec / 60))}</Text>
                <Text style={styles.summaryLabel}>MINUTES</Text>
              </View>
              <View style={styles.summaryDividerV} />
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryNum, { color: COLORS.accent }]}>+{Math.round(stats.pts)}</Text>
                <Text style={styles.summaryLabel}>POINTS</Text>
              </View>
              <View style={styles.summaryDividerV} />
              <View style={styles.summaryStat}>
                <Text style={styles.summaryNum}>🔥 {streak || 0}</Text>
                <Text style={styles.summaryLabel}>STREAK</Text>
              </View>
            </View>
            <Text style={styles.summarySub}>
              {stats.done} task{stats.done === 1 ? '' : 's'} done{stats.skipped > 0 ? ` · ${stats.skipped} skipped` : ''}
            </Text>
            {allSessionsDone && stats.done > 0 ? (
              <TouchableOpacity style={styles.reviewBtn} onPress={onFinishReview} activeOpacity={0.85}>
                <Text style={styles.reviewBtnText}>How did today go? →</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.finishBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.finishText}>{allSessionsDone && stats.done > 0 ? 'Maybe later' : 'Finish'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Nested so it stacks over this full-screen modal (same pattern as the
            library topic modal). */}
        <YouTubePlayerModal
          visible={!!watch}
          query={watch?.query}
          title={watch?.title || 'Watch'}
          onClose={() => setWatch(null)}
        />

        {/* Proof: watch it, record another, or delete it. Nested inside the
            player so it stacks over this full-screen modal. */}
        <SheetModal
          visible={proofFor != null}
          onRequestClose={() => setProofFor(null)}
          centered
          dismissOnBackdrop
          cardStyle={styles.proofCard}
        >
          {(() => {
            if (proofFor == null) return null;
            const clips = clipsFor(proofFor);
            if (!clips.length) return null;
            const i = Math.min(proofIdx, clips.length - 1);
            const cur = clips[i];
            const busy = proofBusyId === proofFor;
            return (
              <>
                <Text style={styles.proofTitle}>
                  {clips.length > 1 ? `Your proof · ${i + 1} of ${clips.length}` : 'Your proof'}
                </Text>
                <ProofMedia key={cur.url} url={cur.url} type={cur.type || 'video'} style={styles.proofSheetMedia} />

                {clips.length > 1 && (
                  <View style={styles.proofPager}>
                    <TouchableOpacity
                      onPress={() => setProofIdx((n) => Math.max(0, n - 1))}
                      disabled={i === 0}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="chevron-back-circle" size={28} color={i === 0 ? COLORS.border : COLORS.text} />
                    </TouchableOpacity>
                    <Text style={styles.proofPagerText}>{i + 1} / {clips.length}</Text>
                    <TouchableOpacity
                      onPress={() => setProofIdx((n) => Math.min(clips.length - 1, n + 1))}
                      disabled={i >= clips.length - 1}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="chevron-forward-circle" size={28} color={i >= clips.length - 1 ? COLORS.border : COLORS.text} />
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.proofAction}
                  onPress={() => onAttachProof(proofFor)}
                  disabled={busy}
                  activeOpacity={0.85}
                >
                  {busy
                    ? <Ghost size="small" color={COLORS.primary} />
                    : <Ionicons name="videocam-outline" size={17} color={COLORS.primary} />}
                  <Text style={styles.proofActionText}>
                    {busy
                      ? (proofPct != null ? `Uploading… ${proofPct}%` : (proofStep || 'Uploading…'))
                      : 'Record another'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.proofAction, styles.proofDelete]}
                  onPress={async () => {
                    const gone = await onDeleteProof?.(proofFor, i);
                    if (gone) setProofIdx((n) => Math.max(0, n - 1));
                  }}
                  disabled={busy}
                  activeOpacity={0.85}
                >
                  <Ionicons name="trash-outline" size={17} color={COLORS.error} />
                  <Text style={[styles.proofActionText, { color: COLORS.error }]}>Delete this one</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.noteClose} onPress={() => setProofFor(null)} activeOpacity={0.85}>
                  <Text style={styles.noteCloseText}>Close</Text>
                </TouchableOpacity>
              </>
            );
          })()}
        </SheetModal>

        {/* The teacher's comment in full — the card in the scroll view is
            capped at three lines so it can't shove the clock off screen. */}
        <SheetModal
          visible={!!note}
          onRequestClose={() => setNote(null)}
          centered
          dismissOnBackdrop
          cardStyle={styles.noteCard}
        >
          <View style={styles.noteHead}>
            <Ionicons name="chatbubble-ellipses" size={15} color={COLORS.primary} />
            <Text style={styles.noteWho}>From your teacher</Text>
          </View>
          {!!note?.title && <Text style={styles.noteTask} numberOfLines={2}>{note.title}</Text>}
          <ScrollView style={styles.noteScroll} contentContainerStyle={{ paddingBottom: SPACING.sm }}>
            <Text style={styles.noteBody}>{note?.body}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.noteClose} onPress={() => setNote(null)} activeOpacity={0.85}>
            <Text style={styles.noteCloseText}>Close</Text>
          </TouchableOpacity>
        </SheetModal>

        <Celebration data={celeb} onDone={() => setCeleb(null)} />
      </InsetShell>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.card,
    alignItems: 'center', justifyContent: 'center',
  },
  progressText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '700' },
  body: { alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.md, paddingBottom: SPACING.lg },
  kickerPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, marginBottom: SPACING.md },
  kickerText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: COLORS.text, fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.xl, lineHeight: 30 },
  clockRing: {
    width: 210, height: 210, borderRadius: 105, borderWidth: 5,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xl,
  },
  clock: { color: COLORS.text, fontSize: 48, fontWeight: '800', fontVariant: ['tabular-nums'] },
  clockSub: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600', marginTop: 4 },
  desc: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: SPACING.md },
  watchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, backgroundColor: COLORS.card, marginBottom: SPACING.sm },
  watchText: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  proofBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.sm, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.primary + '40', backgroundColor: COLORS.primary + '12' },
  proofBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  proofNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  proofNoteText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  proofReplaceLink: { color: COLORS.primary, fontSize: 13, fontWeight: '700', marginLeft: 6 },

  // proof sheet — opened from the button, never on its own
  proofCard: { padding: SPACING.lg, borderRadius: 20, maxHeight: '86%' },
  proofTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800', marginBottom: SPACING.md },
  proofSheetMedia: { width: '100%', aspectRatio: 16 / 10, borderRadius: 14, overflow: 'hidden', backgroundColor: COLORS.card },
  proofPager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, marginTop: SPACING.sm },
  proofPagerText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700', minWidth: 52, textAlign: 'center' },
  proofAction: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: SPACING.sm, paddingVertical: 13, borderRadius: 13,
    borderWidth: 1, borderColor: COLORS.primary + '44', backgroundColor: COLORS.primary + '14',
  },
  proofActionText: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  proofDelete: { borderColor: COLORS.error + '44', backgroundColor: COLORS.error + '12' },

  // teacher's comment — a solid card, not a tint. It has to be as readable as
  // the task description sitting right above it.
  //
  // alignSelf:'stretch' because the scroll body centres its children, which
  // sized this to its longest line instead of the column. Blue is down to the
  // icon and the Read affordance — the left accent rule and the coloured
  // heading made a comment card louder than the task it belongs to.
  // It read as transparent because COLORS.card sits ~1.15 contrast off the
  // background in Sky. raisedSurface() picks whichever token actually steps
  // off the page in the current theme, and a 1.5px border plus a shadow give
  // it an edge — in a near-black UI the border does more work than the fill.
  fbCard: {
    alignSelf: 'stretch',
    marginTop: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, borderRadius: 14,
    backgroundColor: raisedSurface(COLORS),
    borderWidth: 1.5, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  fbHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  fbWho: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 },
  fbMore: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  fbBody: { color: COLORS.text, fontSize: 14, lineHeight: 21, textAlign: 'left' },

  noteCard: { padding: SPACING.lg, borderRadius: 20, maxHeight: '76%' },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  noteWho: { color: COLORS.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  noteTask: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 6 },
  noteScroll: { marginTop: SPACING.md },
  noteBody: { color: COLORS.text, fontSize: 15, lineHeight: 23 },
  noteClose: {
    marginTop: SPACING.md, paddingVertical: 13, borderRadius: 13,
    backgroundColor: COLORS.card, alignItems: 'center',
  },
  noteCloseText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  controls: { flexDirection: 'row', gap: SPACING.md, paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm },
  pauseBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  pauseText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  doneBtn: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16 },
  doneText: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  bottomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, marginBottom: 4,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 8 },
  skipBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 8 },
  skipText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
  summaryWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  summaryEmoji: { fontSize: 56, marginBottom: SPACING.md },
  summaryTitle: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.xl },
  summaryStatsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  summaryStat: { alignItems: 'center', paddingHorizontal: SPACING.lg },
  summaryNum: { color: COLORS.text, fontSize: 26, fontWeight: '800' },
  summaryLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 4 },
  summaryDividerV: { width: 1, height: 34, backgroundColor: COLORS.border },
  summarySub: { color: COLORS.textSecondary, fontSize: 14, marginBottom: SPACING.xl },
  reviewBtn: { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 15, paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm },
  reviewBtnText: { color: COLORS.onPrimary, fontSize: 16, fontWeight: '800' },
  finishBtn: { paddingVertical: 12 },
  finishText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '600' },
}));
