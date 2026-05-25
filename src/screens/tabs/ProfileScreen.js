import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';

function Row({ icon, label, value, valueColor }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={COLORS.textMuted} style={styles.rowIcon} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor && { color: valueColor }]}>{value || '—'}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'users', uid));
      setUserData(snap.data());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  };

  const initial = auth.currentUser?.email?.[0]?.toUpperCase() || '?';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.email}>{auth.currentUser?.email}</Text>
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>{userData?.level || 'Beginner'} · {userData?.instrument || 'Guitar'}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.card}>
          <Row icon="mail-outline" label="Email" value={auth.currentUser?.email} />
          <Row icon="musical-notes-outline" label="Instrument" value={userData?.instrument} />
          <Row icon="bar-chart-outline" label="Level" value={userData?.level} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PLAN</Text>
        <View style={styles.card}>
          <Row icon="card-outline" label="Current plan" value="Free" valueColor={COLORS.primary} />
        </View>
      </View>

      <View style={styles.dangerZone}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800', marginBottom: SPACING.xl },
  avatarSection: { alignItems: 'center', marginBottom: SPACING.xxl },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    borderWidth: 3,
    borderColor: COLORS.primary + '44',
  },
  avatarText: { color: COLORS.text, fontSize: 30, fontWeight: '800' },
  email: { color: COLORS.text, fontSize: 16, fontWeight: '600', marginBottom: SPACING.sm },
  levelBadge: {
    backgroundColor: COLORS.primary + '1A',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: COLORS.primary + '44',
  },
  levelBadgeText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  section: { marginBottom: SPACING.xl },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.5,
    marginBottom: SPACING.sm,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowIcon: { marginRight: SPACING.sm },
  rowLabel: { color: COLORS.textSecondary, fontSize: 15, flex: 1 },
  rowValue: { color: COLORS.text, fontSize: 15, fontWeight: '500' },
  dangerZone: { marginTop: SPACING.lg },
  logoutBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.error + '44',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  logoutText: { color: COLORS.error, fontSize: 16, fontWeight: '600' },
});
