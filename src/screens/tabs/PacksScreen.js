import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { displayName } from '../../lib/displayName';
import { sendNotification } from '../../lib/inbox';
import { COLORS, SPACING } from '../../constants/theme';
import SheetModal from '../../components/SheetModal';
import { advancePrograms } from '../../lib/programs';

// Assignment Packs = a reusable bundle of practice tasks a teacher builds once
// and assigns to any student or class in one tap. The pack lives on the teacher
// doc (`taskPacks`); assigning writes a fresh copy of every task into each
// recipient's `assignedTasks` (same shape the one-off assign flow uses).
//
// Programs = an ordered list of packs (one per week). Assign once and each week
// auto-releases — see src/lib/programs.js. Stored on the teacher doc as
// `taskPrograms`; live assignments live in `assignedPrograms`.

const emptyDraft = () => ({ id: null, name: '', tasks: [], createdAt: null });
const emptyTask = () => ({ title: '', description: '', youtube: '', durationMin: '10' });
const emptyProg = () => ({ id: null, name: '', packIds: [] });

export default function PacksScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [packs, setPacks] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [draft, setDraft] = useState(null);            // pack being created/edited
  const [taskForm, setTaskForm] = useState(emptyTask());
  const [assignPack, setAssignPack] = useState(null);  // pack being assigned
  const [programs, setPrograms] = useState([]);
  const [progDraft, setProgDraft] = useState(null);    // program being created/edited
  const [assignProg, setAssignProg] = useState(null);  // program being assigned
  const [selStudents, setSelStudents] = useState(() => new Set());
  const [selClasses, setSelClasses] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  const myUid = auth.currentUser?.uid;
  const insets = useSafeAreaInsets(); // reliable even inside a Modal (SafeAreaView isn't)

  const load = useCallback(async () => {
    if (!myUid) { setLoading(false); return; }
    try {
      const meSnap = await getDoc(doc(db, 'users', myUid));
      const me = meSnap.data() || {};
      setPacks(Array.isArray(me.taskPacks) ? me.taskPacks : []);
      setPrograms(Array.isArray(me.taskPrograms) ? me.taskPrograms : []);
      setClasses(Array.isArray(me.classes) ? me.classes : []);
      const snap = await getDocs(query(collection(db, 'users'), where('teacherUid', '==', myUid)));
      setStudents(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }, [myUid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const persistPacks = async (next) => {
    setPacks(next);
    try { await updateDoc(doc(db, 'users', myUid), { taskPacks: next }); }
    catch (e) { Alert.alert('Error', "Couldn't save your packs. Please try again."); }
  };

  // ── Editor ──
  const openNew = () => { setTaskForm(emptyTask()); setDraft(emptyDraft()); };
  const openEdit = (p) => { setTaskForm(emptyTask()); setDraft({ ...p, tasks: [...(p.tasks || [])] }); };
  const addTaskToDraft = () => {
    const title = taskForm.title.trim();
    if (!title) { Alert.alert('Task title', 'Give the task a title first.'); return; }
    setDraft((d) => ({
      ...d,
      tasks: [...d.tasks, {
        id: `t_${Date.now()}`,
        title,
        description: taskForm.description.trim(),
        youtube: taskForm.youtube.trim(),
        durationMin: parseInt(taskForm.durationMin, 10) || 0,
      }],
    }));
    setTaskForm(emptyTask());
  };
  const removeDraftTask = (id) => setDraft((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
  const saveDraft = () => {
    const name = (draft.name || '').trim();
    if (!name) { Alert.alert('Name it', 'Give the pack a name.'); return; }
    if (draft.tasks.length === 0) { Alert.alert('Add a task', 'A pack needs at least one task.'); return; }
    const obj = { id: draft.id || `pack_${Date.now()}`, name, tasks: draft.tasks, createdAt: draft.createdAt || new Date().toISOString() };
    persistPacks(draft.id ? packs.map((p) => (p.id === draft.id ? obj : p)) : [...packs, obj]);
    setDraft(null);
  };
  const deletePack = (p) => {
    Alert.alert('Delete pack', `Delete "${p.name}"? Tasks already assigned stay with students.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => persistPacks(packs.filter((x) => x.id !== p.id)) },
    ]);
  };

  const persistPrograms = async (next) => {
    setPrograms(next);
    try { await updateDoc(doc(db, 'users', myUid), { taskPrograms: next }); }
    catch (e) { Alert.alert('Error', "Couldn't save your programs. Please try again."); }
  };

  // ── Program editor (a program = ordered packs, one per week) ──
  const openNewProg = () => {
    if (packs.length === 0) { Alert.alert('Create a pack first', 'A program is built from your packs — make at least one pack, then chain them into weeks.'); return; }
    setProgDraft(emptyProg());
  };
  const openEditProg = (pr) => setProgDraft({ ...pr, packIds: [...(pr.packIds || [])] });
  const addWeek = (packId) => setProgDraft((d) => ({ ...d, packIds: [...d.packIds, packId] }));
  const removeWeek = (i) => setProgDraft((d) => ({ ...d, packIds: d.packIds.filter((_, idx) => idx !== i) }));
  const saveProgram = () => {
    const name = (progDraft.name || '').trim();
    if (!name) { Alert.alert('Name it', 'Give the program a name.'); return; }
    if (progDraft.packIds.length === 0) { Alert.alert('Add a week', 'Add at least one pack as a week.'); return; }
    const obj = { id: progDraft.id || `prog_${Date.now()}`, name, packIds: progDraft.packIds, createdAt: progDraft.createdAt || new Date().toISOString() };
    persistPrograms(progDraft.id ? programs.map((p) => (p.id === progDraft.id ? obj : p)) : [...programs, obj]);
    setProgDraft(null);
  };
  const deleteProgram = (pr) => {
    Alert.alert('Delete program', `Delete "${pr.name}"? Students already on it keep the weeks they've been given.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => persistPrograms(programs.filter((x) => x.id !== pr.id)) },
    ]);
  };

  // ── Assign (shared by packs + programs) ──
  const toggleIn = (setFn) => (id) => setFn((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const openAssign = (p) => { setSelStudents(new Set()); setSelClasses(new Set()); setAssignPack(p); };
  const openAssignProgram = (pr) => { setSelStudents(new Set()); setSelClasses(new Set()); setAssignProg(pr); };
  const closeAssign = () => { setAssignPack(null); setAssignProg(null); };
  const resolveRecipients = () => {
    const recipients = new Map(); // uid -> class tag | null
    selStudents.forEach((uid) => { if (!recipients.has(uid)) recipients.set(uid, null); });
    selClasses.forEach((cid) => {
      const c = classes.find((k) => k.id === cid);
      (c?.studentUids || []).forEach((uid) => {
        if (students.some((s) => s.uid === uid)) recipients.set(uid, { classId: c.id, className: c.name });
      });
    });
    return recipients;
  };

  const doAssign = async () => {
    const recipients = resolveRecipients();
    if (recipients.size === 0) { Alert.alert('Pick recipients', 'Choose at least one student or class.'); return; }
    setSaving(true);
    try {
      const stamp = Date.now();
      await Promise.all([...recipients.entries()].map(([uid, cls], ri) => {
        const tasks = (assignPack.tasks || []).map((t, ti) => ({
          title: t.title, description: t.description || '', youtube: t.youtube || '', song: '',
          dueDate: null, durationMin: t.durationMin || 0, completed: false,
          assignedAt: new Date().toISOString(), teacherUid: myUid,
          ...(cls || {}), id: `${stamp}_${ri}_${ti}`,
        }));
        return updateDoc(doc(db, 'users', uid), { assignedTasks: arrayUnion(...tasks) });
      }));
      [...recipients.keys()].forEach((uid) => sendNotification(uid, {
        type: 'task_assigned', title: 'New tasks from your teacher', body: assignPack.name, data: { taskTitle: assignPack.name },
      }).catch(() => {}));
      const n = recipients.size;
      closeAssign();
      Alert.alert('Assigned', `"${assignPack.name}" sent to ${n} student${n === 1 ? '' : 's'}.`);
    } catch (e) {
      Alert.alert('Error', "Couldn't assign the pack. Please try again.");
    } finally { setSaving(false); }
  };

  const doAssignProgram = async () => {
    const recipients = resolveRecipients();
    if (recipients.size === 0) { Alert.alert('Pick recipients', 'Choose at least one student or class.'); return; }
    setSaving(true);
    try {
      // Snapshot each pack's tasks as that week's content, so later pack edits
      // don't retroactively change a running program.
      const weeks = (assignProg.packIds || []).map((pid) => {
        const p = packs.find((x) => x.id === pid);
        return (p?.tasks || []).map((t) => ({ title: t.title, description: t.description || '', youtube: t.youtube || '', durationMin: t.durationMin || 0 }));
      });
      const startDate = new Date().toISOString();
      const stamp = Date.now();
      const meSnap = await getDoc(doc(db, 'users', myUid));
      const existing = Array.isArray(meSnap.data()?.assignedPrograms) ? meSnap.data().assignedPrograms : [];
      const records = [...recipients.entries()].map(([uid, cls], ri) => ({
        id: `ap_${stamp}_${ri}`, programId: assignProg.id, name: assignProg.name,
        weeks, startDate, weeksAssigned: 0, recipientUid: uid,
        ...(cls ? { classId: cls.classId, className: cls.className } : {}),
      }));
      await updateDoc(doc(db, 'users', myUid), { assignedPrograms: [...existing, ...records] });
      await advancePrograms(myUid); // release Week 1 right away
      [...recipients.keys()].forEach((uid) => sendNotification(uid, {
        type: 'task_assigned', title: 'New program from your teacher', body: assignProg.name, data: { taskTitle: assignProg.name },
      }).catch(() => {}));
      const n = recipients.size;
      closeAssign();
      Alert.alert('Program started', `"${assignProg.name}" — Week 1 sent to ${n} student${n === 1 ? '' : 's'}. Each week releases automatically.`);
    } catch (e) {
      Alert.alert('Error', "Couldn't start the program. Please try again.");
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Home</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Packs & Programs</Text>
        <View style={{ width: 64 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionHeading}>PACKS</Text>
          <Text style={styles.intro}>Build a set of tasks once, then assign the whole pack to a student or class in one tap.</Text>

          {packs.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="albums-outline" size={34} color={COLORS.textMuted} style={{ marginBottom: SPACING.sm }} />
              <Text style={styles.emptyText}>No packs yet. Create your first reusable pack below.</Text>
            </View>
          ) : packs.map((p) => (
            <View key={p.id} style={styles.packCard}>
              <View style={styles.packTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.packName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.packMeta}>{p.tasks.length} task{p.tasks.length === 1 ? '' : 's'}</Text>
                </View>
                <TouchableOpacity onPress={() => openEdit(p)} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="create-outline" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deletePack(p)} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.assignBtn} onPress={() => openAssign(p)} activeOpacity={0.85}>
                <Ionicons name="send" size={15} color={COLORS.text} />
                <Text style={styles.assignBtnText}>Assign pack</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.newBtn} onPress={openNew} activeOpacity={0.85}>
            <Ionicons name="add" size={18} color={COLORS.primary} />
            <Text style={styles.newBtnText}>New pack</Text>
          </TouchableOpacity>

          <View style={styles.divider} />
          <Text style={styles.sectionHeading}>PROGRAMS</Text>
          <Text style={styles.intro}>Chain packs into a multi-week program — assign it once and each week releases to the student automatically.</Text>

          {programs.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="git-branch-outline" size={30} color={COLORS.textMuted} style={{ marginBottom: SPACING.sm }} />
              <Text style={styles.emptyText}>No programs yet. Build a few packs first, then chain them into weeks.</Text>
            </View>
          ) : programs.map((pr) => (
            <View key={pr.id} style={styles.packCard}>
              <View style={styles.packTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.packName} numberOfLines={1}>{pr.name}</Text>
                  <Text style={styles.packMeta}>{pr.packIds.length} week{pr.packIds.length === 1 ? '' : 's'}</Text>
                </View>
                <TouchableOpacity onPress={() => openEditProg(pr)} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="create-outline" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteProgram(pr)} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.assignBtn} onPress={() => openAssignProgram(pr)} activeOpacity={0.85}>
                <Ionicons name="rocket-outline" size={15} color={COLORS.text} />
                <Text style={styles.assignBtnText}>Start program</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.newBtn} onPress={openNewProg} activeOpacity={0.85}>
            <Ionicons name="add" size={18} color={COLORS.primary} />
            <Text style={styles.newBtnText}>New program</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Pack editor (full screen — keyboard-safe) ── */}
      <Modal visible={!!draft} animationType="slide" onRequestClose={() => setDraft(null)}>
        <View style={styles.container}>
          <View style={[styles.nav, { paddingTop: insets.top + SPACING.sm + 2 }]}>
            <TouchableOpacity onPress={() => setDraft(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.navCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.navTitle}>{draft?.id ? 'Edit pack' : 'New pack'}</Text>
            <TouchableOpacity onPress={saveDraft} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.navSave}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 80 }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            <TextInput
              style={styles.input}
              placeholder="Pack name (e.g. Beginner Week 1)"
              placeholderTextColor={COLORS.textMuted}
              value={draft?.name}
              onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))}
            />

            {(draft?.tasks || []).length > 0 && <Text style={styles.label}>TASKS ({draft.tasks.length})</Text>}
            {(draft?.tasks || []).map((t) => (
              <View key={t.id} style={styles.taskRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.taskRowTitle} numberOfLines={1}>{t.title}</Text>
                  <Text style={styles.taskRowMeta}>{t.durationMin ? `${t.durationMin} min` : 'open-ended'}</Text>
                </View>
                <TouchableOpacity onPress={() => removeDraftTask(t.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            ))}

            <Text style={styles.label}>ADD A TASK</Text>
            <TextInput style={styles.input} placeholder="Task title" placeholderTextColor={COLORS.textMuted}
              value={taskForm.title} onChangeText={(v) => setTaskForm((f) => ({ ...f, title: v }))} />
            <TextInput style={[styles.input, { minHeight: 56, textAlignVertical: 'top' }]} placeholder="Description (optional)" placeholderTextColor={COLORS.textMuted}
              value={taskForm.description} onChangeText={(v) => setTaskForm((f) => ({ ...f, description: v }))} multiline />
            <TextInput style={styles.input} placeholder="YouTube search or link (optional)" placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none" value={taskForm.youtube} onChangeText={(v) => setTaskForm((f) => ({ ...f, youtube: v }))} />
            <View style={styles.durRow}>
              <Text style={styles.durLabel}>Timer (min)</Text>
              <TextInput style={styles.durInput} keyboardType="number-pad" placeholder="10" placeholderTextColor={COLORS.textMuted}
                value={taskForm.durationMin} onChangeText={(v) => setTaskForm((f) => ({ ...f, durationMin: v.replace(/[^0-9]/g, '') }))} />
            </View>
            <TouchableOpacity style={styles.addTaskBtn} onPress={addTaskToDraft} activeOpacity={0.85}>
              <Ionicons name="add" size={16} color={COLORS.primary} />
              <Text style={styles.addTaskText}>Add task to pack</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Assign (packs + programs) ── */}
      <SheetModal visible={!!(assignPack || assignProg)} onRequestClose={closeAssign} cardStyle={styles.sheet}>
        <Text style={styles.sheetTitle}>{assignProg ? 'Start' : 'Assign'} “{(assignPack || assignProg)?.name}”</Text>
        <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {classes.length > 0 && <Text style={styles.label}>CLASSES</Text>}
          {classes.map((c) => {
            const on = selClasses.has(c.id);
            return (
              <TouchableOpacity key={c.id} style={styles.pickRow} onPress={() => toggleIn(setSelClasses)(c.id)} activeOpacity={0.7}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? COLORS.primary : COLORS.textMuted} />
                <Ionicons name="people" size={16} color={COLORS.accent} />
                <Text style={styles.pickName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.pickMeta}>{(c.studentUids || []).length}</Text>
              </TouchableOpacity>
            );
          })}
          <Text style={styles.label}>STUDENTS</Text>
          {students.length === 0 ? (
            <Text style={styles.emptyText}>No students connected yet.</Text>
          ) : students.map((s) => {
            const on = selStudents.has(s.uid);
            return (
              <TouchableOpacity key={s.uid} style={styles.pickRow} onPress={() => toggleIn(setSelStudents)(s.uid)} activeOpacity={0.7}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? COLORS.primary : COLORS.textMuted} />
                <Text style={styles.pickName} numberOfLines={1}>{displayName(s)}</Text>
                {!!s.level && <Text style={styles.pickMeta}>{s.level}</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={styles.sheetBtns}>
          <TouchableOpacity style={styles.cancelBtn} onPress={closeAssign}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={assignProg ? doAssignProgram : doAssign} disabled={saving}>
            {saving ? <ActivityIndicator color={COLORS.text} size="small" /> : <Text style={styles.saveText}>{assignProg ? 'Start program' : 'Assign'}</Text>}
          </TouchableOpacity>
        </View>
      </SheetModal>

      {/* ── Program editor (full screen — keyboard-safe) ── */}
      <Modal visible={!!progDraft} animationType="slide" onRequestClose={() => setProgDraft(null)}>
        <View style={styles.container}>
          <View style={[styles.nav, { paddingTop: insets.top + SPACING.sm + 2 }]}>
            <TouchableOpacity onPress={() => setProgDraft(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.navCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.navTitle}>{progDraft?.id ? 'Edit program' : 'New program'}</Text>
            <TouchableOpacity onPress={saveProgram} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.navSave}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 80 }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            <TextInput
              style={styles.input}
              placeholder="Program name (e.g. Beginner Method)"
              placeholderTextColor={COLORS.textMuted}
              value={progDraft?.name}
              onChangeText={(v) => setProgDraft((d) => ({ ...d, name: v }))}
            />

            {(progDraft?.packIds || []).length > 0 && <Text style={styles.label}>WEEKS ({progDraft.packIds.length})</Text>}
            {(progDraft?.packIds || []).map((pid, i) => {
              const p = packs.find((x) => x.id === pid);
              return (
                <View key={`${pid}_${i}`} style={styles.taskRow}>
                  <Text style={styles.weekBadge}>W{i + 1}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.taskRowTitle} numberOfLines={1}>{p ? p.name : 'Deleted pack'}</Text>
                    <Text style={styles.taskRowMeta}>{p ? `${p.tasks.length} task${p.tasks.length === 1 ? '' : 's'}` : 'no longer exists'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeWeek(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              );
            })}

            <Text style={styles.label}>ADD A WEEK — TAP A PACK</Text>
            {packs.map((p) => (
              <TouchableOpacity key={p.id} style={styles.pickRow} onPress={() => addWeek(p.id)} activeOpacity={0.7}>
                <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
                <Text style={styles.pickName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.pickMeta}>{p.tasks.length}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 64 },
  backText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  navCancel: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' },
  navSave: { color: COLORS.primary, fontSize: 15, fontWeight: '800' },
  body: { padding: SPACING.xl, paddingBottom: 60 },
  intro: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: SPACING.lg },

  emptyCard: { alignItems: 'center', paddingVertical: SPACING.xxl, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg },
  emptyText: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: SPACING.lg },

  packCard: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.md },
  packTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  packName: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  packMeta: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
  iconBtn: { padding: 4 },
  assignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: SPACING.sm + 2, marginTop: SPACING.md },
  assignBtnText: { color: COLORS.text, fontSize: 14, fontWeight: '800' },

  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: SPACING.md, borderWidth: 1, borderColor: COLORS.primary + '55', backgroundColor: COLORS.primary + '12' },
  newBtnText: { color: COLORS.primary, fontSize: 15, fontWeight: '800' },
  divider: { height: 1, backgroundColor: COLORS.border, marginTop: SPACING.xl, marginBottom: SPACING.lg },
  sectionHeading: { color: COLORS.text, fontSize: 18, fontWeight: '900', marginBottom: SPACING.xs },
  weekBadge: { color: COLORS.primary, fontSize: 12, fontWeight: '900', width: 30 },

  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: 40 },
  sheetTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginBottom: SPACING.md },
  label: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: SPACING.md, marginBottom: SPACING.xs },
  input: { backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 12, padding: SPACING.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },

  taskRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.md, marginBottom: SPACING.xs },
  taskRowTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  taskRowMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 1 },

  durRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  durLabel: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  durInput: { backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 10, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, width: 84, textAlign: 'center' },
  addTaskBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: SPACING.sm + 2, borderWidth: 1, borderColor: COLORS.primary + '55', backgroundColor: COLORS.primary + '12', marginTop: SPACING.xs },
  addTaskText: { color: COLORS.primary, fontSize: 14, fontWeight: '800' },

  pickRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm + 2, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickName: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 15, fontWeight: '600' },
  pickMeta: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },

  sheetBtns: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: SPACING.md, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  cancelText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700' },
  saveBtn: { flex: 1, alignItems: 'center', paddingVertical: SPACING.md, borderRadius: 12, backgroundColor: COLORS.primary },
  saveText: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
});
