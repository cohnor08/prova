import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Image, Text } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { COLORS } from '../constants/theme';

// Renders a proof clip/photo with a visible loading state, so opening a proof
// doesn't look frozen while the media buffers from Storage.
export default function ProofMedia({ url, type, style }) {
  const [ready, setReady] = useState(false);

  // Hooks can't be conditional — feed the player a null source for photos.
  const player = useVideoPlayer(type === 'video' ? url : null, (p) => {
    // Start as soon as ~2s are buffered instead of waiting for a deep buffer —
    // short clips over Storage were taking noticeably long to appear.
    p.bufferOptions = { preferredForwardBufferDuration: 2 };
    p.play();
  });

  return (
    <View style={[style, { alignItems: 'center', justifyContent: 'center' }]}>
      {type === 'video' ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          nativeControls
          contentFit="contain"
          onFirstFrameRender={() => setReady(true)}
        />
      ) : (
        <Image
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          onLoad={() => setReady(true)}
        />
      )}
      {!ready && (
        <View style={local.loading} pointerEvents="none">
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={local.loadingText}>Loading…</Text>
        </View>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  loading: { alignItems: 'center', gap: 8 },
  loadingText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
});
