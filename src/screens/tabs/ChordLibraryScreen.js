import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ChordDiagram from '../../components/ChordDiagram';
import { GUITAR_CHORDS, ROOTS, CHORD_TYPES } from '../../constants/chords';
import { COLORS, SPACING } from '../../constants/theme';

// Every card is the same fixed height (the diagram is always 4 frets), so we can
// give FlatList an exact row height via getItemLayout — that's what stops the
// scroll-position from jumping/stuttering as more rows render on the way down.
const CARD_H = 186;
const ROW_H = CARD_H + SPACING.md;

const ChordCard = React.memo(function ChordCard({ chord }) {
  return (
    <View style={styles.card}>
      <Text style={styles.chordName}>{chord.name}</Text>
      <ChordDiagram frets={chord.frets} fingers={chord.fingers} />
    </View>
  );
});

export default function ChordLibraryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [root, setRoot] = useState('All');
  const [type, setType] = useState('All');

  const chords = useMemo(
    () => GUITAR_CHORDS.filter(
      (c) => (root === 'All' || c.root === root) && (type === 'All' || c.type === type),
    ),
    [root, type],
  );

  // Pair chords into rows of two so each FlatList item is one fixed-height row.
  const rows = useMemo(() => {
    const out = [];
    for (let i = 0; i < chords.length; i += 2) out.push(chords.slice(i, i + 2));
    return out;
  }, [chords]);

  // Only offer filter chips that actually yield chords.
  const rootsWithType = type === 'All' ? ROOTS : ROOTS.filter((r) => GUITAR_CHORDS.some((c) => c.root === r && c.type === type));
  const typesWithRoot = root === 'All' ? CHORD_TYPES : CHORD_TYPES.filter((t) => GUITAR_CHORDS.some((c) => c.type === t && c.root === root));

  const renderRow = useCallback(({ item }) => (
    <View style={styles.row}>
      {item.map((c) => <ChordCard key={c.id || c.name} chord={c} />)}
      {item.length === 1 && <View style={styles.cardSpacer} />}
    </View>
  ), []);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chord Library</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Root filter */}
      <View style={styles.filterBlock}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {['All', ...rootsWithType].map((r) => (
            <TouchableOpacity key={r} style={[styles.chip, root === r && styles.chipOn]} onPress={() => setRoot(r)} activeOpacity={0.85}>
              <Text style={[styles.chipText, root === r && styles.chipTextOn]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Type filter */}
      <View style={[styles.filterBlock, { paddingBottom: SPACING.sm }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {['All', ...typesWithRoot].map((t) => (
            <TouchableOpacity key={t} style={[styles.chip, type === t && styles.chipOn]} onPress={() => setType(t)} activeOpacity={0.85}>
              <Text style={[styles.chipText, type === t && styles.chipTextOn]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row[0].id || row[0].name}
        renderItem={renderRow}
        getItemLayout={(_data, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
        contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + SPACING.xl }]}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={21}
        ListEmptyComponent={<Text style={styles.empty}>No chords match that filter.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  headerTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },

  filterBlock: { paddingTop: SPACING.sm },
  chipRow: { paddingHorizontal: SPACING.lg, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: '#fff' },

  grid: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md },
  cardSpacer: { width: '47%' },
  card: {
    width: '47%', height: CARD_H, alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: SPACING.md,
  },
  chordName: { color: COLORS.text, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  empty: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginTop: SPACING.xl },
});
