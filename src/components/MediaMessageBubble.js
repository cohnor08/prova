import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { COLORS, SPACING, themedStyles } from '../constants/theme';

// Renders a chat message that carries a photo or video inline (mediaUrl +
// mediaType). Images show as a thumbnail; videos play inline with controls.
export default function MediaMessageBubble({ item, isMe }) {
  const isVideo = item.mediaType === 'video';

  // Hooks can't be conditional — feed the player a null source for photos.
  // No autoplay: the recipient taps play, like the old inline video.
  const player = useVideoPlayer(isVideo ? item.mediaUrl : null);

  return (
    <View style={[styles.wrap, isMe ? styles.wrapMe : styles.wrapThem]}>
      {isVideo ? (
        <VideoView
          style={styles.media}
          player={player}
          nativeControls
          contentFit="contain"
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

const styles = themedStyles(() => StyleSheet.create({
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
}));
