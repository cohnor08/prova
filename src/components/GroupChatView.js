import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Animated, Keyboard, Platform,
} from 'react-native';
import Ghost from './Ghost';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, orderBy, onSnapshot, doc, deleteDoc,
} from 'firebase/firestore';
import { db, ignorePermissionDenied } from '../lib/firebase';
import { sendGroupMessage, toggleReaction } from '../lib/groupChat';
import { pickMedia, captureMedia, uploadChatMedia } from '../lib/media';
import { msgMs, timeLabel, dayLabel, sameDay } from '../lib/chatTime';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { ReactionChips, ReactionPicker } from './Reactions';
import MediaMessageBubble from './MediaMessageBubble';
import { COLORS, SPACING, themedStyles } from '../constants/theme';

// A class group chat = an announcements channel. Only the owning teacher can
// post (text or photos/video, same as the DMs); everyone — teacher included —
// can react. `isTeacher` flips the input row between a composer and a
// read-only note.
export default function GroupChatView({ group, myUid, myName, isTeacher, onBack }) {
  const groupId = group.id;
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reactTarget, setReactTarget] = useState(null); // message the picker is open for
  const flatRef = useRef(null);
  const kbInset = useKeyboardInset();

  useEffect(() => {
    const q = query(collection(db, 'groupChats', groupId, 'messages'), orderBy('timestamp', 'asc'));
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, ignorePermissionDenied);
  }, [groupId]);

  useEffect(() => {
    if (messages.length > 0) flatRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // The list isn't inverted, so when the keyboard shrinks it, keep the newest
  // post in view.
  useEffect(() => {
    const evt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(evt, () => {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    });
    return () => sub.remove();
  }, []);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      await sendGroupMessage({ groupId, senderUid: myUid, senderName: myName, text: trimmed });
    } catch (err) {
      Alert.alert('Error', err.message);
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  // Attach a photo/video, exactly like the 1-on-1 chats (same uploader, the
  // group's id as the storage folder).
  const handleMedia = async (getMedia) => {
    if (uploading || sending) return;
    const picked = await getMedia();
    if (!picked) return;
    if (picked.error) { Alert.alert('Photos', picked.error); return; }
    const caption = text.trim();
    setUploading(true);
    try {
      const url = await uploadChatMedia(picked.uri, groupId, picked.type);
      await sendGroupMessage({
        groupId, senderUid: myUid, senderName: myName,
        text: caption, media: { url, type: picked.type },
      });
      setText('');
    } catch (err) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  };

  const react = (item, emoji) => {
    // Use the live copy of the message so a concurrent reaction isn't dropped.
    const live = messages.find((m) => m.id === item.id) || item;
    toggleReaction({ groupId, messageId: live.id, emoji, uid: myUid, current: live.reactions })
      .catch(() => Alert.alert('Error', "Couldn't add your reaction. Please try again."));
  };

  const pickReaction = (emoji) => {
    if (reactTarget) react(reactTarget, emoji);
    setReactTarget(null);
  };

  const deleteMessage = (item) => {
    if (!isTeacher) return;
    Alert.alert('Delete post', 'Remove this for the whole class?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          deleteDoc(doc(db, 'groupChats', groupId, 'messages', item.id))
            .catch(() => Alert.alert('Error', "Couldn't delete the post."));
        },
      },
    ]);
  };

  const memberCount = (group.memberUids || []).length;

  return (
      <View style={{ flex: 1 }}>
      <View style={[styles.navHeader, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.navCenter}>
          <View style={styles.groupAvatar}>
            <Ionicons name="people" size={18} color="#fff" />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.navName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{group.name}</Text>
            <Text style={styles.navMeta}>{memberCount} member{memberCount === 1 ? '' : 's'}</Text>
          </View>
        </View>
        <View style={{ width: 70 }} />
      </View>

        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="megaphone-outline" size={40} color={COLORS.textMuted} style={{ marginBottom: SPACING.sm }} />
              <Text style={styles.emptyChatText}>
                {isTeacher ? 'Post an announcement to your class.' : 'No announcements yet.'}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const mine = item.senderUid === myUid;
            const ms = msgMs(item);
            const prevMs = index > 0 ? msgMs(messages[index - 1]) : null;
            const showDay = index === 0 || !sameDay(ms, prevMs);
            return (
              <View>
                {showDay && !!ms && (
                  <View style={styles.dayRow}><Text style={styles.dayText}>{dayLabel(ms)}</Text></View>
                )}
                <View style={[styles.msgWrap, mine && styles.msgWrapMine]}>
                  <TouchableOpacity
                    activeOpacity={isTeacher ? 0.7 : 1}
                    onLongPress={isTeacher ? () => deleteMessage(item) : undefined}
                    delayLongPress={300}
                  >
                    {item.mediaUrl ? (
                      <>
                        <MediaMessageBubble item={item} isMe={mine} />
                        {!!ms && <Text style={[styles.msgTimeUnder, mine && styles.msgTimeUnderMine]}>{timeLabel(ms)}</Text>}
                      </>
                    ) : (
                      <View style={[styles.bubble, mine && styles.bubbleMine]}>
                        {!mine && !!item.senderName && <Text style={styles.senderName}>{item.senderName}</Text>}
                        <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.text}</Text>
                        {!!ms && <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{timeLabel(ms)}</Text>}
                      </View>
                    )}
                  </TouchableOpacity>
                  <ReactionChips
                    reactions={item.reactions}
                    myUid={myUid}
                    onToggle={(emoji) => react(item, emoji)}
                    onAdd={() => setReactTarget(item)}
                    alignRight={mine}
                  />
                </View>
              </View>
            );
          }}
        />

        {isTeacher ? (
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
                ? <Ghost color={COLORS.primary} size="small" />
                : <Ionicons name="image" size={20} color={COLORS.primary} />}
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Post to your class…"
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
                ? <Ghost color={COLORS.text} size="small" />
                : <Ionicons name="arrow-up" size={18} color={COLORS.text} />}
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <View style={[styles.readOnlyBar, { paddingBottom: (insets.bottom || SPACING.sm) + SPACING.xs }]}>
            <Ionicons name="lock-closed" size={13} color={COLORS.textMuted} />
            <Text style={styles.readOnlyText}>Only your teacher can post here — tap the smiley to react</Text>
          </View>
        )}

        <ReactionPicker
          visible={!!reactTarget}
          onPick={pickReaction}
          onClose={() => setReactTarget(null)}
        />
      </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  navHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 70 },
  backText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  navCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  groupAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  navName: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  navMeta: { color: COLORS.textMuted, fontSize: 11 },

  messageList: { padding: SPACING.md, gap: SPACING.md, flexGrow: 1 },
  emptyChat: { alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyChatText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: SPACING.xl },

  dayRow: { alignItems: 'center', marginBottom: SPACING.sm },
  dayText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },

  msgWrap: { alignSelf: 'flex-start', maxWidth: '85%' },
  msgWrapMine: { alignSelf: 'flex-end' },
  bubble: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, paddingHorizontal: SPACING.md, paddingVertical: 10 },
  bubbleMine: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  senderName: { color: COLORS.primary, fontSize: 12, fontWeight: '800', marginBottom: 3 },
  bubbleText: { color: COLORS.text, fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: '#fff' },
  bubbleTime: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600', alignSelf: 'flex-end', marginTop: 3 },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.75)' },
  msgTimeUnder: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600', marginTop: 3, marginLeft: 4 },
  msgTimeUnderMine: { alignSelf: 'flex-end', marginLeft: 0, marginRight: 4 },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm, padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  attachBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 22, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },

  readOnlyBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  readOnlyText: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center' },
}));
