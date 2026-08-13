// Shown after signing up, until the address is confirmed.
//
// Only NEW accounts see this. The gate keys off `requiresEmailVerification`,
// which is written at signup — every account that existed before this shipped
// has no such field and is let straight through, so nobody who was already
// using Prova is locked out by a rule that didn't exist when they joined.
//
// Firebase only refreshes `emailVerified` when the user object is reloaded, so
// there is an explicit "I've confirmed it" button as well as a quiet poll: the
// link opens in Mail/Safari, not in the app, so nothing tells us otherwise.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { clearSavedLogin } from '../../lib/savedLogin';
import { COLORS, SPACING } from '../../constants/theme';
import Ghost from '../../components/Ghost';

const POLL_MS = 4000;
const RESEND_COOLDOWN_S = 45;

export default function VerifyEmailScreen({ onVerified }) {
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const email = auth.currentUser?.email || 'your email';
  const mounted = useRef(true);

  const check = async (announce) => {
    const u = auth.currentUser;
    if (!u) return false;
    try {
      await u.reload();
      if (auth.currentUser?.emailVerified) { onVerified && onVerified(); return true; }
      if (announce) Alert.alert('Not confirmed yet', "We can't see a confirmation for that address yet. Open the link in the email, then try again.");
    } catch (e) { /* offline — the poll will get it */ }
    return false;
  };

  // Poll quietly, so coming back from Mail just works without tapping anything.
  useEffect(() => {
    mounted.current = true;
    const id = setInterval(() => { if (mounted.current) check(false); }, POLL_MS);
    return () => { mounted.current = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const resend = async () => {
    if (cooldown > 0 || !auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setCooldown(RESEND_COOLDOWN_S);
      Alert.alert('Sent', `A new confirmation email is on its way to ${auth.currentUser.email}.`);
    } catch (e) {
      Alert.alert('Could not send', e?.code === 'auth/too-many-requests'
        ? 'Too many attempts — wait a minute and try again.'
        : 'Something went wrong. Check your connection and try again.');
    }
  };

  const manualCheck = async () => {
    setChecking(true);
    await check(true);
    setChecking(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <View style={styles.icon}><Ionicons name="mail-outline" size={34} color={COLORS.primary} /></View>
        <Text style={styles.title}>Confirm your email</Text>
        <Text style={styles.sub}>
          We sent a link to <Text style={styles.email}>{email}</Text>. Open it, then come back here.
        </Text>
        <Text style={styles.hint}>Check your spam folder if it hasn’t arrived in a minute.</Text>

        <TouchableOpacity style={styles.primary} onPress={manualCheck} disabled={checking} activeOpacity={0.85}>
          {checking ? <Ghost color={COLORS.onPrimary} size="small" /> : <Text style={styles.primaryText}>I’ve confirmed it</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.ghost} onPress={resend} disabled={cooldown > 0} activeOpacity={0.85}>
          <Text style={[styles.ghostText, cooldown > 0 && { opacity: 0.5 }]}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the email'}
          </Text>
        </TouchableOpacity>

        {/* A way out that isn't "delete the app" — wrong address, or someone
            else's phone. */}
        <TouchableOpacity
          style={styles.link}
          onPress={async () => { await clearSavedLogin(); signOut(auth); }}
          activeOpacity={0.7}
        >
          <Text style={styles.linkText}>Use a different account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  icon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primary + '18',
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg,
  },
  title: { color: COLORS.text, fontSize: 24, fontWeight: '800', marginBottom: SPACING.sm },
  sub: { color: COLORS.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  email: { color: COLORS.text, fontWeight: '700' },
  hint: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', marginTop: SPACING.sm },
  primary: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: SPACING.md,
    alignItems: 'center', alignSelf: 'stretch', marginTop: SPACING.xl, minHeight: 50, justifyContent: 'center',
  },
  primaryText: { color: COLORS.onPrimary, fontSize: 16, fontWeight: '700' },
  ghost: {
    borderRadius: 14, paddingVertical: SPACING.md, alignItems: 'center', alignSelf: 'stretch',
    borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.sm,
  },
  ghostText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  link: { marginTop: SPACING.lg, padding: SPACING.sm },
  linkText: { color: COLORS.textMuted, fontSize: 14 },
});
