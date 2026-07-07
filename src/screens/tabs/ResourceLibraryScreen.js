import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform, InputAccessoryView, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  doc, getDoc, updateDoc, collection, query, where, getDocs, arrayUnion,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { displayName } from '../../lib/displayName';
import DueDatePicker from '../../components/DueDatePicker';
import YouTubePlayerModal from '../../components/YouTubePlayerModal';
import { COLORS, SPACING } from '../../constants/theme';

// Friendly label for a stored ISO due date.
function dueLabel(iso) {
  if (!iso) return 'No due date';
  const d = new Date(iso);
  if (isNaN(d)) return 'No due date';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
import { LIBRARY_TOPICS, LIBRARY_CATEGORIES, LIBRARY_LEVELS } from '../../constants/library';
import SheetModal from '../../components/SheetModal';

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
  const [watch, setWatch] = useState(null); // { query, title } for the in-app video player
  const [newLevel, setNewLevel] = useState('Beginner');
  const [resSearch, setResSearch] = useState('');       // search across the teacher's own resources
  const [expandedRes, setExpandedRes] = useState(null);
  const [resCategories, setResCategories] = useState([]); // teacher's own category names
  const [newCategory, setNewCategory] = useState('');    // category for the resource being added/edited
  const [addingCat, setAddingCat] = useState(false);     // showing the new-category input in the modal
  const [newCatText, setNewCatText] = useState('');
  const [resCatFilter, setResCatFilter] = useState('All'); // 'Your resources' chip filter
  const [showAllRes, setShowAllRes] = useState(false);   // 'show more' expansion

  // The shared lesson-library bank shown right on this page.
  const [librarySearch, setLibrarySearch] = useState('');
  const [libCat, setLibCat] = useState('All');           // category filter for the library
  const [expandedTopic, setExpandedTopic] = useState(null);

  // For assigning a resource / library task to a student or class.
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [assignTarget, setAssignTarget] = useState(null); // { title, url, description } | null
  const [assignInstructions, setAssignInstructions] = useState('');
  const [assignDueDate, setAssignDueDate] = useState(null); // ISO datetime or null
  const [assignDuration, setAssignDuration] = useState(10); // timer minutes (default 10; clear for no limit)
  const [showAssignDuePicker, setShowAssignDuePicker] = useState(false);
  const [selClasses, setSelClasses] = useState(() => new Set());  // multi-select: chosen class ids
  const [selStudents, setSelStudents] = useState(() => new Set()); // multi-select: chosen student uids

  // Seed the instructions/due-date/timer + clear the recipient picks when a
  // resource is chosen to assign.
  useEffect(() => {
    if (assignTarget) {
      setAssignInstructions(assignTarget.description || '');
      setAssignDueDate(null);
      setAssignDuration(10);
      setSelClasses(new Set());
      setSelStudents(new Set());
    }
  }, [assignTarget]);

  const loadResources = (uid) => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then((s) => {
        setCustom(Array.isArray(s.data()?.customResources) ? s.data().customResources : []);
        setClasses(Array.isArray(s.data()?.classes) ? s.data().classes : []);
        setResCategories(Array.isArray(s.data()?.resourceCategories) ? s.data().resourceCategories : []);
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

  const toggleSel = (setter) => (id) => setter((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const toggleClass = toggleSel(setSelClasses);
  const toggleStudent = toggleSel(setSelStudents);

  // Every unique student the current selection resolves to (class members +
  // individually-picked students), used for the button label and the send.
  const resolveRecipients = () => {
    const set = new Set();
    selClasses.forEach((cid) => {
      const c = classes.find((x) => x.id === cid);
      (c?.studentUids || []).filter((uid) => students.some((s) => s.uid === uid)).forEach((u) => set.add(u));
    });
    selStudents.forEach((u) => set.add(u));
    return set;
  };

  // Assign the chosen resource to every selected class + student at once. A
  // class pick tags the task with classId/className so it groups on the student's
  // Today; an individual pick sends it as a solo task.
  const assignToSelection = async () => {
    if (!assignTarget) return;
    const base = {
      title: assignTarget.title,
      description: assignInstructions.trim(),
      youtube: assignTarget.url,
      song: '',
      dueDate: assignDueDate,
      durationMin: assignDuration || 0,
      completed: false,
      assignedAt: new Date().toISOString(),
      teacherUid: auth.currentUser.uid,
    };
    const byUser = new Map(); // uid -> [task, ...] (pre-id)
    const push = (uid, extra) => {
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid).push({ ...base, ...extra });
    };
    selClasses.forEach((cid) => {
      const c = classes.find((x) => x.id === cid);
      if (!c) return;
      (c.studentUids || []).filter((uid) => students.some((s) => s.uid === uid))
        .forEach((uid) => push(uid, { classId: c.id, className: c.name }));
    });
    selStudents.forEach((uid) => push(uid, {}));
    if (byUser.size === 0) { Alert.alert('Pick someone', 'Select at least one student or class.'); return; }
    try {
      let seq = 0;
      await Promise.all([...byUser.entries()].map(([uid, tasks]) => {
        const withIds = tasks.map((t) => ({ ...t, id: `${Date.now()}_${seq++}` }));
        return updateDoc(doc(db, 'users', uid), { assignedTasks: arrayUnion(...withIds) });
      }));
      setAssignTarget(null);
      Alert.alert('Assigned', `Sent to ${byUser.size} student${byUser.size === 1 ? '' : 's'}.`);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const saveCategories = (next) => {
    setResCategories(next);
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { resourceCategories: next }).catch(() => {});
  };
  // Create a category (if new) and select it for the resource being edited.
  const addCategory = (raw) => {
    const n = (raw || '').trim();
    if (!n) return;
    if (!resCategories.some((c) => c.toLowerCase() === n.toLowerCase())) saveCategories([...resCategories, n]);
    setNewCategory(n);
    setNewCatText(''); setAddingCat(false);
  };

  const saveCustom = (next) => {
    setCustom(next);
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { customResources: next }).catch(() => {});
  };

  const resetForm = () => { setNewTitle(''); setNewUrl(''); setNewDesc(''); setEditingId(null); setNewCategory(''); setAddingCat(false); setNewCatText(''); };
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
    setNewCategory(r.category || '');
    setShowAdd(true);
  };

  const saveResource = () => {
    if (!newTitle.trim() || !newUrl.trim()) {
      Alert.alert('Add a title and link', 'Both a title and a YouTube link (or search) are needed.');
      return;
    }
    if (editingId) {
      saveCustom(custom.map((x) => x.id === editingId
        ? { ...x, title: newTitle.trim(), url: newUrl.trim(), description: newDesc.trim(), instrument: newInstrument, level: newLevel, category: newCategory || '' }
        : x));
    } else {
      const item = { id: Date.now().toString(), title: newTitle.trim(), url: newUrl.trim(), description: newDesc.trim(), instrument: newInstrument, level: newLevel, category: newCategory || '' };
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
  let myResources = resQuery
    ? custom.filter((r) =>
        (r.title || '').toLowerCase().includes(resQuery)
        || (r.description || '').toLowerCase().includes(resQuery)
        || (r.url || '').toLowerCase().includes(resQuery))
    : custom.filter((r) => r.instrument === instrument && r.level === level);
  // Category chip filter (only when browsing, not searching).
  if (!resQuery && resCatFilter !== 'All') {
    myResources = myResources.filter((r) => (r.category || '') === resCatFilter);
  }
  // Compact the list once there are more than 3 — "Show more" reveals the rest.
  const RES_COMPACT = 3;
  const resTooMany = myResources.length > RES_COMPACT;
  const shownResources = showAllRes || !resTooMany ? myResources : myResources.slice(0, RES_COMPACT);

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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
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

          {resCategories.length > 0 && !resQuery && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll} style={{ marginBottom: SPACING.sm }}>
              {['All', ...resCategories].map((c) => {
                const on = resCatFilter === c;
                return (
                  <TouchableOpacity key={c} style={[styles.catChip, on && styles.catChipOn]} onPress={() => { setResCatFilter(c); setShowAllRes(false); }} activeOpacity={0.85}>
                    <Text style={[styles.catChipText, on && styles.catChipTextOn]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {myResources.length === 0 ? (
            <Text style={styles.emptyRes}>
              {resQuery
                ? `No resources match “${resSearch.trim()}”.`
                : resCatFilter !== 'All'
                  ? `No resources in “${resCatFilter}” for ${instrument} · ${level}.`
                  : `No links added for ${instrument} · ${level} yet. Tap “Add” to save one.`}
            </Text>
          ) : (
            shownResources.map((r) => {
              const open = expandedRes === r.id;
              return (
                <View key={r.id} style={styles.item}>
                  <TouchableOpacity style={styles.customRow} onPress={() => setExpandedRes(open ? null : r.id)} activeOpacity={0.7}>
                    <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={15} color={COLORS.textMuted} />
                    <Text style={[styles.itemTitle, { flex: 1, marginBottom: 0 }]} numberOfLines={1}>{r.title}</Text>
                    {resQuery ? <Text style={styles.resTag}>{r.instrument} · {r.level}</Text> : (r.category ? <Text style={styles.resTag}>{r.category}</Text> : null)}
                  </TouchableOpacity>
                  {open && (
                    <>
                      {!!r.description && <Text style={[styles.itemDetail, { marginTop: SPACING.sm }]}>{r.description}</Text>}
                      <TouchableOpacity style={styles.ytRow} onPress={() => setWatch({ query: r.url, title: r.title })} activeOpacity={0.8}>
                        <Ionicons name="play-circle" size={18} color={COLORS.error} />
                        <Text style={styles.ytText} numberOfLines={1}>Watch a tutorial</Text>
                        <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
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
          {resTooMany && (
            <TouchableOpacity style={styles.showMoreBtn} onPress={() => setShowAllRes((v) => !v)} activeOpacity={0.7}>
              <Text style={styles.showMoreText}>{showAllRes ? 'Show less' : `Show ${myResources.length - RES_COMPACT} more`}</Text>
              <Ionicons name={showAllRes ? 'chevron-up' : 'chevron-down'} size={15} color={COLORS.primary} />
            </TouchableOpacity>
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
                            <TouchableOpacity style={styles.ytRow} onPress={() => setWatch({ query: task.yt, title: t.title })} activeOpacity={0.8}>
                              <Ionicons name="play-circle" size={18} color={COLORS.error} />
                              <Text style={styles.ytText} numberOfLines={1}>Watch a tutorial</Text>
                              <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
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
      <SheetModal visible={showAdd} onRequestClose={() => setShowAdd(false)} cardStyle={styles.modalCard} keyboardAvoiding>
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
              <Text style={styles.pickLabel}>CATEGORY (OPTIONAL)</Text>
              <View style={styles.pillRow}>
                <Pill label="None" active={!newCategory} onPress={() => setNewCategory('')} />
                {resCategories.map((c) => (
                  <Pill key={c} label={c} active={newCategory === c} onPress={() => setNewCategory(c)} />
                ))}
                <TouchableOpacity style={styles.pill} onPress={() => setAddingCat((v) => !v)} activeOpacity={0.8}>
                  <Text style={[styles.pillText, { color: COLORS.primary }]}>+ New</Text>
                </TouchableOpacity>
              </View>
              {addingCat && (
                <View style={[styles.searchRow, { marginBottom: SPACING.md }]}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="New category name"
                    placeholderTextColor={COLORS.textMuted}
                    value={newCatText}
                    onChangeText={setNewCatText}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => addCategory(newCatText)}
                  />
                  <TouchableOpacity onPress={() => addCategory(newCatText)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.addCatDone}>Add</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowAdd(false); resetForm(); }}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={saveResource}>
                  <Text style={styles.saveText}>{editingId ? 'Save' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
      </SheetModal>

      {/* Pick who to assign the chosen resource / task to */}
      <SheetModal visible={!!assignTarget} onRequestClose={() => setAssignTarget(null)} cardStyle={styles.modalCard} keyboardAvoiding>
            <View style={styles.customRow}>
              <Text style={styles.modalTitle} numberOfLines={1}>Assign “{assignTarget?.title}”</Text>
              <TouchableOpacity onPress={() => setAssignTarget(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Sends it as a task with the link attached.</Text>

            <TextInput
              style={styles.assignInstructions}
              placeholder="Extra instructions (optional) — what should they do?"
              placeholderTextColor={COLORS.textMuted}
              value={assignInstructions}
              onChangeText={setAssignInstructions}
              multiline
            />
            <TouchableOpacity style={styles.assignDueRow} onPress={() => setShowAssignDuePicker(true)} activeOpacity={0.7}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
              <Text style={styles.assignDueLabel}>Due date</Text>
              <Text style={[styles.assignDueValue, assignDueDate && { color: COLORS.text }]}>{dueLabel(assignDueDate)}</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
            </TouchableOpacity>

            <View style={styles.assignDueRow}>
              <Ionicons name="timer-outline" size={16} color={COLORS.primary} />
              <Text style={styles.assignDueLabel}>Timer</Text>
              <TextInput
                style={styles.assignDurInput}
                placeholder="0"
                placeholderTextColor={COLORS.textMuted}
                value={assignDuration ? String(assignDuration) : ''}
                onChangeText={(t) => {
                  const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                  setAssignDuration(isNaN(n) ? 0 : Math.min(n, 600));
                }}
                keyboardType="number-pad"
                maxLength={3}
                inputAccessoryViewID={Platform.OS === 'ios' ? 'resTimerDone' : undefined}
              />
              <Text style={styles.assignDurUnit}>min</Text>
              {assignDuration > 0 && (
                <TouchableOpacity onPress={() => setAssignDuration(0)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.assignDurClear}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            {Platform.OS === 'ios' && (
              <InputAccessoryView nativeID="resTimerDone">
                <View style={styles.accessoryBar}>
                  <TouchableOpacity onPress={() => Keyboard.dismiss()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.accessoryDone}>Done</Text>
                  </TouchableOpacity>
                </View>
              </InputAccessoryView>
            )}

            <Text style={styles.pickLabel}>SEND TO — pick any number</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {classes.length > 0 && <Text style={styles.pickLabel}>CLASSES</Text>}
              {classes.map((c) => {
                const memberUids = (c.studentUids || []).filter((uid) => students.some((s) => s.uid === uid));
                const on = selClasses.has(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.pickRow, memberUids.length === 0 && { opacity: 0.4 }]}
                    onPress={() => memberUids.length > 0 && toggleClass(c.id)}
                    disabled={memberUids.length === 0}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? COLORS.primary : COLORS.textMuted} />
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
                students.map((s) => {
                  const on = selStudents.has(s.uid);
                  return (
                    <TouchableOpacity key={s.uid} style={styles.pickRow} onPress={() => toggleStudent(s.uid)} activeOpacity={0.7}>
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? COLORS.primary : COLORS.textMuted} />
                      <Ionicons name="person-outline" size={18} color={COLORS.textSecondary} />
                      <Text style={styles.pickName} numberOfLines={1}>{displayName(s)}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            {(() => {
              const n = resolveRecipients().size;
              return (
                <TouchableOpacity
                  style={[styles.assignSendBtn, n === 0 && { opacity: 0.5 }]}
                  onPress={assignToSelection}
                  disabled={n === 0}
                  activeOpacity={0.85}
                >
                  <Ionicons name="paper-plane" size={16} color={COLORS.text} />
                  <Text style={styles.assignSendText}>{n > 0 ? `Assign to ${n} student${n === 1 ? '' : 's'}` : 'Assign'}</Text>
                </TouchableOpacity>
              );
            })()}
          {showAssignDuePicker && (
            <DueDatePicker
              initial={assignDueDate}
              onClose={() => setShowAssignDuePicker(false)}
              onSet={setAssignDueDate}
            />
          )}
      </SheetModal>

      <YouTubePlayerModal
        visible={!!watch}
        query={watch?.query}
        title={watch?.title || 'Watch'}
        onClose={() => setWatch(null)}
      />
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
  ytRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.sm },
  ytText: { flex: 1, color: COLORS.error, fontSize: 13, fontWeight: '600' },
  addResBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: COLORS.primary },
  addResBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  emptyRes: { color: COLORS.textMuted, fontSize: 13, lineHeight: 19 },
  assignInstructions: { backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, fontSize: 14, minHeight: 64, textAlignVertical: 'top', marginBottom: SPACING.sm },
  assignDueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 11, paddingHorizontal: SPACING.md, marginBottom: SPACING.sm },
  assignDueLabel: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  assignDueValue: { flex: 1, textAlign: 'right', color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  showMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  showMoreText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  addCatDone: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  assignSendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, marginTop: SPACING.md },
  assignSendText: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  assignDurInput: { flex: 1, textAlign: 'right', color: COLORS.text, fontSize: 14, fontWeight: '700', paddingVertical: 0 },
  assignDurUnit: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  assignDurClear: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  accessoryBar: { backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 8, paddingHorizontal: SPACING.md, alignItems: 'flex-end' },
  accessoryDone: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
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
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, paddingBottom: SPACING.xl + 40, marginBottom: -40 },
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
