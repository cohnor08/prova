import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING } from '../constants/theme';
import YouTubePlayerModal from './YouTubePlayerModal';

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

const CATEGORY_COLORS = {
  warmup: '#06B6D4',
  technique: '#3B82F6',
  theory: '#8B5CF6',
  ear_training: '#10B981',
  repertoire: '#0EA5E9',
  improvisation: '#6366F1',
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
  onAttachProof,
  proofBusyId,
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

  // Timestamp-based timing so a locked phone doesn't drift the clock.
  const startedAtRef = useRef(null);
  const accumRef = useRef(0);
  const buzzedRef = useRef(false);
  const advancingRef = useRef(false); // swallow double-taps during a transition
  const statsRef = useRef({ sec: 0, pts: 0, done: 0, skipped: 0 });
  const savedElapsedRef = useRef({}); // itemId -> seconds on the clock, resumes on revisit

  const elapsed = () => accumRef.current + (startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0);

  // Build the run when the player opens: rotate the queue so the tapped task
  // goes first, the rest follow in order. Clocks stashed in an earlier run
  // today carry over, so exiting never loses time.
  useEffect(() => {
    if (!visible) return;
    let q = [...(queue || [])];
    if (startId) {
      const at = q.findIndex((it) => it.id === startId);
      if (at > 0) q = [...q.slice(at), ...q.slice(0, at)];
    }
    setItems(q);
    setIdx(0);
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
      : onBankTeacher(cur.taskId, sec);
    Promise.resolve(write)
      .then((pts) => { statsRef.current.pts += pts || 0; })
      .catch(() => { /* keep flowing; the old surfaces will re-sync */ });
    reportProgress(idx + 1 < items.length ? items[idx + 1].id : null);
    advance();
  };

  // Skip: the time already on the clock is saved automatically, then move on.
  const handleSkip = () => {
    if (!item || advancingRef.current) return;
    advancingRef.current = true;
    stashCurrent();
    statsRef.current.skipped += 1;
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

              {item.kind === 'teacher' && (
                item.proofUrl ? (
                  <View style={styles.proofNote}>
                    <Ionicons name={item.proofVerified ? 'checkmark-circle' : 'videocam'} size={15} color={item.proofVerified ? COLORS.success : COLORS.primary} />
                    <Text style={styles.proofNoteText}>{item.proofVerified ? 'Proof verified' : 'Proof submitted'}</Text>
                    <TouchableOpacity onPress={() => onAttachProof(item.taskId)} disabled={proofBusyId === item.taskId} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.proofReplaceLink}>{proofBusyId === item.taskId ? 'Uploading…' : 'Add / Replace'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.proofBtn} onPress={() => onAttachProof(item.taskId)} disabled={proofBusyId === item.taskId} activeOpacity={0.8}>
                    {proofBusyId === item.taskId
                      ? <ActivityIndicator size="small" color={COLORS.primary} />
                      : <Ionicons name="videocam-outline" size={15} color={COLORS.primary} />}
                    <Text style={styles.proofBtnText}>{proofBusyId === item.taskId ? 'Uploading…' : 'Add proof of practice'}</Text>
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
      </InsetShell>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  proofBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.primary + '40', backgroundColor: COLORS.primary + '12' },
  proofBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  proofNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  proofNoteText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  proofReplaceLink: { color: COLORS.primary, fontSize: 13, fontWeight: '700', marginLeft: 6 },
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
  reviewBtnText: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  finishBtn: { paddingVertical: 12 },
  finishText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '600' },
});
