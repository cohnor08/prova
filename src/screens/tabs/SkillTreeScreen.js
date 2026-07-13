// Skill tree — a progression map that unlocks as you practice. Four lanes
// (Consistency, Hours, Craft, Mastery), each a row of nodes computed live from
// the user's cumulative stats (never regresses). Craft-lane minutes come from
// the sessionHistory daily logs' category totals.
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';
import { track } from '../../lib/analytics';

const fmtH = (m) => (m >= 60 ? `${Math.floor(m / 60)}h` : `${m}m`);

function buildLanes(u, catMins) {
  const sessions = u.totalSessions || 0;
  const mins = u.totalMinutes || 0;
  const score = u.provaScore || 0;
  const lane = (nodes, value) => nodes.map((n) => ({ ...n, unlocked: value >= n.at, value }));
  return [
    {
      name: 'CONSISTENCY', desc: 'Sessions completed',
      nodes: lane([
        { icon: '🌱', title: 'First Steps', at: 1, req: '1 session' },
        { icon: '🎯', title: 'Warmed Up', at: 5, req: '5 sessions' },
        { icon: '🎼', title: 'Regular', at: 15, req: '15 sessions' },
        { icon: '🚀', title: 'Devoted', at: 40, req: '40 sessions' },
        { icon: '🏆', title: 'Relentless', at: 100, req: '100 sessions' },
      ], sessions),
    },
    {
      name: 'HOURS', desc: 'Total practice time',
      nodes: lane([
        { icon: '⏱', title: 'Hour One', at: 60, req: '1 hour' },
        { icon: '🕐', title: 'Grinder', at: 300, req: '5 hours' },
        { icon: '🎧', title: 'Deep Work', at: 900, req: '15 hours' },
        { icon: '🌙', title: 'Obsessed', at: 2400, req: '40 hours' },
        { icon: '💎', title: 'Master Hours', at: 6000, req: '100 hours' },
      ], mins),
    },
    {
      name: 'CRAFT', desc: 'Minutes by practice category',
      nodes: [
        { icon: '🔧', title: 'Technician I', at: 60, req: '1h technique', unlocked: (catMins.technique || 0) >= 60, value: catMins.technique || 0 },
        { icon: '⚙️', title: 'Technician II', at: 300, req: '5h technique', unlocked: (catMins.technique || 0) >= 300, value: catMins.technique || 0 },
        { icon: '📖', title: 'Scholar I', at: 60, req: '1h theory', unlocked: (catMins.theory || 0) >= 60, value: catMins.theory || 0 },
        { icon: '🎓', title: 'Scholar II', at: 300, req: '5h theory', unlocked: (catMins.theory || 0) >= 300, value: catMins.theory || 0 },
        { icon: '🎭', title: 'Performer I', at: 60, req: '1h repertoire', unlocked: (catMins.repertoire || 0) >= 60, value: catMins.repertoire || 0 },
        { icon: '🎤', title: 'Performer II', at: 300, req: '5h repertoire', unlocked: (catMins.repertoire || 0) >= 300, value: catMins.repertoire || 0 },
      ],
    },
    {
      name: 'MASTERY', desc: 'Prova Score',
      nodes: lane([
        { icon: '🥉', title: 'Rising', at: 250, req: '250 pts' },
        { icon: '🥈', title: 'Proven', at: 1000, req: '1,000 pts' },
        { icon: '🥇', title: 'Elite', at: 5000, req: '5,000 pts' },
        { icon: '👑', title: 'Legendary', at: 15000, req: '15,000 pts' },
      ], score),
    },
  ];
}

export default function SkillTreeScreen({ navigation }) {
  const [lanes, setLanes] = useState(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    (async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        const u = snap.data() || {};
        const catMins = {};
        try {
          const logs = await getDocs(collection(db, 'sessionHistory', uid, 'logs'));
          logs.forEach((d) => {
            Object.entries(d.data().categories || {}).forEach(([k, v]) => {
              catMins[k] = (catMins[k] || 0) + (v || 0);
            });
          });
        } catch (e) { /* craft lane shows zeros */ }
        if (live) setLanes(buildLanes(u, catMins));
      } catch (e) { if (live) setLanes([]); }
    })();
    track('skilltree_viewed');
    return () => { live = false; };
  }, []));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Skill Tree</Text>
        <View style={{ width: 24 }} />
      </View>
      {!lanes ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} /> : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>Every minute of practice grows the tree. Unlock every node.</Text>
          {lanes.map((lane) => {
            const done = lane.nodes.filter((n) => n.unlocked).length;
            return (
              <View key={lane.name} style={styles.lane}>
                <View style={styles.laneHead}>
                  <Text style={styles.laneName}>{lane.name}</Text>
                  <Text style={styles.laneCount}>{done}/{lane.nodes.length}</Text>
                </View>
                <Text style={styles.laneDesc}>{lane.desc}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nodeRow}>
                  {lane.nodes.map((n, i) => {
                    const isNext = !n.unlocked && (i === 0 || lane.nodes[i - 1].unlocked);
                    return (
                      <View key={n.title} style={styles.nodeWrap}>
                        {i > 0 && <View style={[styles.connector, lane.nodes[i - 1].unlocked && n.unlocked && styles.connectorOn]} />}
                        <View style={[styles.node, n.unlocked && styles.nodeOn, isNext && styles.nodeNext]}>
                          <Text style={[styles.nodeIcon, !n.unlocked && styles.nodeIconLocked]}>{n.unlocked ? n.icon : '🔒'}</Text>
                        </View>
                        <Text style={[styles.nodeTitle, !n.unlocked && styles.nodeTitleLocked]} numberOfLines={1}>{n.title}</Text>
                        <Text style={styles.nodeReq} numberOfLines={1}>{n.req}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  content: { paddingHorizontal: SPACING.lg },
  intro: { color: COLORS.textSecondary, fontSize: 13.5, marginBottom: SPACING.lg },
  lane: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.md },
  laneHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  laneName: { color: COLORS.primary, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  laneCount: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },
  laneDesc: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, marginBottom: SPACING.md },
  nodeRow: { alignItems: 'flex-start', paddingRight: SPACING.md },
  nodeWrap: { alignItems: 'center', width: 86, flexDirection: 'column', position: 'relative' },
  connector: { position: 'absolute', left: -43, top: 27, width: 86, height: 2, backgroundColor: COLORS.border },
  connectorOn: { backgroundColor: COLORS.primary },
  node: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.background, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  nodeOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '14' },
  nodeNext: { borderColor: COLORS.primary + '66', borderStyle: 'dashed' },
  nodeIcon: { fontSize: 24 },
  nodeIconLocked: { fontSize: 18, opacity: 0.6 },
  nodeTitle: { color: COLORS.text, fontSize: 11.5, fontWeight: '700', marginTop: 6 },
  nodeTitleLocked: { color: COLORS.textMuted },
  nodeReq: { color: COLORS.textMuted, fontSize: 10, marginTop: 1 },
});
