import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  doc, getDoc, updateDoc, collection, query, where, getDocs, arrayUnion,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { displayName } from '../../lib/displayName';
import { COLORS, SPACING } from '../../constants/theme';
import { LIBRARY_TOPICS, LIBRARY_CATEGORIES, LIBRARY_LEVELS } from '../../constants/library';

const INSTRUMENTS = ['Guitar', 'Bass'];

function openYouTube(phrase) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(phrase)}`;
  Linking.openURL(url).catch(() => {});
}

// A teacher-added link: open it directly if it's a URL, otherwise treat it as a
// YouTube search phrase.
function openResource(value) {
  const v = (value || '').trim();
  if (/^https?:\/\//i.test(v)) { Linking.openURL(v).catch(() => {}); return; }
  openYouTube(v);
}

function Pill({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.pill, active && styles.pillActive]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ResourceLibraryScreen() {
  const [instrument, setInstrument] = useState('Guitar');
  const [level, setLevel] = useState('Beginner');

  // Teacher-added resources, stored on the teacher's own user doc.
  const [custom, setCustom] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newInstrument, setNewInstrument] = useState('Guitar'); // where this resource is filed
  const [newLevel, setNewLevel] = useState('Beginner');
  const [resSearch, setResSearch] = useState('');       // search across the teacher's own resources
  const [expandedRes, setExpandedRes] = useState(null);

  // The shared lesson-library bank shown right on this page.
  const [librarySearch, setLibrarySearch] = useState('');
  const [libCat, setLibCat] = useState('All');           // category filter for the library
  const [expandedTopic, setExpandedTopic] = useState(null);

  // For assigning a resource / library task to a student or class.
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [assignTarget, setAssignTarget] = useState(null); // { title, url, description } | null

  const loadResources = (uid) => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then((s) => {
        setCustom(Array.isArray(s.data()?.customResources) ? s.data().customResources : []);
        setClasses(Array.isArray(s.data()?.classes) ? s.data().classes : []);
      })
      .catch(() => {});
    getDocs(query(collection(db, 'users'), where('teacherUid', '==', uid)))
      .then((snap) => setStudents(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))))
      .catch(() => {});
  };

  // Load once auth is ready. On a cold reopen this screen can mount before
  // Firebase Auth restores the session, so we wait for the auth state to resolve
  // rather than bailing once and never retrying.
  useEffect(() => {
    if (auth.currentUser?.uid) loadResources(auth.currentUser.uid);
    const unsub = onAuthStateChanged(auth, (u) => { if (u?.uid) loadResources(u.uid); });
    return unsub;
  }, []);

  // Assign the selected resource / task (with its link) to recipients.
  const assignResourceTo = async (recipientUids, klass) => {
    if (!assignTarget || recipientUids.length === 0) return;
    const base = {
      title: assignTarget.title,
      description: assignTarget.description || '',
      youtube: assignTarget.url,
      song: '',
      dueDate: null,
      durationMin: 0,
      completed: false,
      assignedAt: new Date().toISOString(),
      teacherUid: auth.currentUser.uid,
      ...(klass ? { classId: klass.id, className: klass.name } : {}),
    };
    try {
      await Promise.all(
        recipientUids.map((uid, i) =>
          updateDoc(doc(db, 'users', uid), { assignedTasks: arrayUnion({ ...base, id: `${Date.now()}_${i}` }) })
        )
      );
      setAssignTarget(null);
      Alert.alert('Assigned', klass
        ? `Sent to ${recipientUids.length} student${recipientUids.length === 1 ? '' : 's'} in ${klass.name}.`
        : 'Sent to the student.');
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const saveCustom = (next) => {
    setCustom(next);
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { customResources: next }).catch(() => {});
  };

  const resetForm = () => { setNewTitle(''); setNewUrl(''); setNewDesc(''); setEditingId(null); };
  // New resources default to the currently-viewed instrument/level; editing keeps
  // the resource's own.
  const openAdd = () => { resetForm(); setNewInstrument(instrument); setNewLevel(level); setShowAdd(true); };
  const openEdit = (r) => {
    setEditingId(r.id);
    setNewTitle(r.title || '');
    setNewUrl(r.url || '');
    setNewDesc(r.description || '');
    setNewInstrument(r.instrument || 'Guitar');
    setNewLevel(r.level || 'Beginner');
    setShowAdd(true);
  };

  const saveResource = () => {
    if (!newTitle.trim() || !newUrl.trim()) {
      Alert.alert('Add a title and link', 'Both a title and a YouTube link (or search) are needed.');
      return;
    }
    if (editingId) {
      saveCustom(custom.map((x) => x.id === editingId
        ? { ...x, title: newTitle.trim(), url: newUrl.trim(), description: newDesc.trim(), instrument: newInstrument, level: newLevel }
        : x));
    } else {
      const item = { id: Date.now().toString(), title: newTitle.trim(), url: newUrl.trim(), description: newDesc.trim(), instrument: newInstrument, level: newLevel };
      saveCustom([item, ...custom]);
    }
    resetForm(); setShowAdd(false);
  };

  const removeResource = (item) => {
    Alert.alert('Remove resource?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => saveCustom(custom.filter((x) => x.id !== item.id)) },
    ]);
  };

  // The teacher's own links. When searching, match across ALL their resources;
  // otherwise show the ones for the currently selected instrument + level.
  const resQuery = resSearch.trim().toLowerCase();
  const myResources = resQuery
    ? custom.filter((r) =>
        (r.title || '').toLowerCase().includes(resQuery)
        || (r.description || '').toLowerCase().includes(resQuery)
        || (r.url || '').toLowerCase().includes(resQuery))
    : custom.filter((r) => r.instrument === instrument && r.level === level);

  // The shared lesson library. The category chip always applies. Search matches
  // the WHOLE bank; browsing (no search) narrows to the selected instrument
  // (+ 'Both') and level.
  const libQuery = librarySearch.trim().toLowerCase();
  const libraryTopics = LIBRARY_TOPICS.filter((t) => {
    if (libCat !== 'All' && t.category !== libCat) return false;
    if (libQuery) {
      const hay = `${t.title} ${t.summary} ${t.category} ${(t.tags || []).join(' ')}`.toLowerCase();
      return libQuery.split(/\s+/).every((w) => hay.includes(w));
    }
    return (t.instrument === 'Both' || t.instrument === instrument) && t.level === level;
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>TEACHING LIBRARY</Text>
        <Text style={styles.title}>Resources</Text>
        <Text style={styles.subtitle}>Your own links, plus a full searchable lesson library — assign any of it to a student or class.</Text>

        <View style={styles.pillRow}>
          {INSTRUMENTS.map((i) => (
            <Pill key={i} label={i} active={instrument === i} onPress={() => setInstrument(i)} />
          ))}
        </View>
        <View style={styles.pillRow}>
          {LIBRARY_LEVELS.map((l) => (
            <Pill key={l} label={l} active={level === l} onPress={() => setLevel(l)} />
          ))}
        </View>

        {/* ── Your resources ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="bookmark" size={16} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Your resources</Text>
            <TouchableOpacity style={styles.addResBtn} onPress={openAdd} activeOpacity={0.85}>
              <Ionicons name="add" size={16} color={COLORS.primary} />
              <Text style={styles.addResBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {custom.length > 0 && (
            <View style={styles.searchRow}>
              <Ionicons name="search" size={15} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search your resources"
                placeholderTextColor={COLORS.textMuted}
                value={resSearch}
                onChangeText={setResSearch}
                autoCapitalize="none"
              />
              {!!resSearch && (
                <TouchableOpacity onPress={() => setResSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {myResources.length === 0 ? (
            <Text style={styles.emptyRes}>
              {resQuery
                ? `No resources match “${resSearch.trim()}”.`
                : `No links added for ${instrument} · ${level} yet. Tap “Add” to save one.`}
            </Text>
          ) : (
            myResources.map((r) => {
              const open = expandedRes === r.id;
              return (
                <View key={r.id} style={styles.item}>
                  <TouchableOpacity style={styles.customRow} onPress={() => setExpandedRes(open ? null : r.id)} activeOpacity={0.7}>
                    <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={15} color={COLORS.textMuted} />
                    <Text style={[styles.itemTitle, { flex: 1, marginBottom: 0 }]} numberOfLines={1}>{r.title}</Text>
                    {resQuery ? <Text style={styles.resTag}>{r.instrument} · {r.level}</Text> : null}
                  </TouchableOpacity>
                  {open && (
                    <>
                      {!!r.description && <Text style={[styles.itemDetail, { marginTop: SPACING.sm }]}>{r.description}</Text>}
                      <TouchableOpacity style={styles.ytRow} onPress={() => openResource(r.url)} activeOpacity={0.7}>
                        <Ionicons name="logo-youtube" size={15} color="#FF0000" />
                        <Text style={styles.ytText} numberOfLines={1}>Open: {r.url}</Text>
                      </TouchableOpacity>
                      <View style={styles.resActions}>
                        <TouchableOpacity style={styles.resAction} onPress={() => setAssignTarget({ title: r.title, url: r.url, description: r.description || '' })} activeOpacity={0.7}>
                          <Ionicons name="paper-plane-outline" size={14} color={COLORS.primary} />
                          <Text style={styles.resActionText}>Assign</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.resAction} onPress={() => openEdit(r)} activeOpacity={0.7}>
                          <Ionicons name="create-outline" size={14} color={COLORS.primary} />
                          <Text style={styles.resActionText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.resAction} onPress={() => removeResource(r)} activeOpacity={0.7}>
                          <Ionicons name="trash-outline" size={14} color={COLORS.error} />
                          <Text style={[styles.resActionText, { color: COLORS.error }]}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* ── Lesson library (searchable bank, assign any task) ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="book" size={16} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Lesson library</Text>
          </View>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={15} color={COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search the whole library — barre chords, slap, modes…"
              placeholderTextColor={COLORS.textMuted}
              value={librarySearch}
              onChangeText={setLibrarySearch}
              autoCapitalize="none"
            />
            {!!librarySearch && (
              <TouchableOpacity onPress={() => setLibrarySearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Category chips — tap one to filter (Chords, Scales, Songs…) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll} style={{ marginBottom: SPACING.sm }}>
            {['All', ...LIBRARY_CATEGORIES].map((c) => {
              const on = libCat === c;
              return (
                <TouchableOpacity key={c} style={[styles.catChip, on && styles.catChipOn]} onPress={() => setLibCat(c)} activeOpacity={0.85}>
                  <Text style={[styles.catChipText, on && styles.catChipTextOn]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {libraryTopics.length === 0 ? (
            <Text style={styles.emptyRes}>
              {libQuery ? `No topics match “${librarySearch.trim()}”.` : `Nothing for ${instrument} · ${level} — try the search.`}
            </Text>
          ) : (
            libraryTopics.map((t) => {
              const open = expandedTopic === t.id;
              return (
                <View key={t.id} style={styles.item}>
                  <TouchableOpacity style={styles.customRow} onPress={() => setExpandedTopic(open ? null : t.id)} activeOpacity={0.7}>
                    <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={15} color={COLORS.textMuted} />
                    <Text style={[styles.itemTitle, { flex: 1, marginBottom: 0 }]} numberOfLines={1}>{t.title}</Text>
                    <Text style={styles.resTag}>{t.category} · {t.level}</Text>
                  </TouchableOpacity>
                  {open && (
                    <>
                      {!!t.summary && <Text style={[styles.itemDetail, { marginTop: SPACING.sm }]}>{t.summary}</Text>}
                      {(t.tasks || []).map((task, i) => (
                        <View key={i} style={styles.libTask}>
                          <Text style={styles.itemDetail}>{task.text}</Text>
                          {!!task.yt && (
                            <TouchableOpacity style={styles.ytRow} onPress={() => openYouTube(task.yt)} activeOpacity={0.7}>
                              <Ionicons name="logo-youtube" size={15} color="#FF0000" />
                              <Text style={styles.ytText} numberOfLines={1}>Watch: {task.yt}</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={styles.assignRow}
                            onPress={() => setAssignTarget({ title: t.title, url: task.yt || t.title, description: task.text })}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="paper-plane-outline" size={14} color={COLORS.primary} />
                            <Text style={styles.assignRowText}>Assign to student</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      {/* Add / edit a resource */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit resource' : 'Add resource'}</Text>
              <Text style={styles.modalSub}>Add a link and choose where it’s filed.</Text>
              <TextInput
                style={styles.input}
                placeholder="Title (e.g. Beginner strumming drill)"
                placeholderTextColor={COLORS.textMuted}
                value={newTitle}
                onChangeText={setNewTitle}
              />
              <TextInput
                style={styles.input}
                placeholder="YouTube link or search phrase"
                placeholderTextColor={COLORS.textMuted}
                value={newUrl}
                onChangeText={setNewUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={[styles.input, styles.inputMulti]}
                placeholder="Description (optional) — what should the student do?"
                placeholderTextColor={COLORS.textMuted}
                value={newDesc}
                onChangeText={setNewDesc}
                multiline
                numberOfLines={3}
              />
              <Text style={styles.pickLabel}>INSTRUMENT</Text>
              <View style={styles.pillRow}>
                {INSTRUMENTS.map((i) => (
                  <Pill key={i} label={i} active={newInstrument === i} onPress={() => setNewInstrument(i)} />
                ))}
              </View>
              <Text style={styles.pickLabel}>LEVEL</Text>
              <View style={styles.pillRow}>
                {LIBRARY_LEVELS.map((l) => (
                  <Pill key={l} label={l} active={newLevel === l} onPress={() => setNewLevel(l)} />
                ))}
              </View>
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowAdd(false); resetForm(); }}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={saveResource}>
                  <Text style={styles.saveText}>{editingId ? 'Save' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Pick who to assign the chosen resource / task to */}
      <Modal visible={!!assignTarget} transparent animationType="slide" onRequestClose={() => setAssignTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.customRow}>
              <Text style={styles.modalTitle} numberOfLines={1}>Assign “{assignTarget?.title}”</Text>
              <TouchableOpacity onPress={() => setAssignTarget(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Sends it as a task with the link attached.</Text>

            <ScrollView style={{ maxHeight: 360 }}>
              {classes.length > 0 && <Text style={styles.pickLabel}>CLASSES</Text>}
              {classes.map((c) => {
                const memberUids = (c.studentUids || []).filter((uid) => students.some((s) => s.uid === uid));
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.pickRow, memberUids.length === 0 && { opacity: 0.4 }]}
                    onPress={() => memberUids.length > 0 && assignResourceTo(memberUids, c)}
                    disabled={memberUids.length === 0}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="school-outline" size={18} color={COLORS.primary} />
                    <Text style={styles.pickName} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.pickMeta}>{memberUids.length} student{memberUids.length === 1 ? '' : 's'}</Text>
                  </TouchableOpacity>
                );
              })}

              <Text style={styles.pickLabel}>STUDENTS</Text>
              {students.length === 0 ? (
                <Text style={styles.emptyRes}>No connected students yet.</Text>
              ) : (
                students.map((s) => (
                  <TouchableOpacity key={s.uid} style={styles.pickRow} onPress={() => assignResourceTo([s.uid], null)} activeOpacity={0.7}>
                    <Ionicons name="person-outline" size={18} color={COLORS.textSecondary} />
                    <Text style={styles.pickName} numberOfLines={1}>{displayName(s)}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg },
  kicker: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.xs },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginTop: SPACING.xs, marginBottom: SPACING.lg },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  pill: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  pillTextActive: { color: COLORS.text },
  section: { marginTop: SPACING.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: SPACING.sm },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  item: { backgroundColor: COLORS.card, borderRadius: 14, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  itemTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  itemDetail: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19 },
  ytRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm },
  ytText: { color: COLORS.textSecondary, fontSize: 12, flexShrink: 1, textDecorationLine: 'underline' },
  addResBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: COLORS.primary },
  addResBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  emptyRes: { color: COLORS.textMuted, fontSize: 13, lineHeight: 19 },
  customRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  assignRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  assignRowText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  libTask: { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  catScroll: { gap: SPACING.sm, paddingRight: SPACING.lg },
  catChip: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  catChipOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '22' },
  catChipText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  catChipTextOn: { color: COLORS.primary },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: 9, marginBottom: SPACING.sm },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14, padding: 0 },
  resTag: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700' },
  resActions: { flexDirection: 'row', gap: SPACING.lg, marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  resAction: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  resActionText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  pickLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: SPACING.md, marginBottom: SPACING.xs },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickName: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 14, fontWeight: '600' },
  pickMeta: { color: COLORS.textMuted, fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, paddingBottom: SPACING.xl },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  modalSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, marginBottom: SPACING.md },
  input: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 14, marginBottom: SPACING.sm },
  inputMulti: { minHeight: 70, textAlignVertical: 'top' },
  modalBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.card },
  cancelText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.primary },
  saveText: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
});
