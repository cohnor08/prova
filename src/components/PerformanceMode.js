import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, StatusBar, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import QRCode from 'react-native-qrcode-svg';
import { COLORS, SPACING } from '../constants/theme';
import { startLiveGig, endLiveGig, watchGigRequests, gigRequestUrl } from '../lib/livegig';

const GIG_DOMAIN = 'prova-583c9.web.app';

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const openTabs = (song) => {
  const q = `${song.title || ''} ${song.artist || ''} guitar tab`.trim();
  Linking.openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`).catch(() => {});
};

// Full-screen "stage view" for performing a setlist live: big glanceable song
// cards, tap to advance, a running set timer + per-song timer, and the screen
// stays awake the whole time.
export default function PerformanceMode({
  setlist, onClose, tipLink,
  playingSongId, loadingSongId, onTogglePreview, onStopPreview, onOpenSpotify,
}) {
  useKeepAwake();
  const songs = setlist?.songs || [];

  const [index, setIndex] = useState(0);
  const [ended, setEnded] = useState(false);
  const [running, setRunning] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const songStart = useRef(0);

  // Audience requests: publish a live gig, stream incoming requests.
  const [gigId, setGigId] = useState(null);
  const [requests, setRequests] = useState([]);
  const [showAudience, setShowAudience] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    let activeGigId = null;
    startLiveGig(setlist, tipLink).then((id) => {
      if (!id) return;
      activeGigId = id;
      setGigId(id);
      unsub = watchGigRequests(id, setRequests);
    }).catch(() => {});
    return () => { unsub(); if (activeGigId) endLiveGig(activeGigId); };
  }, []);

  // Tally requests per song title, most-requested first.
  const requestCounts = {};
  requests.forEach((r) => { const k = r.title || ''; requestCounts[k] = (requestCounts[k] || 0) + 1; });
  const rankedRequests = Object.entries(requestCounts)
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count);

  useEffect(() => {
    if (!running || ended) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running, ended]);

  const goNext = () => {
    onStopPreview?.();
    if (index >= songs.length - 1) { setEnded(true); setRunning(false); return; }
    songStart.current = elapsed;
    setIndex((i) => i + 1);
  };
  const goPrev = () => {
    if (index === 0) return;
    onStopPreview?.();
    songStart.current = elapsed;
    setIndex((i) => i - 1);
  };

  const song = songs[index] || {};
  const next = songs[index + 1];
  const onSong = elapsed - songStart.current;
  const isPreviewing = playingSongId === song.id;
  const isPreviewLoading = loadingSongId === song.id;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <StatusBar hidden />
      <SafeAreaView style={styles.container}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={26} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <View style={styles.setTimer}>
            <Text style={styles.setTimerLabel}>SET</Text>
            <Text style={styles.setTimerValue}>{fmt(elapsed)}</Text>
          </View>
          <View style={styles.topRight}>
            <TouchableOpacity onPress={() => setShowAudience(true)} style={styles.audienceBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="people" size={20} color={COLORS.text} />
              {requests.length > 0 && (
                <View style={styles.reqBadge}><Text style={styles.reqBadgeText}>{requests.length}</Text></View>
              )}
            </TouchableOpacity>
            <Text style={styles.position}>{ended ? `${songs.length}/${songs.length}` : `${index + 1}/${songs.length}`}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((ended ? songs.length : index + 1) / Math.max(songs.length, 1)) * 100}%` }]} />
        </View>

        {ended ? (
          <View style={styles.endWrap}>
            <Text style={styles.endEmoji}>🎉</Text>
            <Text style={styles.endTitle}>Set complete</Text>
            <Text style={styles.endStat}>{songs.length} songs · {fmt(elapsed)}</Text>
            <TouchableOpacity style={styles.endBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.endBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Tap the card to advance */}
            <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={goNext}>
              <Text style={styles.nowLabel}>NOW PLAYING</Text>
              <Text style={styles.songTitle}>{song.title}</Text>
              {!!song.artist && <Text style={styles.songArtist}>{song.artist}</Text>}
              {!!song.note && (
                <View style={styles.notePill}>
                  <Text style={styles.noteText}>{song.note}</Text>
                </View>
              )}

              <View style={styles.songActions}>
                <TouchableOpacity
                  style={styles.songActionBtn}
                  onPress={() => onTogglePreview?.(song)}
                  disabled={isPreviewLoading}
                  activeOpacity={0.8}
                >
                  {isPreviewLoading
                    ? <ActivityIndicator size="small" color={COLORS.text} />
                    : <Ionicons name={isPreviewing ? 'pause' : 'play'} size={18} color={COLORS.text} />}
                  <Text style={styles.songActionText}>{isPreviewing ? 'Stop' : 'Preview'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.songActionBtn, styles.spotifyBtn]}
                  onPress={() => onOpenSpotify?.(song)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="musical-notes" size={18} color="#fff" />
                  <Text style={[styles.songActionText, { color: '#fff' }]}>Spotify</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.songActionBtn}
                  onPress={() => openTabs(song)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="logo-youtube" size={18} color="#FF0000" />
                  <Text style={styles.songActionText}>Tabs</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.onSong}>on this song · {fmt(onSong)}</Text>
              <Text style={styles.tapHint}>tap the card to advance →</Text>
            </TouchableOpacity>

            {/* Next-up preview */}
            <View style={styles.nextRow}>
              {next ? (
                <Text style={styles.nextText} numberOfLines={1}>
                  <Text style={styles.nextLabel}>NEXT  </Text>{next.title}{next.artist ? ` — ${next.artist}` : ''}
                </Text>
              ) : (
                <Text style={styles.nextText}><Text style={styles.nextLabel}>LAST SONG</Text></Text>
              )}
            </View>

            {/* Controls */}
            <View style={styles.controls}>
              <TouchableOpacity style={styles.ctrlBtn} onPress={goPrev} disabled={index === 0}>
                <Ionicons name="play-skip-back" size={22} color={index === 0 ? COLORS.textMuted : COLORS.text} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ctrlBtn, styles.ctrlBig]} onPress={() => setRunning((r) => !r)}>
                <Ionicons name={running ? 'pause' : 'play'} size={26} color={COLORS.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.ctrlBtn} onPress={goNext}>
                <Ionicons name="play-skip-forward" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {showAudience && (
          <View style={styles.audienceOverlay}>
            <SafeAreaView style={{ flex: 1 }}>
              <View style={styles.audienceHeader}>
                <Text style={styles.audienceTitle}>Audience requests</Text>
                <TouchableOpacity onPress={() => setShowAudience(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={26} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.qrWrap}>
                {gigId ? (
                  <>
                    <View style={styles.qrBox}>
                      <QRCode value={gigRequestUrl(gigId)} size={180} backgroundColor="#fff" />
                    </View>
                    <Text style={styles.qrHint}>Point the crowd here — scan to request a song{tipLink ? ' or tip you' : ''}.</Text>
                    <Text style={styles.qrCode}>{GIG_DOMAIN} · code {gigId}</Text>
                  </>
                ) : (
                  <Text style={styles.qrHint}>Publishing your set…</Text>
                )}
              </View>

              <Text style={styles.reqListLabel}>{requests.length} REQUEST{requests.length === 1 ? '' : 'S'}</Text>
              {rankedRequests.length === 0 ? (
                <Text style={styles.reqEmpty}>No requests yet — they'll appear here live.</Text>
              ) : (
                rankedRequests.map((r) => (
                  <View key={r.title} style={styles.reqRow}>
                    <Text style={styles.reqRowTitle} numberOfLines={1}>{r.title}</Text>
                    <View style={styles.reqCount}><Text style={styles.reqCountText}>{r.count}</Text></View>
                  </View>
                ))
              )}
            </SafeAreaView>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08090C' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  setTimer: { alignItems: 'center' },
  setTimerLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  setTimerValue: { color: COLORS.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  audienceBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  reqBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  reqBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  position: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700', textAlign: 'right' },

  audienceOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#08090C', paddingHorizontal: SPACING.lg },
  audienceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.md },
  audienceTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  qrWrap: { alignItems: 'center', marginVertical: SPACING.md },
  qrBox: { backgroundColor: '#fff', padding: 14, borderRadius: 16 },
  qrHint: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginTop: SPACING.md, paddingHorizontal: SPACING.lg },
  qrCode: { color: COLORS.textMuted, fontSize: 12, marginTop: SPACING.xs, fontWeight: '600' },
  reqListLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  reqEmpty: { color: COLORS.textMuted, fontSize: 14 },
  reqRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  reqRowTitle: { color: COLORS.text, fontSize: 15, fontWeight: '600', flex: 1, marginRight: SPACING.md },
  reqCount: { minWidth: 28, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  reqCountText: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  progressTrack: { height: 4, backgroundColor: COLORS.card, marginHorizontal: SPACING.lg, marginTop: SPACING.md, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: COLORS.primary, borderRadius: 2 },

  card: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  nowLabel: { color: COLORS.primary, fontSize: 12, fontWeight: '800', letterSpacing: 3, marginBottom: SPACING.lg },
  songTitle: { color: COLORS.text, fontSize: 40, fontWeight: '900', textAlign: 'center', lineHeight: 46 },
  songArtist: { color: COLORS.textSecondary, fontSize: 20, fontWeight: '600', textAlign: 'center', marginTop: SPACING.sm },
  notePill: { backgroundColor: COLORS.primary + '22', borderColor: COLORS.primary + '55', borderWidth: 1, borderRadius: 999, paddingHorizontal: SPACING.lg, paddingVertical: 8, marginTop: SPACING.lg },
  noteText: { color: COLORS.primary, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  songActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.xl, justifyContent: 'center' },
  songActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 999, paddingHorizontal: SPACING.md, paddingVertical: 10, justifyContent: 'center' },
  spotifyBtn: { backgroundColor: '#1DB954', borderColor: '#1DB954' },
  songActionText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  onSong: { color: COLORS.textMuted, fontSize: 13, marginTop: SPACING.lg, fontVariant: ['tabular-nums'] },
  tapHint: { color: COLORS.textMuted, fontSize: 12, marginTop: SPACING.xs },

  nextRow: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  nextText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  nextLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xl, paddingVertical: SPACING.lg },
  ctrlBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  ctrlBig: { width: 68, height: 68, borderRadius: 34, backgroundColor: COLORS.primary, borderColor: COLORS.primary },

  endWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  endEmoji: { fontSize: 56, marginBottom: SPACING.md },
  endTitle: { color: COLORS.text, fontSize: 30, fontWeight: '900' },
  endStat: { color: COLORS.textSecondary, fontSize: 17, marginTop: SPACING.sm, fontVariant: ['tabular-nums'] },
  endBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingHorizontal: SPACING.xl * 1.5, paddingVertical: SPACING.md, marginTop: SPACING.xl },
  endBtnText: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
});
