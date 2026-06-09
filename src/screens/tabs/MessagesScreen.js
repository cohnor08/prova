import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where, getDocs,
  onSnapshot, orderBy,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { makeChatId, otherUidFromChatId, sendChatMessage } from '../../lib/chat';
import { pickMedia, captureMedia, uploadChatMedia } from '../../lib/media';
import { COLORS, SPACING } from '../../constants/theme';
import MediaMessageBubble from '../../components/MediaMessageBubble';

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

function ChatView({ chatId, myUid, myEmail, otherEmail, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const flatRef = useRef(null);
  const otherUid = otherUidFromChatId(chatId, myUid);

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
    });
  }, [chatId]);

  useEffect(() => {
    if (messages.length > 0) flatRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

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

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.chatNavHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Messages</Text>
        </TouchableOpacity>
        <View style={styles.chatNavCenter}>
          <View style={styles.chatAvatar}>
            <Text style={styles.chatAvatarText}>{(otherEmail || '?')[0].toUpperCase()}</Text>
          </View>
          <Text style={styles.chatNavEmail} numberOfLines={1}>{otherEmail}</Text>
        </View>
        <View style={{ width: 90 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubble-ellipses-outline" size={40} color={COLORS.textMuted} style={{ marginBottom: SPACING.sm }} />
              <Text style={styles.emptyChatText}>No messages yet — say hello!</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMe = item.senderUid === myUid;
            if (item.mediaUrl) return <MediaMessageBubble item={item} isMe={isMe} />;
            return (
              <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
                  {item.text}
                </Text>
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

  if (activeChat) {
    return (
      <SafeAreaView style={styles.container}>
        <ChatView
          chatId={activeChat.chatId}
          myUid={myUid}
          myEmail={myEmail}
          otherEmail={activeChat.otherEmail}
          onBack={() => setActiveChat(null)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <TouchableOpacity onPress={() => setShowNewChat(true)} style={styles.newBtn} activeOpacity={0.7}>
          <Ionicons name="create-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : conversations.length === 0 ? (
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
          data={conversations}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.convoItem}
              onPress={() => setActiveChat({ chatId: item.chatId, otherEmail: item.otherEmail || item.otherUid, otherUid: item.otherUid })}
              activeOpacity={0.8}
            >
              <View style={styles.convoAvatar}>
                <Text style={styles.convoAvatarText}>
                  {(item.otherEmail || '?')[0].toUpperCase()}
                </Text>
              </View>
              <View style={styles.convoInfo}>
                <Text style={styles.convoEmail} numberOfLines={1}>{item.otherEmail || item.otherUid}</Text>
                <Text style={styles.convoLast} numberOfLines={1}>
                  {item.lastSenderUid === myUid ? 'You: ' : ''}{item.lastMessage}
                </Text>
              </View>
              <View style={styles.convoRight}>
                <Text style={styles.convoTime}>{formatTime(item.lastMessageAt)}</Text>
                <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} style={{ marginTop: 4 }} />
              </View>
            </TouchableOpacity>
          )}
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

  // Conversation item
  convoItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.md },
  convoAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
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
