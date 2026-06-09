import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { COLORS, SPACING } from '../constants/theme';

// Renders a chat message that carries a photo or video inline (mediaUrl +
// mediaType). Images show as a thumbnail; videos play inline with controls.
export default function MediaMessageBubble({ item, isMe }) {
  const isVideo = item.mediaType === 'video';

  return (
    <View style={[styles.wrap, isMe ? styles.wrapMe : styles.wrapThem]}>
      {isVideo ? (
        <Video
          style={styles.media}
          source={{ uri: item.mediaUrl }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          isLooping={false}
        />
      ) : (
        <Image style={styles.media} source={{ uri: item.mediaUrl }} resizeMode="cover" />
      )}
      {!!item.text && (
        <Text style={[styles.caption, isMe ? styles.captionMe : styles.captionThem]}>
          {item.text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { maxWidth: '78%', marginVertical: 4 },
  wrapMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  wrapThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  media: {
    width: 220, height: 220, borderRadius: 16,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  caption: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, paddingHorizontal: 4 },
  captionMe: { textAlign: 'right' },
  captionThem: { textAlign: 'left' },
});
