import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal, FlatList,
  KeyboardAvoidingView, Platform, Share, Keyboard, Image, InputAccessoryView,
} from 'react-native';
import ProofMedia from '../../components/ProofMedia';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where, getDocs, doc, getDoc,
  updateDoc, arrayUnion, arrayRemove, onSnapshot, orderBy, limit,
} from 'firebase/firestore';
import { auth, db, ignorePermissionDenied } from '../../lib/firebase';
import { generateSongPlan } from '../../lib/claude';
import { ensureTeacherCode } from '../../lib/teacher';
import { makeChatId, sendChatMessage, markChatRead, receiptStatus } from '../../lib/chat';
import { createGroupChat, deleteGroupChat } from '../../lib/groupChat';
import { sendNotification } from '../../lib/inbox';
import { displayName } from '../../lib/displayName';
import { notifyOverdueTasks } from '../../lib/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pickMedia, captureMedia, uploadChatMedia } from '../../lib/media';
import { COLORS, SPACING, TAB_BAR_STYLE } from '../../constants/theme';
import MediaMessageBubble from '../../components/MediaMessageBubble';
import GroupChatView from '../../components/GroupChatView';
import SheetModal from '../../components/SheetModal';

// ─── Demo ─────────────────────────────────────────────────────────────────────

// Real teacher mode: students connect via the teacher's join code (their
// teacherUid is set). Flip back to true only to populate the screens with the
// sample students below for a screenshot/pitch.
export const DEMO_MODE = false;

const _now = Date.now();
export const DEMO_STUDENTS_DATA = [
  {
    uid: 'demo_1',
    name: 'Jamie Robertson',
    email: 'jamie.r@email.com',
    level: 'Intermediate',
    instrument: 'Guitar',
    streak: 12,
    totalMinutes: 2040,
    lastSessionDate: new Date(_now - 2 * 86400000).toISOString(),
    lastSessionMins: 45,
    lastSessionNote: 'Pentatonic scales, chord transitions',
    availableDays: ['monday', 'wednesday', 'friday', 'saturday'],
    assignedTasks: [
      { id: 'd1_1', title: 'Pentatonic scale runs — 3 positions at 60 bpm', completed: true },
      { id: 'd1_2', title: 'Chord transitions G to C to D', completed: false },
      { id: 'd1_3', title: 'Fingerpicking pattern', completed: false },
    ],
    lastSessionRating: 'Good',
    demoMessages: [
      { id: 'm1', senderRole: 'student', text: 'Finished the pentatonic exercises — felt way smoother today', ts: _now - 7200000 },
      { id: 'm2', senderRole: 'teacher', text: 'Great work. Try adding vibrato on the last note of each run.', ts: _now - 3600000 },
      { id: 'm3', senderRole: 'student', text: 'When should I move on to barre chords?', ts: _now - 1800000 },
    ],
  },
  {
    uid: 'demo_2',
    name: 'Priya Kapoor',
    email: 'priya.k@email.com',
    level: 'Beginner',
    instrument: 'Bass',
    streak: 5,
    totalMinutes: 480,
    lastSessionDate: new Date(_now - 3 * 3600000).toISOString(),
    lastSessionMins: 30,
    lastSessionNote: 'Root note exercise, C major scale',
    availableDays: ['tuesday', 'thursday', 'friday'],
    assignedTasks: [
      { id: 'd2_1', title: 'Root note exercise', completed: true },
      { id: 'd2_2', title: 'Simple bassline in C major', completed: false },
    ],
    lastSessionRating: 'Great',
    demoMessages: [
      { id: 'm1', senderRole: 'student', text: 'Just finished my session. Root note exercise is clicking now.', ts: _now - 10800000 },
      { id: 'm2', senderRole: 'teacher', text: 'Really good progress Priya. Stay consistent this week.', ts: _now - 9000000 },
    ],
  },
  {
    uid: 'demo_3',
    name: 'Tom Harris',
    email: 'tom.h@email.com',
    level: 'Advanced',
    instrument: 'Guitar',
    streak: 28,
    totalMinutes: 7200,
    lastSessionDate: new Date(_now - 3 * 86400000).toISOString(),
    lastSessionMins: 90,
    lastSessionNote: 'Sweep picking, modal improv in Dorian',
    availableDays: ['monday', 'tuesday', 'thursday', 'saturday', 'sunday'],
    assignedTasks: [
      { id: 'd3_1', title: 'Sweep picking arpeggios', completed: true },
      { id: 'd3_2', title: 'Economy picking exercise', completed: true },
      { id: 'd3_3', title: 'Modal improv in Dorian', completed: true },
      { id: 'd3_4', title: 'Tapping lick from lesson', completed: true },
      { id: 'd3_5', title: 'Compose an 8-bar phrase', completed: true },
    ],
    lastSessionRating: 'Perfect',
    demoMessages: [
      { id: 'm1', senderRole: 'teacher', text: 'All 5 tasks done again. Ready for hybrid picking next week?', ts: _now - 86400000 },
      { id: 'm2', senderRole: 'student', text: 'Absolutely. Already been watching videos on it.', ts: _now - 82800000 },
    ],
  },
  {
    uid: 'demo_4',
    name: 'Lena Müller',
    email: 'lena.m@email.com',
    level: 'Novice',
    instrument: 'Guitar',
    streak: 0,
    totalMinutes: 300,
    lastSessionDate: new Date(_now - 5 * 86400000).toISOString(),
    lastSessionMins: 20,
    lastSessionNote: 'Open chord shapes',
    availableDays: ['wednesday', 'friday', 'saturday'],
    assignedTasks: [
      { id: 'd4_1', title: 'Open chord shapes (E, A, D)', completed: false },
      { id: 'd4_2', title: 'Slow strumming to metronome', completed: false },
    ],
    lastSessionRating: 'OK',
    demoMessages: [
      { id: 'm1', senderRole: 'student', text: 'My fingers keep buzzing on the E chord.', ts: _now - 259200000 },
      { id: 'm2', senderRole: 'teacher', text: 'Completely normal at this stage. Make sure your fingertip is right behind the fret. Slow it right down.', ts: _now - 255600000 },
    ],
  },
];

const WEEK_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Full "Sat, Jun 20 · 5:00 PM" for the assign-task due field.
function formatDueFull(due) {
  const d = new Date(due);
  if (isNaN(d)) return 'No due date';
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

// Short due badge for a task (ISO datetime) — null when there's no due date.
function taskDueLabel(due) {
  if (!due) return null;
  const d = new Date(due);
  if (isNaN(d)) return null;
  if (d < new Date()) return { text: 'Overdue', overdue: true };
  const d0 = new Date(d); d0.setHours(0, 0, 0, 0);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const days = Math.round((d0 - t0) / 86400000);
  if (days === 0) return { text: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), overdue: false };
  if (days === 1) return { text: 'Tomorrow', overdue: false };
  return { text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false };
}

// "45s" / "12m" / "1h 05m" — how long a student has practiced a task.
function fmtPractised(sec) {
  const s = Math.round(sec || 0);
  if (s <= 0) return null;
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function getStudentStatus(student) {
  if (!student.lastSessionDate) {
    return { text: 'No sessions yet', color: COLORS.textMuted };
  }
  const firstName = student.name ? student.name.split(' ')[0] : 'Student';
  const diffMs = Date.now() - new Date(student.lastSessionDate).getTime();
  const diffHours = diffMs / 3600000;
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffHours < 3) return { text: 'Active now', color: COLORS.success };
  if (diffDays === 0) {
    const mins = student.lastSessionMins;
    return { text: mins ? `Practiced today · ${mins} min` : 'Practiced today', color: COLORS.success };
  }
  if (diffDays === 1) {
    const mins = student.lastSessionMins;
    return { text: mins ? `Practiced yesterday · ${mins} min` : 'Practiced yesterday', color: COLORS.accent };
  }
  if (diffDays <= 3) {
    return { text: `${firstName} hasn't practiced in ${diffDays} days`, color: '#F59E0B' };
  }
  return { text: `${firstName} hasn't practiced in ${diffDays} days`, color: COLORS.error };
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

// ─── Paywall ──────────────────────────────────────────────────────────────────

const DEMO_PREVIEW_STUDENTS = [
  { name: 'Jamie R.', level: 'Intermediate', instrument: 'Guitar', streak: 12, hours: 34, lastSession: '2 days ago', tasks: '3/4', rating: '🔥 On fire' },
  { name: 'Priya K.', level: 'Beginner', instrument: 'Bass', streak: 5, hours: 8, lastSession: 'Today', tasks: '1/2', rating: '😊 Good' },
  { name: 'Tom H.', level: 'Advanced', instrument: 'Guitar', streak: 28, hours: 120, lastSession: 'Yesterday', tasks: '5/5', rating: '⭐ Perfect' },
];

function DemoStudentCard({ student }) {
  return (
    <View style={styles.demoCard}>
      <View style={styles.studentHeader}>
        <View style={[styles.studentAvatar, { backgroundColor: COLORS.primaryDark || COLORS.primary }]}>
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
        {[
          { value: student.streak, label: 'streak' },
          { value: `${student.hours}h`, label: 'total' },
          { value: student.lastSession, label: 'last session' },
          { value: student.tasks, label: 'tasks done' },
        ].map(s => (
          <View key={s.label} style={styles.statBox}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
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
          {DEMO_PREVIEW_STUDENTS.map(s => (
            <DemoStudentCard key={s.name} student={s} />
          ))}
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
              'Add unlimited students',
              'Assign custom practice tasks',
              'View streaks, hours and ratings',
              'Chat directly with students',
            ].map((f) => (
              <View key={f} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.success} style={{ marginRight: 8 }} />
                <Text style={styles.featureItem}>{f}</Text>
              </View>
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

// ─── Create Class Modal ──────────────────────────────────────────────────────

function CreateClassModal({ visible, students, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  const toggle = (uid) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(uid)) n.delete(uid); else n.add(uid);
    return n;
  });
  const reset = () => { setName(''); setSearch(''); setSelected(new Set()); };

  const q = search.trim().toLowerCase();
  const shown = q
    ? students.filter((s) => displayName(s).toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q))
    : students;
  const create = () => {
    if (!name.trim()) { Alert.alert('Name your class', 'Give the class a name first.'); return; }
    onCreate(name.trim(), [...selected]);
    reset();
  };

  return (
    <SheetModal visible={visible} onRequestClose={onClose} cardStyle={styles.modalCard} keyboardAvoiding>
            <Text style={styles.modalTitle}>New class</Text>
            <TextInput
              style={styles.input}
              placeholder="Class name (e.g. Tuesday Beginners)"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
            />
            <Text style={styles.tplLabel}>ADD STUDENTS ({selected.size})</Text>
            {students.length === 0 ? (
              <Text style={styles.tplSheetEmpty}>No students yet — connect students with your join code first.</Text>
            ) : (
              <>
                {students.length > 5 && (
                  <TextInput
                    style={[styles.input, { marginBottom: SPACING.sm }]}
                    placeholder="Search students…"
                    placeholderTextColor={COLORS.textMuted}
                    value={search}
                    onChangeText={setSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                )}
                <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
                  {shown.length === 0 ? (
                    <Text style={styles.tplSheetEmpty}>No students match “{search}”.</Text>
                  ) : shown.map((s) => {
                  const on = selected.has(s.uid);
                  const nm = displayName(s);
                  return (
                    <TouchableOpacity key={s.uid} style={styles.classPickRow} onPress={() => toggle(s.uid)} activeOpacity={0.7}>
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? COLORS.primary : COLORS.textMuted} />
                      <Text style={styles.classPickName} numberOfLines={1}>{nm}</Text>
                      {!!s.level && <Text style={styles.classPickMeta}>{s.level}</Text>}
                    </TouchableOpacity>
                  );
                })}
                </ScrollView>
              </>
            )}
            {!name.trim() && (
              <Text style={styles.classHint}>Type a class name above to create it.</Text>
            )}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { reset(); onClose(); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              {/* Stays tappable even when dimmed so it can tell the teacher what's missing. */}
              <TouchableOpacity style={[styles.modalAssignBtn, !name.trim() && { opacity: 0.5 }]} onPress={create}>
                <Text style={styles.modalAssignText}>Create class</Text>
              </TouchableOpacity>
            </View>
    </SheetModal>
  );
}

// Create a class group chat (announcements). The teacher either picks a class
// (pre-fills its students) or hand-picks students. Only the teacher can post in
// the resulting thread; students react.
function CreateGroupChatModal({ visible, students, classes, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [classId, setClassId] = useState(null);

  const reset = () => { setName(''); setSearch(''); setSelected(new Set()); setClassId(null); };
  const toggle = (uid) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(uid)) n.delete(uid); else n.add(uid);
    return n;
  });

  // Picking a class fills the selection with its (still-connected) members and
  // seeds the name. Tapping it again clears back to manual mode.
  const pickClass = (c) => {
    if (classId === c.id) { setClassId(null); setSelected(new Set()); return; }
    const memberUids = (c.studentUids || []).filter((uid) => students.some((s) => s.uid === uid));
    setClassId(c.id);
    setSelected(new Set(memberUids));
    if (!name.trim()) setName(c.name);
  };

  const q = search.trim().toLowerCase();
  const shown = q
    ? students.filter((s) => displayName(s).toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q))
    : students;

  const create = () => {
    if (!name.trim()) { Alert.alert('Name the group', 'Give the group chat a name first.'); return; }
    if (selected.size === 0) { Alert.alert('Add members', 'Pick a class or at least one student.'); return; }
    onCreate(name.trim(), [...selected], classId);
    reset();
  };

  return (
    <SheetModal visible={visible} onRequestClose={onClose} cardStyle={styles.modalCard} keyboardAvoiding>
          <ScrollView
            style={{ maxHeight: 380 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: SPACING.sm }}
          >
            <Text style={styles.modalTitle}>New group chat</Text>
            <Text style={styles.tplSheetEmpty}>Only you can post — students can react.</Text>
            <TextInput
              style={[styles.input, { marginTop: SPACING.sm }]}
              placeholder="Group name (e.g. Tuesday Beginners)"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
            />
            {classes.length > 0 && (
              <>
                <Text style={styles.tplLabel}>USE A CLASS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
                  {classes.map((c) => {
                    const on = classId === c.id;
                    return (
                      <TouchableOpacity key={c.id} style={[styles.classPickChip, on && styles.classPickChipOn]} onPress={() => pickClass(c)} activeOpacity={0.8}>
                        <Text style={[styles.classPickChipText, on && styles.classPickChipTextOn]} numberOfLines={1}>{c.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}
            <Text style={styles.tplLabel}>MEMBERS ({selected.size})</Text>
            {students.length === 0 ? (
              <Text style={styles.tplSheetEmpty}>No students yet — connect students with your join code first.</Text>
            ) : (
              <>
                {students.length > 5 && (
                  <TextInput
                    style={[styles.input, { marginBottom: SPACING.sm }]}
                    placeholder="Search students…"
                    placeholderTextColor={COLORS.textMuted}
                    value={search}
                    onChangeText={setSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                )}
                <View>
                  {shown.length === 0 ? (
                    <Text style={styles.tplSheetEmpty}>No students match “{search}”.</Text>
                  ) : shown.map((s) => {
                    const on = selected.has(s.uid);
                    return (
                      <TouchableOpacity key={s.uid} style={styles.classPickRow} onPress={() => toggle(s.uid)} activeOpacity={0.7}>
                        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? COLORS.primary : COLORS.textMuted} />
                        <Text style={styles.classPickName} numberOfLines={1}>{displayName(s)}</Text>
                        {!!s.level && <Text style={styles.classPickMeta}>{s.level}</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { reset(); onClose(); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalAssignBtn, (!name.trim() || selected.size === 0) && { opacity: 0.5 }]} onPress={create}>
                <Text style={styles.modalAssignText}>Create chat</Text>
              </TouchableOpacity>
            </View>
    </SheetModal>
  );
}

// Add more students to an EXISTING class, optionally back-assigning every task
// the class has already been given so the newcomers catch up.
function AddStudentsModal({ visible, klass, students, onClose, onAdd }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [assignTasks, setAssignTasks] = useState(true);
  const reset = () => { setSearch(''); setSelected(new Set()); setAssignTasks(true); };

  const memberSet = new Set(klass?.studentUids || []);
  const available = students.filter((s) => !memberSet.has(s.uid));
  const q = search.trim().toLowerCase();
  const shown = q
    ? available.filter((s) => displayName(s).toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q))
    : available;

  const toggle = (uid) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(uid)) n.delete(uid); else n.add(uid);
    return n;
  });
  const submit = () => {
    if (selected.size === 0) { Alert.alert('Pick students', 'Select at least one student to add.'); return; }
    onAdd([...selected], assignTasks);
    reset();
  };

  return (
    <SheetModal visible={visible} onRequestClose={onClose} cardStyle={styles.modalCard} keyboardAvoiding>
            <Text style={styles.modalTitle}>Add students{klass ? ` to ${klass.name}` : ''}</Text>
            {available.length === 0 ? (
              <Text style={styles.tplSheetEmpty}>All your students are already in this class.</Text>
            ) : (
              <>
                <Text style={styles.tplLabel}>STUDENTS ({selected.size})</Text>
                {available.length > 5 && (
                  <TextInput
                    style={[styles.input, { marginBottom: SPACING.sm }]}
                    placeholder="Search students…"
                    placeholderTextColor={COLORS.textMuted}
                    value={search}
                    onChangeText={setSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                )}
                <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
                  {shown.length === 0 ? (
                    <Text style={styles.tplSheetEmpty}>No students match “{search}”.</Text>
                  ) : shown.map((s) => {
                    const on = selected.has(s.uid);
                    return (
                      <TouchableOpacity key={s.uid} style={styles.classPickRow} onPress={() => toggle(s.uid)} activeOpacity={0.7}>
                        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? COLORS.primary : COLORS.textMuted} />
                        <Text style={styles.classPickName} numberOfLines={1}>{displayName(s)}</Text>
                        {!!s.level && <Text style={styles.classPickMeta}>{s.level}</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity style={styles.assignTasksRow} onPress={() => setAssignTasks((v) => !v)} activeOpacity={0.7}>
                  <Ionicons name={assignTasks ? 'checkbox' : 'square-outline'} size={20} color={assignTasks ? COLORS.primary : COLORS.textMuted} />
                  <Text style={styles.assignTasksText}>Also give them the class’s current tasks</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { reset(); onClose(); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalAssignBtn, selected.size === 0 && { opacity: 0.5 }]} onPress={submit}>
                <Text style={styles.modalAssignText}>Add{selected.size > 0 ? ` (${selected.size})` : ''}</Text>
              </TouchableOpacity>
            </View>
    </SheetModal>
  );
}

// ─── Assign Task Modal ────────────────────────────────────────────────────────

// Calendar + time picker for a task due date (no external dependency). Rendered
// as an in-place overlay (not a Modal) so it can sit over the assign sheet —
// iOS won't reliably stack two Modals.
function DueDatePicker({ initial, onClose, onSet }) {
  const base = initial ? new Date(initial) : null;
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const [day, setDay] = useState(() => {
    const d = base ? new Date(base) : new Date();
    d.setHours(0, 0, 0, 0); return d;
  });
  const [view, setView] = useState(() => new Date((base || new Date()).getFullYear(), (base || new Date()).getMonth(), 1));
  const [hour24, setHour24] = useState(base ? base.getHours() : 17);
  const [minute, setMinute] = useState(base ? base.getMinutes() : 0);

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  const atCurMonth = year === today0.getFullYear() && month === today0.getMonth();

  const h12 = hour24 % 12 || 12;
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  const stepHour = (n) => setHour24((h) => (h + n + 24) % 24);
  const stepMin = (n) => setMinute((m) => (m + n + 60) % 60);

  const confirm = () => {
    const d = new Date(day);
    d.setHours(hour24, minute, 0, 0);
    onSet(d.toISOString());
    onClose();
  };

  return (
    <View style={styles.dpBackdrop}>
        <View style={styles.dpCard}>
          <View style={styles.dpHeader}>
            <TouchableOpacity onPress={() => setView(new Date(year, month - 1, 1))} disabled={atCurMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={20} color={atCurMonth ? COLORS.border : COLORS.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.dpMonth}>{view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
            <TouchableOpacity onPress={() => setView(new Date(year, month + 1, 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.dpDowRow}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <Text key={i} style={styles.dpDow}>{d}</Text>)}
          </View>
          <View style={styles.dpGrid}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={styles.dpCell} />;
              const past = d < today0;
              const sel = d.getTime() === day.getTime();
              return (
                <TouchableOpacity key={i} style={styles.dpCell} disabled={past} onPress={() => setDay(d)} activeOpacity={0.7}>
                  <View style={[styles.dpDayDot, sel && styles.dpDaySel]}>
                    <Text style={[styles.dpDayText, past && styles.dpDayPast, sel && styles.dpDaySelText]}>{d.getDate()}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.dpTimeRow}>
            <Text style={styles.dpTimeLabel}>Time</Text>
            <View style={styles.dpTimeCtrls}>
              <TouchableOpacity style={styles.dpStep} onPress={() => stepHour(1)}><Ionicons name="chevron-up" size={14} color={COLORS.text} /></TouchableOpacity>
              <Text style={styles.dpTimeVal}>{h12}</Text>
              <TouchableOpacity style={styles.dpStep} onPress={() => stepHour(-1)}><Ionicons name="chevron-down" size={14} color={COLORS.text} /></TouchableOpacity>
              <Text style={styles.dpColon}>:</Text>
              <TouchableOpacity style={styles.dpStep} onPress={() => stepMin(5)}><Ionicons name="chevron-up" size={14} color={COLORS.text} /></TouchableOpacity>
              <Text style={styles.dpTimeVal}>{String(minute).padStart(2, '0')}</Text>
              <TouchableOpacity style={styles.dpStep} onPress={() => stepMin(-5)}><Ionicons name="chevron-down" size={14} color={COLORS.text} /></TouchableOpacity>
              <TouchableOpacity style={styles.dpAmPm} onPress={() => stepHour(12)}><Text style={styles.dpAmPmText}>{ampm}</Text></TouchableOpacity>
            </View>
          </View>

          <View style={styles.dpBtns}>
            <TouchableOpacity style={styles.dpClear} onPress={() => { onSet(null); onClose(); }}>
              <Text style={styles.dpClearText}>No due date</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dpSet} onPress={confirm} activeOpacity={0.85}>
              <Text style={styles.dpSetText}>Set</Text>
            </TouchableOpacity>
          </View>
        </View>
    </View>
  );
}

// Teacher: pick a song → generate the step-by-step plan → tick which steps to
// hand the student → each ticked step becomes an ordered assigned task. Uses the
// student's instrument so the breakdown fits what they actually play.
function AssignSongModal({ student, klass, recipientStudents, visible, onClose, onAssigned }) {
  // Works for one student OR a whole class (klass + its member student objects).
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState(null);          // { title, artist, instrument, steps:[...] }
  const [picked, setPicked] = useState(new Set()); // step ids the teacher will assign
  const [assigning, setAssigning] = useState(false);

  const isClass = !!klass;
  const members = isClass ? (recipientStudents || []) : (student ? [student] : []);
  // Class plans use the majority instrument of the members.
  const bassCount = members.filter((m) => m?.instrument === 'Bass').length;
  const instrument = isClass
    ? (bassCount > members.length / 2 ? 'Bass' : 'Guitar')
    : (student?.instrument === 'Bass' ? 'Bass' : 'Guitar');

  const reset = () => {
    setTitle(''); setArtist(''); setPlan(null); setPicked(new Set());
    setGenerating(false); setAssigning(false);
  };
  const close = () => { reset(); onClose(); };

  const generate = async () => {
    if (!title.trim()) { Alert.alert('Pick a song', 'Enter a song title first.'); return; }
    Keyboard.dismiss();
    setGenerating(true);
    try {
      const p = await generateSongPlan({ instrument, title: title.trim(), artist: artist.trim() });
      setPlan(p);
      setPicked(new Set((p.steps || []).map((s) => s.id))); // default: all selected
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.toLowerCase().includes('limit reached')) {
        Alert.alert('Weekly limit reached', "You've used your 5 song plans for this week. Already-generated songs are still free to assign.");
      } else {
        Alert.alert('Could not build a plan', 'Something went wrong generating that song. Please try again.');
      }
    } finally {
      setGenerating(false);
    }
  };

  const toggleStep = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Assign the song directly as a single task, skipping the AI step-by-step plan
  // (no generation, no weekly-limit hit) — just "learn this song".
  const assignSongOnly = async () => {
    if (members.length === 0 || !title.trim()) { Alert.alert('Pick a song', 'Enter a song title first.'); return; }
    Keyboard.dismiss();
    setAssigning(true);
    try {
      const t = title.trim();
      const a = artist.trim();
      const base = {
        title: `Learn: ${t}${a ? ` — ${a}` : ''}`,
        description: '',
        youtube: `${t}${a ? ` ${a}` : ''} ${instrument} tutorial`,
        song: t,
        dueDate: null,
        durationMin: 0, // open-ended — a song to learn isn't a one-sitting task
        completed: false,
        assignedAt: new Date().toISOString(),
        teacherUid: auth.currentUser.uid,
        ...(isClass ? { classId: klass.id, className: klass.name } : {}),
      };
      await Promise.all(members.map((m, i) =>
        updateDoc(doc(db, 'users', m.uid), { assignedTasks: arrayUnion({ ...base, id: `${Date.now()}_${i}_song` }) })
      ));
      onAssigned && onAssigned();
      Alert.alert('Assigned', isClass
        ? `"${t}" assigned to ${members.length} student${members.length === 1 ? '' : 's'} in ${klass.name}.`
        : `"${t}" assigned to learn.`);
      close();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setAssigning(false);
    }
  };

  const assign = async () => {
    if (members.length === 0 || !plan) return;
    const steps = (plan.steps || []).filter((s) => picked.has(s.id));
    if (steps.length === 0) { Alert.alert('No steps', 'Tick at least one step to assign.'); return; }
    setAssigning(true);
    try {
      const stamp = Date.now();
      const mkTasks = (mi) => steps.map((s, i) => ({
        id: `${stamp}_${mi}_${i}`,
        title: `${plan.title} — ${s.title}`,
        description: [s.summary, ...(s.tasks || [])].filter(Boolean).join('\n• '),
        youtube: s.yt || `${plan.title} ${instrument} tutorial`,
        song: plan.title,
        songPlanKey: plan.key,
        songStepOrder: i,
        dueDate: null,
        durationMin: 0,
        completed: false,
        assignedAt: new Date().toISOString(),
        teacherUid: auth.currentUser.uid,
        ...(isClass ? { classId: klass.id, className: klass.name } : {}),
      }));
      await Promise.all(members.map((m, mi) =>
        updateDoc(doc(db, 'users', m.uid), { assignedTasks: arrayUnion(...mkTasks(mi)) })
      ));
      onAssigned && onAssigned();
      Alert.alert('Assigned', isClass
        ? `${steps.length} step${steps.length === 1 ? '' : 's'} of "${plan.title}" sent to ${members.length} student${members.length === 1 ? '' : 's'} in ${klass.name}.`
        : `${steps.length} step${steps.length === 1 ? '' : 's'} of "${plan.title}" assigned.`);
      close();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <SheetModal visible={visible} onRequestClose={() => !assigning && !generating && close()} cardStyle={styles.songModalCard} keyboardAvoiding>
          <View style={styles.songModalHead}>
            <Text style={styles.songModalTitle}>Assign a song to learn</Text>
            <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {generating ? (
            <View style={styles.songGenBox}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.songGenText}>Building the step-by-step plan…</Text>
            </View>
          ) : !plan ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.songFieldLabel}>Song title</Text>
              <TextInput style={styles.songInput} placeholder="e.g. Wonderwall" placeholderTextColor={COLORS.textMuted} value={title} onChangeText={setTitle} />
              <Text style={styles.songFieldLabel}>Artist (optional)</Text>
              <TextInput style={styles.songInput} placeholder="e.g. Oasis" placeholderTextColor={COLORS.textMuted} value={artist} onChangeText={setArtist} />
              <Text style={styles.songCapHint}>
                {isClass
                  ? `For ${klass.name} (${members.length} student${members.length === 1 ? '' : 's'}) · built for ${instrument.toLowerCase()}. 5 new song plans per week — reused songs are free.`
                  : `Plan is built for ${instrument.toLowerCase()} (this student's instrument). 5 new song plans per week — reused songs are free.`}
              </Text>
              <TouchableOpacity style={[styles.songGenBtn, !title.trim() && styles.songGenBtnOff]} disabled={!title.trim()} onPress={generate}>
                <Text style={styles.songGenBtnText}>Build the plan</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.songPlainBtn, !title.trim() && { opacity: 0.5 }]} disabled={!title.trim()} onPress={assignSongOnly}>
                <Text style={styles.songPlainBtnText}>Just assign the song (no plan)</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <>
              <Text style={styles.songPlanHeading}>{plan.title}{plan.artist ? ` — ${plan.artist}` : ''}</Text>
              {!!plan.overview && <Text style={styles.songPlanOverview}>{plan.overview}</Text>}
              <Text style={styles.songCapHint}>{isClass ? `Tick the steps to give ${klass.name}. Every student gets them as ordered tasks on their Today.` : "Tick the steps to give this student. They'll appear as ordered tasks on their Today."}</Text>
              <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                {(plan.steps || []).map((s, i) => {
                  const on = picked.has(s.id);
                  return (
                    <TouchableOpacity key={s.id} style={styles.songStepRow} onPress={() => toggleStep(s.id)} activeOpacity={0.7}>
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? COLORS.primary : COLORS.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.songStepTitle}>{i + 1}. {s.title}{s.targetBpm ? `  ·  ${s.targetBpm} BPM` : ''}</Text>
                        {!!s.summary && <Text style={styles.songStepSummary} numberOfLines={2}>{s.summary}</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.songPlanActions}>
                <TouchableOpacity style={styles.songBackBtn} onPress={() => { setPlan(null); setPicked(new Set()); }}>
                  <Text style={styles.songBackText}>Pick another</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.songAssignBtn} onPress={assign} disabled={assigning}>
                  {assigning ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.songAssignText}>Assign {picked.size} step{picked.size === 1 ? '' : 's'}</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
    </SheetModal>
  );
}

function AssignTaskModal({ student, klass, recipientUids, editTask, visible, onClose, onAssigned }) {
  // The modal assigns to one student, or to every student in a class at once —
  // or, when editTask is passed, edits one student's existing task in place.
  const isClass = !!klass;
  const isEdit = !!editTask;
  const recipients = isClass ? (recipientUids || []) : (student ? [student.uid] : []);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [youtube, setYoutube] = useState('');
  const [song, setSong] = useState('');
  const [dueDate, setDueDate] = useState(null); // ISO datetime or null
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [durationMin, setDurationMin] = useState(10); // default 10-min timer; clear it for an open-ended (no-limit) task
  const [feedback, setFeedback] = useState(''); // teacher's feedback on this task (edit mode) — shows in the student's Notes
  const [loading, setLoading] = useState(false);
  const [justAdded, setJustAdded] = useState(0); // count assigned this session

  const formScrollRef = useRef(null); // scrolls bottom fields (feedback) above the keyboard
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [resources, setResources] = useState([]); // teacher's saved resources, assignable from here
  const [showResources, setShowResources] = useState(false);

  const close = () => {
    setTitle(''); setDescription(''); setYoutube(''); setSong('');
    setDueDate(null); setDurationMin(10); setJustAdded(0); setShowTemplates(false); setFeedback('');
    onClose();
  };

  // Reusable task templates + the teacher's saved resources, both on their doc.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then((s) => {
        setTemplates(Array.isArray(s.data()?.taskTemplates) ? s.data().taskTemplates : []);
        setResources(Array.isArray(s.data()?.customResources) ? s.data().customResources : []);
      })
      .catch(() => {});
  }, []);

  // Fill the task fields from one of the teacher's saved resources.
  const applyResource = (r) => {
    setTitle(r.title || '');
    setDescription(r.description || '');
    setYoutube(r.url || '');
  };

  // Pre-fill the fields when opening to edit an existing task.
  useEffect(() => {
    if (visible && editTask) {
      setTitle(editTask.title || '');
      setDescription(editTask.description || '');
      setYoutube(editTask.youtube || '');
      setSong(editTask.song || '');
      setDueDate(editTask.dueDate || null);
      setDurationMin(editTask.durationMin || 0);
      setFeedback(editTask.feedback || '');
    }
  }, [visible, editTask]);

  const saveTemplates = (next) => {
    setTemplates(next);
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { taskTemplates: next }).catch(() => {});
  };

  const applyTemplate = (t) => {
    setTitle(t.title || '');
    setDescription(t.description || '');
    setYoutube(t.youtube || '');
    setSong(t.song || '');
  };

  const saveAsTemplate = () => {
    if (!title.trim()) return;
    const tpl = { id: Date.now().toString(), title: title.trim(), description: description.trim(), youtube: youtube.trim(), song: song.trim() };
    // Replace any existing template with the same title, keep newest first.
    const next = [tpl, ...templates.filter((x) => (x.title || '').toLowerCase() !== tpl.title.toLowerCase())].slice(0, 30);
    saveTemplates(next);
    Alert.alert('Saved', `"${tpl.title}" saved as a template.`);
  };

  const deleteTemplate = (t) => {
    Alert.alert('Delete template?', t.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => saveTemplates(templates.filter((x) => x.id !== t.id)) },
    ]);
  };

  const handleAssign = async () => {
    if (!title.trim()) return;
    if (DEMO_MODE) {
      Alert.alert('Demo mode', 'Task assignment is disabled in demo mode.');
      return;
    }
    // Edit mode: update the one existing task on this student's doc.
    if (isEdit) {
      Keyboard.dismiss();
      setLoading(true);
      try {
        const next = (student.assignedTasks || []).map((t) =>
          t.id === editTask.id
            ? {
                ...t,
                title: title.trim(), description: description.trim(), youtube: youtube.trim(), song: song.trim(),
                dueDate, durationMin: durationMin || 0,
                feedback: feedback.trim(),
                // Stamp when the feedback text actually changes, so the student's
                // Notes screen can sort by freshness.
                feedbackAt: feedback.trim() !== (editTask.feedback || '') ? new Date().toISOString() : (editTask.feedbackAt || null),
              }
            : t
        );
        await updateDoc(doc(db, 'users', student.uid), { assignedTasks: next });
        onAssigned();
        close();
      } catch (err) {
        Alert.alert('Error', err.message);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (recipients.length === 0) {
      Alert.alert('No students', isClass ? 'This class has no students yet.' : 'No student selected.');
      return;
    }
    Keyboard.dismiss();
    setLoading(true);
    try {
      const base = {
        title: title.trim(),
        description: description.trim(),
        youtube: youtube.trim(),
        song: song.trim(),
        dueDate,
        durationMin: durationMin || 0,
        completed: false,
        assignedAt: new Date().toISOString(),
        teacherUid: auth.currentUser.uid,
        ...(isClass ? { classId: klass.id, className: klass.name } : {}),
      };
      // Each student gets their own private copy of the task (own id, own progress).
      await Promise.all(
        recipients.map((uid, i) =>
          updateDoc(doc(db, 'users', uid), {
            assignedTasks: arrayUnion({ ...base, id: `${Date.now()}_${i}` }),
          })
        )
      );
      // Ring each student's bell too (best-effort, never blocks the assign).
      recipients.forEach((uid) => {
        sendNotification(uid, {
          type: 'task_assigned',
          title: 'New task from your teacher',
          body: base.title,
          data: { taskTitle: base.title },
        }).catch(() => {});
      });
      // Keep the modal open so the teacher can assign several in a row.
      setTitle(''); setDescription(''); setYoutube(''); setSong(''); setDueDate(null); setDurationMin(10);
      setJustAdded((n) => n + 1);
      if (isClass) {
        Alert.alert('Assigned', `Sent to ${recipients.length} student${recipients.length === 1 ? '' : 's'} in ${klass.name}.`);
      }
      onAssigned();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    // keyboardAvoiding="android" only — iOS is covered by the ScrollView's
    // automaticallyAdjustKeyboardInsets, and combining the two double-compensates
    // (sheet flies too high).
    <SheetModal visible={visible} onRequestClose={onClose} cardStyle={styles.modalCard} keyboardAvoiding="android">
              <ScrollView
                ref={formScrollRef}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator={false}
                automaticallyAdjustKeyboardInsets
                contentContainerStyle={{ paddingBottom: SPACING.lg }}
              >
              <Text style={styles.modalTitle}>{isEdit ? 'Edit Task' : isClass ? 'Assign to Class' : 'Assign Task'}</Text>
              <Text style={styles.modalSubtitle}>
                {isClass
                  ? `${klass.name}  ·  ${recipients.length} student${recipients.length === 1 ? '' : 's'}`
                  : `${isEdit ? 'For' : 'To'}: ${displayName(student)}`}
                {justAdded > 0 ? `  ·  ${justAdded} added` : ''}
              </Text>

              <View style={[styles.tplActions, { flexWrap: 'wrap' }]}>
                <TouchableOpacity style={styles.tplOpenBtn} onPress={() => { Keyboard.dismiss(); setShowTemplates(true); }} activeOpacity={0.85}>
                  <Ionicons name="albums-outline" size={15} color={COLORS.text} />
                  <Text style={styles.tplOpenText}>Templates ({templates.length})</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.tplOpenBtn} onPress={() => { Keyboard.dismiss(); setShowResources(true); }} activeOpacity={0.85}>
                  <Ionicons name="bookmark" size={14} color={COLORS.text} />
                  <Text style={styles.tplOpenText}>My resources ({resources.length})</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tplSaveBtn, !title.trim() && styles.tplSaveBtnDisabled]}
                  onPress={saveAsTemplate}
                  disabled={!title.trim()}
                  activeOpacity={0.85}
                >
                  <Ionicons name="bookmark-outline" size={14} color={title.trim() ? COLORS.primary : COLORS.textMuted} />
                  <Text style={[styles.tplSaveBtnText, !title.trim() && { color: COLORS.textMuted }]}>Save as template</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Task title"
                placeholderTextColor={COLORS.textMuted}
                value={title}
                onChangeText={setTitle}
                returnKeyType="next"
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
              <TextInput
                style={styles.input}
                placeholder="YouTube link or search (optional)"
                placeholderTextColor={COLORS.textMuted}
                value={youtube}
                onChangeText={setYoutube}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.input}
                placeholder="Song — e.g. Wonderwall — Oasis (optional)"
                placeholderTextColor={COLORS.textMuted}
                value={song}
                onChangeText={setSong}
              />

              <Text style={styles.dueLabel}>DUE</Text>
              <TouchableOpacity style={styles.dueField} onPress={() => { Keyboard.dismiss(); setShowDuePicker(true); }} activeOpacity={0.8}>
                <Ionicons name="calendar-outline" size={16} color={dueDate ? COLORS.primary : COLORS.textMuted} />
                <Text style={[styles.dueFieldText, dueDate && { color: COLORS.text }]} numberOfLines={1}>
                  {dueDate ? formatDueFull(dueDate) : 'No due date — tap to set'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>

              <Text style={styles.dueLabel}>TIMER</Text>
              <Text style={styles.timerHint}>Minutes the student must practice before they can mark it done. Leave blank for no timer.</Text>
              <View style={styles.durInputRow}>
                <TextInput
                  style={styles.durInput}
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                  value={durationMin ? String(durationMin) : ''}
                  onChangeText={(t) => {
                    const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                    setDurationMin(isNaN(n) ? 0 : Math.min(n, 600));
                  }}
                  keyboardType="number-pad"
                  maxLength={3}
                  returnKeyType="done"
                  blurOnSubmit
                  inputAccessoryViewID={Platform.OS === 'ios' ? 'taskTimerDone' : undefined}
                />
                <Text style={styles.durUnit}>minutes</Text>
                {durationMin > 0 && (
                  <TouchableOpacity onPress={() => setDurationMin(0)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 4 }}>
                    <Text style={styles.durClear}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              {Platform.OS === 'ios' && (
                <InputAccessoryView nativeID="taskTimerDone">
                  <View style={styles.accessoryBar}>
                    <TouchableOpacity onPress={() => Keyboard.dismiss()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.accessoryDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </InputAccessoryView>
              )}

              {/* Feedback on THIS task — lands in the student's Notes window
                  (great for reacting to their proof videos). */}
              {isEdit && (
                <>
                  <Text style={styles.dueLabel}>FEEDBACK TO STUDENT</Text>
                  <Text style={styles.timerHint}>They'll see this in their Notes — use it to comment on their practice or proof video.</Text>
                  <TextInput
                    style={[styles.input, styles.inputMulti]}
                    placeholder="e.g. Great tone on the video! Watch the timing in bar 3…"
                    placeholderTextColor={COLORS.textMuted}
                    value={feedback}
                    onChangeText={setFeedback}
                    multiline
                    numberOfLines={3}
                    // Bottom-most field: shove it above the keyboard on focus.
                    onFocus={() => setTimeout(() => formScrollRef.current?.scrollToEnd({ animated: true }), 250)}
                  />
                </>
              )}

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { Keyboard.dismiss(); close(); }}>
                  <Text style={styles.modalCancelText}>{justAdded > 0 ? 'Done' : 'Cancel'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalAssignBtn, (!title.trim() || loading) && { opacity: 0.5 }]}
                  onPress={handleAssign}
                  disabled={!title.trim() || loading}
                >
                  {loading
                    ? <ActivityIndicator color={COLORS.text} size="small" />
                    : <Text style={styles.modalAssignText}>{isEdit ? 'Save changes' : 'Assign task'}</Text>}
                </TouchableOpacity>
              </View>
              </ScrollView>
            {showDuePicker && (
              <DueDatePicker
                initial={dueDate}
                onClose={() => setShowDuePicker(false)}
                onSet={setDueDate}
              />
            )}
            {showTemplates && (
              <View style={styles.dpBackdrop}>
                <View style={styles.tplSheet}>
                  <View style={styles.tplSheetHeader}>
                    <Text style={styles.tplSheetTitle}>Templates</Text>
                    <TouchableOpacity onPress={() => setShowTemplates(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  {templates.length === 0 ? (
                    <Text style={styles.tplSheetEmpty}>No templates yet. Fill in a task, then tap “Save as template”.</Text>
                  ) : (
                    <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
                      {templates.map((t) => (
                        <View key={t.id} style={styles.tplSheetRow}>
                          <TouchableOpacity
                            style={{ flex: 1 }}
                            onPress={() => { applyTemplate(t); setShowTemplates(false); }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.tplSheetRowTitle} numberOfLines={1}>{t.title}</Text>
                            {!!t.description && <Text style={styles.tplSheetRowSub} numberOfLines={1}>{t.description}</Text>}
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => deleteTemplate(t)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </View>
            )}
            {showResources && (
              <View style={styles.dpBackdrop}>
                <View style={styles.tplSheet}>
                  <View style={styles.tplSheetHeader}>
                    <Text style={styles.tplSheetTitle}>My resources</Text>
                    <TouchableOpacity onPress={() => setShowResources(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  {resources.length === 0 ? (
                    <Text style={styles.tplSheetEmpty}>No saved resources yet — add them on the Resources page.</Text>
                  ) : (
                    <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
                      {resources.map((r) => (
                        <View key={r.id} style={styles.tplSheetRow}>
                          <TouchableOpacity
                            style={{ flex: 1 }}
                            onPress={() => { applyResource(r); setShowResources(false); }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.tplSheetRowTitle} numberOfLines={1}>{r.title}</Text>
                            <Text style={styles.tplSheetRowSub} numberOfLines={1}>
                              {[r.instrument, r.level, r.category].filter(Boolean).join(' · ') || r.description || ''}
                            </Text>
                          </TouchableOpacity>
                          <Ionicons name="arrow-down-circle-outline" size={18} color={COLORS.primary} />
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </View>
            )}
    </SheetModal>
  );
}

// ─── Inline Chat View ─────────────────────────────────────────────────────────

function InlineChatView({ student, myUid, isDemo, title, subtitle, onBack }) {
  const otherUid = student.uid;
  const otherEmail = student.email;
  const myEmail = auth.currentUser?.email || '';
  const chatId = makeChatId(myUid, otherUid);
  const insets = useSafeAreaInsets();

  const initMessages = () => {
    if (!isDemo) return [];
    return (student.demoMessages || []).map((m) => ({
      id: m.id,
      senderUid: m.senderRole === 'teacher' ? myUid : student.uid,
      text: m.text,
      ts: m.ts,
    }));
  };

  const [messages, setMessages] = useState(initMessages);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Demo chats simulate the student having caught up; real chats read the
  // student's actual lastRead marker.
  const [otherReadAt, setOtherReadAt] = useState(isDemo ? Date.now() : null);
  const flatRef = useRef(null);

  // After the teacher sends in a demo chat, flip the receipt to "Read" shortly
  // after, so it behaves like a real conversation.
  const bumpDemoRead = () => {
    if (isDemo) setTimeout(() => setOtherReadAt(Date.now()), 1200);
  };

  useEffect(() => {
    if (isDemo) return;
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, ignorePermissionDenied);
    return unsub;
  }, [isDemo, chatId]);

  useEffect(() => {
    if (isDemo) return;
    const unsub = onSnapshot(doc(db, 'chats', chatId), (snap) => {
      setOtherReadAt(snap.data()?.lastRead?.[otherUid] || null);
    }, ignorePermissionDenied);
    return unsub;
  }, [isDemo, chatId, otherUid]);

  useEffect(() => {
    if (isDemo) return;
    markChatRead(chatId, myUid).catch(() => {});
  }, [isDemo, chatId, myUid, messages.length]);

  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      if (isDemo) {
        setMessages((prev) => [
          ...prev,
          { id: `local_${Date.now()}`, senderUid: myUid, text: trimmed, ts: Date.now() },
        ]);
        setText('');
        bumpDemoRead();
      } else {
        setText('');
        await sendChatMessage({
          chatId,
          senderUid: myUid,
          senderEmail: myEmail,
          otherUid,
          otherEmail,
          text: trimmed,
        });
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSending(false);
    }
  };

  const handleMedia = async (getMedia) => {
    if (uploading || sending) return;
    const picked = await getMedia();
    if (!picked) return;
    if (picked.error) { Alert.alert('Photos', picked.error); return; }
    const caption = text.trim();
    setUploading(true);
    try {
      // Demo chats are local-only, so the on-device file URI displays fine
      // without an upload. Real chats upload so the student can load it.
      const url = isDemo ? picked.uri : await uploadChatMedia(picked.uri, chatId, picked.type);
      if (isDemo) {
        setMessages((prev) => [
          ...prev,
          { id: `local_${Date.now()}`, senderUid: myUid, text: caption, mediaUrl: url, mediaType: picked.type, ts: Date.now() },
        ]);
        bumpDemoRead();
      } else {
        await sendChatMessage({
          chatId, senderUid: myUid, senderEmail: myEmail, otherUid, otherEmail,
          text: caption, media: { url, type: picked.type },
        });
      }
      setText('');
    } catch (err) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.chatNavHeader, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity onPress={onBack} style={styles.chatNavBackBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.chatNavBackText}>Messages</Text>
        </TouchableOpacity>
        <View style={styles.chatNavCenter}>
          <Text style={styles.chatNavTitle} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text style={styles.chatNavSub}>{subtitle}</Text>}
        </View>
        <View style={{ width: 80 }} />
      </View>
      {/* Inverted = bottom-anchored: the newest message stays above the input
          whatever the keyboard does; dragging dismisses the keyboard. */}
      <FlatList
        ref={flatRef}
        data={[...messages].reverse()}
        inverted={messages.length > 0}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatMessages}
        renderItem={({ item, index }) => {
          const isMe = item.senderUid === myUid;
          const showReceipt = isMe && index === 0; // inverted: index 0 = newest
          const body = item.mediaUrl
            ? <MediaMessageBubble item={item} isMe={isMe} />
            : (
              <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
                  {item.text}
                </Text>
              </View>
            );
          if (!showReceipt) return body;
          return (
            <View>
              {body}
              <Text style={styles.chatReceipt}>{receiptStatus(item, otherReadAt)}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.chatEmpty}>
            <Ionicons name="chatbubble-ellipses-outline" size={36} color={COLORS.textMuted} style={{ marginBottom: SPACING.sm }} />
            <Text style={styles.chatEmptyText}>No messages yet</Text>
          </View>
        }
      />
      <View style={[styles.chatInputRow, { paddingBottom: (insets.bottom || SPACING.sm) + SPACING.xs }]}>
        <TouchableOpacity
          style={styles.chatVideoBtn}
          onPress={() => handleMedia(captureMedia)}
          disabled={sending || uploading}
        >
          <Ionicons name="camera" size={20} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.chatVideoBtn}
          onPress={() => handleMedia(pickMedia)}
          disabled={sending || uploading}
        >
          {uploading
            ? <ActivityIndicator color={COLORS.primary} size="small" />
            : <Ionicons name="image" size={20} color={COLORS.primary} />}
        </TouchableOpacity>
        <TextInput
          style={styles.chatInput}
          placeholder="Message..."
          placeholderTextColor={COLORS.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.chatSendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
          onPress={sendMessage}
          disabled={!text.trim() || sending}
        >
          {sending
            ? <ActivityIndicator color={COLORS.text} size="small" />
            : <Ionicons name="arrow-up" size={18} color={COLORS.text} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Teacher Dashboard ────────────────────────────────────────────────────────

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Per-student practice bar chart — daily minutes over the last 2 weeks. Fetched
// lazily when their card expands. Reads sessionHistory (allowed for the teacher).
function StudentActivityChart({ studentUid }) {
  const [logMap, setLogMap] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'sessionHistory', studentUid, 'logs'),
          orderBy('date', 'desc'), limit(20),
        ));
        const map = {};
        snap.forEach((d) => { map[d.id] = d.data(); });
        if (!cancelled) setLogMap(map);
      } catch (e) {
        if (!cancelled) setLogMap({});
      }
    })();
    return () => { cancelled = true; };
  }, [studentUid]);

  if (logMap === null) {
    return <ActivityIndicator size="small" color={COLORS.textMuted} style={{ marginVertical: SPACING.md }} />;
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ mins: logMap[key]?.totalMinutes || 0, dow: DOW_LABELS[d.getDay()], isToday: i === 0 });
  }
  const maxMins = Math.max(30, ...days.map((d) => d.mins));
  const totalMins = days.reduce((s, d) => s + d.mins, 0);
  const practiced = days.filter((d) => d.mins > 0).length;
  const h = Math.floor(totalMins / 60); const m = totalMins % 60;
  const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;

  return (
    <View style={styles.chartWrap}>
      <View style={styles.chartHeader}>
        <Text style={styles.taskSectionLabel}>PRACTICE · LAST 2 WEEKS</Text>
        <Text style={styles.chartSummary}>{practiced}/14 days · {timeStr}</Text>
      </View>
      <View style={styles.chartBars}>
        {days.map((d, i) => (
          <View key={i} style={styles.chartCol}>
            <View style={styles.chartTrack}>
              <View
                style={[
                  styles.chartBar,
                  { height: `${d.mins > 0 ? Math.max(10, (d.mins / maxMins) * 100) : 0}%` },
                  d.isToday && styles.chartBarToday,
                ]}
              />
            </View>
            <Text style={[styles.chartTick, d.isToday && styles.chartTickToday]}>{d.dow}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TeacherDashboard() {
  const [students, setStudents] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [songStudent, setSongStudent] = useState(null);
  const [songClass, setSongClass] = useState(null); // class getting a song-to-learn
  const [expanded, setExpanded] = useState(null);
  const [proofView, setProofView] = useState(null); // { url, type, proofs, studentUid, taskId, verified, title }
  const [proofIdx, setProofIdx] = useState(0);      // which clip is showing when a task has several
  useEffect(() => { setProofIdx(0); }, [proofView?.taskId]);
  const [completedView, setCompletedView] = useState(null); // student whose completed tasks are open
  const [activeTab, setActiveTab] = useState('students');
  const [activeChatStudent, setActiveChatStudent] = useState(null);
  const [convoMap, setConvoMap] = useState({});
  const [groupChats, setGroupChats] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [myName, setMyName] = useState('');
  const [joinCode, setJoinCode] = useState(null);
  const [classes, setClasses] = useState([]);
  const [parentEmails, setParentEmails] = useState({});     // { studentUid: 'parent@email' }
  const [contactsOpen, setContactsOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState({});
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null); // class being renamed
  const [renameText, setRenameText] = useState('');
  const [addToClass, setAddToClass] = useState(null); // class we're adding students to
  const [studentSearch, setStudentSearch] = useState('');
  const [editTaskCtx, setEditTaskCtx] = useState(null); // { student, task } being edited
  const [expandedClassId, setExpandedClassId] = useState(null);
  const [classView, setClassView] = useState('progress'); // 'progress' | 'leaderboard'
  const [openStudents, setOpenStudents] = useState(() => new Set()); // `${classId}_${uid}`
  const toggleStudent = (key) => setOpenStudents((prev) => {
    const n = new Set(prev);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });

  const myUid = auth.currentUser?.uid;
  const navigation = useNavigation();

  // Hide the bottom tab bar while a chat / class announcement thread is open so
  // it can own the full screen (fixes the input gap + keyboard avoidance).
  const inChat = !!(activeChatStudent || activeGroup);
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: inChat ? { display: 'none' } : TAB_BAR_STYLE });
    return () => navigation.setOptions({ tabBarStyle: TAB_BAR_STYLE });
  }, [inChat, navigation]);

  useEffect(() => {
    if (!myUid) return;
    ensureTeacherCode(myUid).then(setJoinCode).catch(() => {});
  }, [myUid]);

  const shareCode = () => {
    if (!joinCode) return;
    Share.share({ message: `Add me as your Prova teacher with this code: ${joinCode}` }).catch(() => {});
  };
  const todayName = WEEK_DAYS[new Date().getDay()];

  useFocusEffect(
    React.useCallback(() => { loadStudents(); }, [])
  );

  // Live last-message previews for the Messages tab, keyed by chatId.
  useEffect(() => {
    if (!myUid || DEMO_MODE) return;
    const q = query(collection(db, 'userChats', myUid, 'conversations'));
    return onSnapshot(q, (snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = d.data(); });
      setConvoMap(map);
    }, ignorePermissionDenied);
  }, [myUid]);

  // Resolve my own display name (for labelling group-chat posts) + load my
  // private parent-contact book.
  useEffect(() => {
    if (!myUid) return;
    getDoc(doc(db, 'users', myUid))
      .then((s) => {
        const d = s.data() || {};
        setMyName(displayName({ uid: myUid, ...d }));
        setParentEmails(d.parentEmails && typeof d.parentEmails === 'object' ? d.parentEmails : {});
      })
      .catch(() => {});
  }, [myUid]);

  const openContacts = () => { setEmailDraft({ ...parentEmails }); setContactsOpen(true); };
  const saveContacts = async () => {
    // Drop blank entries so the map stays tidy.
    const cleaned = {};
    Object.entries(emailDraft).forEach(([uid, v]) => { const e = (v || '').trim(); if (e) cleaned[uid] = e; });
    setParentEmails(cleaned);
    setContactsOpen(false);
    if (myUid) updateDoc(doc(db, 'users', myUid), { parentEmails: cleaned }).catch(() => {});
  };

  // Class group chats I own/belong to (newest activity first).
  useEffect(() => {
    if (!myUid || DEMO_MODE) return;
    const q = query(collection(db, 'groupChats'), where('memberUids', 'array-contains', myUid));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.lastMessageAt?.toMillis?.() || 0) - (a.lastMessageAt?.toMillis?.() || 0));
      setGroupChats(rows);
    }, ignorePermissionDenied);
  }, [myUid]);

  const createGroup = async (name, studentUids, classId) => {
    setShowCreateGroup(false);
    try {
      await createGroupChat({ teacherUid: myUid, name, studentUids, classId });
    } catch (e) {
      Alert.alert('Error', "Couldn't create the group chat. Please try again.");
    }
  };

  const removeGroup = (group) => {
    Alert.alert('Delete group chat?', `"${group.name}" will be removed for everyone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteGroupChat(group.id).catch(() => {}) },
    ]);
  };

  const loadStudents = async () => {
    setLoading(true);
    try {
      if (DEMO_MODE) {
        setStudents(DEMO_STUDENTS_DATA);
        setLoading(false);
        return;
      }
      const uid = auth.currentUser.uid;
      // Students who connected (via my join code, or an accepted request) carry
      // teacherUid === my uid.
      const [snap, meSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('teacherUid', '==', uid))),
        getDoc(doc(db, 'users', uid)),
      ]);
      setStudents(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
      setClasses(Array.isArray(meSnap.data()?.classes) ? meSnap.data().classes : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Ping the teacher (local notification) when a student's task passes its due
  // date. A seen-set in AsyncStorage makes sure each overdue task only ever
  // notifies once.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || DEMO_MODE || students.length === 0) return;
    (async () => {
      try {
        const now = new Date();
        const overdue = [];
        students.forEach((s) => (s.assignedTasks || []).forEach((t) => {
          if (t.completed || !t.dueDate) return;
          const d = new Date(t.dueDate);
          if (!isNaN(d) && d < now) overdue.push({ key: `${s.uid}_${t.id}`, title: t.title, student: displayName(s) });
        }));
        if (overdue.length === 0) return;
        const storeKey = `prova_overdue_seen_${uid}`;
        const seen = new Set(JSON.parse((await AsyncStorage.getItem(storeKey)) || '[]'));
        const fresh = overdue.filter((o) => !seen.has(o.key));
        if (fresh.length > 0) {
          notifyOverdueTasks(fresh);
          await AsyncStorage.setItem(storeKey, JSON.stringify(overdue.map((o) => o.key)));
        }
      } catch (e) { /* best-effort */ }
    })();
  }, [students]);

  const saveClasses = (next) => {
    setClasses(next);
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { classes: next }).catch(() => {});
  };

  const createClass = (name, studentUids) => {
    const cls = { id: `class_${Date.now()}`, name, studentUids, createdAt: new Date().toISOString() };
    saveClasses([...classes, cls]);
    setShowCreateClass(false);
  };

  const deleteClass = (id, name) => {
    Alert.alert('Delete class?', `"${name}" — the students stay connected to you.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => saveClasses(classes.filter((c) => c.id !== id)) },
    ]);
  };

  // Rename a class after it's been made. Closes instantly — the rename itself
  // is optimistic, and relabeling `className` on every member's existing class
  // tasks happens in the background (best-effort).
  const renameClass = (klass, rawName) => {
    const name = (rawName || '').trim();
    setRenameTarget(null);
    if (!klass || !name || name === klass.name) return;
    saveClasses(classes.map((c) => (c.id === klass.id ? { ...c, name } : c)));
    (klass.studentUids || []).forEach((uid) => {
      const s = students.find((x) => x.uid === uid);
      const tasks = s?.assignedTasks || [];
      if (!tasks.some((t) => t.classId === klass.id)) return;
      const next = tasks.map((t) => (t.classId === klass.id ? { ...t, className: name } : t));
      setStudents((prev) => prev.map((x) => (x.uid === uid ? { ...x, assignedTasks: next } : x)));
      updateDoc(doc(db, 'users', uid), { assignedTasks: next }).catch(() => {});
    });
  };

  // Add students to an existing class. If `assignExisting`, back-assign every
  // task the class has already been given (one fresh copy per task, per newcomer).
  const addStudentsToClass = async (klass, uids, assignExisting) => {
    if (!klass || uids.length === 0) { setAddToClass(null); return; }
    const merged = [...new Set([...(klass.studentUids || []), ...uids])];
    saveClasses(classes.map((c) => (c.id === klass.id ? { ...c, studentUids: merged } : c)));

    if (assignExisting) {
      // One representative per task batch (same classId + assignedAt + title) from
      // the students already in the class.
      const batches = new Map();
      (klass.studentUids || []).forEach((muid) => {
        const m = students.find((s) => s.uid === muid);
        (m?.assignedTasks || []).forEach((t) => {
          if (t.classId !== klass.id) return;
          const k = `${t.assignedAt}__${t.title}`;
          if (!batches.has(k)) batches.set(k, t);
        });
      });
      const templates = [...batches.values()].map((t) => ({
        title: t.title, description: t.description || '', youtube: t.youtube || '', song: t.song || '',
        dueDate: t.dueDate || null, durationMin: t.durationMin || 0,
        completed: false, assignedAt: t.assignedAt, teacherUid: auth.currentUser.uid,
        classId: klass.id, className: klass.name,
      }));
      if (templates.length > 0) {
        try {
          await Promise.all(uids.map((uid, ui) => {
            const tasks = templates.map((tpl, ti) => ({ ...tpl, id: `${Date.now()}_${ui}_${ti}` }));
            return updateDoc(doc(db, 'users', uid), { assignedTasks: arrayUnion(...tasks) });
          }));
        } catch (e) { Alert.alert('Note', "Students were added, but assigning the existing tasks failed. Try again."); }
      }
    }
    setAddToClass(null);
    await loadStudents();
    Alert.alert('Added', `${uids.length} student${uids.length === 1 ? '' : 's'} added to ${klass.name}.`);
  };

  // Remove a student from a class (off the roster + drop that class's tasks from
  // their account). They stay connected to the teacher.
  const removeStudentFromClass = (klass, uid, name) => {
    Alert.alert('Remove from class?', `Remove ${name} from ${klass.name}? Their tasks from this class will be removed too.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          saveClasses(classes.map((c) => (c.id === klass.id ? { ...c, studentUids: (c.studentUids || []).filter((u) => u !== uid) } : c)));
          const s = students.find((x) => x.uid === uid);
          const next = (s?.assignedTasks || []).filter((t) => t.classId !== klass.id);
          try {
            await updateDoc(doc(db, 'users', uid), { assignedTasks: next });
            setStudents((prev) => prev.map((x) => (x.uid === uid ? { ...x, assignedTasks: next } : x)));
          } catch (e) {
            Alert.alert('Error', "Couldn't remove the student's class tasks. Please try again.");
          }
        },
      },
    ]);
  };

  const addStudent = async () => {
    if (DEMO_MODE) { Alert.alert('Demo mode', 'Adding students is disabled in demo mode.'); return; }
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviting(true);
    try {
      const q = query(collection(db, 'users'), where('email', '==', email));
      const snap = await getDocs(q);
      if (snap.empty) { Alert.alert('Not found', 'No Prova account found with that email.'); return; }
      const studentUid = snap.docs[0].id;
      if (students.find((s) => s.uid === studentUid)) { Alert.alert('Already added', 'This student is already in your list.'); return; }
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

  const removeStudent = (studentUid, name) => {
    if (DEMO_MODE) { Alert.alert('Demo mode', 'Removing students is disabled in demo mode.'); return; }
    Alert.alert('Remove Student', `Remove ${name}? They can reconnect later with your code.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            // Unlink the student (clear their teacherUid). Allowed for the
            // linked teacher by the Firestore rule.
            await updateDoc(doc(db, 'users', studentUid), { teacherUid: null });
            setStudents((prev) => prev.filter((s) => s.uid !== studentUid));
          } catch (e) {
            Alert.alert('Error', "Couldn't remove this student. Please try again.");
          }
        },
      },
    ]);
  };

  // Remove one assigned task from a student (allowed: linked teacher may update
  // the student's assignedTasks).
  const removeAssignedTask = (studentUid, taskId, taskTitle) => {
    Alert.alert('Remove task?', taskTitle, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const s = students.find((x) => x.uid === studentUid);
          const next = (s?.assignedTasks || []).filter((t) => t.id !== taskId);
          try {
            await updateDoc(doc(db, 'users', studentUid), { assignedTasks: next });
            setStudents((prev) => prev.map((x) => (x.uid === studentUid ? { ...x, assignedTasks: next } : x)));
          } catch (e) {
            Alert.alert('Error', "Couldn't remove the task. Please try again.");
          }
        },
      },
    ]);
  };

  // Mark a student's practice-proof clip as verified (writes the student's
  // assignedTasks — allowed for the linked teacher).
  const verifyProof = async (studentUid, taskId) => {
    const s = students.find((x) => x.uid === studentUid);
    const next = (s?.assignedTasks || []).map((t) => (t.id === taskId ? { ...t, proofVerified: true, proofVerifiedAt: new Date().toISOString() } : t));
    try {
      await updateDoc(doc(db, 'users', studentUid), { assignedTasks: next });
      setStudents((prev) => prev.map((x) => (x.uid === studentUid ? { ...x, assignedTasks: next } : x)));
      setProofView((p) => (p ? { ...p, verified: true } : p));
    } catch (e) {
      Alert.alert('Error', "Couldn't verify the proof. Please try again.");
    }
  };

  // Remove a class task from EVERY student it was assigned to. A class batch
  // shares the same classId + assignedAt + title, so match on that.
  const removeClassTask = (klass, group) => {
    Alert.alert(
      'Remove from whole class?',
      `"${group.title}" will be removed from all ${group.count} student${group.count === 1 ? '' : 's'} in ${klass.name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove from class', style: 'destructive', onPress: async () => {
            const memberUids = (klass.studentUids || []).filter((uid) => students.some((s) => s.uid === uid));
            const matches = (t) => t.classId === klass.id && t.assignedAt === group.assignedAt && t.title === group.title;
            try {
              await Promise.all(memberUids.map((uid) => {
                const s = students.find((x) => x.uid === uid);
                const next = (s?.assignedTasks || []).filter((t) => !matches(t));
                return updateDoc(doc(db, 'users', uid), { assignedTasks: next });
              }));
              setStudents((prev) => prev.map((x) =>
                memberUids.includes(x.uid) ? { ...x, assignedTasks: (x.assignedTasks || []).filter((t) => !matches(t)) } : x
              ));
            } catch (e) {
              Alert.alert('Error', "Couldn't remove the task for the class. Please try again.");
            }
          },
        },
      ]
    );
  };

  // One-tap parent report: compile this week's practice + share it.
  const sendParentReport = async (student) => {
    try {
      const snap = await getDocs(query(
        collection(db, 'sessionHistory', student.uid, 'logs'),
        orderBy('date', 'desc'), limit(7),
      ));
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 6); cutoff.setHours(0, 0, 0, 0);
      let weekMins = 0; let daysPracticed = 0;
      snap.forEach((d) => {
        const data = d.data();
        const day = new Date(`${d.id}T00:00:00`);
        if (day >= cutoff && (data.totalMinutes || 0) > 0) { weekMins += data.totalMinutes; daysPracticed++; }
      });
      const name = displayName(student);
      const streak = student.streak || 0;
      const assigned = student.assignedTasks?.length || 0;
      const done = student.assignedTasks?.filter((t) => t.completed).length || 0;
      const h = Math.floor(weekMins / 60); const m = weekMins % 60;
      const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;

      // Pull lesson attendance, marks and the latest note from the teacher's own
      // doc (recorded on the lesson calendar) for the last ~term.
      let lessonLines = '';
      try {
        const meSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        const att = meSnap.data()?.attendance || {};
        const c = new Date(); c.setDate(c.getDate() - 91);
        const cutoffYmd = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`;
        let present = 0, late = 0, absent = 0, markSum = 0, markCount = 0;
        let latestNote = null, latestNoteDate = '';
        Object.values(att).forEach((r) => {
          if (r.studentUid !== student.uid || (r.date || '') < cutoffYmd) return;
          if (r.status === 'present') present++;
          else if (r.status === 'late') late++;
          else if (r.status === 'absent') absent++;
          if (r.mark) { markSum += r.mark; markCount++; }
          if (r.note && (r.date || '') >= latestNoteDate) { latestNote = r.note; latestNoteDate = r.date || ''; }
        });
        const denom = present + late + absent;
        if (denom > 0) {
          const pct = Math.round(((present + late) / denom) * 100);
          lessonLines += `\nLessons this term: ${present + late} of ${denom} attended (${pct}%)`;
          if (absent > 0) lessonLines += ` · ${absent} missed`;
        }
        if (markCount > 0) lessonLines += `\nAverage lesson mark: ${(markSum / markCount).toFixed(1)} / 5 ⭐`;
        if (latestNote) lessonLines += `\nLatest teacher note: ${latestNote}`;
      } catch (e) { /* attendance is optional — skip if it fails */ }

      const report =
`🎸 Prova practice report — ${name}

This week: practiced ${daysPracticed} of 7 days · ${timeStr} total
Current streak: ${streak} day${streak === 1 ? '' : 's'} 🔥
Assigned tasks: ${done} of ${assigned} completed
Level: ${student.level || 'Beginner'} (${student.instrument || 'Guitar'})${lessonLines}

Sent from Prova`;
      await Share.share({ message: report });
    } catch (e) {
      Alert.alert('Error', "Couldn't build the report. Please try again.");
    }
  };

  const openChat = (student) => {
    setActiveChatStudent(student);
    setActiveTab('chats');
  };

  if (loading) {
    return <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />;
  }

  // ── Inline chat view ──
  if (activeChatStudent) {
    const chatTitle = displayName(activeChatStudent);
    return (
      <View style={styles.container}>
        <InlineChatView
          student={activeChatStudent}
          myUid={myUid}
          isDemo={DEMO_MODE}
          title={chatTitle}
          subtitle={`${activeChatStudent.level} · ${activeChatStudent.instrument}`}
          onBack={() => setActiveChatStudent(null)}
        />
      </View>
    );
  }

  // ── Group chat view ──
  if (activeGroup) {
    return (
      <View style={styles.container}>
        <GroupChatView
          group={activeGroup}
          myUid={myUid}
          myName={myName}
          isTeacher
          onBack={() => setActiveGroup(null)}
        />
      </View>
    );
  }

  const sQuery = studentSearch.trim().toLowerCase();
  const filteredStudents = sQuery
    ? students.filter((s) => displayName(s).toLowerCase().includes(sQuery) || (s.email || '').toLowerCase().includes(sQuery))
    : students;

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>My Students</Text>

        {/* Tab switcher */}
        <View style={styles.tabSwitcher}>
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'students' && styles.tabPillActive]}
            onPress={() => setActiveTab('students')}
          >
            <Ionicons
              name={activeTab === 'students' ? 'people' : 'people-outline'}
              size={14}
              color={activeTab === 'students' ? COLORS.text : COLORS.textMuted}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.tabPillText, activeTab === 'students' && styles.tabPillTextActive]}>
              Students {students.length > 0 ? `(${students.length})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'classes' && styles.tabPillActive]}
            onPress={() => setActiveTab('classes')}
          >
            <Ionicons
              name={activeTab === 'classes' ? 'school' : 'school-outline'}
              size={14}
              color={activeTab === 'classes' ? COLORS.text : COLORS.textMuted}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.tabPillText, activeTab === 'classes' && styles.tabPillTextActive]}>
              Classes {classes.length > 0 ? `(${classes.length})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'chats' && styles.tabPillActive]}
            onPress={() => setActiveTab('chats')}
          >
            <Ionicons
              name={activeTab === 'chats' ? 'chatbubbles' : 'chatbubbles-outline'}
              size={14}
              color={activeTab === 'chats' ? COLORS.text : COLORS.textMuted}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.tabPillText, activeTab === 'chats' && styles.tabPillTextActive]}>
              Messages
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Students tab ── */}
        {activeTab === 'students' && (
          <>
            {DEMO_MODE ? (
              <View style={styles.demoBanner}>
                <Ionicons name="flask-outline" size={13} color={COLORS.accent} style={{ marginRight: 6 }} />
                <Text style={styles.demoBannerText}>Demo — sample student data</Text>
              </View>
            ) : (
              <View style={styles.codeCard}>
                <Text style={styles.inviteLabel}>YOUR JOIN CODE</Text>
                <Text style={styles.codeBig}>{joinCode || '······'}</Text>
                <Text style={styles.codeHint}>
                  Students enter this in their Profile → My Teacher to connect with you instantly.
                </Text>
                <TouchableOpacity style={styles.shareCodeBtn} onPress={shareCode} activeOpacity={0.85}>
                  <Ionicons name="share-outline" size={16} color="#fff" />
                  <Text style={styles.shareCodeText}>Share code</Text>
                </TouchableOpacity>
              </View>
            )}

            {!DEMO_MODE && (
              <TouchableOpacity style={styles.contactsBtn} onPress={openContacts} activeOpacity={0.85}>
                <Ionicons name="mail-outline" size={17} color={COLORS.primary} />
                <Text style={styles.contactsBtnText}>Parent contacts</Text>
                <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            )}

            {!DEMO_MODE && !loading && students.length === 0 && (
              <View style={styles.emptyStudents}>
                <Ionicons name="people-outline" size={30} color={COLORS.textMuted} style={{ marginBottom: 8 }} />
                <Text style={styles.emptyStudentsText}>No students yet</Text>
                <Text style={styles.emptyStudentsSub}>Share your join code above — students appear here the moment they connect.</Text>
              </View>
            )}

            {students.length > 0 && (
              <View style={styles.studentSearchRow}>
                <Ionicons name="search" size={16} color={COLORS.textMuted} />
                <TextInput
                  style={styles.studentSearchInput}
                  placeholder="Search students…"
                  placeholderTextColor={COLORS.textMuted}
                  value={studentSearch}
                  onChangeText={setStudentSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {studentSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setStudentSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            )}
            {students.length > 0 && filteredStudents.length === 0 && (
              <Text style={styles.studentSearchEmpty}>No students match “{studentSearch.trim()}”.</Text>
            )}

            {filteredStudents.map((student) => {
              const isOpen = expanded === student.uid;
              const status = getStudentStatus(student);
              const streak = student.streak || 0;
              const totalMin = student.totalMinutes || 0;
              const hrs = Math.floor(totalMin / 60);
              const remMin = totalMin % 60;
              const practiceLabel = hrs > 0
                ? (remMin > 0 ? `${hrs}h ${remMin}m` : `${hrs}h`)
                : `${remMin}m`;
              const assignedCount = student.assignedTasks?.length || 0;
              const doneCount = student.assignedTasks?.filter((t) => t.completed).length || 0;
              const hasPracticeToday = student.availableDays?.includes(todayName);
              const nm = displayName(student);
              const initial = nm[0].toUpperCase();

              return (
                <View key={student.uid} style={styles.studentCard}>
                  <TouchableOpacity
                    style={styles.studentHeader}
                    onPress={() => setExpanded(isOpen ? null : student.uid)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.studentAvatar}>
                      <Text style={styles.studentAvatarText}>{initial}</Text>
                    </View>
                    <View style={styles.studentInfo}>
                      <View style={styles.nameRow}>
                        <Text style={styles.studentName}>{nm}</Text>
                      </View>
                      <Text style={styles.studentMeta}>{student.level} · {student.instrument}</Text>
                      <View style={styles.statusRow}>
                        <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                        <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
                      </View>
                    </View>
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.studentDetails}>
                      {/* Stats */}
                      <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                          <Text style={styles.statValue}>{streak}</Text>
                          <Text style={styles.statLabel}>day streak</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statBox}>
                          <Text style={styles.statValue}>{practiceLabel}</Text>
                          <Text style={styles.statLabel}>total practice</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statBox}>
                          <Text style={styles.statValue}>{doneCount}/{assignedCount}</Text>
                          <Text style={styles.statLabel}>tasks done</Text>
                        </View>
                      </View>

                      {/* Practice bar chart — last 2 weeks */}
                      <StudentActivityChart studentUid={student.uid} />

                      {/* Last session note */}
                      {!!student.lastSessionNote && (
                        <View style={styles.sessionNote}>
                          <Text style={styles.sessionNoteLabel}>Last practiced</Text>
                          <Text style={styles.sessionNoteText}>{student.lastSessionNote}</Text>
                        </View>
                      )}

                      {/* Today's practice */}
                      {hasPracticeToday && (
                        <View style={styles.todayPracticeRow}>
                          <Ionicons name="calendar-outline" size={14} color={COLORS.accent} style={{ marginRight: 6 }} />
                          <Text style={styles.todayPracticeText}>Scheduled to practice today</Text>
                        </View>
                      )}

                      {/* Assigned tasks — active ones here; finished ones live in
                          their own "Completed" window. */}
                      {student.assignedTasks?.length > 0 && (
                        <View style={styles.taskSection}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={[styles.taskSectionLabel, { flex: 1 }]}>ASSIGNED TASKS</Text>
                            {student.assignedTasks.some((t) => t.completed) && (
                              <TouchableOpacity onPress={() => setCompletedView(student)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Text style={styles.completedLink}>
                                  Completed ({student.assignedTasks.filter((t) => t.completed).length}) ›
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          {student.assignedTasks.filter((t) => !t.completed).length === 0 && (
                            <Text style={styles.tplSheetEmpty}>All caught up — everything's completed.</Text>
                          )}
                          {student.assignedTasks.filter((t) => !t.completed).map((t) => (
                            <View key={t.id} style={styles.miniTask}>
                              <TouchableOpacity style={styles.miniTaskMain} onPress={() => setEditTaskCtx({ student, task: t })} activeOpacity={0.7}>
                                <Ionicons
                                  name={t.completed ? 'checkmark-circle' : 'ellipse-outline'}
                                  size={15}
                                  color={t.completed ? COLORS.success : COLORS.textMuted}
                                  style={{ marginRight: 8 }}
                                />
                                <Text
                                  style={[styles.miniTaskText, t.completed && styles.miniTaskDone]}
                                  numberOfLines={1}
                                >
                                  {t.title}
                                </Text>
                              </TouchableOpacity>
                              {fmtPractised(t.practicedSec) && (
                                <Text style={styles.miniPractised}>{fmtPractised(t.practicedSec)}</Text>
                              )}
                              {!t.completed && (() => {
                                const d = taskDueLabel(t.dueDate);
                                return d ? <Text style={[styles.miniDue, d.overdue && styles.miniDueOverdue]}>{d.text}</Text> : null;
                              })()}
                              {t.proofUrl && (
                                <TouchableOpacity
                                  onPress={() => setProofView({ url: t.proofUrl, type: t.proofType || 'video', proofs: t.proofs, studentUid: student.uid, taskId: t.id, verified: !!t.proofVerified, title: t.title })}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  style={{ marginLeft: 8 }}
                                >
                                  <Ionicons name={t.proofVerified ? 'checkmark-circle' : 'videocam'} size={17} color={t.proofVerified ? COLORS.success : COLORS.primary} />
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                onPress={() => removeAssignedTask(student.uid, t.id, t.title)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={{ marginLeft: 8 }}
                              >
                                <Ionicons name="close" size={16} color={COLORS.textMuted} />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Actions */}
                      <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => setSelectedStudent(student)}>
                          <Ionicons name="add" size={15} color={COLORS.text} style={{ marginRight: 4 }} />
                          <Text style={styles.actionBtnText}>Assign Task</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtnChat} onPress={() => openChat(student)}>
                          <Ionicons name="chatbubble-ellipses" size={15} color={COLORS.primary} style={{ marginRight: 4 }} />
                          <Text style={[styles.actionBtnText, { color: COLORS.primary }]}>Message</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionBtnRemove}
                          onPress={() => removeStudent(student.uid, nm)}
                        >
                          <Ionicons name="person-remove-outline" size={15} color={COLORS.error} />
                        </TouchableOpacity>
                      </View>

                      {/* Assign a song to learn (AI step-by-step) */}
                      <TouchableOpacity style={styles.songBtn} onPress={() => setSongStudent(student)} activeOpacity={0.85}>
                        <Ionicons name="school" size={15} color={COLORS.background} style={{ marginRight: 6 }} />
                        <Text style={styles.songBtnText}>Assign a song to learn</Text>
                      </TouchableOpacity>

                      {/* Parent progress report */}
                      <TouchableOpacity style={styles.parentReportBtn} onPress={() => sendParentReport(student)} activeOpacity={0.85}>
                        <Ionicons name="share-outline" size={15} color={COLORS.primary} style={{ marginRight: 6 }} />
                        <Text style={styles.parentReportText}>Send progress to parents</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* ── Classes tab ── */}
        {activeTab === 'classes' && (
          <>
            <TouchableOpacity style={styles.newClassBtn} onPress={() => setShowCreateClass(true)} activeOpacity={0.85}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.newClassBtnText}>New class</Text>
            </TouchableOpacity>

            {classes.length === 0 ? (
              <View style={styles.emptyStudents}>
                <Ionicons name="school-outline" size={30} color={COLORS.textMuted} style={{ marginBottom: 8 }} />
                <Text style={styles.emptyStudentsText}>No classes yet</Text>
                <Text style={styles.emptyStudentsSub}>Create a class to assign tasks to a group of students at once.</Text>
              </View>
            ) : (
              classes.map((c) => {
                const members = (c.studentUids || [])
                  .map((uid) => students.find((s) => s.uid === uid))
                  .filter(Boolean);
                const open = expandedClassId === c.id;
                // Group this class's assigned tasks (one row per batch) so the
                // teacher can remove a task from the whole class at once.
                const groupMap = {};
                members.forEach((m) => (m.assignedTasks || []).filter((t) => t.classId === c.id).forEach((t) => {
                  const key = `${t.assignedAt}__${t.title}`;
                  if (!groupMap[key]) groupMap[key] = { key, title: t.title, assignedAt: t.assignedAt, count: 0, done: 0, sec: 0 };
                  groupMap[key].count += 1;
                  groupMap[key].sec += (t.practicedSec || 0);
                  if (t.completed) groupMap[key].done += 1;
                }));
                const classGroups = Object.values(groupMap).sort((a, b) => (b.assignedAt || '').localeCompare(a.assignedAt || ''));
                return (
                  <View key={c.id} style={styles.classCard}>
                    <View style={styles.classCardTop}>
                      <TouchableOpacity
                        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                        onPress={() => setExpandedClassId(open ? null : c.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={COLORS.textMuted} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.classCardName} numberOfLines={1}>{c.name}</Text>
                          <Text style={styles.classCardMeta}>{members.length} student{members.length === 1 ? '' : 's'}</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setRenameTarget(c); setRenameText(c.name); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: 14 }}>
                        <Ionicons name="pencil" size={17} color={COLORS.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteClass(c.id, c.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                      </TouchableOpacity>
                    </View>

                    {!open && members.length > 0 && (
                      <Text style={styles.classCardMembers} numberOfLines={2}>
                        {members.map((m) => displayName(m)).join(', ')}
                      </Text>
                    )}

                    {open && (
                      <View style={styles.classExpand}>
                        {members.length === 0 ? (
                          <Text style={styles.classCardMembers}>No students in this class yet.</Text>
                        ) : (
                          <>
                            <View style={styles.classViewToggle}>
                              <TouchableOpacity
                                style={[styles.classViewPill, classView === 'progress' && styles.classViewPillActive]}
                                onPress={() => setClassView('progress')}
                                activeOpacity={0.8}
                              >
                                <Text style={[styles.classViewPillText, classView === 'progress' && styles.classViewPillTextActive]}>Progress</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.classViewPill, classView === 'effort' && styles.classViewPillActive]}
                                onPress={() => setClassView('effort')}
                                activeOpacity={0.8}
                              >
                                <Text style={[styles.classViewPillText, classView === 'effort' && styles.classViewPillTextActive]}>Practice time</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.classViewPill, classView === 'leaderboard' && styles.classViewPillActive]}
                                onPress={() => setClassView('leaderboard')}
                                activeOpacity={0.8}
                              >
                                <Text style={[styles.classViewPillText, classView === 'leaderboard' && styles.classViewPillTextActive]}>Overall</Text>
                              </TouchableOpacity>
                            </View>

                            {classView === 'progress' ? (
                              <>
                                {classGroups.length > 0 && (
                                  <View style={styles.classGroupBox}>
                                    <Text style={styles.classGroupLabel}>CLASS TASKS</Text>
                                    {classGroups.map((g) => (
                                      <View key={g.key} style={styles.classGroupRow}>
                                        <Text style={styles.classGroupTitle} numberOfLines={1}>{g.title}</Text>
                                        <Text style={styles.classGroupMeta}>{g.done}/{g.count}</Text>
                                        <TouchableOpacity onPress={() => removeClassTask(c, g)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                          <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                                        </TouchableOpacity>
                                      </View>
                                    ))}
                                  </View>
                                )}
                                {members.map((m) => {
                                  const mt = (m.assignedTasks || []).filter((t) => t.classId === c.id);
                                  const done = mt.filter((t) => t.completed).length;
                                  const mSec = mt.reduce((sum, t) => sum + (t.practicedSec || 0), 0);
                                  const sKey = `${c.id}_${m.uid}`;
                                  const sOpen = openStudents.has(sKey);
                                  return (
                                    <View key={m.uid} style={styles.classMemberBlock}>
                                      <TouchableOpacity style={styles.classMemberRow} onPress={() => toggleStudent(sKey)} activeOpacity={0.7}>
                                        <Ionicons name={sOpen ? 'chevron-down' : 'chevron-forward'} size={15} color={COLORS.textMuted} />
                                        <Text style={styles.classMemberName} numberOfLines={1}>{displayName(m)}</Text>
                                        {fmtPractised(mSec) && <Text style={styles.classMemberPts}>{fmtPractised(mSec)}</Text>}
                                        <Text style={[styles.classMemberProgress, mt.length > 0 && done === mt.length && { color: COLORS.success }]}>
                                          {mt.length ? `${done}/${mt.length}` : '—'}
                                        </Text>
                                        <TouchableOpacity onPress={() => removeStudentFromClass(c, m.uid, displayName(m))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 4 }}>
                                          <Ionicons name="close" size={16} color={COLORS.textMuted} />
                                        </TouchableOpacity>
                                      </TouchableOpacity>
                                      {sOpen && (
                                        mt.length === 0 ? (
                                          <Text style={styles.classMemberEmpty}>No class tasks assigned to {displayName(m)} yet.</Text>
                                        ) : mt.map((t) => (
                                          <View key={t.id} style={styles.classTaskRow}>
                                            {/* Tap the task to see/edit its full details, same as individual students. */}
                                            <TouchableOpacity
                                              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}
                                              onPress={() => setEditTaskCtx({ student: m, task: t })}
                                              activeOpacity={0.7}
                                            >
                                              <Ionicons
                                                name={t.completed ? 'checkmark-circle' : 'ellipse-outline'}
                                                size={15}
                                                color={t.completed ? COLORS.success : COLORS.textMuted}
                                              />
                                              <Text
                                                style={[styles.classTaskTitle, t.completed && { color: COLORS.textMuted, textDecorationLine: 'line-through' }]}
                                                numberOfLines={1}
                                              >
                                                {t.title}
                                              </Text>
                                            </TouchableOpacity>
                                            {fmtPractised(t.practicedSec) && (
                                              <Text style={styles.miniPractised}>{fmtPractised(t.practicedSec)}</Text>
                                            )}
                                            <TouchableOpacity onPress={() => removeAssignedTask(m.uid, t.id, t.title)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                              <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                                            </TouchableOpacity>
                                          </View>
                                        ))
                                      )}
                                    </View>
                                  );
                                })}
                              </>
                            ) : classView === 'effort' ? (
                              // Time each student has spent practicing THIS
                              // class's assignments — the effort board.
                              (() => {
                                const ranked = [...members]
                                  .map((m) => ({
                                    m,
                                    sec: (m.assignedTasks || [])
                                      .filter((t) => t.classId === c.id)
                                      .reduce((sum, t) => sum + (t.practicedSec || 0), 0),
                                  }))
                                  .sort((a, b) => b.sec - a.sec);
                                if (ranked.every((r) => r.sec === 0)) {
                                  return <Text style={styles.classMemberEmpty}>No practice yet — time shows up as students work on the class tasks.</Text>;
                                }
                                return ranked.map(({ m, sec }, i) => {
                                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                                  return (
                                    <View key={m.uid} style={styles.lbRow}>
                                      <Text style={[styles.lbRank, i < 3 && styles.lbRankMedal]}>{medal || `${i + 1}`}</Text>
                                      <Text style={styles.lbName} numberOfLines={1}>{displayName(m)}</Text>
                                      <Text style={styles.lbScore}>{fmtPractised(sec) || '0m'}</Text>
                                    </View>
                                  );
                                });
                              })()
                            ) : (
                              [...members]
                                .sort((a, b) => (b.provaScore || 0) - (a.provaScore || 0))
                                .map((m, i) => {
                                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                                  return (
                                    <View key={m.uid} style={styles.lbRow}>
                                      <Text style={[styles.lbRank, i < 3 && styles.lbRankMedal]}>{medal || `${i + 1}`}</Text>
                                      <Text style={styles.lbName} numberOfLines={1}>{displayName(m)}</Text>
                                      <Text style={styles.lbScore}>{(m.provaScore || 0).toLocaleString()}</Text>
                                    </View>
                                  );
                                })
                            )}
                          </>
                        )}
                      </View>
                    )}

                    <View style={styles.classBtnRow}>
                      <TouchableOpacity
                        style={styles.classAddBtn}
                        onPress={() => setAddToClass(c)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="person-add-outline" size={15} color={COLORS.primary} />
                        <Text style={styles.classAssignBtnText}>Add students</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.classAddBtn, members.length === 0 && { opacity: 0.5 }]}
                        onPress={() => setSelectedClass(c)}
                        disabled={members.length === 0}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="clipboard-outline" size={15} color={COLORS.primary} />
                        <Text style={styles.classAssignBtnText}>Assign task</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.classSongBtn, members.length === 0 && { opacity: 0.5 }]}
                        onPress={() => setSongClass(c)}
                        disabled={members.length === 0}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="musical-notes-outline" size={17} color={COLORS.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* ── Messages tab ── */}
        {activeTab === 'chats' && (
          <>
            {students.length > 0 && (
              <>
                <View style={styles.groupHeaderRow}>
                  <Text style={styles.tplLabel}>GROUP CHATS</Text>
                  <TouchableOpacity style={styles.newGroupBtn} onPress={() => setShowCreateGroup(true)} activeOpacity={0.8}>
                    <Ionicons name="add" size={16} color={COLORS.primary} />
                    <Text style={styles.newGroupBtnText}>New</Text>
                  </TouchableOpacity>
                </View>
                {groupChats.length === 0 ? (
                  <Text style={styles.chatPreviewEmpty}>Create a class announcements chat — only you can post, students react.</Text>
                ) : groupChats.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={styles.chatListItem}
                    onPress={() => setActiveGroup(g)}
                    onLongPress={() => removeGroup(g)}
                    delayLongPress={400}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.studentAvatar, { backgroundColor: COLORS.accent || COLORS.primary }]}>
                      <Ionicons name="people" size={20} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.studentName} numberOfLines={1}>{g.name}</Text>
                      {g.lastMessage ? (
                        <Text style={styles.chatPreviewText} numberOfLines={1}>
                          {g.lastSenderUid === myUid ? 'You: ' : ''}{g.lastMessage}
                        </Text>
                      ) : (
                        <Text style={styles.chatPreviewEmpty}>{(g.memberUids || []).length} members · tap to post</Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ))}
                <Text style={[styles.tplLabel, { marginTop: SPACING.lg }]}>DIRECT MESSAGES</Text>
              </>
            )}
            {students.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={48} color={COLORS.textMuted} style={{ marginBottom: SPACING.md }} />
                <Text style={styles.emptyText}>Add students to start messaging</Text>
              </View>
            ) : (
              students.map((student) => {
                let lastText = null;
                let lastTs = null;
                let lastMine = false;
                if (DEMO_MODE) {
                  const msgs = student.demoMessages || [];
                  const last = msgs[msgs.length - 1];
                  if (last) {
                    lastText = last.text;
                    lastTs = last.ts;
                    lastMine = last.senderRole === 'teacher';
                  }
                } else {
                  const conv = convoMap[makeChatId(myUid, student.uid)];
                  if (conv?.lastMessage) {
                    lastText = conv.lastMessage;
                    lastTs = conv.lastMessageAt?.toMillis ? conv.lastMessageAt.toMillis() : conv.lastMessageAt;
                    lastMine = conv.lastSenderUid === myUid;
                  }
                }
                const nm = displayName(student);
                const initial = nm[0].toUpperCase();
                const status = getStudentStatus(student);
                return (
                  <TouchableOpacity
                    key={student.uid}
                    style={styles.chatListItem}
                    onPress={() => openChat(student)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.studentAvatar}>
                      <Text style={styles.studentAvatarText}>{initial}</Text>
                      <View style={[styles.avatarStatusDot, { backgroundColor: status.color }]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.studentName}>{nm}</Text>
                      {lastText ? (
                        <Text style={styles.chatPreviewText} numberOfLines={1}>
                          {lastMine ? 'You: ' : ''}{lastText}
                        </Text>
                      ) : (
                        <Text style={styles.chatPreviewEmpty}>No messages yet</Text>
                      )}
                    </View>
                    <View style={styles.chatListRight}>
                      {lastTs && <Text style={styles.chatPreviewTime}>{formatRelativeTime(lastTs)}</Text>}
                      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} style={{ marginTop: 4 }} />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <AssignTaskModal
        student={selectedStudent}
        visible={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
        onAssigned={loadStudents}
      />
      <AssignTaskModal
        klass={selectedClass}
        recipientUids={
          selectedClass
            ? (selectedClass.studentUids || []).filter((uid) => students.some((s) => s.uid === uid))
            : []
        }
        visible={!!selectedClass}
        onClose={() => setSelectedClass(null)}
        onAssigned={loadStudents}
      />
      <CreateClassModal
        visible={showCreateClass}
        students={students}
        onClose={() => setShowCreateClass(false)}
        onCreate={createClass}
      />

      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Rename class</Text>
              <TextInput
                style={styles.input}
                placeholder="Class name"
                placeholderTextColor={COLORS.textMuted}
                value={renameText}
                onChangeText={setRenameText}
                autoFocus
              />
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRenameTarget(null)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalAssignBtn, !renameText.trim() && { opacity: 0.5 }]} onPress={() => renameClass(renameTarget, renameText)}>
                  <Text style={styles.modalAssignText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <CreateGroupChatModal
        visible={showCreateGroup}
        students={students}
        classes={classes}
        onClose={() => setShowCreateGroup(false)}
        onCreate={createGroup}
      />

      {/* Parent Contacts — a private email book, saved on the teacher's own doc.
          Fills in the "who to send to" half of parent reports. */}
      <Modal visible={contactsOpen} animationType="slide" onRequestClose={() => setContactsOpen(false)}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.pcNav}>
            <TouchableOpacity onPress={() => setContactsOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.pcCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pcTitle}>Parent Contacts</Text>
            <TouchableOpacity onPress={saveContacts} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.pcSave}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <Text style={styles.pcIntro}>Add each student's parent email. Saved privately to your account — ready for parent reports.</Text>
            {students.length === 0 ? (
              <Text style={styles.pcEmpty}>No students connected yet. Share your join code first.</Text>
            ) : students.map((s) => (
              <View key={s.uid} style={styles.pcRow}>
                <Text style={styles.pcName} numberOfLines={1}>{displayName(s)}</Text>
                <TextInput
                  style={styles.pcInput}
                  placeholder="parent@email.com"
                  placeholderTextColor={COLORS.textMuted}
                  value={emailDraft[s.uid] || ''}
                  onChangeText={(v) => setEmailDraft((d) => ({ ...d, [s.uid]: v }))}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <AddStudentsModal
        visible={!!addToClass}
        klass={addToClass}
        students={students}
        onClose={() => setAddToClass(null)}
        onAdd={(uids, assignExisting) => addStudentsToClass(addToClass, uids, assignExisting)}
      />

      <AssignTaskModal
        student={editTaskCtx?.student}
        editTask={editTaskCtx?.task}
        visible={!!editTaskCtx}
        onClose={() => setEditTaskCtx(null)}
        onAssigned={loadStudents}
      />

      <AssignSongModal
        student={songStudent}
        klass={songClass}
        recipientStudents={
          songClass
            ? (songClass.studentUids || []).map((uid) => students.find((s) => s.uid === uid)).filter(Boolean)
            : undefined
        }
        visible={!!songStudent || !!songClass}
        onClose={() => { setSongStudent(null); setSongClass(null); }}
        onAssigned={loadStudents}
      />

      {/* Everything this student has finished, in its own window. */}
      <SheetModal visible={!!completedView} onRequestClose={() => setCompletedView(null)} cardStyle={styles.modalCard}>
            {(() => {
              const live = students.find((s) => s.uid === completedView?.uid) || completedView;
              const done = (live?.assignedTasks || [])
                .filter((t) => t.completed)
                .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
              return (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm }}>
                    <Text style={[styles.modalTitle, { flex: 1, marginBottom: 0 }]} numberOfLines={1}>
                      Completed · {live ? displayName(live) : ''}
                    </Text>
                    <TouchableOpacity onPress={() => setCompletedView(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  {done.length === 0 ? (
                    <Text style={styles.tplSheetEmpty}>Nothing completed yet.</Text>
                  ) : (
                    <ScrollView style={{ maxHeight: 420 }}>
                      {done.map((t) => (
                        <View key={t.id} style={styles.completedRow}>
                          <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                          {/* Tap to open the task (e.g. to leave feedback on it). */}
                          <TouchableOpacity
                            style={{ flex: 1, minWidth: 0 }}
                            onPress={() => { setCompletedView(null); setEditTaskCtx({ student: live, task: t }); }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.completedTitle} numberOfLines={1}>{t.title}</Text>
                            <Text style={styles.completedMeta}>
                              {[
                                t.completedAt ? new Date(t.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null,
                                fmtPractised(t.practicedSec) ? `${fmtPractised(t.practicedSec)} practiced` : null,
                                t.feedback ? '💬' : null,
                                t.className || null,
                              ].filter(Boolean).join(' · ')}
                            </Text>
                          </TouchableOpacity>
                          {t.proofUrl && (
                            <TouchableOpacity
                              // Close this window first — iOS won't stack two Modals.
                              onPress={() => { setCompletedView(null); setProofView({ url: t.proofUrl, type: t.proofType || 'video', proofs: t.proofs, studentUid: live.uid, taskId: t.id, verified: !!t.proofVerified, title: t.title }); }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name={t.proofVerified ? 'checkmark-circle' : 'videocam'} size={17} color={t.proofVerified ? COLORS.success : COLORS.primary} />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity onPress={() => removeAssignedTask(live.uid, t.id, t.title)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="trash-outline" size={16} color={COLORS.textMuted} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </>
              );
            })()}
      </SheetModal>

      <Modal visible={!!proofView} transparent animationType="fade" onRequestClose={() => setProofView(null)}>
        <View style={styles.proofBackdrop}>
          <View style={styles.proofViewer}>
            {!!proofView && <Text style={styles.proofTitle} numberOfLines={1}>{proofView.title}</Text>}
            {proofView ? (() => {
              // A task can carry several clips — page through them.
              const clips = Array.isArray(proofView.proofs) && proofView.proofs.length > 0
                ? proofView.proofs
                : [{ url: proofView.url, type: proofView.type }];
              const cur = clips[Math.min(proofIdx, clips.length - 1)];
              return (
                <>
                  <ProofMedia key={cur.url} url={cur.url} type={cur.type || 'video'} style={styles.proofMedia} />
                  {clips.length > 1 && (
                    <View style={styles.proofPager}>
                      <TouchableOpacity onPress={() => setProofIdx((i) => Math.max(0, i - 1))} disabled={proofIdx === 0} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="chevron-back-circle" size={26} color={proofIdx === 0 ? COLORS.border : COLORS.text} />
                      </TouchableOpacity>
                      <Text style={styles.proofPagerText}>{Math.min(proofIdx, clips.length - 1) + 1} of {clips.length}</Text>
                      <TouchableOpacity onPress={() => setProofIdx((i) => Math.min(clips.length - 1, i + 1))} disabled={proofIdx >= clips.length - 1} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="chevron-forward-circle" size={26} color={proofIdx >= clips.length - 1 ? COLORS.border : COLORS.text} />
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              );
            })() : null}
            <View style={styles.proofActions}>
              {proofView?.verified ? (
                <View style={styles.proofVerifiedTag}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                  <Text style={styles.proofVerifiedText}>Verified</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.proofVerifyBtn} onPress={() => verifyProof(proofView.studentUid, proofView.taskId)} activeOpacity={0.85}>
                  <Ionicons name="checkmark" size={17} color="#fff" />
                  <Text style={styles.proofVerifyText}>Verify</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.proofCloseBtn} onPress={() => setProofView(null)} activeOpacity={0.85}>
                <Text style={styles.proofCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Student Assigned Tasks View ──────────────────────────────────────────────

function StudentTasksView({ assignedTasks, teacherUid }) {
  const [tasks, setTasks] = useState(assignedTasks || []);
  const [loading, setLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [teacherEmail, setTeacherEmail] = useState('');
  const myUid = auth.currentUser?.uid;

  useEffect(() => {
    if (!teacherUid) return;
    getDoc(doc(db, 'users', teacherUid))
      .then((s) => setTeacherEmail(s.data()?.email || 'Your teacher'))
      .catch(() => {});
  }, [teacherUid]);

  const toggleTask = async (taskId) => {
    setLoading(true);
    try {
      const uid = auth.currentUser.uid;
      const snap = await getDoc(doc(db, 'users', uid));
      const current = snap.data()?.assignedTasks || [];
      const updated = current.map((t) => t.id === taskId ? { ...t, completed: !t.completed } : t);
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
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.studentViewHeader}>
          <View>
            <Text style={styles.title}>Assigned Tasks</Text>
            <Text style={styles.subtitle}>Tasks set by your teacher</Text>
          </View>
          {!!teacherUid && (
            <TouchableOpacity style={styles.chatWithTeacherBtn} onPress={() => setChatOpen(true)}>
              <Ionicons name="chatbubble-ellipses" size={16} color={COLORS.text} style={{ marginRight: 5 }} />
              <Text style={styles.chatWithTeacherText}>Chat</Text>
            </TouchableOpacity>
          )}
        </View>

        {tasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="clipboard-outline" size={48} color={COLORS.textMuted} style={{ marginBottom: SPACING.md }} />
            <Text style={styles.emptyText}>No tasks assigned yet</Text>
          </View>
        ) : (
          <>
            {pending.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>TO DO</Text>
                {pending.map((task) => (
                  <TouchableOpacity key={task.id} style={styles.taskCard} onPress={() => toggleTask(task.id)} disabled={loading} activeOpacity={0.8}>
                    <View style={styles.taskCheck} />
                    <View style={styles.taskContent}>
                      <Text style={styles.taskTitle}>{task.title}</Text>
                      {!!task.description && <Text style={styles.taskDesc}>{task.description}</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
            {done.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>COMPLETED</Text>
                {done.map((task) => (
                  <TouchableOpacity key={task.id} style={[styles.taskCard, styles.taskCardDone]} onPress={() => toggleTask(task.id)} disabled={loading} activeOpacity={0.8}>
                    <View style={styles.taskCheckDone}>
                      <Ionicons name="checkmark" size={13} color={COLORS.text} />
                    </View>
                    <View style={styles.taskContent}>
                      <Text style={[styles.taskTitle, styles.taskTitleDone]}>{task.title}</Text>
                      {!!task.description && <Text style={styles.taskDesc}>{task.description}</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* No keyboardAvoiding here — InlineChatView carries its own KAV (with a
          zero offset in the sheet); two avoiders would double-compensate. */}
      <SheetModal visible={chatOpen} onRequestClose={() => setChatOpen(false)} cardStyle={styles.chatSheet}>
              <View style={styles.chatHeader}>
                <Text style={styles.chatTitle}>Your Teacher</Text>
                <TouchableOpacity onPress={() => setChatOpen(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={22} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
              <InlineChatView
                student={{ uid: teacherUid, email: teacherEmail, demoMessages: [] }}
                myUid={myUid}
                isDemo={false}
              />
      </SheetModal>
    </>
  );
}

// ─── Root Screen ──────────────────────────────────────────────────────────────

export default function TeacherScreen() {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    React.useCallback(() => { loadUser(); }, [])
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

  // role (set at signup) is the source of truth.
  // Fall back to legacy fields for existing accounts without a role.
  // Only paid teachers get in — role alone doesn't bypass the paywall
  if (!userData?.isTeacherPro) {
    return <PaywallScreen onUnlock={loadUser} />;
  }

  // Paid teachers who are also linked as a student see assigned tasks
  if (userData?.teacherUid) {
    return (
      <SafeAreaView style={styles.container}>
        <StudentTasksView assignedTasks={userData.assignedTasks || []} teacherUid={userData.teacherUid} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <TeacherDashboard />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.xs },
  subtitle: { color: COLORS.textSecondary, fontSize: 14, marginBottom: SPACING.lg },
  sectionLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: SPACING.sm },

  // Demo banner
  demoBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(6,182,212,0.08)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(6,182,212,0.2)',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  demoBannerText: { color: COLORS.accent, fontSize: 12, fontWeight: '600' },

  // Tab switcher
  tabSwitcher: {
    flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 4, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border,
  },
  tabPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.sm, borderRadius: 9 },
  tabPillActive: { backgroundColor: COLORS.primary },
  tabPillText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  tabPillTextActive: { color: COLORS.text },

  // Invite
  inviteCard: { backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg },
  inviteLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 1 },

  codeCard: { backgroundColor: COLORS.primary + '14', borderRadius: 16, borderWidth: 1, borderColor: COLORS.primary + '44', padding: SPACING.lg, marginBottom: SPACING.lg },
  codeBig: { color: COLORS.text, fontSize: 34, fontWeight: '900', letterSpacing: 6, marginVertical: 4 },
  codeHint: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: SPACING.md },
  shareCodeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 11 },
  shareCodeText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  contactsBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingVertical: SPACING.md, paddingHorizontal: SPACING.md, marginBottom: SPACING.lg },
  contactsBtnText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  // Parent Contacts page
  pcNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pcCancel: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' },
  pcTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  pcSave: { color: COLORS.primary, fontSize: 15, fontWeight: '800' },
  pcIntro: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: SPACING.lg },
  pcEmpty: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center', marginTop: SPACING.xl },
  pcRow: { marginBottom: SPACING.md },
  pcName: { color: COLORS.text, fontSize: 14, fontWeight: '700', marginBottom: SPACING.xs },
  pcInput: { backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 12, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  studentSearchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  studentSearchInput: { flex: 1, color: COLORS.text, fontSize: 15, paddingVertical: 10 },
  studentSearchEmpty: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: SPACING.lg },
  emptyStudents: { alignItems: 'center', paddingVertical: SPACING.xxl, paddingHorizontal: SPACING.lg },
  emptyStudentsText: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  emptyStudentsSub: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19 },

  // Classes
  classPickRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  classPickName: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '600' },
  classPickMeta: { color: COLORS.textMuted, fontSize: 12 },
  classPickChip: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, maxWidth: 160 },
  classPickChipOn: { backgroundColor: COLORS.primary + '22', borderColor: COLORS.primary },
  classPickChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  classPickChipTextOn: { color: COLORS.primary },
  groupHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  newGroupBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: COLORS.primary + '1A', borderRadius: 12, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  newGroupBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  newClassBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12, marginBottom: SPACING.lg },
  newClassBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  classCard: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.md },
  classCardTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  classCardName: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  classCardMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 1 },
  classCardMembers: { color: COLORS.textMuted, fontSize: 12, marginTop: SPACING.sm, lineHeight: 17 },
  classAssignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: SPACING.md, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.surface },
  classAssignBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  classBtnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  classAddBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.surface },
  // Icon-only "assign a song" so all three class actions fit on one row.
  classSongBtn: { width: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.surface },
  assignTasksRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.md, paddingVertical: 4 },
  assignTasksText: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: '600' },
  classHint: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center', marginBottom: SPACING.sm },
  classExpand: { marginTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm },
  classMemberBlock: { marginBottom: 6, backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  classMemberRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 8 },
  classMemberEmpty: { color: COLORS.textMuted, fontSize: 12, paddingLeft: 22, paddingBottom: 6 },
  classMemberName: { color: COLORS.text, fontSize: 13, fontWeight: '700', flex: 1, minWidth: 0 },
  classMemberProgress: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  classMemberPts: { color: COLORS.accent || COLORS.primary, fontSize: 12, fontWeight: '700' },
  classTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4, paddingLeft: SPACING.xs },
  classTaskTitle: { color: COLORS.textSecondary, fontSize: 12, flex: 1, minWidth: 0 },
  classGroupBox: { backgroundColor: COLORS.surface, borderRadius: 10, padding: SPACING.sm, marginBottom: SPACING.sm },
  classGroupLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  classGroupRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 6 },
  classGroupTitle: { color: COLORS.text, fontSize: 13, fontWeight: '600', flex: 1, minWidth: 0 },
  classGroupMeta: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  classGroupPts: { color: COLORS.accent || COLORS.primary, fontSize: 12, fontWeight: '700' },
  classViewToggle: { flexDirection: 'row', gap: SPACING.xs, backgroundColor: COLORS.surface, borderRadius: 10, padding: 3, marginBottom: SPACING.sm },
  classViewPill: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  classViewPillActive: { backgroundColor: COLORS.primary },
  classViewPillText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  classViewPillTextActive: { color: COLORS.text },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  lbRank: { width: 26, textAlign: 'center', color: COLORS.textSecondary, fontSize: 13, fontWeight: '800' },
  lbRankMedal: { fontSize: 16 },
  lbName: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 13, fontWeight: '600' },
  lbScore: { color: COLORS.primary, fontSize: 13, fontWeight: '800' },
  inviteRow: { flexDirection: 'row', gap: SPACING.sm },
  inviteInput: { flex: 1, backgroundColor: COLORS.surface, color: COLORS.text, borderRadius: 8, padding: SPACING.sm, fontSize: 14, borderWidth: 1, borderColor: COLORS.border },
  inviteBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: SPACING.md, justifyContent: 'center', minWidth: 56, alignItems: 'center' },
  inviteBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },

  // Student card
  studentCard: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  studentHeader: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.md },
  studentAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  studentAvatarText: { color: COLORS.text, fontWeight: '800', fontSize: 17 },
  avatarStatusDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: COLORS.card },
  studentInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 2 },
  studentName: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  todayBadge: { backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },
  todayBadgeText: { color: COLORS.success, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  studentMeta: { color: COLORS.textMuted, fontSize: 12, marginBottom: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '500' },
  studentDetails: { borderTopWidth: 1, borderTopColor: COLORS.border, padding: SPACING.md, gap: SPACING.md },

  // Stats
  statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 10, padding: SPACING.md },
  statBox: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 30, backgroundColor: COLORS.border },
  statValue: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  statLabel: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },

  // Session note
  sessionNote: { backgroundColor: COLORS.surface, borderRadius: 10, padding: SPACING.md },
  sessionNoteLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' },
  sessionNoteText: { color: COLORS.textSecondary, fontSize: 13 },

  // Today practice row
  todayPracticeRow: { flexDirection: 'row', alignItems: 'center' },
  todayPracticeText: { color: COLORS.accent, fontSize: 13, fontWeight: '500' },

  // Assigned tasks mini list
  taskSection: { gap: 6 },
  taskSectionLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  completedLink: { color: COLORS.primary, fontSize: 11, fontWeight: '700' },
  completedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  completedTitle: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  completedMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },

  parentReportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, borderRadius: 10, backgroundColor: COLORS.primary + '15',
    borderWidth: 1, borderColor: COLORS.primary + '33',
  },
  parentReportText: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },

  songBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.primary,
  },
  songBtnText: { color: COLORS.background, fontSize: 14, fontWeight: '800' },

  // AssignSongModal
  // The extra bottom padding + negative margin let the sheet overshoot the
  // screen edge, so no background "crack" shows between it and the keyboard.
  songModalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.md, paddingBottom: SPACING.md + 40, marginBottom: -40, maxHeight: '88%' },
  songModalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  songModalTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  songFieldLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: SPACING.sm },
  songInput: { backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 },
  songCapHint: { color: COLORS.textMuted, fontSize: 12, marginTop: SPACING.sm, lineHeight: 17 },
  songGenBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.md, marginBottom: SPACING.sm },
  songGenBtnOff: { opacity: 0.4 },
  songGenBtnText: { color: COLORS.background, fontSize: 15, fontWeight: '700' },
  songPlainBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  songPlainBtnText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  songGenBox: { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  songGenText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  songPlanHeading: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  songPlanOverview: { color: COLORS.textSecondary, fontSize: 13, fontStyle: 'italic', marginTop: 4, lineHeight: 19 },
  songStepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  songStepTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  songStepSummary: { color: COLORS.textSecondary, fontSize: 13, marginTop: 3, lineHeight: 18 },
  songPlanActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  songBackBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  songBackText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700' },
  songAssignBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center' },
  songAssignText: { color: COLORS.background, fontSize: 15, fontWeight: '800' },

  // Per-student practice bar chart
  chartWrap: { gap: SPACING.sm },
  chartHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  chartSummary: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 56 },
  chartCol: { flex: 1, alignItems: 'center' },
  chartTrack: { width: '100%', flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.surface, borderRadius: 3, overflow: 'hidden' },
  chartBar: { width: '100%', backgroundColor: COLORS.primary, borderRadius: 3, minHeight: 2 },
  chartBarToday: { backgroundColor: COLORS.accent },
  chartTick: { color: COLORS.textMuted, fontSize: 8, fontWeight: '600', marginTop: 3 },
  chartTickToday: { color: COLORS.accent },

  miniTask: { flexDirection: 'row', alignItems: 'center' },
  miniTaskMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  miniTaskText: { color: COLORS.textSecondary, fontSize: 12, flex: 1 },
  miniTaskDone: { textDecorationLine: 'line-through', color: COLORS.textMuted },
  proofBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  proofViewer: { width: '100%', alignItems: 'center' },
  proofTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: SPACING.sm, maxWidth: '100%' },
  proofMedia: { width: '100%', height: 360, borderRadius: 12, backgroundColor: '#000' },
  proofActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.lg },
  proofPager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, marginTop: SPACING.sm },
  proofPagerText: { color: '#fff', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  proofVerifyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: SPACING.lg, borderRadius: 999, backgroundColor: COLORS.success },
  proofVerifyText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  proofVerifiedTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  proofVerifiedText: { color: COLORS.success, fontSize: 14, fontWeight: '800' },
  proofCloseBtn: { paddingVertical: 11, paddingHorizontal: SPACING.lg, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.15)' },
  proofCloseText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  miniDue: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', marginLeft: 6 },
  miniPractised: { color: COLORS.accent || COLORS.primary, fontSize: 11, fontWeight: '700', marginLeft: 6, fontVariant: ['tabular-nums'] },
  miniDueOverdue: { color: COLORS.error },

  // Action row
  actionRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  actionBtnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 10 },
  actionBtnChat: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border },
  actionBtnRemove: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.error },
  actionBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 13 },

  // Chats list
  chatListItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md },
  chatPreviewText: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  chatPreviewEmpty: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  chatListRight: { alignItems: 'flex-end' },
  chatPreviewTime: { color: COLORS.textMuted, fontSize: 11 },

  // Chat nav header
  chatNavHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  chatNavBackBtn: { flexDirection: 'row', alignItems: 'center', width: 90 },
  chatNavBackText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  chatNavCenter: { flex: 1, alignItems: 'center' },
  chatNavTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  chatNavSub: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },

  // Chat messages
  chatMessages: { padding: SPACING.md, gap: SPACING.xs, flexGrow: 1 },
  chatEmpty: { alignItems: 'center', justifyContent: 'center', paddingTop: SPACING.xxl },
  chatEmptyText: { color: COLORS.textMuted, fontSize: 14 },
  bubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: SPACING.md, paddingVertical: 10, marginBottom: 2 },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: COLORS.primary },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMe: { color: COLORS.text },
  bubbleTextThem: { color: COLORS.text },

  // Chat input
  chatInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm, padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  chatInput: { flex: 1, backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 22, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, maxHeight: 100 },
  chatSendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  chatVideoBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  chatReceipt: { alignSelf: 'flex-end', color: COLORS.textMuted, fontSize: 10, fontWeight: '600', marginTop: 2, marginRight: 4 },

  // Chat modal (student side)
  chatSheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '80%' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  chatTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.xl, paddingBottom: SPACING.xl + 40, marginBottom: -40, maxHeight: '88%' },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginBottom: SPACING.xs },
  modalSubtitle: { color: COLORS.textSecondary, fontSize: 13, marginBottom: SPACING.lg },
  input: { backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 10, padding: SPACING.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  tplBlock: { marginBottom: SPACING.md },
  tplHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  tplLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  tplSave: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  tplChip: { paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.primary + '44', backgroundColor: COLORS.primary + '15', maxWidth: 180 },
  tplChipText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  tplEmpty: { color: COLORS.textMuted, fontSize: 12, fontStyle: 'italic', marginBottom: SPACING.sm },
  tplSaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.primary + '55', backgroundColor: COLORS.primary + '12' },
  tplSaveBtnDisabled: { borderColor: COLORS.border, backgroundColor: 'transparent' },
  tplSaveBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  tplActions: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  tplOpenBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  tplOpenText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  tplSheet: { width: '100%', maxWidth: 360, backgroundColor: COLORS.surface, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg },
  tplSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  tplSheetTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  tplSheetEmpty: { color: COLORS.textMuted, fontSize: 13, lineHeight: 19, paddingVertical: SPACING.md },
  tplSheetRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  tplSheetRowTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  tplSheetRowSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 1 },

  dueLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: SPACING.sm },
  dueField: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: 12, marginBottom: SPACING.md },
  timerHint: { color: COLORS.textMuted, fontSize: 11, marginBottom: SPACING.sm, marginTop: -4 },
  durInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  durInput: { width: 90, backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 10, paddingHorizontal: SPACING.md, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  durUnit: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  durClear: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  accessoryBar: { backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 8, paddingHorizontal: SPACING.lg, alignItems: 'flex-end' },
  accessoryDone: { color: COLORS.primary, fontSize: 16, fontWeight: '800' },
  durRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  durChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  durChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  durChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  durChipTextActive: { color: COLORS.text },
  dueFieldText: { flex: 1, color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },

  // Due date+time picker overlay
  dpBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  dpCard: { width: '100%', maxWidth: 340, backgroundColor: COLORS.surface, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg },
  dpHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  dpMonth: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  dpDowRow: { flexDirection: 'row', marginBottom: 4 },
  dpDow: { width: `${100 / 7}%`, textAlign: 'center', color: COLORS.textMuted, fontSize: 10, fontWeight: '700' },
  dpGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dpCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  dpDayDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dpDaySel: { backgroundColor: COLORS.primary },
  dpDayText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  dpDayPast: { color: COLORS.border },
  dpDaySelText: { color: '#fff', fontWeight: '800' },
  dpTimeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md },
  dpTimeLabel: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  dpTimeCtrls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dpStep: { width: 26, height: 26, borderRadius: 8, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  dpTimeVal: { color: COLORS.text, fontSize: 18, fontWeight: '800', minWidth: 26, textAlign: 'center', fontVariant: ['tabular-nums'] },
  dpColon: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  dpAmPm: { marginLeft: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.primary + '22', borderWidth: 1, borderColor: COLORS.primary + '44' },
  dpAmPmText: { color: COLORS.primary, fontSize: 13, fontWeight: '800' },
  dpBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  dpClear: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  dpClearText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  dpSet: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  dpSetText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalBtns: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  modalCancelBtn: { flex: 1, padding: SPACING.md, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  modalCancelText: { color: COLORS.textSecondary, fontWeight: '600' },
  modalAssignBtn: { flex: 1, padding: SPACING.md, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  modalAssignText: { color: COLORS.text, fontWeight: '700' },

  // Task cards (student view)
  taskCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md },
  taskCardDone: { opacity: 0.5 },
  taskCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.primary, marginTop: 1 },
  taskCheckDone: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  taskContent: { flex: 1 },
  taskTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  taskTitleDone: { textDecorationLine: 'line-through', color: COLORS.textSecondary },
  taskDesc: { color: COLORS.textSecondary, fontSize: 13, marginTop: 3 },

  // Student view header
  studentViewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.lg },
  chatWithTeacherBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  chatWithTeacherText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },

  // Paywall
  previewWrapper: { position: 'relative', marginBottom: SPACING.lg },
  demoCard: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md, padding: SPACING.md },
  demoInviteBar: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, alignItems: 'center', marginBottom: SPACING.md, gap: SPACING.sm },
  demoInviteText: { flex: 1, color: COLORS.textMuted, fontSize: 14 },
  demoInviteBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  demoInviteBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  demoRatingBadge: { backgroundColor: COLORS.surface, borderRadius: 8, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  demoRatingText: { fontSize: 11, color: COLORS.textSecondary },
  lockOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,8,16,0.78)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  lockBadge: { backgroundColor: COLORS.card, borderRadius: 16, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  lockIcon: { fontSize: 28, marginBottom: SPACING.xs },
  lockText: { color: COLORS.text, fontWeight: '800', fontSize: 15 },
  paywallCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.lg },
  paywallIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(59,130,246,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  paywallTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800', marginBottom: SPACING.sm },
  paywallDesc: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: SPACING.lg },
  featureList: { alignSelf: 'stretch', marginBottom: SPACING.lg, gap: SPACING.sm },
  featureRow: { flexDirection: 'row', alignItems: 'center' },
  featureItem: { color: COLORS.text, fontSize: 14 },
  pricingRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: SPACING.md },
  price: { color: COLORS.primary, fontSize: 36, fontWeight: '900' },
  pricePer: { color: COLORS.textSecondary, fontSize: 16 },
  subscribeBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, width: '100%', alignItems: 'center', marginBottom: SPACING.sm },
  subscribeBtnText: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  trialNote: { color: COLORS.textMuted, fontSize: 12 },

  // Empty
  emptyState: { alignItems: 'center', paddingTop: SPACING.xxl },
  emptyText: { color: COLORS.textSecondary, fontSize: 15 },
});
