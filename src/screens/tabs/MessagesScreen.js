import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Animated,
  Platform, Modal, Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where,
  onSnapshot, orderBy, doc, getDoc, deleteDoc, setDoc,
} from 'firebase/firestore';
import { auth, db, ignorePermissionDenied } from '../../lib/firebase';
import { makeChatId, otherUidFromChatId, sendChatMessage, markChatRead, receiptStatus, ensureChatThread, toggleChatReaction } from '../../lib/chat';
import { msgMs, timeLabel, dayLabel, sameDay } from '../../lib/chatTime';
import { ReactionChips, ReactionPicker } from '../../components/Reactions';
import { displayName } from '../../lib/displayName';
import EmptyState from '../../components/EmptyState';
import { fetchProgressReport } from '../../lib/progressReport';
import { pickMedia, captureMedia, uploadChatMedia } from '../../lib/media';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { COLORS, SPACING, TAB_BAR_STYLE, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';
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

function ChatView({ chatId, myUid, myEmail, otherEmail, otherName, hideProgress, onBack }) {
  const headerName = otherName || (otherEmail ? otherEmail.split('@')[0] : '');
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sendingProgress, setSendingProgress] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState(null);
  const [reactTarget, setReactTarget] = useState(null); // message the reaction picker is open for
  const flatRef = useRef(null);
  const insets = useSafeAreaInsets();
  const kbInset = useKeyboardInset();
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

  const react = (item, emoji) => {
    // Use the live copy of the message so a concurrent reaction isn't dropped.
    const live = messages.find((m) => m.id === item.id) || item;
    toggleChatReaction({ chatId, messageId: live.id, emoji, uid: myUid, current: live.reactions })
      .catch(() => Alert.alert('Error', "Couldn't add your reaction. Please try again."));
  };
  const pickReaction = (emoji) => {
    if (reactTarget) react(reactTarget, emoji);
    setReactTarget(null);
  };

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

  const revMessages = [...messages].reverse();

  return (
      <View style={{ flex: 1 }}>
      <View style={[styles.chatNavHeader, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Messages</Text>
        </TouchableOpacity>
        <View style={styles.chatNavCenter}>
          <View style={styles.chatAvatar}>
            <Text style={styles.chatAvatarText}>{(headerName || '?')[0].toUpperCase()}</Text>
          </View>
          <Text style={styles.chatNavEmail} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{headerName}</Text>
        </View>
        {/* "Send my progress" is a student feature — teachers have no progress. */}
        {hideProgress ? (
          <View style={styles.progressBtn} />
        ) : (
          <TouchableOpacity style={styles.progressBtn} onPress={sendProgress} disabled={sendingProgress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {sendingProgress
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <Ionicons name="stats-chart" size={15} color={COLORS.primary} />}
            <Text style={styles.progressBtnText}>Progress</Text>
          </TouchableOpacity>
        )}
      </View>

        {/* Inverted list = bottom-anchored, the real chat-app pattern: the
            newest message stays glued above the input no matter what the
            keyboard does. Dragging the list tucks the keyboard away. */}
        <FlatList
          ref={flatRef}
          data={revMessages}
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
            const ms = msgMs(item);
            // Inverted list: the chronologically-older neighbour is index+1;
            // a day separator goes above the first message of each day.
            const olderMs = index < revMessages.length - 1 ? msgMs(revMessages[index + 1]) : null;
            const showDay = !!ms && (!olderMs || !sameDay(ms, olderMs));
            const body = item.mediaUrl
              ? (
                <>
                  <MediaMessageBubble item={item} isMe={isMe} />
                  {!!ms && <Text style={[styles.msgTimeUnder, isMe && styles.msgTimeUnderMine]}>{timeLabel(ms)}</Text>}
                </>
              ) : (
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                  <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
                    {item.text}
                  </Text>
                  {!!ms && <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMine]}>{timeLabel(ms)}</Text>}
                </View>
              );
            return (
              <View>
                {showDay && (
                  <View style={styles.dayRow}><Text style={styles.dayText}>{dayLabel(ms)}</Text></View>
                )}
                <TouchableOpacity
                  activeOpacity={isMe ? 0.7 : 1}
                  onLongPress={isMe ? () => deleteMessage(item) : undefined}
                  delayLongPress={300}
                >
                  {body}
                </TouchableOpacity>
                <ReactionChips
                  reactions={item.reactions}
                  myUid={myUid}
                  onToggle={(emoji) => react(item, emoji)}
                  onAdd={() => setReactTarget(item)}
                  alignRight={isMe}
                />
                {showReceipt && <Text style={styles.receipt}>{receiptStatus(item, otherReadAt)}</Text>}
              </View>
            );
          }}
        />
        {/* The bar owns its bottom padding (surface colour), driven by the
            keyboard's own animation — no dark gap can show under the field. */}
        <Animated.View style={[styles.inputRow, { paddingBottom: kbInset }]}>
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
        </Animated.View>
        <ReactionPicker
          visible={!!reactTarget}
          onPick={pickReaction}
          onClose={() => setReactTarget(null)}
        />
      </View>
  );
}

// ─── Messages Screen ──────────────────────────────────────────────────────────

export default function MessagesScreen() {
  useThemeSync();
  const [conversations, setConversations] = useState([]);
  const [groupChats, setGroupChats] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [nameMap, setNameMap] = useState({}); // uid -> display name
  const [teacher, setTeacher] = useState(null); // { uid, email } — the linked teacher
  const [role, setRole] = useState(null); // 'teacher' | 'student' | 'personal'
  // The "Connect your teacher" empty state must wait for the profile lookup —
  // otherwise it flashes for a beat before the teacher/conversations resolve.
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState(null);

  const navigation = useNavigation();
  const myUid = auth.currentUser?.uid;
  const myEmail = auth.currentUser?.email || '';
  const isTeacher = role === 'teacher';

  // Hide the bottom tab bar while a chat/announcement thread is open, so the
  // chat can own the full screen (fixes the input sitting above a tab-bar gap
  // and the keyboard-avoidance math). Restored to the shared style on back.
  const inChat = !!(activeChat || activeGroup);
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: inChat ? { display: 'none' } : TAB_BAR_STYLE });
    return () => navigation.setOptions({ tabBarStyle: TAB_BAR_STYLE });
  }, [inChat, navigation]);

  useEffect(() => {
    if (!myUid) return;
    const q = query(
      collection(db, 'userChats', myUid, 'conversations'),
      orderBy('lastMessageAt', 'desc')
    );
    setLoadErr(false);
    return onSnapshot(q, snap => {
      setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => { setLoading(false); setLoadErr(true); });
  }, [myUid, retryNonce]);

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
        const md = meSnap.data() || {};
        setRole(md.role || null);
        const teacherUid = md.teacherUid;
        if (!teacherUid) { setProfileLoaded(true); return; }
        const teacherSnap = await getDoc(doc(db, 'users', teacherUid));
        const td = teacherSnap.data() || {};
        setTeacher({ uid: teacherUid, email: td.email || '' });
        setNameMap((m) => ({ ...m, [teacherUid]: displayName({ uid: teacherUid, ...td }) }));
        setProfileLoaded(true);
        await ensureChatThread({
          aUid: myUid,
          aEmail: myEmail,
          bUid: teacherUid,
          bEmail: td.email || '',
        });
      } catch (e) { setProfileLoaded(true); /* non-fatal */ }
    })();
  }, [myUid]);

  if (activeGroup) {
    return (
      <View style={styles.container}>
        <GroupChatView
          group={activeGroup}
          myUid={myUid}
          myName=""
          isTeacher={activeGroup.teacherUid === myUid}
          onBack={() => setActiveGroup(null)}
        />
      </View>
    );
  }

  if (activeChat) {
    return (
      <View style={styles.container}>
        <ChatView
          chatId={activeChat.chatId}
          myUid={myUid}
          myEmail={myEmail}
          otherEmail={activeChat.otherEmail}
          otherName={activeChat.otherName}
          hideProgress={isTeacher}
          onBack={() => setActiveChat(null)}
        />
      </View>
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
  // Peer-to-peer DMs are disabled for students/personal accounts — they only
  // ever see their teacher's thread + class announcements. Teachers still see
  // their (teacher↔student) conversations here.
  const otherRows = isTeacher ? conversations.filter((c) => c.otherUid !== teacherUid) : [];
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
      </View>

      {loading || !profileLoaded ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : loadErr && listData.length === 0 ? (
        <EmptyState
          variant="error"
          title="Couldn't load your messages"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => { setLoading(true); setRetryNonce((n) => n + 1); }}
        />
      ) : listData.length === 0 ? (
        isTeacher ? (
          <EmptyState
            icon="chatbubbles-outline"
            title="No messages yet"
            subtitle="Messages with your students and class announcements will appear here."
          />
        ) : teacher ? (
          <EmptyState
            icon="chatbubbles-outline"
            title="No messages yet"
            subtitle="Say hello to your teacher — messages and class announcements will appear here."
          />
        ) : (
          <EmptyState
            icon="school-outline"
            title="Connect your teacher"
            subtitle="Enter your teacher's join code to get their tasks and start chatting."
            actionLabel="Add my teacher"
            onAction={() => navigation.navigate('Profile')}
          />
        )
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
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800' },
  newBtn: { padding: SPACING.xs },
  list: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm },
  sectionHeader: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: SPACING.md, marginBottom: SPACING.xs },

  // Conversation item
  convoItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.md },
  convoAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  convoAvatarTeacher: { backgroundColor: COLORS.primary },
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
  chatNavHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.md + 2, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 96 },
  backText: { color: COLORS.primary, fontSize: 16, fontWeight: '600' },
  progressBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, width: 96 },
  progressBtnText: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  chatNavCenter: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: SPACING.sm },
  chatAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  chatAvatarText: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  chatNavEmail: { color: COLORS.text, fontSize: 14, fontWeight: '800', flexShrink: 1 },

  dayRow: { alignItems: 'center', marginVertical: SPACING.sm },
  dayText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  bubbleTime: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600', alignSelf: 'flex-end', marginTop: 3 },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.75)' },
  msgTimeUnder: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600', marginTop: 3, marginLeft: 4 },
  msgTimeUnderMine: { alignSelf: 'flex-end', marginLeft: 0, marginRight: 4 },

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
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  modalHint: { color: COLORS.textSecondary, fontSize: 13, marginBottom: SPACING.md },
  searchInput: { backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 12, padding: SPACING.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  startBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: SPACING.md, alignItems: 'center' },
  startBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
}));
