import React, { useState, useEffect, useRef, useContext } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, Modal, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where, getDocs,
  onSnapshot, orderBy, doc, getDoc, deleteDoc, setDoc,
} from 'firebase/firestore';
import { auth, db, ignorePermissionDenied } from '../../lib/firebase';
import { makeChatId, otherUidFromChatId, sendChatMessage, markChatRead, receiptStatus, ensureChatThread } from '../../lib/chat';
import { displayName } from '../../lib/displayName';
import { fetchProgressReport } from '../../lib/progressReport';
import { pickMedia, captureMedia, uploadChatMedia } from '../../lib/media';
import { COLORS, SPACING } from '../../constants/theme';
import MediaMessageBubble from '../../components/MediaMessageBubble';
import GroupChatView from '../../components/GroupChatView';

function formatTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d`;
}

// ─── Chat View ────────────────────────────────────────────────────────────────

function ChatView({ chatId, myUid, myEmail, otherEmail, otherName, onBack }) {
  const headerName = otherName || (otherEmail ? otherEmail.split('@')[0] : '');
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sendingProgress, setSendingProgress] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState(null);
  const flatRef = useRef(null);
  const otherUid = otherUidFromChatId(chatId, myUid);

  // Watch the other participant's read marker.
  useEffect(() => {
    return onSnapshot(doc(db, 'chats', chatId), (snap) => {
      setOtherReadAt(snap.data()?.lastRead?.[otherUid] || null);
    }, ignorePermissionDenied);
  }, [chatId, otherUid]);

  // Mark this chat read whenever it's open and new messages arrive.
  useEffect(() => {
    markChatRead(chatId, myUid).catch(() => {});
  }, [chatId, myUid, messages.length]);

  const handleMedia = async (getMedia) => {
    if (uploading || sending) return;
    const picked = await getMedia();
    if (!picked) return;
    if (picked.error) { Alert.alert('Photos', picked.error); return; }
    const caption = text.trim();
    setUploading(true);
    try {
      const url = await uploadChatMedia(picked.uri, chatId, picked.type);
      await sendChatMessage({
        chatId, senderUid: myUid, senderEmail: myEmail, otherUid, otherEmail,
        text: caption, media: { url, type: picked.type },
      });
      setText('');
    } catch (err) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, ignorePermissionDenied);
  }, [chatId]);

  // (No scroll bookkeeping needed — the inverted list is bottom-anchored.)

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      await sendChatMessage({
        chatId,
        senderUid: myUid,
        senderEmail: myEmail,
        otherUid,
        otherEmail,
        text: trimmed,
      });
    } catch (err) {
      Alert.alert('Error', err.message);
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  // Delete a message for everyone in the chat. Both participants read the same
  // messages collection, so deleting the doc removes it on both sides. You can
  // only delete your own messages. If it was the latest message, the thread
  // preview in each person's conversation list is refreshed too.
  // Share my latest weekly progress straight into this chat.
  const sendProgress = async () => {
    if (sendingProgress) return;
    setSendingProgress(true);
    try {
      const report = await fetchProgressReport(myUid);
      await sendChatMessage({ chatId, senderUid: myUid, senderEmail: myEmail, otherUid, otherEmail, text: report });
    } catch (e) {
      Alert.alert('Error', "Couldn't send your progress. Please try again.");
    } finally {
      setSendingProgress(false);
    }
  };

  const deleteMessage = (item) => {
    if (item.senderUid !== myUid) return;
    Alert.alert('Delete message', 'This removes it for everyone in this chat.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const wasLast = messages.length > 0 && messages[messages.length - 1].id === item.id;
          try {
            await deleteDoc(doc(db, 'chats', chatId, 'messages', item.id));
            if (wasLast) {
              const prev = messages[messages.length - 2] || null;
              const preview = prev
                ? (prev.mediaUrl ? (prev.mediaType === 'video' ? '🎥 Video' : '📷 Photo') : prev.text)
                : '';
              const meta = { lastMessage: preview, lastSenderUid: prev?.senderUid || '' };
              await Promise.all([
                setDoc(doc(db, 'userChats', myUid, 'conversations', chatId), meta, { merge: true }),
                otherUid ? setDoc(doc(db, 'userChats', otherUid, 'conversations', chatId), meta, { merge: true }) : Promise.resolve(),
              ]);
            }
          } catch (e) {
            Alert.alert('Error', "Couldn't delete the message. Please try again.");
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.chatNavHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Messages</Text>
        </TouchableOpacity>
        <View style={styles.chatNavCenter}>
          <View style={styles.chatAvatar}>
            <Text style={styles.chatAvatarText}>{(headerName || '?')[0].toUpperCase()}</Text>
          </View>
          <Text style={styles.chatNavEmail} numberOfLines={1}>{headerName}</Text>
        </View>
        <TouchableOpacity style={styles.progressBtn} onPress={sendProgress} disabled={sendingProgress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {sendingProgress
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Ionicons name="stats-chart" size={15} color={COLORS.primary} />}
          <Text style={styles.progressBtnText}>Progress</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={tabBarHeight}
      >
        {/* Inverted list = bottom-anchored, the real chat-app pattern: the
            newest message stays glued above the input no matter what the
            keyboard does. Dragging the list tucks the keyboard away. */}
        <FlatList
          ref={flatRef}
          data={[...messages].reverse()}
          inverted={messages.length > 0}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubble-ellipses-outline" size={40} color={COLORS.textMuted} style={{ marginBottom: SPACING.sm }} />
              <Text style={styles.emptyChatText}>No messages yet — say hello!</Text>
            </View>
          }
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
            const wrapped = (
              <TouchableOpacity
                activeOpacity={isMe ? 0.7 : 1}
                onLongPress={isMe ? () => deleteMessage(item) : undefined}
                delayLongPress={300}
              >
                {body}
              </TouchableOpacity>
            );
            if (!showReceipt) return wrapped;
            return (
              <View>
                {wrapped}
                <Text style={styles.receipt}>{receiptStatus(item, otherReadAt)}</Text>
              </View>
            );
          }}
        />
        <View style={styles.inputRow}>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={() => handleMedia(captureMedia)}
            disabled={sending || uploading}
          >
            <Ionicons name="camera" size={20} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.attachBtn}
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
            style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
            onPress={send}
            disabled={!text.trim() || sending}
          >
            {sending
              ? <ActivityIndicator color={COLORS.text} size="small" />
              : <Ionicons name="arrow-up" size={18} color={COLORS.text} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Messages Screen ──────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const [conversations, setConversations] = useState([]);
  const [groupChats, setGroupChats] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [nameMap, setNameMap] = useState({}); // uid -> display name
  const [teacher, setTeacher] = useState(null); // { uid, email } — the linked teacher
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [searching, setSearching] = useState(false);

  const myUid = auth.currentUser?.uid;
  const myEmail = auth.currentUser?.email || '';

  useEffect(() => {
    if (!myUid) return;
    const q = query(
      collection(db, 'userChats', myUid, 'conversations'),
      orderBy('lastMessageAt', 'desc')
    );
    return onSnapshot(q, snap => {
      setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
  }, [myUid]);

  // Class group chats I'm a member of (teacher-run announcements channels).
  useEffect(() => {
    if (!myUid) return;
    const q = query(collection(db, 'groupChats'), where('memberUids', 'array-contains', myUid));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.lastMessageAt?.toMillis?.() || 0) - (a.lastMessageAt?.toMillis?.() || 0));
      setGroupChats(rows);
    }, ignorePermissionDenied);
  }, [myUid]);

  // Resolve each conversation partner's username (chats only store email).
  useEffect(() => {
    const missing = conversations.map((c) => c.otherUid).filter((uid) => uid && !nameMap[uid]);
    if (missing.length === 0) return;
    (async () => {
      const updates = {};
      await Promise.all([...new Set(missing)].map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          updates[uid] = displayName({ uid, ...snap.data() });
        } catch (e) { /* ignore */ }
      }));
      if (Object.keys(updates).length) setNameMap((m) => ({ ...m, ...updates }));
    })();
  }, [conversations]);

  // Self-heal: if this student is linked to a teacher but has no chat thread yet
  // (linked before auto-seeding existed), create it so it shows up here.
  useEffect(() => {
    if (!myUid) return;
    (async () => {
      try {
        const meSnap = await getDoc(doc(db, 'users', myUid));
        const teacherUid = meSnap.data()?.teacherUid;
        if (!teacherUid) return;
        const teacherSnap = await getDoc(doc(db, 'users', teacherUid));
        const td = teacherSnap.data() || {};
        setTeacher({ uid: teacherUid, email: td.email || '' });
        setNameMap((m) => ({ ...m, [teacherUid]: displayName({ uid: teacherUid, ...td }) }));
        await ensureChatThread({
          aUid: myUid,
          aEmail: myEmail,
          bUid: teacherUid,
          bEmail: td.email || '',
        });
      } catch (e) { /* non-fatal */ }
    })();
  }, [myUid]);

  const startChat = async () => {
    const email = searchEmail.trim().toLowerCase();
    if (!email) return;
    setSearching(true);
    try {
      const q = query(collection(db, 'users'), where('email', '==', email));
      const snap = await getDocs(q);
      if (snap.empty) {
        Alert.alert('Not found', 'No Prova account found with that email.');
        return;
      }
      const otherUid = snap.docs[0].id;
      if (otherUid === myUid) {
        Alert.alert('Oops', "You can't message yourself.");
        return;
      }
      const chatId = makeChatId(myUid, otherUid);
      setShowNewChat(false);
      setSearchEmail('');
      setActiveChat({ chatId, otherEmail: email, otherUid });
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSearching(false);
    }
  };

  if (activeGroup) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GroupChatView
          group={activeGroup}
          myUid={myUid}
          myName=""
          isTeacher={activeGroup.teacherUid === myUid}
          onBack={() => setActiveGroup(null)}
        />
      </SafeAreaView>
    );
  }

  if (activeChat) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ChatView
          chatId={activeChat.chatId}
          myUid={myUid}
          myEmail={myEmail}
          otherEmail={activeChat.otherEmail}
          otherName={activeChat.otherName}
          onBack={() => setActiveChat(null)}
        />
      </SafeAreaView>
    );
  }

  // Put the linked teacher in its own "Your Teacher" section at the top, and
  // surface them even before any message exists (synthesize a tap-to-chat row).
  const teacherUid = teacher?.uid || null;
  let teacherRows = conversations.filter((c) => c.otherUid === teacherUid);
  if (teacherUid && teacherRows.length === 0) {
    teacherRows = [{
      id: `teacher-${teacherUid}`,
      chatId: makeChatId(myUid, teacherUid),
      otherUid: teacherUid,
      otherEmail: teacher.email,
      lastMessage: null,
      lastMessageAt: null,
    }];
  }
  const otherRows = conversations.filter((c) => c.otherUid !== teacherUid);
  const listData = [];
  if (teacherRows.length) {
    listData.push({ type: 'header', id: 'h-teacher', label: 'YOUR TEACHER' });
    teacherRows.forEach((c) => listData.push(c));
  }
  if (groupChats.length) {
    listData.push({ type: 'header', id: 'h-groups', label: 'CLASS CHATS' });
    groupChats.forEach((g) => listData.push({ ...g, type: 'group' }));
  }
  if (otherRows.length) {
    if (teacherRows.length || groupChats.length) listData.push({ type: 'header', id: 'h-other', label: 'MESSAGES' });
    otherRows.forEach((c) => listData.push(c));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <TouchableOpacity onPress={() => setShowNewChat(true)} style={styles.newBtn} activeOpacity={0.7}>
          <Ionicons name="create-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : listData.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles-outline" size={40} color={COLORS.primary} />
          </View>
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySubtitle}>Tap the pencil icon to message a friend or your teacher</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowNewChat(true)} activeOpacity={0.8}>
            <Text style={styles.emptyBtnText}>Start a conversation</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return <Text style={styles.sectionHeader}>{item.label}</Text>;
            }
            if (item.type === 'group') {
              const members = (item.memberUids || []).length;
              return (
                <TouchableOpacity
                  style={styles.convoItem}
                  onPress={() => setActiveGroup(item)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.convoAvatar, styles.convoAvatarTeacher]}>
                    <Ionicons name="people" size={20} color="#fff" />
                  </View>
                  <View style={styles.convoInfo}>
                    <Text style={styles.convoEmail} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.convoLast} numberOfLines={1}>
                      {item.lastMessage
                        ? `${item.lastSenderUid === myUid ? 'You: ' : ''}${item.lastMessage}`
                        : `${members} member${members === 1 ? '' : 's'} · announcements`}
                    </Text>
                  </View>
                  <View style={styles.convoRight}>
                    {!!item.lastMessageAt && <Text style={styles.convoTime}>{formatTime(item.lastMessageAt)}</Text>}
                    <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} style={{ marginTop: 4 }} />
                  </View>
                </TouchableOpacity>
              );
            }
            const isTeacher = item.otherUid === teacherUid;
            const name = nameMap[item.otherUid] || (item.otherEmail ? item.otherEmail.split('@')[0] : item.otherUid);
            return (
            <TouchableOpacity
              style={styles.convoItem}
              onPress={() => setActiveChat({ chatId: item.chatId, otherEmail: item.otherEmail || item.otherUid, otherUid: item.otherUid, otherName: name })}
              activeOpacity={0.8}
            >
              <View style={[styles.convoAvatar, isTeacher && styles.convoAvatarTeacher]}>
                {isTeacher
                  ? <Ionicons name="school" size={20} color="#fff" />
                  : <Text style={styles.convoAvatarText}>{(name || '?')[0].toUpperCase()}</Text>}
              </View>
              <View style={styles.convoInfo}>
                <Text style={styles.convoEmail} numberOfLines={1}>{name}</Text>
                <Text style={styles.convoLast} numberOfLines={1}>
                  {item.lastMessage
                    ? `${item.lastSenderUid === myUid ? 'You: ' : ''}${item.lastMessage}`
                    : isTeacher ? 'Tap to message your teacher' : 'Tap to start chatting'}
                </Text>
              </View>
              <View style={styles.convoRight}>
                {!!item.lastMessageAt && <Text style={styles.convoTime}>{formatTime(item.lastMessageAt)}</Text>}
                <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} style={{ marginTop: 4 }} />
              </View>
            </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal visible={showNewChat} transparent animationType="slide" onRequestClose={() => setShowNewChat(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Message</Text>
                <TouchableOpacity onPress={() => { setShowNewChat(false); setSearchEmail(''); }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={22} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalHint}>Enter the email address of another Prova user</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="friend@email.com"
                placeholderTextColor={COLORS.textMuted}
                value={searchEmail}
                onChangeText={setSearchEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoFocus
                onSubmitEditing={startChat}
              />
              <TouchableOpacity
                style={[styles.startBtn, (!searchEmail.trim() || searching) && { opacity: 0.5 }]}
                onPress={startChat}
                disabled={!searchEmail.trim() || searching}
                activeOpacity={0.8}
              >
                {searching
                  ? <ActivityIndicator color={COLORS.text} size="small" />
                  : <Text style={styles.startBtnText}>Open Chat</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800' },
  newBtn: { padding: SPACING.xs },
  list: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm },
  sectionHeader: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: SPACING.md, marginBottom: SPACING.xs },

  // Conversation item
  convoItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.md },
  convoAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  convoAvatarTeacher: { backgroundColor: COLORS.accent || COLORS.primary },
  convoAvatarText: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  convoInfo: { flex: 1, minWidth: 0 },
  convoEmail: { color: COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 3 },
  convoLast: { color: COLORS.textMuted, fontSize: 13 },
  convoRight: { alignItems: 'flex-end', flexShrink: 0 },
  convoTime: { color: COLORS.textMuted, fontSize: 11 },

  // Empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.primary + '33' },
  emptyTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginBottom: SPACING.sm },
  emptySubtitle: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: SPACING.xl },
  emptyBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  emptyBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 15 },

  // Chat nav header
  chatNavHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 90 },
  backText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  progressBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, width: 90 },
  progressBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  chatNavCenter: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: SPACING.sm },
  chatAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  chatAvatarText: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  chatNavEmail: { color: COLORS.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },

  // Messages
  messageList: { padding: SPACING.md, gap: SPACING.xs, flexGrow: 1 },
  emptyChat: { alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyChatText: { color: COLORS.textMuted, fontSize: 14 },
  bubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: SPACING.md, paddingVertical: 10, marginBottom: 2 },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: COLORS.primary },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMe: { color: COLORS.text },
  bubbleTextThem: { color: COLORS.text },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm, padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  chatInput: { flex: 1, backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 22, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  attachBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  receipt: { alignSelf: 'flex-end', color: COLORS.textMuted, fontSize: 10, fontWeight: '600', marginTop: 2, marginRight: 4 },

  // New chat modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  modalHint: { color: COLORS.textSecondary, fontSize: 13, marginBottom: SPACING.md },
  searchInput: { backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 12, padding: SPACING.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  startBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: SPACING.md, alignItems: 'center' },
  startBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
});
