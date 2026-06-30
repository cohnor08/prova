import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform, Animated, PanResponder,
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
import { RESOURCES, RESOURCE_LEVELS, RESOURCE_LEVEL_FALLBACK, CATEGORY_META } from '../../constants/resources';

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
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ResourceItem({ item, onAssign, onRemove }) {
  return (
    <View style={styles.item}>
      <View style={styles.customRow}>
        <Text style={[styles.itemTitle, { flex: 1 }]}>{item.title}</Text>
        {onRemove && (
          <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={16} color={COLORS.error} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.itemDetail}>{item.detail}</Text>
      {item.yt && (
        <TouchableOpacity style={styles.ytRow} onPress={() => openYouTube(item.yt)} activeOpacity={0.7}>
          <Ionicons name="logo-youtube" size={15} color="#FF0000" />
          <Text style={styles.ytText} numberOfLines={1}>Watch: {item.yt}</Text>
        </TouchableOpacity>
      )}
      {onAssign && (
        <TouchableOpacity style={styles.assignRow} onPress={() => onAssign({ title: item.title, url: item.yt || item.title, description: item.detail || '' })} activeOpacity={0.7}>
          <Ionicons name="paper-plane-outline" size={14} color={COLORS.primary} />
          <Text style={styles.assignRowText}>Assign to student</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Drag-to-reorder list for the category sections (Exercises / Songs / Tips).
// Hold the ≡ grip and drag a row; tap the eye to show/hide. PanResponder-based,
// no extra deps. Rows are a fixed height since each is a single label.
const CAT_ROW_H = 56;
function CategoryEditList({ layout, onReorder, onToggle }) {
  const [dragId, setDragId] = useState(null);
  const orderRef = useRef(layout);
  orderRef.current = layout;
  const pan = useRef(new Animated.Value(0)).current;
  const startTop = useRef(0);
  const responders = useRef({});

  const getResponder = (id) => {
    if (responders.current[id]) return responders.current[id];
    responders.current[id] = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startTop.current = orderRef.current.findIndex((x) => x.id === id) * CAT_ROW_H;
        pan.setValue(0);
        setDragId(id);
      },
      onPanResponderMove: (_, g) => {
        const order = orderRef.current;
        const desiredTop = startTop.current + g.dy;
        const center = desiredTop + CAT_ROW_H / 2;
        let target = Math.max(0, Math.min(order.length - 1, Math.floor(center / CAT_ROW_H)));
        const curIndex = order.findIndex((x) => x.id === id);
        if (target !== curIndex) {
          const arr = [...order];
          const [it] = arr.splice(curIndex, 1);
          arr.splice(target, 0, it);
          onReorder(arr);
          pan.setValue(desiredTop - target * CAT_ROW_H);
        } else {
          pan.setValue(desiredTop - curIndex * CAT_ROW_H);
        }
      },
      onPanResponderRelease: () => { setDragId(null); pan.setValue(0); },
      onPanResponderTerminate: () => { setDragId(null); pan.setValue(0); },
    });
    return responders.current[id];
  };

  return (
    <View style={{ marginTop: SPACING.sm }}>
      {layout.map((entry) => {
        const meta = CATEGORY_META[entry.id];
        const dragging = dragId === entry.id;
        return (
          <Animated.View
            key={entry.id}
            style={[
              styles.editRow,
              dragging && styles.editRowDragging,
              dragging && { transform: [{ translateY: pan }], zIndex: 20, elevation: 8 },
            ]}
          >
            <View {...getResponder(entry.id).panHandlers} style={styles.grip}>
              <Ionicons name="reorder-three" size={26} color={COLORS.textSecondary} />
            </View>
            <Ionicons name={meta.icon} size={16} color={COLORS.primary} />
            <Text style={[styles.editRowName, !entry.visible && { color: COLORS.textMuted }]}>{meta.label}</Text>
            <TouchableOpacity onPress={() => onToggle(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={entry.visible ? 'eye' : 'eye-off'} size={20} color={entry.visible ? COLORS.primary : COLORS.textMuted} />
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </View>
  );
}

export default function ResourceLibraryScreen() {
  const [instrument, setInstrument] = useState('Guitar');
  const [level, setLevel] = useState('Beginner');

  // Teacher-added resources, stored on the teacher's own user doc.
  const [custom, setCustom] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null); // resource id being edited, or null when adding
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [resSearch, setResSearch] = useState('');     // search across all your resources
  const [expandedRes, setExpandedRes] = useState(null); // which resource card is expanded
  const [hidden, setHidden] = useState([]);            // built-in item ids the teacher removed
  const [catLayout, setCatLayout] = useState(null);    // section order + visibility, or null = default
  const [collapsedCats, setCollapsedCats] = useState(() => new Set(Object.keys(CATEGORY_META))); // start compact
  const [editLayout, setEditLayout] = useState(false); // layout edit mode (like the Home screen)

  // For assigning a resource to a student/class.
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [assignTarget, setAssignTarget] = useState(null); // { title, url } | null

  const loadResources = (uid) => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then((s) => {
        const cust = Array.isArray(s.data()?.customResources) ? s.data().customResources : [];
        setCustom(cust);
        setClasses(Array.isArray(s.data()?.classes) ? s.data().classes : []);
        setHidden(Array.isArray(s.data()?.hiddenResources) ? s.data().hiddenResources : []);
        if (Array.isArray(s.data()?.resourceLayout)) setCatLayout(s.data().resourceLayout);
        // New teachers (no library of their own yet) get the built-in sections
        // expanded so they see ready-to-use content; once they've built up their
        // own resources, the stock sections stay collapsed to reduce clutter.
        if (cust.length === 0) setCollapsedCats(new Set());
      })
      .catch(() => {});
    getDocs(query(collection(db, 'users'), where('teacherUid', '==', uid)))
      .then((snap) => setStudents(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))))
      .catch(() => {});
  };

  // Load once auth is ready. On a cold reopen this screen can mount before
  // Firebase Auth restores the session, so we wait for the auth state to resolve
  // (and reload on any sign-in) rather than bailing once and never retrying.
  useEffect(() => {
    if (auth.currentUser?.uid) loadResources(auth.currentUser.uid);
    const unsub = onAuthStateChanged(auth, (u) => { if (u?.uid) loadResources(u.uid); });
    return unsub;
  }, []);

  // Assign the selected resource as a task (with its link) to recipients.
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
        : 'Resource sent to the student.');
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

  const openAdd = () => { resetForm(); setShowAdd(true); };

  const openEdit = (r) => {
    setEditingId(r.id);
    setNewTitle(r.title || '');
    setNewUrl(r.url || '');
    setNewDesc(r.description || '');
    setShowAdd(true);
  };

  const saveResource = () => {
    if (!newTitle.trim() || !newUrl.trim()) {
      Alert.alert('Add a title and link', 'Both a title and a YouTube link (or search) are needed.');
      return;
    }
    if (editingId) {
      // Edit in place, keeping the resource's original instrument/level.
      saveCustom(custom.map((x) => x.id === editingId
        ? { ...x, title: newTitle.trim(), url: newUrl.trim(), description: newDesc.trim() }
        : x));
    } else {
      const item = { id: Date.now().toString(), title: newTitle.trim(), url: newUrl.trim(), description: newDesc.trim(), instrument, level };
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

  // A stable id for a built-in item, so a teacher can hide it per their account.
  const builtinId = (cat, item) => `${instrument}|${level}|${cat}|${item.title}`;

  const saveHidden = (next) => {
    setHidden(next);
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { hiddenResources: next }).catch(() => {});
  };
  const removeBuiltin = (cat, item) => {
    const id = builtinId(cat, item);
    Alert.alert('Remove resource?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => saveHidden([...hidden, id]) },
    ]);
  };

  const toggleCollapse = (cat) => setCollapsedCats((prev) => {
    const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n;
  });

  // Section layout (order + visibility), Home-screen style. Merge any saved
  // layout with the full category list so new categories still appear.
  const allCats = Object.keys(CATEGORY_META);
  const mergedLayout = (() => {
    const saved = Array.isArray(catLayout) ? catLayout.filter((x) => allCats.includes(x.id)) : [];
    const have = new Set(saved.map((x) => x.id));
    return [...saved, ...allCats.filter((c) => !have.has(c)).map((c) => ({ id: c, visible: true }))];
  })();
  const toggleCatVisible = (id) =>
    setCatLayout(mergedLayout.map((x) => (x.id === id ? { ...x, visible: !x.visible } : x)));
  const saveLayout = () => {
    setEditLayout(false);
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { resourceLayout: mergedLayout }).catch(() => {});
  };

  // The teacher's own links. When searching, match across ALL their resources
  // (any instrument/level) by title, description or link; otherwise show the
  // ones for the currently selected instrument + level.
  const resQuery = resSearch.trim().toLowerCase();
  const myResources = resQuery
    ? custom.filter((r) =>
        (r.title || '').toLowerCase().includes(resQuery)
        || (r.description || '').toLowerCase().includes(resQuery)
        || (r.url || '').toLowerCase().includes(resQuery))
    : custom.filter((r) => r.instrument === instrument && r.level === level);

  const effLevel = RESOURCES[instrument]?.[level] ? level : (RESOURCE_LEVEL_FALLBACK[level] || level);
  const data = RESOURCES[instrument]?.[effLevel] || {};
  const hiddenSet = new Set(hidden);
  // Items per category with hidden ones filtered out.
  const visibleItems = (cat) => (data[cat] || []).filter((it) => !hiddenSet.has(builtinId(cat, it)));
  // Sections in the teacher's chosen order — only visible ones that still have
  // items (the drag editor handles reordering/hiding separately).
  const orderedCats = mergedLayout.filter((x) => x.visible && visibleItems(x.id).length > 0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>TEACHING LIBRARY</Text>
        <Text style={styles.title}>Resources</Text>
        <Text style={styles.subtitle}>Ready-to-use exercises, tips and songs to hand to your students.</Text>

        <View style={styles.pillRow}>
          {INSTRUMENTS.map((i) => (
            <Pill key={i} label={i} active={instrument === i} onPress={() => setInstrument(i)} />
          ))}
        </View>
        <View style={styles.pillRow}>
          {RESOURCE_LEVELS.map((l) => (
            <Pill key={l} label={l} active={level === l} onPress={() => setLevel(l)} />
          ))}
        </View>

        {/* Teacher's own added resources for this instrument + level */}
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
                    <Text style={[styles.itemTitle, { flex: 1 }]} numberOfLines={1}>{r.title}</Text>
                    {resQuery ? <Text style={styles.resTag}>{r.instrument} · {r.level}</Text> : null}
                  </TouchableOpacity>
                  {open && (
                    <>
                      {!!r.description && <Text style={styles.itemDetail}>{r.description}</Text>}
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

        {/* Layout editor toggle — reorder / show-hide the category sections */}
        <View style={styles.layoutBar}>
          <Text style={styles.layoutHint}>{editLayout ? 'Reorder or hide sections' : `Sections · ${instrument} · ${level}`}</Text>
          <TouchableOpacity
            style={[styles.layoutBtn, editLayout && styles.layoutBtnActive]}
            onPress={() => (editLayout ? saveLayout() : setEditLayout(true))}
            activeOpacity={0.85}
          >
            <Ionicons name={editLayout ? 'checkmark' : 'options-outline'} size={15} color={editLayout ? '#fff' : COLORS.primary} />
            <Text style={[styles.layoutBtnText, editLayout && { color: '#fff' }]}>{editLayout ? 'Done' : 'Edit layout'}</Text>
          </TouchableOpacity>
        </View>

        {editLayout ? (
          <CategoryEditList layout={mergedLayout} onReorder={setCatLayout} onToggle={toggleCatVisible} />
        ) : (
          orderedCats.map((entry) => {
            const cat = entry.id;
            const meta = CATEGORY_META[cat];
            const items = visibleItems(cat);
            const collapsed = collapsedCats.has(cat);
            return (
              <View key={cat} style={styles.section}>
                <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleCollapse(cat)} activeOpacity={0.7}>
                  <Ionicons name={meta.icon} size={16} color={COLORS.primary} />
                  <Text style={[styles.sectionTitle, { flex: 1 }]}>{meta.label}</Text>
                  <Text style={styles.sectionCount}>{items.length}</Text>
                  <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
                {!collapsed && (
                  items.length === 0
                    ? <Text style={styles.emptyRes}>All removed. Nothing here for {instrument} · {level}.</Text>
                    : items.map((item, idx) => (
                        <ResourceItem
                          key={`${cat}_${idx}`}
                          item={item}
                          onAssign={cat === 'tips' ? null : setAssignTarget}
                          onRemove={() => removeBuiltin(cat, item)}
                        />
                      ))
                )}
              </View>
            );
          })
        )}

        {hidden.length > 0 && !editLayout && (
          <TouchableOpacity style={styles.restoreRow} onPress={() => saveHidden([])} activeOpacity={0.7}>
            <Ionicons name="refresh" size={14} color={COLORS.textSecondary} />
            <Text style={styles.restoreText}>Restore {hidden.length} removed resource{hidden.length === 1 ? '' : 's'}</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit resource' : 'Add resource'}</Text>
              <Text style={styles.modalSub}>{editingId ? 'Update this resource' : `Saved under ${instrument} · ${level}`}</Text>
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

      {/* Pick who to assign the chosen resource to */}
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
  pill: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  pillTextActive: { color: COLORS.text },
  section: { marginTop: SPACING.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: SPACING.sm },
  editRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, height: 56,
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm,
  },
  editRowDragging: { borderColor: COLORS.primary, backgroundColor: COLORS.surface },
  editRowName: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '700' },
  grip: { paddingHorizontal: 2, paddingVertical: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  sectionCount: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },
  layoutBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.xl },
  layoutHint: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, flex: 1 },
  layoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: COLORS.primary },
  layoutBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  layoutBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  restoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: SPACING.lg },
  restoreText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
  item: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: SPACING.md,
    marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
  },
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
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: 9, marginBottom: SPACING.sm,
  },
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
