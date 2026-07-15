import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, orderBy, onSnapshot, doc, deleteDoc,
} from 'firebase/firestore';
import { db, ignorePermissionDenied } from '../lib/firebase';
import { GROUP_REACTIONS, sendGroupMessage, toggleReaction } from '../lib/groupChat';
import { COLORS, SPACING, themedStyles } from '../constants/theme';

// A class group chat = an announcements channel. Only the owning teacher can
// post; everyone else can only react. `isTeacher` flips the input row between a
// composer (teacher) and a read-only note (students).
export default function GroupChatView({ group, myUid, myName, isTeacher, onBack }) {
  const groupId = group.id;
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const flatRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, 'groupChats', groupId, 'messages'), orderBy('timestamp', 'asc'));
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, ignorePermissionDenied);
  }, [groupId]);

  useEffect(() => {
    if (messages.length > 0) flatRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

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

  const react = (item, emoji) => {
    toggleReaction({ groupId, messageId: item.id, emoji, uid: myUid, current: item.reactions })
      .catch(() => Alert.alert('Error', "Couldn't add your reaction. Please try again."));
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
            <Text style={styles.navName} numberOfLines={1}>{group.name}</Text>
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
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="megaphone-outline" size={40} color={COLORS.textMuted} style={{ marginBottom: SPACING.sm }} />
              <Text style={styles.emptyChatText}>
                {isTeacher ? 'Post an announcement to your class.' : 'No announcements yet.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const reactions = item.reactions || {};
            const entries = Object.keys(reactions).filter((e) => (reactions[e] || []).length > 0);
            return (
              <View style={styles.msgWrap}>
                <TouchableOpacity
                  activeOpacity={isTeacher ? 0.7 : 1}
                  onLongPress={isTeacher ? () => deleteMessage(item) : undefined}
                  delayLongPress={300}
                >
                  <View style={styles.bubble}>
                    {!!item.senderName && <Text style={styles.senderName}>{item.senderName}</Text>}
                    <Text style={styles.bubbleText}>{item.text}</Text>
                  </View>
                </TouchableOpacity>

                {/* Existing reaction tallies */}
                {entries.length > 0 && (
                  <View style={styles.reactionRow}>
                    {entries.map((emoji) => {
                      const mine = (reactions[emoji] || []).includes(myUid);
                      return (
                        <TouchableOpacity
                          key={emoji}
                          style={[styles.reactionChip, mine && styles.reactionChipMine]}
                          onPress={() => react(item, emoji)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.reactionEmoji}>{emoji}</Text>
                          <Text style={[styles.reactionCount, mine && styles.reactionCountMine]}>
                            {(reactions[emoji] || []).length}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Quick-react picker (students + teacher) */}
                <View style={styles.pickerRow}>
                  {GROUP_REACTIONS.map((emoji) => (
                    <TouchableOpacity key={emoji} onPress={() => react(item, emoji)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Text style={styles.pickerEmoji}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          }}
        />

        {isTeacher ? (
          <View style={[styles.inputRow, { paddingBottom: (insets.bottom || SPACING.sm) + SPACING.xs }]}>
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
                ? <ActivityIndicator color={COLORS.text} size="small" />
                : <Ionicons name="arrow-up" size={18} color={COLORS.text} />}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.readOnlyBar, { paddingBottom: (insets.bottom || SPACING.sm) + SPACING.xs }]}>
            <Ionicons name="lock-closed" size={13} color={COLORS.textMuted} />
            <Text style={styles.readOnlyText}>Only your teacher can post here — tap an emoji to react</Text>
          </View>
        )}
      </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  navHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 70 },
  backText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  navCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  groupAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  navName: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  navMeta: { color: COLORS.textMuted, fontSize: 11 },

  messageList: { padding: SPACING.md, gap: SPACING.md, flexGrow: 1 },
  emptyChat: { alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyChatText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: SPACING.xl },

  msgWrap: { alignSelf: 'flex-start', maxWidth: '85%' },
  bubble: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, paddingHorizontal: SPACING.md, paddingVertical: 10 },
  senderName: { color: COLORS.primary, fontSize: 12, fontWeight: '800', marginBottom: 3 },
  bubbleText: { color: COLORS.text, fontSize: 15, lineHeight: 21 },

  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, marginLeft: 4 },
  reactionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  reactionChipMine: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '22' },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  reactionCountMine: { color: COLORS.primary },

  pickerRow: { flexDirection: 'row', gap: SPACING.md, marginTop: 6, marginLeft: 4, opacity: 0.85 },
  pickerEmoji: { fontSize: 18 },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm, padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  input: { flex: 1, backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 22, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },

  readOnlyBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  readOnlyText: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center' },
}));
