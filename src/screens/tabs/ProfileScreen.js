import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { signOut } from '@firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';

export default function ProfileScreen() {
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const uid = auth.currentUser.uid;
    const snap = await getDoc(doc(db, 'users', uid));
    setUserData(snap.data());
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {auth.currentUser?.email?.[0]?.toUpperCase() || '?'}
          </Text>
        </View>
        <Text style={styles.email}>{auth.currentUser?.email}</Text>
        <Text style={styles.level}>{userData?.level || 'Beginner'} · {userData?.instrument || 'Guitar'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Email</Text>
          <Text style={styles.rowValue}>{auth.currentUser?.email}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Instrument</Text>
          <Text style={styles.rowValue}>{userData?.instrument || '—'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Level</Text>
          <Text style={styles.rowValue}>{userData?.level || '—'}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PLAN</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Current plan</Text>
          <Text style={[styles.rowValue, { color: COLORS.primary }]}>Free</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.xl },
  avatarSection: { alignItems: 'center', marginBottom: SPACING.xxl },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  avatarText: { color: COLORS.text, fontSize: 32, fontWeight: '800' },
  email: { color: COLORS.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  level: { color: COLORS.textSecondary, fontSize: 14 },
  section: { marginBottom: SPACING.xl },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLabel: { color: COLORS.textSecondary, fontSize: 15 },
  rowValue: { color: COLORS.text, fontSize: 15, fontWeight: '500' },
  logoutBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.error + '44',
    marginTop: SPACING.lg,
  },
  logoutText: { color: COLORS.error, fontSize: 16, fontWeight: '600' },
});
