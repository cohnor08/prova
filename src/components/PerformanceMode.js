import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { COLORS, SPACING } from '../constants/theme';

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Full-screen "stage view" for performing a setlist live: big glanceable song
// cards, tap to advance, a running set timer + per-song timer, and the screen
// stays awake the whole time.
export default function PerformanceMode({ setlist, onClose }) {
  useKeepAwake();
  const songs = setlist?.songs || [];

  const [index, setIndex] = useState(0);
  const [ended, setEnded] = useState(false);
  const [running, setRunning] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const songStart = useRef(0);

  useEffect(() => {
    if (!running || ended) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running, ended]);

  const goNext = () => {
    if (index >= songs.length - 1) { setEnded(true); setRunning(false); return; }
    songStart.current = elapsed;
    setIndex((i) => i + 1);
  };
  const goPrev = () => {
    if (index === 0) return;
    songStart.current = elapsed;
    setIndex((i) => i - 1);
  };

  const song = songs[index] || {};
  const next = songs[index + 1];
  const onSong = elapsed - songStart.current;

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
          <Text style={styles.position}>{ended ? `${songs.length}/${songs.length}` : `${index + 1}/${songs.length}`}</Text>
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
              <Text style={styles.onSong}>on this song · {fmt(onSong)}</Text>
              <Text style={styles.tapHint}>tap anywhere to advance →</Text>
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
  position: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700', minWidth: 40, textAlign: 'right' },
  progressTrack: { height: 4, backgroundColor: COLORS.card, marginHorizontal: SPACING.lg, marginTop: SPACING.md, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: COLORS.primary, borderRadius: 2 },

  card: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  nowLabel: { color: COLORS.primary, fontSize: 12, fontWeight: '800', letterSpacing: 3, marginBottom: SPACING.lg },
  songTitle: { color: COLORS.text, fontSize: 40, fontWeight: '900', textAlign: 'center', lineHeight: 46 },
  songArtist: { color: COLORS.textSecondary, fontSize: 20, fontWeight: '600', textAlign: 'center', marginTop: SPACING.sm },
  notePill: { backgroundColor: COLORS.primary + '22', borderColor: COLORS.primary + '55', borderWidth: 1, borderRadius: 999, paddingHorizontal: SPACING.lg, paddingVertical: 8, marginTop: SPACING.lg },
  noteText: { color: COLORS.primary, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  onSong: { color: COLORS.textMuted, fontSize: 13, marginTop: SPACING.xl, fontVariant: ['tabular-nums'] },
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
