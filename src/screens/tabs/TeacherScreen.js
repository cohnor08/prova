import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  collection, query, where, getDocs, doc, getDoc,
  updateDoc, arrayUnion, arrayRemove, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';

// ─── Paywall ────────────────────────────────────────────────────────────────

const DEMO_STUDENTS = [
  { name: 'Jamie R.', level: 'Intermediate', instrument: 'Guitar', streak: 12, hours: 34, lastSession: '2 days ago', tasks: '3/4', rating: '😊 Good' },
  { name: 'Priya K.', level: 'Beginner', instrument: 'Bass', streak: 5, hours: 8, lastSession: 'Today', tasks: '1/2', rating: '🔥 Great' },
  { name: 'Tom H.', level: 'Advanced', instrument: 'Guitar', streak: 28, hours: 120, lastSession: 'Yesterday', tasks: '5/5', rating: '⭐ Perfect' },
];

function DemoStudentCard({ student }) {
  return (
    <View style={styles.demoCard}>
      <View style={styles.studentHeader}>
        <View style={[styles.studentAvatar, { backgroundColor: COLORS.primaryDark }]}>
          <Text style={styles.studentAvatarText}>{student.name[0]}</Text>
        </View>
        <View style={styles.studentInfo}>
          <Text style={styles.studentEmail}>{student.name}</Text>
          <Text style={styles.studentMetaText}>{student.level} · {student.instrument}</Text>
        </View>
        <View style={styles.demoRatingBadge}>
          <Text style={styles.demoRatingText}>{student.rating}</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{student.streak}</Text>
          <Text style={styles.statLabel}>streak</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{student.hours}h</Text>
          <Text style={styles.statLabel}>total</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{student.lastSession}</Text>
          <Text style={styles.statLabel}>last session</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{student.tasks}</Text>
          <Text style={styles.statLabel}>tasks done</Text>
        </View>
      </View>
    </View>
  );
}

function PaywallScreen({ onUnlock }) {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const uid = auth.currentUser.uid;
      await updateDoc(doc(db, 'users', uid), { isTeacherPro: true });
      onUnlock();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Teacher Mode</Text>
        <Text style={styles.subtitle}>See what your dashboard looks like</Text>

        {/* Blurred demo preview */}
        <View style={styles.previewWrapper}>
          <View style={styles.demoInviteBar}>
            <Text style={styles.demoInviteText}>student@email.com</Text>
            <View style={styles.demoInviteBtn}>
              <Text style={styles.demoInviteBtnText}>Add</Text>
            </View>
          </View>

          {DEMO_STUDENTS.map((s) => (
            <DemoStudentCard key={s.name} student={s} />
          ))}

          {/* Frosted lock overlay */}
          <View style={styles.lockOverlay}>
            <View style={styles.lockBadge}>
              <Text style={styles.lockIcon}>🔒</Text>
              <Text style={styles.lockText}>Unlock Teacher Mode</Text>
            </View>
          </View>
        </View>

        {/* CTA card */}
        <View style={styles.paywallCard}>
          <Text style={styles.paywallTitle}>Prova for Teachers</Text>
          <Text style={styles.paywallDesc}>
            Monitor students' practice, assign custom tasks, and track their weekly progress.
          </Text>

          <View style={styles.featureList}>
            {[
              '✓  Add unlimited students',
              '✓  Assign custom practice tasks',
              '✓  View streaks, hours & ratings',
              '✓  Monitor weekly plans',
            ].map((f) => (
              <Text key={f} style={styles.featureItem}>{f}</Text>
            ))}
          </View>

          <View style={styles.pricingRow}>
            <Text style={styles.price}>£9.99</Text>
            <Text style={styles.pricePer}> / month</Text>
          </View>

          <TouchableOpacity
            style={[styles.subscribeBtn, loading && { opacity: 0.6 }]}
            onPress={handleSubscribe}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={COLORS.text} />
              : <Text style={styles.subscribeBtnText}>Start Free Trial</Text>}
          </TouchableOpacity>
          <Text style={styles.trialNote}>7-day free trial · Cancel anytime</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Assign Task Modal ───────────────────────────────────────────────────────

function AssignTaskModal({ student, visible, onClose, onAssigned }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAssign = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const task = {
        id: Date.now().toString(),
        title: title.trim(),
        description: description.trim(),
        completed: false,
        assignedAt: new Date().toISOString(),
        teacherUid: auth.currentUser.uid,
      };
      await updateDoc(doc(db, 'users', student.uid), {
        assignedTasks: arrayUnion(task),
      });
      setTitle('');
      setDescription('');
      onAssigned();
      onClose();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Assign Task</Text>
          <Text style={styles.modalSubtitle}>To: {student?.email}</Text>

          <TextInput
            style={styles.input}
            placeholder="Task title"
            placeholderTextColor={COLORS.textMuted}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="Description (optional)"
            placeholderTextColor={COLORS.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalAssignBtn, (!title.trim() || loading) && { opacity: 0.5 }]}
              onPress={handleAssign}
              disabled={!title.trim() || loading}
            >
              {loading
                ? <ActivityIndicator color={COLORS.text} size="small" />
                : <Text style={styles.modalAssignText}>Assign</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Teacher Dashboard ───────────────────────────────────────────────────────

function TeacherDashboard() {
  const [students, setStudents] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useFocusEffect(
    React.useCallback(() => {
      loadStudents();
    }, [])
  );

  const loadStudents = async () => {
    setLoading(true);
    try {
      const uid = auth.currentUser.uid;
      const snap = await getDoc(doc(db, 'users', uid));
      const studentUids = snap.data()?.students || [];
      const data = await Promise.all(
        studentUids.map(async (suid) => {
          const s = await getDoc(doc(db, 'users', suid));
          return s.exists() ? { uid: suid, ...s.data() } : null;
        })
      );
      setStudents(data.filter(Boolean));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addStudent = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviting(true);
    try {
      const q = query(collection(db, 'users'), where('email', '==', email));
      const snap = await getDocs(q);
      if (snap.empty) {
        Alert.alert('Not found', 'No Prova account found with that email.');
        return;
      }
      const studentUid = snap.docs[0].id;
      if (students.find((s) => s.uid === studentUid)) {
        Alert.alert('Already added', 'This student is already in your list.');
        return;
      }
      const uid = auth.currentUser.uid;
      await updateDoc(doc(db, 'users', uid), { students: arrayUnion(studentUid) });
      await updateDoc(doc(db, 'users', studentUid), { teacherUid: uid });
      setInviteEmail('');
      await loadStudents();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setInviting(false);
    }
  };

  const removeStudent = (studentUid, email) => {
    Alert.alert('Remove Student', `Remove ${email}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const uid = auth.currentUser.uid;
          await updateDoc(doc(db, 'users', uid), { students: arrayRemove(studentUid) });
          await updateDoc(doc(db, 'users', studentUid), { teacherUid: null });
          setStudents((prev) => prev.filter((s) => s.uid !== studentUid));
        },
      },
    ]);
  };

  if (loading) {
    return <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />;
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>My Students</Text>

        <View style={styles.inviteCard}>
          <Text style={styles.inviteLabel}>Add student by email</Text>
          <View style={styles.inviteRow}>
            <TextInput
              style={styles.inviteInput}
              placeholder="student@email.com"
              placeholderTextColor={COLORS.textMuted}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.inviteBtn, inviting && { opacity: 0.6 }]}
              onPress={addStudent}
              disabled={inviting}
            >
              {inviting
                ? <ActivityIndicator color={COLORS.text} size="small" />
                : <Text style={styles.inviteBtnText}>Add</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {students.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>No students yet — add one above</Text>
          </View>
        ) : (
          students.map((student) => {
            const isOpen = expanded === student.uid;
            const streak = student.streak || 0;
            const hours = Math.floor((student.totalMinutes || 0) / 60);
            const lastDate = student.lastSessionDate
              ? new Date(student.lastSessionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              : 'Never';
            const assignedCount = student.assignedTasks?.length || 0;
            const doneCount = student.assignedTasks?.filter((t) => t.completed).length || 0;

            return (
              <View key={student.uid} style={styles.studentCard}>
                <TouchableOpacity
                  style={styles.studentHeader}
                  onPress={() => setExpanded(isOpen ? null : student.uid)}
                  activeOpacity={0.8}
                >
                  <View style={styles.studentAvatar}>
                    <Text style={styles.studentAvatarText}>{(student.email || '?')[0].toUpperCase()}</Text>
                  </View>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentEmail}>{student.email}</Text>
                    <Text style={styles.studentMetaText}>
                      {student.level || 'Beginner'} · {student.instrument || 'Guitar'}
                    </Text>
                  </View>
                  <Text style={styles.expandIcon}>{isOpen ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.studentDetails}>
                    <View style={styles.statsRow}>
                      <View style={styles.statBox}>
                        <Text style={styles.statValue}>{streak}</Text>
                        <Text style={styles.statLabel}>streak</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={styles.statValue}>{hours}h</Text>
                        <Text style={styles.statLabel}>total</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={styles.statValue}>{lastDate}</Text>
                        <Text style={styles.statLabel}>last session</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={styles.statValue}>{doneCount}/{assignedCount}</Text>
                        <Text style={styles.statLabel}>tasks done</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.assignBtn}
                      onPress={() => setSelectedStudent(student)}
                    >
                      <Text style={styles.assignBtnText}>+ Assign Task</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removeStudent(student.uid, student.email)}
                    >
                      <Text style={styles.removeBtnText}>Remove Student</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <AssignTaskModal
        student={selectedStudent}
        visible={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
        onAssigned={loadStudents}
      />
    </>
  );
}

// ─── Student Assigned Tasks View ─────────────────────────────────────────────

function StudentTasksView({ assignedTasks, teacherUid }) {
  const [tasks, setTasks] = useState(assignedTasks || []);
  const [loading, setLoading] = useState(false);

  const toggleTask = async (taskId) => {
    setLoading(true);
    try {
      const uid = auth.currentUser.uid;
      const snap = await getDoc(doc(db, 'users', uid));
      const current = snap.data()?.assignedTasks || [];
      const updated = current.map((t) =>
        t.id === taskId ? { ...t, completed: !t.completed } : t
      );
      await updateDoc(doc(db, 'users', uid), { assignedTasks: updated });
      setTasks(updated);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const pending = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Assigned Tasks</Text>
      <Text style={styles.subtitle}>Tasks set by your teacher</Text>

      {tasks.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No tasks assigned yet</Text>
        </View>
      ) : (
        <>
          {pending.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>TO DO</Text>
              {pending.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  style={styles.taskCard}
                  onPress={() => toggleTask(task.id)}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <View style={styles.taskCheck} />
                  <View style={styles.taskContent}>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    {!!task.description && (
                      <Text style={styles.taskDesc}>{task.description}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          {done.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>COMPLETED</Text>
              {done.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  style={[styles.taskCard, styles.taskCardDone]}
                  onPress={() => toggleTask(task.id)}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <View style={styles.taskCheckDone}>
                    <Text style={styles.taskCheckMark}>✓</Text>
                  </View>
                  <View style={styles.taskContent}>
                    <Text style={[styles.taskTitle, styles.taskTitleDone]}>{task.title}</Text>
                    {!!task.description && (
                      <Text style={styles.taskDesc}>{task.description}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ─── Root Screen ─────────────────────────────────────────────────────────────

export default function TeacherScreen() {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    React.useCallback(() => {
      loadUser();
    }, [])
  );

  const loadUser = async () => {
    setLoading(true);
    try {
      const uid = auth.currentUser.uid;
      const snap = await getDoc(doc(db, 'users', uid));
      setUserData(snap.data());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  // Student with a teacher → show assigned tasks
  if (userData?.teacherUid) {
    return (
      <SafeAreaView style={styles.container}>
        <StudentTasksView
          assignedTasks={userData.assignedTasks || []}
          teacherUid={userData.teacherUid}
        />
      </SafeAreaView>
    );
  }

  // Not subscribed → paywall
  if (!userData?.isTeacherPro) {
    return <PaywallScreen onUnlock={loadUser} />;
  }

  // Teacher subscribed → dashboard
  return (
    <SafeAreaView style={styles.container}>
      <TeacherDashboard />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.xs },
  subtitle: { color: COLORS.textSecondary, fontSize: 14, marginBottom: SPACING.lg },
  sectionLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: SPACING.sm },

  // Paywall teaser
  previewWrapper: { position: 'relative', marginBottom: SPACING.lg },
  demoCard: {
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.border, marginBottom: SPACING.md, padding: SPACING.md,
  },
  demoInviteBar: {
    flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
    alignItems: 'center', marginBottom: SPACING.md, gap: SPACING.sm,
  },
  demoInviteText: { flex: 1, color: COLORS.textMuted, fontSize: 14 },
  demoInviteBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  demoInviteBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  demoRatingBadge: { backgroundColor: COLORS.surface, borderRadius: 8, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  demoRatingText: { fontSize: 11, color: COLORS.textSecondary },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,8,16,0.75)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadge: {
    backgroundColor: COLORS.card, borderRadius: 16, paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  lockIcon: { fontSize: 28, marginBottom: SPACING.xs },
  lockText: { color: COLORS.text, fontWeight: '800', fontSize: 15 },

  // Paywall
  paywallCard: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: SPACING.xl,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.lg,
  },
  paywallIcon: { fontSize: 52, marginBottom: SPACING.md },
  paywallTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800', marginBottom: SPACING.sm },
  paywallDesc: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: SPACING.lg },
  featureList: { alignSelf: 'stretch', marginBottom: SPACING.lg, gap: SPACING.sm },
  featureItem: { color: COLORS.text, fontSize: 14 },
  pricingRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: SPACING.md },
  price: { color: COLORS.primary, fontSize: 36, fontWeight: '900' },
  pricePer: { color: COLORS.textSecondary, fontSize: 16 },
  subscribeBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl, width: '100%', alignItems: 'center', marginBottom: SPACING.sm,
  },
  subscribeBtnText: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  trialNote: { color: COLORS.textMuted, fontSize: 12 },

  // Invite
  inviteCard: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg,
  },
  inviteLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 1 },
  inviteRow: { flexDirection: 'row', gap: SPACING.sm },
  inviteInput: {
    flex: 1, backgroundColor: COLORS.surface, color: COLORS.text, borderRadius: 8,
    padding: SPACING.sm, fontSize: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  inviteBtn: {
    backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: SPACING.md,
    justifyContent: 'center', minWidth: 56, alignItems: 'center',
  },
  inviteBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },

  // Student card
  studentCard: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  studentHeader: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md },
  studentAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  studentAvatarText: { color: COLORS.text, fontWeight: '800', fontSize: 16 },
  studentInfo: { flex: 1 },
  studentEmail: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
  studentMetaText: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  expandIcon: { color: COLORS.textMuted, fontSize: 10 },
  studentDetails: { borderTopWidth: 1, borderTopColor: COLORS.border, padding: SPACING.md },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: SPACING.md },
  statBox: { alignItems: 'center' },
  statValue: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  statLabel: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  assignBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10, padding: SPACING.sm,
    alignItems: 'center', marginBottom: SPACING.sm,
  },
  assignBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  removeBtn: { alignSelf: 'flex-end', paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md, borderRadius: 8, borderWidth: 1, borderColor: COLORS.error },
  removeBtnText: { color: COLORS.error, fontSize: 12, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.xl },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginBottom: SPACING.xs },
  modalSubtitle: { color: COLORS.textSecondary, fontSize: 13, marginBottom: SPACING.lg },
  input: {
    backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 10,
    padding: SPACING.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md,
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  modalBtns: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  modalCancelBtn: { flex: 1, padding: SPACING.md, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  modalCancelText: { color: COLORS.textSecondary, fontWeight: '600' },
  modalAssignBtn: { flex: 1, padding: SPACING.md, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  modalAssignText: { color: COLORS.text, fontWeight: '700' },

  // Task cards
  taskCard: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.card,
    borderRadius: 12, padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md,
  },
  taskCardDone: { opacity: 0.5 },
  taskCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.primary, marginTop: 1 },
  taskCheckDone: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  taskCheckMark: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  taskContent: { flex: 1 },
  taskTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  taskTitleDone: { textDecorationLine: 'line-through', color: COLORS.textSecondary },
  taskDesc: { color: COLORS.textSecondary, fontSize: 13, marginTop: 3 },

  // Empty
  emptyState: { alignItems: 'center', paddingTop: SPACING.xxl },
  emptyIcon: { fontSize: 48, marginBottom: SPACING.md },
  emptyText: { color: COLORS.textSecondary, fontSize: 15 },
});
