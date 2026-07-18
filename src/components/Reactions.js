import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SheetModal from './SheetModal';
import { COLORS, SPACING, themedStyles } from '../constants/theme';

// One shared reactions kit for every chat surface (class group chat + 1-on-1
// DMs): tallies + a small smiley+ chip under each message, and the picker
// sheet the chip opens. Reactions live on the message as { emoji: [uids] }.

export const QUICK_REACTIONS = ['👍', '👎', '❤️', '😂', '😮', '🔥'];
export const MORE_REACTIONS = [
  '👏', '🎸', '🎵', '🥳', '💯', '🤘',
  '⭐', '💪', '😍', '🤔', '😢', '😴',
  '🙌', '✨', '🚀', '🙏', '😆', '👀',
];

// Tallies for a message's existing reactions plus the add chip. Renders
// nothing but the chip when there are no reactions yet. `alignRight` mirrors
// the row for own-message (right-side) bubbles.
export function ReactionChips({ reactions, myUid, onToggle, onAdd, alignRight }) {
  const map = reactions || {};
  const entries = Object.keys(map).filter((e) => (map[e] || []).length > 0);
  return (
    <View style={[styles.row, alignRight && styles.rowRight]}>
      {entries.map((emoji) => {
        const mine = (map[emoji] || []).includes(myUid);
        return (
          <TouchableOpacity
            key={emoji}
            style={[styles.chip, mine && styles.chipMine]}
            onPress={() => onToggle(emoji)}
            activeOpacity={0.7}
          >
            <Text style={styles.chipEmoji}>{emoji}</Text>
            <Text style={[styles.chipCount, mine && styles.chipCountMine]}>{(map[emoji] || []).length}</Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={styles.addChip}
        onPress={onAdd}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        activeOpacity={0.7}
      >
        <Ionicons name="happy-outline" size={15} color={COLORS.textMuted} />
        <Ionicons name="add" size={11} color={COLORS.textMuted} style={{ marginLeft: -3 }} />
      </TouchableOpacity>
    </View>
  );
}

// The picker: a prominent quick row, a divider, then the fuller grid.
export function ReactionPicker({ visible, onPick, onClose }) {
  return (
    <SheetModal visible={visible} onRequestClose={onClose} centered cardStyle={styles.card} dismissOnBackdrop>
      <View style={styles.quickRow}>
        {QUICK_REACTIONS.map((emoji) => (
          <TouchableOpacity key={emoji} onPress={() => onPick(emoji)} activeOpacity={0.7}>
            <Text style={styles.quickEmoji}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.divider} />
      <View style={styles.grid}>
        {MORE_REACTIONS.map((emoji) => (
          <TouchableOpacity key={emoji} onPress={() => onPick(emoji)} activeOpacity={0.7}>
            <Text style={styles.gridEmoji}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SheetModal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6, marginLeft: 4 },
  rowRight: { justifyContent: 'flex-end', marginLeft: 0, marginRight: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  chipMine: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '22' },
  chipEmoji: { fontSize: 13 },
  chipCount: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  chipCountMine: { color: COLORS.primary },
  addChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3, opacity: 0.85 },

  card: { marginHorizontal: 40, borderRadius: 20, padding: SPACING.lg },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quickEmoji: { fontSize: 30 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: SPACING.md },
  gridEmoji: { fontSize: 26, width: 40, textAlign: 'center' },
}));
