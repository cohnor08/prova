import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Image, Text } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { COLORS } from '../constants/theme';

// Renders a proof clip/photo with a visible loading state, so opening a proof
// doesn't look frozen while the media buffers from Storage.
export default function ProofMedia({ url, type, style }) {
  const [ready, setReady] = useState(false);

  return (
    <View style={[style, { alignItems: 'center', justifyContent: 'center' }]}>
      {type === 'video' ? (
        <Video
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          onReadyForDisplay={() => setReady(true)}
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
