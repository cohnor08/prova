import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { generatePracticePlan } from '../../lib/claude';
import { COLORS, SPACING } from '../../constants/theme';
import { track } from '../../lib/analytics';

const PRICE = '$5.99';
const PERKS = [
  { icon: 'sparkles', title: 'Your own AI practice plan', sub: 'A daily plan built around your instrument, level and goals.' },
  { icon: 'trending-up', title: 'Adapts as you improve', sub: 'Rate a session and the next day’s plan adjusts to match.' },
  { icon: 'school', title: 'Keep your teacher too', sub: 'Personal works right alongside any teacher you connect.' },
  { icon: 'musical-notes', title: 'AI gig setlists', sub: 'Describe the gig — Prova builds the set from your library and taste.' },
  { icon: 'ear', title: 'Unlimited practice games', sub: 'Ear training and the fretboard game, as many rounds as you like.' },
  { icon: 'infinite', title: 'Everything in Free', sub: 'Daily challenge, progress, songs and reminders — all included.' },
];

export default function PaywallScreen({ navigation }) {
  const [busy, setBusy] = useState(false);
  // Remote switch (config/paywall.mockCheckout in Firestore): while checkout
  // is a mock, this controls whether "Start free trial" actually grants the
  // upgrade or shows a coming-soon message — so the free self-upgrade can be
  // shut off from the Firebase console without shipping an update.
  const [mockCheckout, setMockCheckout] = useState(true);
  useEffect(() => {
    getDoc(doc(db, 'config', 'paywall'))
      .then((s) => { if (s.exists()) setMockCheckout(s.data().mockCheckout !== false); })
      .catch(() => {});
  }, []);

  useEffect(() => { track('paywall_viewed'); }, []);

  const comingSoon = () => {
    Alert.alert('Coming soon', 'Upgrades aren’t open quite yet — hang tight, Personal is almost here!');
  };

  const confirm = () => {
    Alert.alert(
      'Start your 7-day free trial?',
      `You won’t be charged today. Personal is ${PRICE}/month after the trial — cancel anytime.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Start free trial', onPress: doUpgrade },
      ]
    );
  };

  // Mock checkout (no real billing yet): flip the account to Personal and build
  // their first personalised plan so the upgrade is immediately tangible.
  const doUpgrade = async () => {
    setBusy(true);
    try {
      const uid = auth.currentUser.uid;
      const snap = await getDoc(doc(db, 'users', uid));
      const profile = snap.data() || {};
      track('upgrade_started');
      await updateDoc(doc(db, 'users', uid), {
        role: 'personal',
        planType: 'personal_trial',
        trialStartedAt: new Date().toISOString(),
      });
      try {
        const plan = await generatePracticePlan(profile);
        await setDoc(doc(db, 'users', uid), { practicePlan: plan, planGeneratedAt: new Date().toISOString() }, { merge: true });
      } catch (e) {
        // Upgrade still succeeds — they can build the plan from Profile if gen fails.
      }
      setBusy(false);
      Alert.alert('Welcome to Personal! 🎉', 'Your personalised plan is ready on the Today tab.', [
        { text: 'Let’s go', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      setBusy(false);
      Alert.alert('Something went wrong', "Couldn’t complete the upgrade. Please try again.");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={26} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[COLORS.primary, COLORS.accent || '#06B6D4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroBadge}><Ionicons name="sparkles" size={26} color="#fff" /></View>
          <Text style={styles.heroTitle}>Prova Personal</Text>
          <Text style={styles.heroSub}>Your own AI coach that builds and adapts a plan just for you.</Text>
        </LinearGradient>

        <View style={styles.perks}>
          {PERKS.map((p) => (
            <View key={p.title} style={styles.perk}>
              <View style={styles.perkIcon}><Ionicons name={p.icon} size={18} color={COLORS.primary} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.perkTitle}>{p.title}</Text>
                <Text style={styles.perkSub}>{p.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.priceCard}>
          <View style={styles.trialPill}><Text style={styles.trialPillText}>7-DAY FREE TRIAL</Text></View>
          <Text style={styles.price}>{PRICE}<Text style={styles.priceUnit}> / month</Text></Text>
          <Text style={styles.priceNote}>Free for 7 days, then {PRICE}/month. Cancel anytime.</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cta} onPress={mockCheckout ? confirm : comingSoon} disabled={busy} activeOpacity={0.9}>
          {busy
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.ctaText}>{mockCheckout ? 'Start free trial' : 'Coming soon'}</Text>}
        </TouchableOpacity>
        {busy && <Text style={styles.busyNote}>Setting up your plan — this can take a moment…</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  navBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl },
  hero: { borderRadius: 24, padding: SPACING.xl, alignItems: 'center' },
  heroBadge: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: 0.5 },
  heroSub: { color: 'rgba(255,255,255,0.92)', fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  perks: { marginTop: SPACING.xl, gap: SPACING.lg },
  perk: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  perkIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.primary + '18', alignItems: 'center', justifyContent: 'center' },
  perkTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  perkSub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 },
  priceCard: { marginTop: SPACING.xl, backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, alignItems: 'center' },
  trialPill: { backgroundColor: COLORS.primary + '1A', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, marginBottom: SPACING.sm },
  trialPillText: { color: COLORS.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  price: { color: COLORS.text, fontSize: 32, fontWeight: '900' },
  priceUnit: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' },
  priceNote: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  footer: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, paddingBottom: SPACING.md },
  cta: { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  busyNote: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center', marginTop: SPACING.sm },
});
