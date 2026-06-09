import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/theme';

// Renders a chat message that carries a video link (a YouTube/URL "video help"
// message). Tapping opens the video in the browser/YouTube app. Falls back to a
// YouTube search if the value isn't a full URL, so it always resolves.
export default function VideoMessageBubble({ item, isMe }) {
  const open = () => {
    const raw = (item.videoUrl || '').trim();
    const url = /^https?:\/\//i.test(raw)
      ? raw
      : `https://www.youtube.com/results?search_query=${encodeURIComponent(raw)}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={[styles.wrap, isMe ? styles.wrapMe : styles.wrapThem]}>
      <TouchableOpacity style={styles.card} onPress={open} activeOpacity={0.85}>
        <View style={styles.thumb}>
          <Ionicons name="play" size={22} color={COLORS.text} />
        </View>
        <View style={styles.meta}>
          <Text style={styles.kicker}>VIDEO HELP</Text>
          <Text style={styles.title} numberOfLines={2}>
            {item.videoTitle || 'Watch this'}
          </Text>
          <Text style={styles.cta}>Tap to watch ›</Text>
        </View>
      </TouchableOpacity>
      {!!item.text && (
        <Text style={[styles.caption, isMe ? styles.captionMe : styles.captionThem]}>
          {item.text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { maxWidth: '82%', marginVertical: 4 },
  wrapMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  wrapThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: 16, padding: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  thumb: {
    width: 52, height: 52, borderRadius: 12,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  meta: { flexShrink: 1 },
  kicker: { color: COLORS.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { color: COLORS.text, fontSize: 14, fontWeight: '700', marginTop: 1 },
  cta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  caption: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, paddingHorizontal: 4 },
  captionMe: { textAlign: 'right' },
  captionThem: { textAlign: 'left' },
});
