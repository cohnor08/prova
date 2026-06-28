import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator, Linking, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';
import { generateSongPlan } from '../../lib/claude';
import { POINTS_PER_MIN } from '../../lib/score';

const ytUrl = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const stepPoints = (seconds) => Math.round((seconds / 60) * POINTS_PER_MIN);
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Build a deduped list of {title, artist} the user already has, to power search.
function ownedSongs(userData) {
  const out = [];
  const seen = new Set();
  const push = (title, artist) => {
    const t = (title || '').trim();
    if (!t) return;
    const k = `${t.toLowerCase()}|${(artist || '').trim().toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ title: t, artist: (artist || '').trim() });
  };
  (userData?.songLibrary || []).forEach((s) => push(s.title, s.artist));
  (userData?.setlists || []).forEach((sl) => (sl.songs || []).forEach((s) => push(s.title, s.artist)));
  return out;
}

export default function LearnSongScreen({ navigation }) {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedSong, setExpandedSong] = useState(null);
  const [openSteps, setOpenSteps] = useState(new Set()); // `${songKey}_${stepId}` of expanded steps

  // Add / generate modal
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [freeTitle, setFreeTitle] = useState('');
  const [freeArtist, setFreeArtist] = useState('');
  const [generating, setGenerating] = useState(false);

  // One active practice timer across the whole screen.
  const [active, setActive] = useState(null); // { songKey, stepId, seconds }
  const tickRef = useRef(null);

  const load = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    const snap = await getDoc(doc(db, 'users', uid));
    setUserData(snap.exists() ? snap.data() : {});
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [load, navigation]);

  useEffect(() => () => clearInterval(tickRef.current), []);

  const instrument = userData?.instrument === 'Bass' ? 'Bass' : 'Guitar';
  const songs = userData?.learningSongs || [];

  const persist = async (nextSongs, addedScore = 0, extra = {}) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const patch = { learningSongs: nextSongs, ...extra };
    if (addedScore) patch.provaScore = (userData?.provaScore || 0) + addedScore;
    setUserData((u) => ({ ...(u || {}), ...patch }));
    await setDoc(doc(db, 'users', uid), patch, { merge: true });
  };

  // ── Generate a new song plan ──────────────────────────────────────────────
  const handleGenerate = async (title, artist) => {
    const t = (title || '').trim();
    if (!t) { Alert.alert('Pick a song', 'Enter a song title first.'); return; }
    Keyboard.dismiss();
    setGenerating(true);
    try {
      const plan = await generateSongPlan({ instrument, title: t, artist: (artist || '').trim() });
      const entry = {
        songKey: plan.key,
        title: plan.title,
        artist: plan.artist,
        instrument: plan.instrument,
        overview: plan.overview,
        addedAt: new Date().toISOString(),
        steps: (plan.steps || []).map((s) => ({ ...s, done: false, practicedSec: 0 })),
      };
      // Replace if the same song is already in the list.
      const next = [entry, ...songs.filter((s) => s.songKey !== plan.key)];

      // Also drop it into the song library so it shows up in "songs to practise".
      const lib = userData?.songLibrary || [];
      const inLib = lib.some(
        (s) => (s.title || '').toLowerCase() === plan.title.toLowerCase()
          && (s.artist || '').toLowerCase() === (plan.artist || '').toLowerCase()
      );
      const nextLib = inLib
        ? lib
        : [{ id: `lib_${Date.now()}`, title: plan.title, artist: plan.artist || '', addedAt: new Date().toISOString() }, ...lib];

      await persist(next, 0, { songLibrary: nextLib });
      setAddOpen(false);
      setSearch(''); setFreeTitle(''); setFreeArtist('');
      setExpandedSong(plan.key);
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.toLowerCase().includes('limit reached')) {
        Alert.alert('Weekly limit reached', "You've used your 5 song plans for this week. They reset next week — already-generated songs stay free to practise.");
      } else {
        Alert.alert('Could not build a plan', 'Something went wrong generating that song. Please try again.');
      }
    } finally {
      setGenerating(false);
    }
  };

  const removeSong = (songKey) => {
    Alert.alert('Remove song', 'Remove this song and its steps from your list?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => persist(songs.filter((s) => s.songKey !== songKey)) },
    ]);
  };

  // ── Per-step practice timer ───────────────────────────────────────────────
  const startStep = (songKey, stepId) => {
    clearInterval(tickRef.current);
    // Practising (again) un-completes the step so it lights up while you work on it.
    const next = songs.map((s) =>
      s.songKey === songKey
        ? { ...s, steps: s.steps.map((st) => (st.id === stepId ? { ...st, done: false } : st)) }
        : s
    );
    persist(next);
    setActive({ songKey, stepId, seconds: 0 });
    tickRef.current = setInterval(() => {
      setActive((a) => (a ? { ...a, seconds: a.seconds + 1 } : a));
    }, 1000);
  };

  const stopStep = () => {
    clearInterval(tickRef.current);
    setActive(null);
  };

  const finishStep = async () => {
    if (!active) return;
    clearInterval(tickRef.current);
    const { songKey, stepId, seconds } = active;
    const gained = stepPoints(seconds);
    const next = songs.map((s) => {
      if (s.songKey !== songKey) return s;
      return {
        ...s,
        steps: s.steps.map((st) =>
          st.id === stepId
            ? { ...st, done: true, practicedSec: (st.practicedSec || 0) + seconds }
            : st
        ),
      };
    });
    setActive(null);
    await persist(next, gained);
    if (gained > 0) Alert.alert('Step complete', `+${gained} Prova points 🎸`);
  };

  const toggleStepOpen = (stepKey) => {
    setOpenSteps((prev) => {
      const next = new Set(prev);
      next.has(stepKey) ? next.delete(stepKey) : next.add(stepKey);
      return next;
    });
  };

  const toggleStepDone = async (songKey, stepId) => {
    const next = songs.map((s) =>
      s.songKey === songKey
        ? { ...s, steps: s.steps.map((st) => (st.id === stepId ? { ...st, done: !st.done } : st)) }
        : s
    );
    await persist(next);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const results = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return ownedSongs(userData)
      .filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(q))
      .slice(0, 8);
  })();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Learn a Song</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING.xxl }}>
          <Text style={styles.intro}>
            Pick any song and Prova builds the exact steps to learn it on {instrument.toLowerCase()} — from the first chords to full speed.
          </Text>

          <TouchableOpacity style={styles.addBtn} onPress={() => setAddOpen(true)} activeOpacity={0.85}>
            <Ionicons name="add-circle" size={22} color={COLORS.background} />
            <Text style={styles.addBtnText}>Learn a new song</Text>
          </TouchableOpacity>

          {songs.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="musical-notes-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No songs yet. Add one above to get a step-by-step plan.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>YOUR SONGS</Text>
              {songs.map((s) => {
                const done = s.steps.filter((st) => st.done).length;
                const total = s.steps.length;
                const open = expandedSong === s.songKey;
                return (
                  <View key={s.songKey} style={styles.songCard}>
                    <TouchableOpacity
                      style={styles.songHeader}
                      onPress={() => setExpandedSong(open ? null : s.songKey)}
                      activeOpacity={0.8}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.songTitle} numberOfLines={open ? 3 : 1}>{s.title}</Text>
                        {!!s.artist && <Text style={styles.songArtist}>{s.artist}</Text>}
                        <Text style={styles.songProgress}>{done}/{total} steps · {done === total ? 'Learned 🎉' : 'In progress'}</Text>
                      </View>
                      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>

                    {open && (
                      <View style={styles.songBody}>
                        {!!s.overview && <Text style={styles.overview}>{s.overview}</Text>}
                        {s.steps.map((st, i) => {
                          const isActive = active && active.songKey === s.songKey && active.stepId === st.id;
                          const stepKey = `${s.songKey}_${st.id}`;
                          const stepOpen = openSteps.has(stepKey) || isActive; // a running timer forces it open
                          return (
                            <View key={st.id} style={[styles.step, st.done && styles.stepDone]}>
                              <View style={styles.stepHeadRow}>
                                <TouchableOpacity onPress={() => toggleStepDone(s.songKey, st.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                  <Ionicons
                                    name={st.done ? 'checkmark-circle' : 'ellipse-outline'}
                                    size={22}
                                    color={st.done ? COLORS.success : COLORS.textMuted}
                                  />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.stepHeadMain} onPress={() => toggleStepOpen(stepKey)} activeOpacity={0.7}>
                                  <Text style={[styles.stepTitle, st.done && styles.stepTitleDone]} numberOfLines={stepOpen ? undefined : 1}>
                                    {i + 1}. {st.title}{st.targetBpm ? `  ·  ${st.targetBpm} BPM` : ''}
                                  </Text>
                                  <Ionicons name={stepOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
                                </TouchableOpacity>
                              </View>

                              {stepOpen && (
                                <>
                                  {!!st.summary && <Text style={styles.stepSummary}>{st.summary}</Text>}
                                  {(st.tasks || []).map((t, ti) => (
                                    <View key={ti} style={styles.taskRow}>
                                      <Text style={styles.taskDot}>•</Text>
                                      <Text style={styles.taskText}>{t}</Text>
                                    </View>
                                  ))}
                                  {!!st.yt && (
                                    <TouchableOpacity style={styles.watchRow} onPress={() => Linking.openURL(ytUrl(st.yt))}>
                                      <Ionicons name="logo-youtube" size={16} color={COLORS.error} />
                                      <Text style={styles.watchText}>Watch a tutorial</Text>
                                    </TouchableOpacity>
                                  )}

                                  {isActive ? (
                                    <View style={styles.timerRow}>
                                      <Text style={styles.timerClock}>{fmtClock(active.seconds)}</Text>
                                      <Text style={styles.timerPts}>+{stepPoints(active.seconds)} pts</Text>
                                      <TouchableOpacity style={styles.timerGhost} onPress={stopStep}>
                                        <Text style={styles.timerGhostText}>Cancel</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity style={styles.timerDone} onPress={finishStep}>
                                        <Text style={styles.timerDoneText}>Done</Text>
                                      </TouchableOpacity>
                                    </View>
                                  ) : (
                                    <TouchableOpacity style={styles.practiceBtn} onPress={() => startStep(s.songKey, st.id)}>
                                      <Ionicons name="play" size={14} color={COLORS.primary} />
                                      <Text style={styles.practiceBtnText}>{st.done ? 'Practise again' : 'Practise'}</Text>
                                    </TouchableOpacity>
                                  )}
                                </>
                              )}
                            </View>
                          );
                        })}

                        <TouchableOpacity style={styles.removeRow} onPress={() => removeSong(s.songKey)}>
                          <Ionicons name="trash-outline" size={15} color={COLORS.textSecondary} />
                          <Text style={styles.removeText}>Remove song</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* Add / generate modal */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => !generating && setAddOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Learn a song</Text>
              <TouchableOpacity onPress={() => !generating && setAddOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {generating ? (
              <View style={styles.genBox}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.genText}>Building your step-by-step plan…</Text>
                <Text style={styles.genHint}>This can take a few seconds.</Text>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
                <Text style={styles.fieldLabel}>Search your songs & setlists</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Search a song you've saved…"
                  placeholderTextColor={COLORS.textMuted}
                  value={search}
                  onChangeText={setSearch}
                />
                {results.map((r, i) => (
                  <TouchableOpacity key={i} style={styles.resultRow} onPress={() => handleGenerate(r.title, r.artist)}>
                    <Ionicons name="musical-note" size={16} color={COLORS.primary} />
                    <Text style={styles.resultText} numberOfLines={1}>
                      {r.title}{r.artist ? ` — ${r.artist}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}

                <View style={styles.divider}><Text style={styles.dividerText}>OR TYPE ANY SONG</Text></View>

                <Text style={styles.fieldLabel}>Song title</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Wonderwall"
                  placeholderTextColor={COLORS.textMuted}
                  value={freeTitle}
                  onChangeText={setFreeTitle}
                />
                <Text style={styles.fieldLabel}>Artist (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Oasis"
                  placeholderTextColor={COLORS.textMuted}
                  value={freeArtist}
                  onChangeText={setFreeArtist}
                />

                <TouchableOpacity
                  style={[styles.genBtn, !freeTitle.trim() && styles.genBtnOff]}
                  onPress={() => handleGenerate(freeTitle, freeArtist)}
                  disabled={!freeTitle.trim()}
                >
                  <Text style={styles.genBtnText}>Build my plan</Text>
                </TouchableOpacity>
                <Text style={styles.capHint}>5 new song plans per week. Songs already learned are free to practise.</Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 26 },
  navTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  intro: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: SPACING.md },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14,
    marginBottom: SPACING.lg,
  },
  addBtnText: { color: COLORS.background, fontSize: 15, fontWeight: '700' },

  empty: { alignItems: 'center', paddingVertical: SPACING.xxl, gap: SPACING.sm },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: SPACING.lg },

  sectionLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: SPACING.sm },

  songCard: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm, overflow: 'hidden' },
  songHeader: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.sm },
  songTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  songArtist: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  songProgress: { color: COLORS.accent, fontSize: 12, marginTop: 4, fontWeight: '600' },
  songBody: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
  overview: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: SPACING.sm, fontStyle: 'italic' },

  step: { backgroundColor: COLORS.surface, borderRadius: 10, padding: SPACING.sm, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  stepDone: { opacity: 0.7 },
  stepHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepHeadMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700', flex: 1 },
  stepTitleDone: { textDecorationLine: 'line-through', color: COLORS.textSecondary },
  stepSummary: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 },
  taskRow: { flexDirection: 'row', marginTop: 4, paddingLeft: 4 },
  taskDot: { color: COLORS.primary, fontSize: 13, marginRight: 6 },
  taskText: { color: COLORS.text, fontSize: 13, lineHeight: 18, flex: 1 },
  watchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  watchText: { color: COLORS.error, fontSize: 13, fontWeight: '600' },

  practiceBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' },
  practiceBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },

  timerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 10 },
  timerClock: { color: COLORS.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timerPts: { color: COLORS.accent, fontSize: 13, fontWeight: '700', flex: 1 },
  timerGhost: { paddingVertical: 6, paddingHorizontal: 12 },
  timerGhostText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  timerDone: { backgroundColor: COLORS.success, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  timerDoneText: { color: COLORS.background, fontSize: 13, fontWeight: '700' },

  removeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.xs, alignSelf: 'flex-start' },
  removeText: { color: COLORS.textSecondary, fontSize: 13 },

  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.md, maxHeight: '85%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  fieldLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: SPACING.sm },
  input: { backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  resultText: { color: COLORS.text, fontSize: 14, flex: 1 },
  divider: { alignItems: 'center', marginVertical: SPACING.md },
  dividerText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  genBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.md },
  genBtnOff: { opacity: 0.4 },
  genBtnText: { color: COLORS.background, fontSize: 15, fontWeight: '700' },
  capHint: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center', marginTop: SPACING.sm, marginBottom: SPACING.sm },
  genBox: { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  genText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  genHint: { color: COLORS.textMuted, fontSize: 13 },
});
