import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../../constants/theme';
import { RESOURCES, RESOURCE_LEVELS, RESOURCE_LEVEL_FALLBACK, CATEGORY_META } from '../../constants/resources';

const INSTRUMENTS = ['Guitar', 'Bass'];

function openYouTube(phrase) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(phrase)}`;
  Linking.openURL(url).catch(() => {});
}

function Pill({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ResourceItem({ item }) {
  return (
    <View style={styles.item}>
      <Text style={styles.itemTitle}>{item.title}</Text>
      <Text style={styles.itemDetail}>{item.detail}</Text>
      {item.yt && (
        <TouchableOpacity style={styles.ytRow} onPress={() => openYouTube(item.yt)} activeOpacity={0.7}>
          <Ionicons name="logo-youtube" size={15} color="#FF0000" />
          <Text style={styles.ytText} numberOfLines={1}>Watch: {item.yt}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function ResourceLibraryScreen() {
  const [instrument, setInstrument] = useState('Guitar');
  const [level, setLevel] = useState('Beginner');

  const effLevel = RESOURCES[instrument]?.[level] ? level : (RESOURCE_LEVEL_FALLBACK[level] || level);
  const data = RESOURCES[instrument]?.[effLevel] || {};
  const categories = Object.keys(CATEGORY_META).filter((c) => (data[c] || []).length > 0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>TEACHING LIBRARY</Text>
        <Text style={styles.title}>Resources</Text>
        <Text style={styles.subtitle}>Ready-to-use exercises, tips and songs to hand to your students.</Text>

        <View style={styles.pillRow}>
          {INSTRUMENTS.map((i) => (
            <Pill key={i} label={i} active={instrument === i} onPress={() => setInstrument(i)} />
          ))}
        </View>
        <View style={styles.pillRow}>
          {RESOURCE_LEVELS.map((l) => (
            <Pill key={l} label={l} active={level === l} onPress={() => setLevel(l)} />
          ))}
        </View>

        {categories.map((cat) => {
          const meta = CATEGORY_META[cat];
          return (
            <View key={cat} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name={meta.icon} size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>{meta.label}</Text>
              </View>
              {data[cat].map((item, idx) => (
                <ResourceItem key={`${cat}_${idx}`} item={item} />
              ))}
            </View>
          );
        })}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg },
  kicker: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.xs },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginTop: SPACING.xs, marginBottom: SPACING.lg },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  pill: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  pillTextActive: { color: COLORS.text },
  section: { marginTop: SPACING.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: SPACING.sm },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  item: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: SPACING.md,
    marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  itemTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  itemDetail: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19 },
  ytRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm },
  ytText: { color: COLORS.textSecondary, fontSize: 12, flexShrink: 1, textDecorationLine: 'underline' },
});
