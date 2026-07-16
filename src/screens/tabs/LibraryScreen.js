import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';
import { LIBRARY_TOPICS, LIBRARY_CATEGORIES, LIBRARY_LEVELS } from '../../constants/library';
import YouTubePlayerModal from '../../components/YouTubePlayerModal';
import SheetModal from '../../components/SheetModal';

const norm = (s) => (s || '').toLowerCase();

// A calm, borderless filter pill row. Selected = solid fill, unselected = subtle
// surface — no borders, so a long row of options reads cleanly instead of as a
// wall of boxes.
function FilterRow({ label, options, value, onSelect }) {
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.groupLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {options.map((opt) => {
          const on = value === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => onSelect(opt)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function LibraryScreen({ navigation }) {
  useThemeSync();
  const [instrument, setInstrument] = useState(null); // 'Guitar' | 'Bass' | null
  const [levelFilter, setLevelFilter] = useState('All'); // defaults to the user's level once loaded
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [selected, setSelected] = useState(null); // topic opened in the detail modal
  const [watch, setWatch] = useState(null); // { query } for the in-app video player

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
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets>
        {/* Title */}
        <Text style={styles.pageTitle}>Lesson Library</Text>
        <Text style={styles.pageSub}>
          {topics.length} lesson{topics.length === 1 ? '' : 's'}{instrument ? ` · ${instrument}` : ''}
        </Text>

        {/* Search */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search barre chords, slap, modes…"
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

        {/* Filters */}
        <FilterRow label="Level" options={levels} value={levelFilter} onSelect={(lv) => { setLevelFilter(lv); setCat('All'); }} />
        <FilterRow label="Category" options={cats} value={cat} onSelect={setCat} />

        <View style={{ height: SPACING.md }} />

        {topics.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={30} color={COLORS.textMuted} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyText}>No lessons match “{query}”.</Text>
            <Text style={styles.emptySub}>Try a simpler word, or clear the search to browse.</Text>
          </View>
        ) : (
          topics.map((t) => (
            <TouchableOpacity key={t.id} style={styles.card} onPress={() => setSelected(t)} activeOpacity={0.7}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{t.title}</Text>
                <Text style={styles.cardMeta}>{t.category} · {t.level}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Topic detail — opens the lesson content in a modal over the list */}
      <SheetModal visible={!!selected} onRequestClose={() => setSelected(null)} cardStyle={styles.sheet} dismissOnBackdrop>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sheetTitle} numberOfLines={2}>{selected?.title}</Text>
                <Text style={styles.sheetMeta}>{selected?.category} · {selected?.level}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xl }} showsVerticalScrollIndicator={false}>
              {!!selected?.summary && <Text style={styles.summary}>{selected.summary}</Text>}
              {(selected?.tasks || []).map((task, i) => (
                <View key={i} style={styles.task}>
                  <Text style={styles.taskText}>{task.text}</Text>
                  {!!task.yt && (
                    <TouchableOpacity style={styles.watchBtn} onPress={() => setWatch({ query: task.yt, title: selected.title })} activeOpacity={0.8}>
                      <Ionicons name="play-circle" size={18} color={COLORS.primary} />
                      <Text style={styles.watchBtnText} numberOfLines={1}>Watch videos on {selected.title}</Text>
                      <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>

            {/* Nested so the player stacks over this sheet and returns here on close */}
            <YouTubePlayerModal
              visible={!!watch}
              query={watch?.query}
              title={watch?.title ? `Videos on ${watch.title}` : 'Watch'}
              onClose={() => setWatch(null)}
            />
      </SheetModal>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },

  pageTitle: { color: COLORS.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  pageSub: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600', marginTop: 4, marginBottom: SPACING.lg },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: 12, paddingHorizontal: SPACING.md, paddingVertical: 12, marginBottom: SPACING.lg },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 15, padding: 0 },

  filterGroup: { marginBottom: SPACING.md },
  groupLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginBottom: SPACING.sm },
  chipRow: { gap: SPACING.sm, paddingRight: SPACING.lg },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.surface },
  chipOn: { backgroundColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: '#FFFFFF', fontWeight: '700' },

  card: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.card, borderRadius: 14, padding: SPACING.md, marginBottom: SPACING.sm },
  cardTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  cardMeta: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: 3 },

  sheet: { backgroundColor: COLORS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.xl, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, marginBottom: SPACING.lg },
  sheetTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  sheetMeta: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600', marginTop: 3 },
  summary: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: SPACING.md },
  task: { marginBottom: SPACING.md },
  taskText: { color: COLORS.text, fontSize: 14, lineHeight: 21 },
  watchBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingVertical: 2 },
  watchBtnText: { flex: 1, color: COLORS.primary, fontSize: 13, fontWeight: '600' },

  empty: { alignItems: 'center', paddingVertical: SPACING.xl },
  emptyText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  emptySub: { color: COLORS.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' },
}));
