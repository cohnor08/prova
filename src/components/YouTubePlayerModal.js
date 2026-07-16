import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, Image, Linking, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import YoutubePlayer from 'react-native-youtube-iframe';
import { COLORS, SPACING, themedStyles } from '../constants/theme';
import { searchYouTube } from '../lib/youtube';
import SheetModal from './SheetModal';

// Pull an 11-char video id out of any YouTube URL (watch, youtu.be, embed,
// shorts). Returns null for a plain search phrase.
function extractYouTubeId(s) {
  const m = String(s || '').match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// A reusable bottom-sheet that plays YouTube inline without leaving Prova. Open
// it with a `query` that's EITHER a search phrase ("G to C chord change beginner
// guitar") — it searches and shows results — OR a direct YouTube URL, in which
// case it plays that exact video. `title` is an optional header label.
export default function YouTubePlayerModal({ visible, query, title, onClose }) {
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [playingId, setPlayingId] = useState(null);

  const run = useCallback(async (q) => {
    setLoading(true);
    setError(null);
    setResults([]);
    setPlayingId(null);
    // A direct YouTube link → just play that video, no search needed.
    const directId = extractYouTubeId(q);
    if (directId) {
      setPlayingId(directId);
      setLoading(false);
      return;
    }
    try {
      const { results } = await searchYouTube(q, 6);
      setResults(results);
      // Auto-play the top hit so the user lands straight on a video.
      if (results.length > 0) setPlayingId(results[0].videoId);
      else setError('No videos found for that search.');
    } catch (e) {
      setError(e?.message?.includes('limit')
        ? "Today's video search limit was reached. Try again tomorrow."
        : 'Could not load videos. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible && query) run(query);
  }, [visible, query, run]);

  // 16:9 player sized to the sheet width.
  const playerWidth = Math.min(width, 560) - SPACING.lg * 2;
  const playerHeight = Math.round((playerWidth * 9) / 16);

  return (
    <SheetModal visible={visible} onRequestClose={onClose} cardStyle={styles.sheet} dismissOnBackdrop>
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={1}>{title || 'Watch'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Player */}
          {playingId ? (
            <View style={[styles.player, { height: playerHeight }]}>
              <YoutubePlayer
                height={playerHeight}
                width={playerWidth}
                videoId={playingId}
                play={false}
              />
            </View>
          ) : (
            <View style={[styles.player, styles.playerPlaceholder, { height: playerHeight }]}>
              {loading ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <Ionicons name="logo-youtube" size={36} color={COLORS.textMuted} />
              )}
            </View>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          {/* Results list */}
          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: SPACING.lg }}>
            {results.map((r) => {
              const active = r.videoId === playingId;
              return (
                <TouchableOpacity
                  key={r.videoId}
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => setPlayingId(r.videoId)}
                  activeOpacity={0.7}
                >
                  <View style={styles.thumbWrap}>
                    {!!r.thumbnail && <Image source={{ uri: r.thumbnail }} style={styles.thumb} />}
                    {active && (
                      <View style={styles.nowPlaying}>
                        <Ionicons name="musical-notes" size={12} color="#fff" />
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.rowTitle, active && styles.rowTitleActive]} numberOfLines={2}>{r.title}</Text>
                    <Text style={styles.rowChannel} numberOfLines={1}>{r.channel}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {!loading && results.length > 0 && (
              <TouchableOpacity
                style={styles.openYt}
                onPress={() => Linking.openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(query || '')}`).catch(() => {})}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-youtube" size={15} color="#FF0000" />
                <Text style={styles.openYtText}>More on YouTube</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
    </SheetModal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  sheet: { backgroundColor: COLORS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, maxHeight: '88%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  headerTitle: { flex: 1, color: COLORS.text, fontSize: 16, fontWeight: '800', marginRight: SPACING.md },

  player: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', marginBottom: SPACING.md },
  playerPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card },

  error: { color: COLORS.error, fontSize: 13, textAlign: 'center', marginBottom: SPACING.sm },

  list: { flexGrow: 0 },
  row: { flexDirection: 'row', gap: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'center' },
  rowActive: {},
  thumbWrap: { width: 100, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: COLORS.card },
  thumb: { width: '100%', height: '100%' },
  nowPlaying: { position: 'absolute', top: 4, left: 4, backgroundColor: COLORS.primary, borderRadius: 999, padding: 3 },
  rowTitle: { color: COLORS.text, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  rowTitleActive: { color: COLORS.primary },
  rowChannel: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },

  openYt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: SPACING.md, marginTop: SPACING.xs },
  openYtText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
}));
