// Prova paywall — the upgrade screen for both paid tiers.
//
// ROLE-AWARE: teachers (role 'teacher') see the STUDIO plan; everyone else sees
// PERSONAL. The upsell hooks in src/lib/entitlements.js navigate here.
//
// ⚠️ HALF-BUILT ON PURPOSE (see prova-monetization-plan in memory):
// This is the UI half. The "Start free trial" button is a PLACEHOLDER — it does
// NOT grant anything and does NOT take payment yet. The real purchase must go
// through Apple In-App Purchase (via RevenueCat) — wire it at the TODO below.
// Do NOT reintroduce the old "flip role to personal for free" mock checkout or
// the "email us to upgrade" flow: both are exactly what Apple 3.1.1 rejected.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import Ghost from '../../components/Ghost';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';
import { track } from '../../lib/analytics';

// ─── Plan definitions (prices/trials decided 2026-07-26) ─────────────────────
const PLANS = {
  personal: {
    name: 'Prova Personal',
    tagline: 'Your own AI coach that builds and adapts a plan just for you.',
    price: '$6.99',
    trialDays: 7,
    gradient: [COLORS.primary, COLORS.accent || '#06B6D4'],
    perks: [
      { icon: 'sparkles', title: 'Your own AI practice plan', sub: 'A daily plan built around your instrument, level and goals.' },
      { icon: 'trending-up', title: 'Adapts as you improve', sub: 'Rate a session and the next day’s plan adjusts to match.' },
      { icon: 'musical-notes', title: 'Learn any song, step by step', sub: 'Prova breaks a song into a guided, playable practice plan.' },
      { icon: 'chatbubbles', title: 'Ask Prova, 25× a day', sub: 'Your AI coach for any playing question — well past the free 2-a-day.' },
      { icon: 'list', title: 'AI gig setlists', sub: 'Describe the gig — Prova builds the set from your library and taste.' },
      { icon: 'infinite', title: 'Unlimited practice games', sub: 'Ear training, fretboard, rhythm and theory — as many rounds as you like.' },
    ],
  },
  studio: {
    name: 'Prova Studio',
    tagline: 'Run your whole teaching studio from one place.',
    price: '$12.99',
    trialDays: 14,
    gradient: ['#6366F1', COLORS.primary],
    perks: [
      { icon: 'people', title: 'Unlimited students', sub: 'Grow your studio past the 3-student free cap.' },
      { icon: 'mail', title: 'Automatic parent reports', sub: 'Weekly practice summaries emailed to parents — hands-off.' },
      { icon: 'pulse', title: 'Practice Pulse + nudges', sub: 'See who’s slipping and send a one-tap nudge to get them back.' },
      { icon: 'chatbubbles', title: 'Ask Prova, 25× a day', sub: 'Your AI teaching assistant for any question — past the free 2-a-day.' },
      { icon: 'infinite', title: 'Everything in Free', sub: 'Dashboard, lesson notes, calendar and packs — all included.' },
    ],
  },
};

export default function PaywallScreen({ navigation }) {
  useThemeSync();
  const [planKey, setPlanKey] = useState(null); // null while we look up the role
  const [busy, setBusy] = useState(false);

  // Decide which plan to show from the user's role.
  useEffect(() => {
    let alive = true;
    (async () => {
      let key = 'personal';
      try {
        const uid = auth.currentUser?.uid;
        if (uid) {
          const u = (await getDoc(doc(db, 'users', uid))).data() || {};
          if (u.role === 'teacher') key = 'studio';
        }
      } catch (e) {
        // default to personal on any hiccup
      }
      if (alive) { setPlanKey(key); track('paywall_viewed', { plan: key }); }
    })();
    return () => { alive = false; };
  }, []);

  const plan = planKey ? PLANS[planKey] : null;

  // TODO(paywall): replace this placeholder with the real RevenueCat purchase.
  //   1. await Purchases.purchasePackage(pkg)
  //   2. on success, RevenueCat entitlement flips; mirror it to the user doc
  //   3. entitlements.js reads that entitlement to unlock features
  // Until that's wired (needs a RevenueCat account + a dev build), this button
  // only shows a friendly "almost here" message and grants nothing.
  const onStartTrial = () => {
    track('paywall_cta_tapped', { plan: planKey });
    Alert.alert(
      'Almost here',
      `${plan.name} isn’t open for purchase just yet — we’re putting the finishing touches on payments. Hang tight!`,
      [{ text: 'OK' }]
    );
  };

  if (!plan) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loading}><Ghost /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={26} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={plan.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroBadge}><Ionicons name="sparkles" size={26} color="#fff" /></View>
          <Text style={styles.heroTitle}>{plan.name}</Text>
          <Text style={styles.heroSub}>{plan.tagline}</Text>
        </LinearGradient>

        <View style={styles.perks}>
          {plan.perks.map((p) => (
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
          <View style={styles.trialPill}><Text style={styles.trialPillText}>{plan.trialDays}-DAY FREE TRIAL</Text></View>
          <Text style={styles.price}>{plan.price}<Text style={styles.priceUnit}> / month</Text></Text>
          <Text style={styles.priceNote}>Free for {plan.trialDays} days, then {plan.price}/month. Cancel anytime.</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cta} onPress={onStartTrial} disabled={busy} activeOpacity={0.9}>
          {busy ? <Ghost color="#fff" /> : <Text style={styles.ctaText}>Start free trial</Text>}
        </TouchableOpacity>
        <Text style={styles.legal}>Billed through the App Store. Cancel anytime in Settings.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  legal: { color: COLORS.textMuted, fontSize: 11, textAlign: 'center', marginTop: SPACING.sm },
}));
