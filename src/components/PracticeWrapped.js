// Practice Wrapped — the week as a shareable highlight reel. Auto-shows once
// per completed week (TodayScreen triggers it on first open after Sunday),
// and can be revisited any time from Progress. Empty weeks never show.
// Sharing captures the card as an image where the native module is available
// (needs a dev build); otherwise falls back to a text share.
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Share, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { COLORS, SPACING } from '../constants/theme';
import { BADGES, TIER_COLORS } from '../constants/badges';
import { track } from '../lib/analytics';

let captureRef = null;
try { captureRef = require('react-native-view-shot').captureRef; } catch (e) { /* next build */ }

// Most recent COMPLETED Monday→Sunday week. Returns the Monday's 'YYYY-MM-DD'.
export function lastCompletedWeekKey(now = new Date()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday - 7);
  return d;
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const wrappedWeekKey = (now = new Date()) => ymd(lastCompletedWeekKey(now));

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CAT_LABELS = { warmup: 'Warm-ups', technique: 'Technique', repertoire: 'Repertoire', improvisation: 'Improvisation', theory: 'Theory', teacher: 'Teacher tasks', song: 'Songs', ear: 'Ear training', fretboard: 'Fretboard' };

async function buildStats(uid) {
  const monday = lastCompletedWeekKey();
  const days = [];
  for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(d.getDate() + i); days.push(ymd(d)); }
  const prevDays = [];
  for (let i = 7; i > 0; i--) { const d = new Date(monday); d.setDate(d.getDate() - i); prevDays.push(ymd(d)); }

  const [userSnap, logsSnap] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDocs(collection(db, 'sessionHistory', uid, 'logs')),
  ]);
  const u = userSnap.data() || {};
  const logs = {}; logsSnap.forEach((d) => { logs[d.id] = d.data(); });

  let mins = 0, daysPracticed = 0, longest = { mins: 0, day: null }, prevMins = 0;
  const cats = {};
  days.forEach((key, i) => {
    const m = logs[key]?.totalMinutes || 0;
    mins += m;
    if (m > 0) daysPracticed++;
    if (m > longest.mins) longest = { mins: m, day: DAY_NAMES[(i + 1) % 7] };
    Object.entries(logs[key]?.categories || {}).forEach(([c, v]) => { cats[c] = (cats[c] || 0) + (v || 0); });
  });
  prevDays.forEach((key) => { prevMins += logs[key]?.totalMinutes || 0; });

  const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  const sundayEnd = new Date(monday); sundayEnd.setDate(sundayEnd.getDate() + 7);
  const earnedBadges = BADGES.filter((b) => {
    const at = (u.badges || {})[b.id];
    return at && new Date(at) >= monday && new Date(at) < sundayEnd;
  });
  const fmtRange = () => {
    const end = new Date(monday); end.setDate(end.getDate() + 6);
    const opts = { day: 'numeric', month: 'long' };
    return `${monday.toLocaleDateString(undefined, { day: 'numeric', month: monday.getMonth() === end.getMonth() ? undefined : 'long' })}–${end.toLocaleDateString(undefined, opts)}`;
  };

  return {
    weekKey: ymd(monday), range: fmtRange(),
    mins, daysPracticed, longest,
    topCat: topCat ? (CAT_LABELS[topCat[0]] || topCat[0]) : null,
    delta: prevMins > 0 ? Math.round(((mins - prevMins) / prevMins) * 100) : null,
    streak: u.streak || 0,
    earnedBadges,
  };
}

export default function PracticeWrapped({ visible, uid, forced = false, onResolve }) {
  const [stats, setStats] = useState(null);
  const [show, setShow] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!visible || !uid) return;
    let live = true;
    setStats(null); setShow(false);
    buildStats(uid).then((st) => {
      if (!live) return;
      setStats(st);
      if (st.mins > 0 || forced) { setShow(true); track('wrapped_viewed'); }
      else onResolve && onResolve({ shown: false, weekKey: st.weekKey });
    }).catch(() => { onResolve && onResolve({ shown: false, weekKey: wrappedWeekKey() }); });
    return () => { live = false; };
  }, [visible, uid]);

  const close = () => { setShow(false); onResolve && onResolve({ shown: true, weekKey: stats?.weekKey || wrappedWeekKey() }); };

  const share = async () => {
    track('wrapped_shared');
    const s = stats;
    try {
      if (captureRef && cardRef.current && Platform.OS !== 'web') {
        const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
        await Share.share(Platform.OS === 'ios' ? { url: uri } : { message: '', url: uri });
        return;
      }
    } catch (e) { /* fall through to text */ }
    const lines = [
      `🎸 My week in music (${s.range})`,
      `${s.mins} minutes · ${s.daysPracticed}/7 days practiced`,
      s.longest.day ? `Longest: ${s.longest.mins} min on ${s.longest.day}` : null,
      s.topCat ? `Top focus: ${s.topCat}` : null,
      s.earnedBadges.length ? `Badges earned: ${s.earnedBadges.map((b) => b.title).join(', ')}` : null,
      s.streak > 1 ? `Current streak: ${s.streak} days` : null,
      '— tracked with Prova',
    ].filter(Boolean).join('\n');
    Share.share({ message: lines }).catch(() => {});
  };

  if (!visible) return null;
  return (
    <Modal visible={visible && (show || !stats)} animationType="fade" transparent onRequestClose={close}>
      <View style={styles.dim}>
        {!stats ? <ActivityIndicator color={COLORS.primary} /> : show && (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View ref={cardRef} collapsable={false} style={styles.card}>
              <View style={styles.glowRing} />
              <Text style={styles.kicker}>YOUR WEEK IN MUSIC</Text>
              <Text style={styles.range}>{stats.range}</Text>

              <Text style={styles.bigMins}>{stats.mins}</Text>
              <Text style={styles.bigMinsLabel}>minutes practiced</Text>

              <View style={styles.statRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statV}>{stats.daysPracticed}/7</Text>
                  <Text style={styles.statL}>days</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statV}>{stats.longest.mins}m</Text>
                  <Text style={styles.statL}>{stats.longest.day ? `best · ${stats.longest.day.slice(0, 3)}` : 'best day'}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statV}>{stats.streak}</Text>
                  <Text style={styles.statL}>day streak</Text>
                </View>
              </View>

              {stats.topCat && <Text style={styles.line}>Top focus: <Text style={styles.lineBold}>{stats.topCat}</Text></Text>}
              {stats.delta !== null && (
                <Text style={[styles.line, { color: stats.delta >= 0 ? '#4ade80' : COLORS.textSecondary }]}>
                  {stats.delta >= 0 ? `▲ ${stats.delta}% more than last week` : `▼ ${Math.abs(stats.delta)}% vs last week — new week, fresh start`}
                </Text>
              )}

              {stats.earnedBadges.length > 0 && (
                <View style={styles.badgeRow}>
                  {stats.earnedBadges.slice(0, 4).map((b) => (
                    <View key={b.id} style={styles.badgeItem}>
                      <View style={[styles.miniRing, { borderColor: TIER_COLORS[b.tier], backgroundColor: TIER_COLORS[b.tier] + '14' }]}>
                        <Ionicons name={b.icon} size={15} color={TIER_COLORS[b.tier]} />
                      </View>
                      <Text style={styles.badgeName} numberOfLines={1}>{b.title}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.brand}>PROVA<Text style={{ color: '#22D3EE' }}>.</Text></Text>
            </View>

            <TouchableOpacity style={styles.shareBtn} onPress={share} activeOpacity={0.85}>
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={styles.shareText}>Share my week</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10 }}>
              <Text style={styles.doneLink}>Done</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(2,4,10,0.96)', alignItems: 'center', justifyContent: 'center' },
  scroll: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#0A1120', borderRadius: 26, borderWidth: 1, borderColor: '#1E2D4A', padding: 28, alignItems: 'center', overflow: 'hidden' },
  glowRing: { position: 'absolute', top: -90, width: 260, height: 260, borderRadius: 130, backgroundColor: COLORS.primary + '14' },
  kicker: { color: COLORS.primary, fontSize: 11, fontWeight: '800', letterSpacing: 3 },
  range: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 22 },
  bigMins: { color: COLORS.text, fontSize: 74, fontWeight: '900', letterSpacing: -2, lineHeight: 78 },
  bigMinsLabel: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 22 },
  statRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginBottom: 18 },
  statBox: { flex: 1, backgroundColor: '#0C1424', borderWidth: 1, borderColor: '#1E2D4A', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  statV: { color: COLORS.text, fontSize: 19, fontWeight: '800' },
  statL: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  line: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 8 },
  lineBold: { color: COLORS.text, fontWeight: '800' },
  badgeRow: { flexDirection: 'row', gap: 12, marginTop: 10, marginBottom: 4 },
  badgeItem: { alignItems: 'center', width: 66 },
  miniRing: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  badgeName: { color: COLORS.textSecondary, fontSize: 9.5, textAlign: 'center' },
  brand: { color: COLORS.text, fontSize: 13, fontWeight: '800', letterSpacing: 3, marginTop: 18, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 44, marginTop: 22 },
  shareText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  doneLink: { color: COLORS.textSecondary, fontSize: 14, marginTop: 16 },
});
