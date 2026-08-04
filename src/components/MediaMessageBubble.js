import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { COLORS, SPACING, themedStyles } from '../constants/theme';

// Renders a chat message that carries a photo or video inline (mediaUrl +
// mediaType). Images show as a thumbnail; videos play inline with controls.
//
// Media that fails to load must never render as a bare dark box. The bubble is
// a fixed 220x220 on the card colour, so a dead link used to leave a solid
// rectangle sitting in the thread with nothing in it — which reads as the app
// being broken rather than the link. Both paths fall back to a labelled
// placeholder, and the photo path shows a spinner until the bytes arrive.
export default function MediaMessageBubble({ item, isMe }) {
  const isVideo = item.mediaType === 'video';
  const hasUrl = !!item.mediaUrl;

  // Hooks can't be conditional — feed the player a null source for photos.
  // No autoplay: the recipient taps play, like the old inline video.
  const player = useVideoPlayer(isVideo && hasUrl ? item.mediaUrl : null);

  const [failed, setFailed] = useState(!hasUrl);
  const [loaded, setLoaded] = useState(false);

  // expo-video reports load failures through statusChange — there's no onError
  // prop on VideoView, so without this listener a dead URL just sits there as a
  // black player with controls on top.
  useEffect(() => {
    if (!isVideo || !hasUrl || !player) return undefined;
    let sub;
    try {
      sub = player.addListener('statusChange', ({ status, error }) => {
        if (status === 'error' || error) setFailed(true);
        else if (status === 'readyToPlay') setLoaded(true);
      });
    } catch (e) {
      // A player that won't even take a listener is itself a failure.
      setFailed(true);
    }
    return () => sub?.remove?.();
  }, [player, isVideo, hasUrl]);

  return (
    <View style={[styles.wrap, isMe ? styles.wrapMe : styles.wrapThem]}>
      {failed ? (
        <View style={[styles.media, styles.fallback]}>
          <Ionicons
            name={isVideo ? 'videocam-off-outline' : 'image-outline'}
            size={26}
            color={COLORS.textMuted}
          />
          <Text style={styles.fallbackText}>
            {isVideo ? 'Video unavailable' : 'Photo unavailable'}
          </Text>
        </View>
      ) : isVideo ? (
        <VideoView
          style={styles.media}
          player={player}
          nativeControls
          contentFit="contain"
        />
      ) : (
        <View>
          <Image
            style={styles.media}
            source={{ uri: item.mediaUrl }}
            resizeMode="cover"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
          {!loaded && (
            <View style={[styles.media, styles.loading]}>
              <ActivityIndicator size="small" color={COLORS.textMuted} />
            </View>
          )}
        </View>
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
  fallback: { alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  fallbackText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  loading: { position: 'absolute', top: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  caption: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, paddingHorizontal: 4 },
  captionMe: { textAlign: 'right' },
  captionThem: { textAlign: 'left' },
}));
