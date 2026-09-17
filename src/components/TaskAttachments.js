import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, Modal, Pressable, Linking, Platform, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContext } from '@react-navigation/native';
import { Audio } from 'expo-av';
import * as WebBrowser from 'expo-web-browser';
import { COLORS, SPACING, themedStyles } from '../constants/theme';
import { attachmentKind, attachmentMeta, cleanFileName } from '../lib/attachments';

// Everything a teacher attached to a task, as the student sees it: photos as
// thumbnails that open full size, audio as a player that runs right here (so a
// backing track plays while the practice clock keeps going), and PDFs, video
// and anything else as a row that opens it.
//
// Used on the Today task card and in the practice player. Studio writes the
// same shape — see src/lib/attachments.js.

const fmtTime = (ms) => {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

// A PDF opens inside the app on iOS (Safari's viewer reads it properly, with
// zoom and every page). Android's in-app browser can't show a PDF at all — it
// just downloads — so there it goes straight to the system, which hands it to
// a PDF app.
export function openAttachment(url) {
  if (!url) return;
  if (Platform.OS === 'android') {
    Linking.openURL(url).catch(() => {});
    return;
  }
  WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => {}));
}

// Only one track at a time — starting a second one pauses the first, rather
// than two backing tracks playing over each other.
let nowPlaying = null; // { sound, pause }

function AudioRow({ a, onEdit }) {
  const soundRef = useRef(null);
  const mounted = useRef(true);
  const barWidth = useRef(0);
  const [state, setState] = useState('idle'); // idle | loading | playing | paused | error
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  // Leaving the task (next task, collapsing the card, closing the player)
  // stops the track.
  useEffect(() => () => {
    mounted.current = false;
    const s = soundRef.current;
    soundRef.current = null;
    if (s) {
      if (nowPlaying && nowPlaying.sound === s) nowPlaying = null;
      s.unloadAsync().catch(() => {});
    }
  }, []);

  // Tabs stay mounted, so switching away from Today doesn't unmount the card.
  // Pause instead — nothing on the new screen could stop it. Read through the
  // context (not useNavigation) so this renders fine outside a navigator too.
  const navigation = React.useContext(NavigationContext);
  useEffect(() => {
    if (!navigation || typeof navigation.addListener !== 'function') return undefined;
    return navigation.addListener('blur', () => { soundRef.current?.pauseAsync().catch(() => {}); });
  }, [navigation]);

  const onStatus = (st) => {
    if (!mounted.current) return;
    if (!st.isLoaded) {
      if (st.error) setState('error');
      return;
    }
    if (st.durationMillis) setDur(st.durationMillis);
    if (st.didJustFinish) {
      setPos(0);
      setState('paused');
      soundRef.current?.setPositionAsync(0).catch(() => {});
      return;
    }
    setPos(st.positionMillis || 0);
    setState(st.isPlaying ? 'playing' : (st.isBuffering && st.shouldPlay ? 'loading' : 'paused'));
  };

  const claim = (sound) => {
    if (nowPlaying && nowPlaying.sound !== sound) nowPlaying.pause();
    nowPlaying = { sound, pause: () => sound.pauseAsync().catch(() => {}) };
  };

  const toggle = async () => {
    try {
      if (!soundRef.current) {
        if (state === 'loading') return; // already on its way
        setState('loading');
        if (nowPlaying) nowPlaying.pause();
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
        // Streams — a long WAV starts playing without downloading first.
        const { sound } = await Audio.Sound.createAsync(
          { uri: a.url },
          { shouldPlay: true, progressUpdateIntervalMillis: 250 },
          onStatus,
        );
        if (!mounted.current) { sound.unloadAsync().catch(() => {}); return; }
        soundRef.current = sound;
        claim(sound);
        return;
      }
      const st = await soundRef.current.getStatusAsync();
      if (st.isLoaded && st.isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        claim(soundRef.current);
        await soundRef.current.playAsync();
      }
    } catch (e) {
      if (mounted.current) setState('error');
    }
  };

  const seek = (e) => {
    const s = soundRef.current;
    if (!s || !dur || !barWidth.current) return;
    const frac = Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth.current));
    setPos(frac * dur);
    s.setPositionAsync(Math.round(frac * dur)).catch(() => {});
  };

  const title = cleanFileName(a.title || 'Audio');
  const pct = dur ? Math.min(1, pos / dur) : 0;

  if (state === 'error') {
    // Streaming failed (an odd format, a dropped connection) — the file may
    // still open in the browser's own player, so offer that instead of a dead end.
    return (
      <TouchableOpacity style={styles.row} onPress={() => openAttachment(a.url)} activeOpacity={0.8}>
        <View style={styles.tile}>
          <Ionicons name="musical-notes" size={18} color={COLORS.primary} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="middle">{title}</Text>
          <Text style={styles.rowMeta} numberOfLines={1}>Couldn't play here — tap to open it</Text>
        </View>
        <Ionicons name="open-outline" size={16} color={COLORS.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.playBtn}
        onPress={toggle}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={state === 'playing' ? `Pause ${title}` : `Play ${title}`}
      >
        {state === 'loading'
          ? <ActivityIndicator size="small" color={COLORS.onPrimary} />
          : <Ionicons name={state === 'playing' ? 'pause' : 'play'} size={18} color={COLORS.onPrimary} style={state === 'playing' ? null : { marginLeft: 2 }} />}
      </TouchableOpacity>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="middle">{title}</Text>
        {state === 'idle' ? (
          <Text style={styles.rowMeta} numberOfLines={1}>{attachmentMeta(a)}</Text>
        ) : (
          <View style={styles.progressLine}>
            <Pressable
              style={styles.barHit}
              onPress={seek}
              onLayout={(e) => { barWidth.current = e.nativeEvent.layout.width; }}
              accessibilityLabel="Seek"
            >
              <View style={styles.barTrack} pointerEvents="none">
                <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
              </View>
            </Pressable>
            <Text style={styles.time}>{fmtTime(pos)}{dur ? ` / ${fmtTime(dur)}` : ''}</Text>
          </View>
        )}
      </View>
      <EditDot a={a} onEdit={onEdit} />
    </View>
  );
}

function FileRow({ a, kind, onEdit }) {
  const icon = kind === 'pdf' ? 'document-text' : kind === 'video' ? 'videocam' : 'attach';
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => openAttachment(a.url)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Open ${cleanFileName(a.title || 'file')}`}
    >
      <View style={styles.tile}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="middle">
          {cleanFileName(a.title || (kind === 'pdf' ? 'Sheet music' : kind === 'video' ? 'Video' : 'File'))}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{attachmentMeta(a)}</Text>
      </View>
      <Text style={styles.openText}>Open</Text>
      <EditDot a={a} onEdit={onEdit} />
    </TouchableOpacity>
  );
}

// Only rendered when a caller passes onEdit — the teacher's own file library
// does, so a row can be renamed or filed without a second list beside it.
// Students are never given one.
function EditDot({ a, onEdit }) {
  if (!onEdit) return null;
  return (
    <TouchableOpacity
      onPress={() => onEdit(a)}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={{ marginLeft: 2 }}
      accessibilityRole="button"
      accessibilityLabel={`Rename or file ${cleanFileName(a.title || 'this file')}`}
    >
      <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

export default function TaskAttachments({ attachments, style, onEdit }) {
  const [zoom, setZoom] = useState(null);
  const list = (Array.isArray(attachments) ? attachments : []).filter((a) => a && a.url);
  if (!list.length) return null;
  const photos = list.filter((a) => attachmentKind(a) === 'photo');
  const others = list.filter((a) => attachmentKind(a) !== 'photo');

  return (
    <View style={[styles.wrap, style]}>
      {others.map((a, i) => {
        const kind = attachmentKind(a);
        return kind === 'audio'
          ? <AudioRow key={`${a.url}_${i}`} a={a} onEdit={onEdit} />
          : <FileRow key={`${a.url}_${i}`} a={a} kind={kind} onEdit={onEdit} />;
      })}
      {photos.length > 0 && (
        <View style={styles.photos}>
          {photos.map((a, i) => (
            <TouchableOpacity
              key={`${a.url}_${i}`}
              onPress={() => setZoom(a.url)}
              activeOpacity={0.85}
              accessibilityRole="imagebutton"
              accessibilityLabel="Open photo"
            >
              <Image source={{ uri: a.url }} style={styles.photo} resizeMode="cover" />
              <View style={styles.expand} pointerEvents="none">
                <Ionicons name="expand-outline" size={12} color="#fff" />
              </View>
              {!!onEdit && (
                <TouchableOpacity
                  style={styles.photoEdit}
                  onPress={() => onEdit(a)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Rename or file ${cleanFileName(a.title || 'this photo')}`}
                >
                  <Ionicons name="ellipsis-horizontal" size={13} color="#fff" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Full size on `contain` — sheet music is the usual photo, and the
          thumbnail crops it. */}
      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <Pressable style={styles.zoomBack} onPress={() => setZoom(null)}>
          {!!zoom && <Image style={styles.zoomImg} source={{ uri: zoom }} resizeMode="contain" />}
          <View style={styles.zoomClose} pointerEvents="none">
            <Ionicons name="close" size={22} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: SPACING.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  tile: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary + '1F',
  },
  playBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  rowMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  openText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  progressLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 4 },
  barHit: { flex: 1, minWidth: 0, paddingVertical: 8 },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: COLORS.border, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2, backgroundColor: COLORS.primary },
  time: { color: COLORS.textMuted, fontSize: 11.5, fontVariant: ['tabular-nums'] },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  photo: { width: 96, height: 96, borderRadius: 12, backgroundColor: COLORS.card },
  expand: {
    position: 'absolute', right: 6, bottom: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  photoEdit: {
    position: 'absolute', right: 6, top: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  zoomBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  zoomImg: { width: '100%', height: '100%' },
  zoomClose: {
    position: 'absolute', top: 48, right: 20, width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
}));
