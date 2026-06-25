import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';
import { LIBRARY_TOPICS, LIBRARY_CATEGORIES, LIBRARY_LEVELS } from '../../constants/library';

// Open a YouTube SEARCH for a task (never a hard-coded video link).
function openSearch(phrase) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(phrase)}`;
  Linking.openURL(url).catch(() => {});
}

const norm = (s) => (s || '').toLowerCase();

export default function LibraryScreen({ navigation }) {
  const [instrument, setInstrument] = useState(null); // 'Guitar' | 'Bass' | null
  const [levelFilter, setLevelFilter] = useState('All'); // defaults to the user's level once loaded
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        const d = (await getDoc(doc(db, 'users', uid))).data() || {};
        if (d.instrument === 'Guitar' || d.instrument === 'Bass') setInstrument(d.instrument);
        // Default the library to the level the student picked in onboarding.
        if (LIBRARY_LEVELS.includes(d.level)) setLevelFilter(d.level);
      } catch { /* ignore — show everything */ }
    })();
  }, []);

  // Only topics for the student's instrument (plus 'Both'); if we don't know the
  // instrument yet, show all.
  const forInstrument = LIBRARY_TOPICS.filter(
    (t) => !instrument || t.instrument === 'Both' || t.instrument === instrument
  );

  // Scope to the selected level (defaults to the student's own level) so the
  // library shows mostly level-appropriate material.
  const levelScoped = forInstrument.filter((t) => levelFilter === 'All' || t.level === levelFilter);

  // Levels / categories that actually have content for this instrument + scope.
  const levels = ['All', ...LIBRARY_LEVELS.filter((lv) => forInstrument.some((t) => t.level === lv))];
  const cats = ['All', ...LIBRARY_CATEGORIES.filter((c) => levelScoped.some((t) => t.category === c))];

  const q = norm(query.trim());
  const topics = levelScoped.filter((t) => {
    if (cat !== 'All' && t.category !== cat) return false;
    if (!q) return true;
    const hay = `${norm(t.title)} ${norm(t.summary)} ${norm(t.category)} ${(t.tags || []).join(' ')}`;
    return q.split(/\s+/).every((word) => hay.includes(word));
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Lesson Library</Text>
        <View style={{ width: 72 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Search */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search any topic — e.g. barre chords, slap, modes"
            placeholderTextColor={COLORS.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Level filter — defaults to the student's own level */}
        <Text style={styles.filterLabel}>LEVEL</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow} style={{ marginBottom: SPACING.sm }}>
          {levels.map((lv) => {
            const on = levelFilter === lv;
            return (
              <TouchableOpacity
                key={lv}
                style={[styles.catChip, on && styles.catChipOn]}
                onPress={() => { setLevelFilter(lv); setCat('All'); }}
                activeOpacity={0.85}
              >
                <Text style={[styles.catChipText, on && styles.catChipTextOn]}>{lv}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Category filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow} style={{ marginBottom: SPACING.md }}>
          {cats.map((c) => {
            const on = cat === c;
            return (
              <TouchableOpacity key={c} style={[styles.catChip, on && styles.catChipOn]} onPress={() => setCat(c)} activeOpacity={0.85}>
                <Text style={[styles.catChipText, on && styles.catChipTextOn]}>{c}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.count}>{topics.length} topic{topics.length === 1 ? '' : 's'}</Text>

        {topics.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={30} color={COLORS.textMuted} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyText}>No topics match “{query}”.</Text>
            <Text style={styles.emptySub}>Try a simpler word, or clear the search to browse.</Text>
          </View>
        ) : (
          topics.map((t) => {
            const open = openId === t.id;
            return (
              <View key={t.id} style={styles.card}>
                <TouchableOpacity style={styles.cardHead} onPress={() => setOpenId(open ? null : t.id)} activeOpacity={0.7}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{t.title}</Text>
                    <Text style={styles.cardMeta}>{t.category} · {t.level}</Text>
                  </View>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
                </TouchableOpacity>

                {open && (
                  <View style={styles.cardBody}>
                    {!!t.summary && <Text style={styles.summary}>{t.summary}</Text>}
                    {(t.tasks || []).map((task, i) => (
                      <View key={i} style={styles.task}>
                        <Text style={styles.taskText}>{task.text}</Text>
                        {!!task.yt && (
                          <TouchableOpacity style={styles.watch} onPress={() => openSearch(task.yt)} activeOpacity={0.7}>
                            <Ionicons name="logo-youtube" size={14} color="#FF0000" />
                            <Text style={styles.watchText} numberOfLines={1}>Watch: {task.yt}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 72 },
  backText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: 10, marginBottom: SPACING.md },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 15, padding: 0 },

  filterLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: SPACING.xs },
  catRow: { gap: SPACING.sm, paddingRight: SPACING.lg },
  catChip: { paddingHorizontal: SPACING.md, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  catChipOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '22' },
  catChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  catChipTextOn: { color: COLORS.primary },

  count: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700', marginBottom: SPACING.sm },

  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md },
  cardTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  cardMeta: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
  cardBody: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: SPACING.sm },
  summary: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19 },
  task: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm },
  taskText: { color: COLORS.text, fontSize: 13, lineHeight: 19 },
  watch: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  watchText: { color: COLORS.textSecondary, fontSize: 12, textDecorationLine: 'underline', flexShrink: 1 },

  empty: { alignItems: 'center', paddingVertical: SPACING.xl },
  emptyText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  emptySub: { color: COLORS.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' },
});
