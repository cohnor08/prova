// Web twin of YouTubePlayerModal — browsers don't have react-native-webview,
// but they play YouTube natively via a plain <iframe>. Same props/behaviour:
// pass a `query` (search phrase or youtube URL), it resolves via searchYouTube
// and plays the top result, with the other results listed below.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import Ghost from './Ghost';
import { COLORS, SPACING, themedStyles } from '../constants/theme';
import { searchYouTube } from '../lib/youtube';
import SheetModal from './SheetModal';

export default function YouTubePlayerModal({ visible, query, title, onClose }) {
  const [results, setResults] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (q) => {
    setLoading(true); setResults([]); setPlayingId(null);
    try {
      const m = String(q).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
      if (m) { setPlayingId(m[1]); setLoading(false); return; }
      const r = await searchYouTube(q);
      const list = r?.results || [];
      setResults(list);
      if (list.length > 0) setPlayingId(list[0].videoId);
    } catch (e) { /* fall through to the open-on-youtube link */ }
    setLoading(false);
  }, []);

  useEffect(() => { if (visible && query) run(query); }, [visible, query, run]);

  return (
    <SheetModal visible={visible} onRequestClose={onClose} cardStyle={styles.sheet} dismissOnBackdrop>
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>{title || 'Watch'}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>
      {loading ? <Ghost color={COLORS.primary} style={{ marginVertical: 40 }} /> : null}
      {playingId ? (
        <View style={styles.playerBox}>
          <iframe
            src={`https://www.youtube.com/embed/${playingId}?autoplay=1`}
            style={{ width: '100%', height: '100%', border: 0, borderRadius: 12 }}
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            title={title || 'video'}
          />
        </View>
      ) : null}
      <ScrollView style={{ maxHeight: 220 }}>
        {results.map((r) => (
          <TouchableOpacity key={r.videoId} style={[styles.row, r.videoId === playingId && styles.rowOn]} onPress={() => setPlayingId(r.videoId)}>
            <Text style={styles.rowText} numberOfLines={2}>{r.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity onPress={() => Linking.openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(query || '')}`).catch(() => {})}>
        <Text style={styles.link}>Open on YouTube ↗</Text>
      </TouchableOpacity>
    </SheetModal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  sheet: { padding: SPACING.lg, maxHeight: '90%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  title: { color: COLORS.text, fontSize: 16, fontWeight: '800', flex: 1, marginRight: SPACING.md },
  close: { color: COLORS.textSecondary, fontSize: 18 },
  playerBox: { width: '100%', aspectRatio: 16 / 9, marginBottom: SPACING.md },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowOn: { backgroundColor: COLORS.primary + '14' },
  rowText: { color: COLORS.textSecondary, fontSize: 13.5 },
  link: { color: COLORS.primary, fontSize: 13.5, textAlign: 'center', paddingVertical: 12 },
}));
