import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ChordDiagram from '../../components/ChordDiagram';
import ScaleDiagram from '../../components/ScaleDiagram';
import { GUITAR_CHORDS, ROOTS, CHORD_TYPES } from '../../constants/chords';
import { SCALES, SCALE_ROOTS, NOTE_NAMES } from '../../constants/scales';
import { COLORS, SPACING } from '../../constants/theme';

// Every card is the same fixed height (the diagram is always 4 frets), so we can
// give FlatList an exact row height via getItemLayout — that keeps the scroll
// position from jumping as more rows render on the way down.
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

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipOn]} onPress={onPress} activeOpacity={0.85}>
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ChordLibraryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState('chords');

  // Chords
  const [root, setRoot] = useState('All');
  const [type, setType] = useState('All');
  const chords = useMemo(
    () => GUITAR_CHORDS.filter(
      (c) => (root === 'All' || c.root === root) && (type === 'All' || c.type === type),
    ),
    [root, type],
  );
  const rows = useMemo(() => {
    const out = [];
    for (let i = 0; i < chords.length; i += 2) out.push(chords.slice(i, i + 2));
    return out;
  }, [chords]);
  const rootsWithType = type === 'All' ? ROOTS : ROOTS.filter((r) => GUITAR_CHORDS.some((c) => c.root === r && c.type === type));
  const typesWithRoot = root === 'All' ? CHORD_TYPES : CHORD_TYPES.filter((t) => GUITAR_CHORDS.some((c) => c.type === t && c.root === root));
  const renderRow = useCallback(({ item }) => (
    <View style={styles.gridRow}>
      {item.map((c) => <ChordCard key={c.id || c.name} chord={c} />)}
      {item.length === 1 && <View style={styles.cardSpacer} />}
    </View>
  ), []);

  // Scales
  const [scaleRoot, setScaleRoot] = useState('C');
  const [scaleName, setScaleName] = useState('Major');
  const scale = SCALES.find((s) => s.name === scaleName) || SCALES[0];
  const scaleRootIdx = NOTE_NAMES.indexOf(scaleRoot);
  const scaleNotes = scale.intervals.map((i) => NOTE_NAMES[(scaleRootIdx + i) % 12]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chords & Scales</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Chords / Scales toggle */}
      <View style={styles.segment}>
        {['chords', 'scales'].map((m) => (
          <TouchableOpacity key={m} style={[styles.segBtn, mode === m && styles.segBtnOn]} onPress={() => setMode(m)} activeOpacity={0.85}>
            <Text style={[styles.segText, mode === m && styles.segTextOn]}>{m === 'chords' ? 'Chords' : 'Scales'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'chords' ? (
        <>
          <View style={styles.filterBlock}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {['All', ...rootsWithType].map((r) => <Chip key={r} label={r} active={root === r} onPress={() => setRoot(r)} />)}
            </ScrollView>
          </View>
          <View style={[styles.filterBlock, { paddingBottom: SPACING.sm }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {['All', ...typesWithRoot].map((t) => <Chip key={t} label={t} active={type === t} onPress={() => setType(t)} />)}
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
        </>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.xl }}>
          <View style={styles.filterBlock}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {SCALE_ROOTS.map((r) => <Chip key={r} label={r} active={scaleRoot === r} onPress={() => setScaleRoot(r)} />)}
            </ScrollView>
          </View>
          <View style={[styles.filterBlock, { paddingBottom: SPACING.sm }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {SCALES.map((s) => <Chip key={s.name} label={s.name} active={scaleName === s.name} onPress={() => setScaleName(s.name)} />)}
            </ScrollView>
          </View>

          <View style={styles.scaleWrap}>
            <Text style={styles.scaleTitle}>{scaleRoot} {scaleName}</Text>
            <View style={styles.notesRow}>
              {scaleNotes.map((n, i) => (
                <View key={i} style={[styles.notePill, i === 0 && styles.notePillRoot]}>
                  <Text style={[styles.notePillText, i === 0 && styles.notePillTextRoot]}>{n}</Text>
                </View>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.boardScroll}>
              <ScaleDiagram rootIndex={scaleRootIdx} intervals={scale.intervals} />
            </ScrollView>
            <Text style={styles.scaleHint}>Filled dot = root note. Scroll the neck sideways if it's cut off.</Text>
          </View>
        </ScrollView>
      )}
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

  segment: {
    flexDirection: 'row', gap: 6, backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, padding: 4,
    marginHorizontal: SPACING.lg, marginTop: SPACING.md,
  },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  segBtnOn: { backgroundColor: COLORS.primary },
  segText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  segTextOn: { color: '#fff' },

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
  gridRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md },
  cardSpacer: { width: '47%' },
  card: {
    width: '47%', height: CARD_H, alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: SPACING.md,
  },
  chordName: { color: COLORS.text, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  empty: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginTop: SPACING.xl },

  scaleWrap: { marginHorizontal: SPACING.lg, marginTop: SPACING.md, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md },
  scaleTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', marginBottom: SPACING.sm },
  notesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: SPACING.md },
  notePill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: COLORS.primary + '22', borderWidth: 1, borderColor: COLORS.primary + '55' },
  notePillRoot: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  notePillText: { color: COLORS.primary, fontSize: 13, fontWeight: '800' },
  notePillTextRoot: { color: '#fff' },
  boardScroll: { marginHorizontal: -4 },
  scaleHint: { color: COLORS.textMuted, fontSize: 11, marginTop: SPACING.sm },
});
