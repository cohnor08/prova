import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal, FlatList,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where, getDocs, doc, getDoc,
  updateDoc, arrayUnion, arrayRemove, onSnapshot, orderBy,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { makeChatId, sendChatMessage } from '../../lib/chat';
import { COLORS, SPACING } from '../../constants/theme';
import VideoMessageBubble from '../../components/VideoMessageBubble';

// ─── Demo ─────────────────────────────────────────────────────────────────────

export const DEMO_MODE = true;

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

// ─── Assign Task Modal ────────────────────────────────────────────────────────

function AssignTaskModal({ student, visible, onClose, onAssigned }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAssign = async () => {
    if (!title.trim()) return;
    if (DEMO_MODE) {
      Alert.alert('Demo mode', 'Task assignment is disabled in demo mode.');
      return;
    }
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
      await updateDoc(doc(db, 'users', student.uid), { assignedTasks: arrayUnion(task) });
      setTitle(''); setDescription('');
      onAssigned(); onClose();
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
          <Text style={styles.modalSubtitle}>To: {student?.name || student?.email}</Text>
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

// ─── Inline Chat View ─────────────────────────────────────────────────────────

function InlineChatView({ student, myUid, isDemo }) {
  const otherUid = student.uid;
  const otherEmail = student.email;
  const myEmail = auth.currentUser?.email || '';
  const chatId = makeChatId(myUid, otherUid);

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
  const [videoModal, setVideoModal] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoNote, setVideoNote] = useState('');
  const flatRef = useRef(null);

  useEffect(() => {
    if (isDemo) return;
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [isDemo, chatId]);

  useEffect(() => {
    if (messages.length > 0) flatRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

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

  const sendVideo = async () => {
    const url = videoUrl.trim();
    if (!url) { Alert.alert('Add a link', 'Paste a YouTube or video link to send.'); return; }
    const title = videoTitle.trim() || 'Video help';
    const note = videoNote.trim();
    setSending(true);
    try {
      if (isDemo) {
        setMessages((prev) => [
          ...prev,
          { id: `local_${Date.now()}`, senderUid: myUid, text: note, videoUrl: url, videoTitle: title, ts: Date.now() },
        ]);
      } else {
        await sendChatMessage({
          chatId, senderUid: myUid, senderEmail: myEmail, otherUid, otherEmail,
          text: note, videoUrl: url, videoTitle: title,
        });
      }
      setVideoUrl(''); setVideoTitle(''); setVideoNote(''); setVideoModal(false);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatMessages}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const isMe = item.senderUid === myUid;
          if (item.videoUrl) return <VideoMessageBubble item={item} isMe={isMe} />;
          return (
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
                {item.text}
              </Text>
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
      <View style={styles.chatInputRow}>
        <TouchableOpacity
          style={styles.chatVideoBtn}
          onPress={() => setVideoModal(true)}
          disabled={sending}
        >
          <Ionicons name="videocam" size={20} color={COLORS.primary} />
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

      <Modal visible={videoModal} transparent animationType="fade" onRequestClose={() => setVideoModal(false)}>
        <View style={styles.videoModalBackdrop}>
          <View style={styles.videoModalCard}>
            <View style={styles.videoModalHeader}>
              <Ionicons name="videocam" size={18} color={COLORS.primary} />
              <Text style={styles.videoModalTitle}>Send video help</Text>
              <TouchableOpacity onPress={() => setVideoModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.videoModalLabel}>What's it for? (title)</Text>
            <TextInput
              style={styles.videoModalInput}
              placeholder="e.g. Fixing your F barre chord"
              placeholderTextColor={COLORS.textMuted}
              value={videoTitle}
              onChangeText={setVideoTitle}
              maxLength={60}
            />
            <Text style={styles.videoModalLabel}>Video link</Text>
            <TextInput
              style={styles.videoModalInput}
              placeholder="Paste a YouTube or video URL"
              placeholderTextColor={COLORS.textMuted}
              value={videoUrl}
              onChangeText={setVideoUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.videoModalLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.videoModalInput, { height: 64, textAlignVertical: 'top' }]}
              placeholder="Add a short message…"
              placeholderTextColor={COLORS.textMuted}
              value={videoNote}
              onChangeText={setVideoNote}
              multiline
              maxLength={300}
            />
            <TouchableOpacity
              style={[styles.videoModalSend, (!videoUrl.trim() || sending) && { opacity: 0.4 }]}
              onPress={sendVideo}
              disabled={!videoUrl.trim() || sending}
            >
              {sending
                ? <ActivityIndicator color={COLORS.text} size="small" />
                : <Text style={styles.videoModalSendText}>Send to student</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Teacher Dashboard ────────────────────────────────────────────────────────

function TeacherDashboard() {
  const [students, setStudents] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [activeTab, setActiveTab] = useState('students');
  const [activeChatStudent, setActiveChatStudent] = useState(null);
  const [convoMap, setConvoMap] = useState({});

  const myUid = auth.currentUser?.uid;
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
    });
  }, [myUid]);

  const loadStudents = async () => {
    setLoading(true);
    try {
      if (DEMO_MODE) {
        setStudents(DEMO_STUDENTS_DATA);
        setLoading(false);
        return;
      }
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
    Alert.alert('Remove Student', `Remove ${name}?`, [
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

  const openChat = (student) => {
    setActiveChatStudent(student);
    setActiveTab('chats');
  };

  if (loading) {
    return <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />;
  }

  // ── Inline chat view ──
  if (activeChatStudent) {
    const displayName = activeChatStudent.name || activeChatStudent.email;
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.chatNavHeader}>
          <TouchableOpacity onPress={() => setActiveChatStudent(null)} style={styles.chatNavBackBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
            <Text style={styles.chatNavBackText}>Messages</Text>
          </TouchableOpacity>
          <View style={styles.chatNavCenter}>
            <Text style={styles.chatNavTitle} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.chatNavSub}>{activeChatStudent.level} · {activeChatStudent.instrument}</Text>
          </View>
          <View style={{ width: 80 }} />
        </View>
        <InlineChatView student={activeChatStudent} myUid={myUid} isDemo={DEMO_MODE} />
      </View>
    );
  }

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
                  <TouchableOpacity style={[styles.inviteBtn, inviting && { opacity: 0.6 }]} onPress={addStudent} disabled={inviting}>
                    {inviting ? <ActivityIndicator color={COLORS.text} size="small" /> : <Text style={styles.inviteBtnText}>Add</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {students.map((student) => {
              const isOpen = expanded === student.uid;
              const status = getStudentStatus(student);
              const streak = student.streak || 0;
              const hours = Math.floor((student.totalMinutes || 0) / 60);
              const assignedCount = student.assignedTasks?.length || 0;
              const doneCount = student.assignedTasks?.filter((t) => t.completed).length || 0;
              const hasPracticeToday = student.availableDays?.includes(todayName);
              const displayName = student.name || student.email;
              const initial = displayName[0].toUpperCase();

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
                        <Text style={styles.studentName}>{displayName}</Text>
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
                          <Text style={styles.statValue}>{hours}h</Text>
                          <Text style={styles.statLabel}>total practice</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statBox}>
                          <Text style={styles.statValue}>{doneCount}/{assignedCount}</Text>
                          <Text style={styles.statLabel}>tasks done</Text>
                        </View>
                      </View>

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

                      {/* Assigned tasks */}
                      {student.assignedTasks?.length > 0 && (
                        <View style={styles.taskSection}>
                          <Text style={styles.taskSectionLabel}>ASSIGNED TASKS</Text>
                          {student.assignedTasks.map((t) => (
                            <View key={t.id} style={styles.miniTask}>
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
                          onPress={() => removeStudent(student.uid, displayName)}
                        >
                          <Ionicons name="person-remove-outline" size={15} color={COLORS.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* ── Messages tab ── */}
        {activeTab === 'chats' && (
          <>
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
                const displayName = student.name || student.email;
                const initial = displayName[0].toUpperCase();
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
                      <Text style={styles.studentName}>{displayName}</Text>
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

      <Modal visible={chatOpen} transparent animationType="slide" onRequestClose={() => setChatOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.chatOverlay}>
            <View style={styles.chatSheet}>
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
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  miniTask: { flexDirection: 'row', alignItems: 'center' },
  miniTaskText: { color: COLORS.textSecondary, fontSize: 12, flex: 1 },
  miniTaskDone: { textDecorationLine: 'line-through', color: COLORS.textMuted },

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
  videoModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: SPACING.lg },
  videoModalCard: { backgroundColor: COLORS.surface, borderRadius: 18, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  videoModalHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  videoModalTitle: { flex: 1, color: COLORS.text, fontSize: 16, fontWeight: '800' },
  videoModalLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, marginTop: SPACING.sm },
  videoModalInput: { backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 12, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: 14, borderWidth: 1, borderColor: COLORS.border },
  videoModalSend: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.lg },
  videoModalSendText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },

  // Chat modal (student side)
  chatOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  chatSheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '80%' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  chatTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.xl },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginBottom: SPACING.xs },
  modalSubtitle: { color: COLORS.textSecondary, fontSize: 13, marginBottom: SPACING.lg },
  input: { backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 10, padding: SPACING.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  inputMulti: { height: 80, textAlignVertical: 'top' },
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
