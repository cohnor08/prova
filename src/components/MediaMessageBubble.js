import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, Pressable,
} from 'react-native';
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
  // The thumbnail is a 220px square on `cover`, so a page of sheet music or a
  // wide shot of a fretboard arrives cropped. Tapping opens the whole thing.
  const [zoomed, setZoomed] = useState(false);

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
        <TouchableOpacity activeOpacity={0.85} onPress={() => setZoomed(true)} accessibilityRole="imagebutton" accessibilityLabel="Open photo">
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
          {/* Cropping hides that there is more to see, so say so. */}
          {loaded && (
            <View style={styles.expand} pointerEvents="none">
              <Ionicons name="expand-outline" size={14} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      )}
      {!!item.text && (
        <Text style={[styles.caption, isMe ? styles.captionMe : styles.captionThem]}>
          {item.text}
        </Text>
      )}

      {/* Full-size viewer. `contain` rather than `cover` — the point of opening
          it is to see the parts the thumbnail cut off. */}
      <Modal visible={zoomed} transparent animationType="fade" onRequestClose={() => setZoomed(false)}>
        <Pressable style={styles.zoomBack} onPress={() => setZoomed(false)}>
          <Image style={styles.zoomImg} source={{ uri: item.mediaUrl }} resizeMode="contain" />
          <View style={styles.zoomClose} pointerEvents="none">
            <Ionicons name="close" size={22} color="#fff" />
          </View>
        </Pressable>
      </Modal>
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
  expand: {
    position: 'absolute', right: 8, bottom: 8, width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  zoomBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  zoomImg: { width: '100%', height: '100%' },
  zoomClose: {
    position: 'absolute', top: 48, right: 20, width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  caption: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, paddingHorizontal: 4 },
  captionMe: { textAlign: 'right' },
  captionThem: { textAlign: 'left' },
}));
