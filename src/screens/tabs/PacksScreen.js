import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { displayName } from '../../lib/displayName';
import { sendNotification } from '../../lib/inbox';
import { COLORS, SPACING } from '../../constants/theme';
import SheetModal from '../../components/SheetModal';

// Assignment Packs = a reusable bundle of practice tasks a teacher builds once
// and assigns to any student or class in one tap. The pack lives on the teacher
// doc (`taskPacks`); assigning writes a fresh copy of every task into each
// recipient's `assignedTasks` (same shape the one-off assign flow uses).

const emptyDraft = () => ({ id: null, name: '', tasks: [], createdAt: null });
const emptyTask = () => ({ title: '', description: '', youtube: '', durationMin: '10' });

export default function PacksScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [packs, setPacks] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [draft, setDraft] = useState(null);            // pack being created/edited
  const [taskForm, setTaskForm] = useState(emptyTask());
  const [assignPack, setAssignPack] = useState(null);  // pack being assigned
  const [selStudents, setSelStudents] = useState(() => new Set());
  const [selClasses, setSelClasses] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  const myUid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    if (!myUid) { setLoading(false); return; }
    try {
      const meSnap = await getDoc(doc(db, 'users', myUid));
      const me = meSnap.data() || {};
      setPacks(Array.isArray(me.taskPacks) ? me.taskPacks : []);
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

  // ── Assign ──
  const openAssign = (p) => { setSelStudents(new Set()); setSelClasses(new Set()); setAssignPack(p); };
  const toggleIn = (setFn) => (id) => setFn((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const doAssign = async () => {
    const recipients = new Map(); // uid -> class tag | null
    selStudents.forEach((uid) => { if (!recipients.has(uid)) recipients.set(uid, null); });
    selClasses.forEach((cid) => {
      const c = classes.find((k) => k.id === cid);
      (c?.studentUids || []).forEach((uid) => {
        if (students.some((s) => s.uid === uid)) recipients.set(uid, { classId: c.id, className: c.name });
      });
    });
    if (recipients.size === 0) { Alert.alert('Pick recipients', 'Choose at least one student or class.'); return; }
    setSaving(true);
    try {
      const stamp = Date.now();
      await Promise.all([...recipients.entries()].map(([uid, cls], ri) => {
        const tasks = (assignPack.tasks || []).map((t, ti) => ({
          title: t.title,
          description: t.description || '',
          youtube: t.youtube || '',
          song: '',
          dueDate: null,
          durationMin: t.durationMin || 0,
          completed: false,
          assignedAt: new Date().toISOString(),
          teacherUid: myUid,
          ...(cls || {}),
          id: `${stamp}_${ri}_${ti}`,
        }));
        return updateDoc(doc(db, 'users', uid), { assignedTasks: arrayUnion(...tasks) });
      }));
      [...recipients.keys()].forEach((uid) => sendNotification(uid, {
        type: 'task_assigned', title: 'New tasks from your teacher', body: assignPack.name, data: { taskTitle: assignPack.name },
      }).catch(() => {}));
      const n = recipients.size;
      setAssignPack(null);
      Alert.alert('Assigned', `"${assignPack.name}" sent to ${n} student${n === 1 ? '' : 's'}.`);
    } catch (e) {
      Alert.alert('Error', "Couldn't assign the pack. Please try again.");
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Home</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Assignment Packs</Text>
        <View style={{ width: 64 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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
        </ScrollView>
      )}

      {/* ── Editor ── */}
      <SheetModal visible={!!draft} onRequestClose={() => setDraft(null)} cardStyle={styles.sheet} keyboardAvoiding>
        <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.sheetTitle}>{draft?.id ? 'Edit pack' : 'New pack'}</Text>
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
        <View style={styles.sheetBtns}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setDraft(null)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={saveDraft}>
            <Text style={styles.saveText}>Save pack</Text>
          </TouchableOpacity>
        </View>
      </SheetModal>

      {/* ── Assign ── */}
      <SheetModal visible={!!assignPack} onRequestClose={() => setAssignPack(null)} cardStyle={styles.sheet}>
        <Text style={styles.sheetTitle}>Assign “{assignPack?.name}”</Text>
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
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setAssignPack(null)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={doAssign} disabled={saving}>
            {saving ? <ActivityIndicator color={COLORS.text} size="small" /> : <Text style={styles.saveText}>Assign</Text>}
          </TouchableOpacity>
        </View>
      </SheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 64 },
  backText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
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
