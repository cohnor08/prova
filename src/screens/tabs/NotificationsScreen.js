import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, orderBy, limit, onSnapshot, doc, updateDoc, deleteDoc, arrayUnion,
} from 'firebase/firestore';
import { auth, db, ignorePermissionDenied } from '../../lib/firebase';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';

// The bell on Today opens this: everything that happened while the student was
// away — gig invites (accept/decline), new teacher tasks, etc. Notes live in
// users/{uid}/inbox; anyone signed-in can drop one, only the owner sees them.

const TYPE_META = {
  gig_invite:    { icon: 'mic',              color: '#0EA5E9' },
  task_assigned: { icon: 'clipboard-outline', color: '#3B82F6' },
  nudge:         { icon: 'hand-right',       color: '#F59E0B' },
  reports_sent:  { icon: 'mail-outline',     color: '#10B981' },
  default:       { icon: 'notifications-outline', color: '#8B5CF6' },
};

function timeAgo(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}

function prettyGigDate(ymd, time) {
  const [y, m, d] = (ymd || '').split('-').map(Number);
  if (!y) return ymd || '';
  const day = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (!time) return day;
  const [hh, mm] = time.split(':').map(Number);
  return `${day} · ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

export default function NotificationsScreen({ navigation }) {
  useThemeSync();
  const uid = auth.currentUser?.uid;
  const [notes, setNotes] = useState([]);
  const [actingId, setActingId] = useState(null);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'users', uid, 'inbox'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, ignorePermissionDenied);
  }, [uid]);

  // Everything on screen counts as seen — clears the bell badge.
  useEffect(() => {
    notes.filter((n) => !n.read).forEach((n) => {
      updateDoc(doc(db, 'users', uid, 'inbox', n.id), { read: true }).catch(() => {});
    });
  }, [notes.length]);

  const acceptInvite = async (note) => {
    if (actingId) return;
    setActingId(note.id);
    try {
      const g = note.data || {};
      await updateDoc(doc(db, 'users', uid), {
        gigs: arrayUnion({
          id: `gig_${Date.now()}`,
          name: g.name || 'Gig',
          date: g.date,
          time: g.time || null,
          setlistId: null,
          from: g.fromName || null,
          createdAt: new Date().toISOString(),
        }),
      });
      await updateDoc(doc(db, 'users', uid, 'inbox', note.id), { status: 'accepted' });
    } catch (e) {
      Alert.alert('Error', "Couldn't add the gig. Please try again.");
    } finally {
      setActingId(null);
    }
  };

  const declineInvite = async (note) => {
    if (actingId) return;
    setActingId(note.id);
    try {
      await updateDoc(doc(db, 'users', uid, 'inbox', note.id), { status: 'declined' });
    } catch (e) { /* ignore */ } finally {
      setActingId(null);
    }
  };

  const removeNote = (note) => {
    deleteDoc(doc(db, 'users', uid, 'inbox', note.id)).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Today</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Notifications</Text>
        <View style={{ width: 72 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {notes.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={30} color={COLORS.textMuted} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyText}>Nothing yet</Text>
            <Text style={styles.emptySub}>Gig invites and updates from your teacher will show up here.</Text>
          </View>
        ) : notes.map((n) => {
          const meta = TYPE_META[n.type] || TYPE_META.default;
          const isInvite = n.type === 'gig_invite';
          const g = n.data || {};
          return (
            <View key={n.id} style={[styles.card, !n.read && styles.cardUnread]}>
              <View style={styles.cardTop}>
                <View style={[styles.icon, { backgroundColor: meta.color + '22' }]}>
                  <Ionicons name={meta.icon} size={16} color={meta.color} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.cardTitle}>{n.title}</Text>
                  {!!n.body && <Text style={styles.cardBody}>{n.body}</Text>}
                  {isInvite && !!g.date && (
                    <Text style={styles.cardWhen}>{prettyGigDate(g.date, g.time)}</Text>
                  )}
                  <Text style={styles.cardTime}>{timeAgo(n.createdAt)}</Text>
                </View>
                <TouchableOpacity onPress={() => removeNote(n)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>

              {isInvite && (
                n.status === 'accepted' ? (
                  <View style={styles.statusRow}>
                    <Ionicons name="checkmark-circle" size={15} color={COLORS.success} />
                    <Text style={[styles.statusText, { color: COLORS.success }]}>Added to your calendar</Text>
                    <TouchableOpacity
                      style={styles.calendarBtn}
                      onPress={() => navigation.navigate('Practice', { screen: 'Schedule', params: { date: g.date } })}
                      activeOpacity={0.85}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="calendar-outline" size={13} color={COLORS.primary} />
                      <Text style={styles.calendarBtnText}>Calendar</Text>
                    </TouchableOpacity>
                  </View>
                ) : n.status === 'declined' ? (
                  <View style={styles.statusRow}>
                    <Ionicons name="close-circle" size={15} color={COLORS.textMuted} />
                    <Text style={styles.statusText}>Declined</Text>
                  </View>
                ) : (
                  <View style={styles.inviteBtns}>
                    <TouchableOpacity style={styles.declineBtn} onPress={() => declineInvite(n)} disabled={actingId === n.id} activeOpacity={0.85}>
                      <Text style={styles.declineText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptInvite(n)} disabled={actingId === n.id} activeOpacity={0.85}>
                      <Ionicons name="checkmark" size={15} color={COLORS.text} />
                      <Text style={styles.acceptText}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 72 },
  backText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  empty: { alignItems: 'center', paddingVertical: SPACING.xxl },
  emptyText: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  emptySub: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.sm },
  cardUnread: { borderColor: COLORS.primary + '55' },
  cardTop: { flexDirection: 'row', gap: SPACING.md },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  cardBody: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  cardWhen: { color: COLORS.text, fontSize: 13, fontWeight: '600', marginTop: 4 },
  cardTime: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: SPACING.sm, marginLeft: 32 + SPACING.md },
  statusText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  calendarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: COLORS.primary + '18', borderWidth: 1, borderColor: COLORS.primary + '44' },
  calendarBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  inviteBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm, marginLeft: 32 + SPACING.md },
  declineBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  declineText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  acceptBtn: { flex: 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.primary },
  acceptText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
}));
