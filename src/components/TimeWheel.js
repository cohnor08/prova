import React, { useRef } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';

// A rollable hour / minute / AM-PM time picker that reads and emits a 24-hour
// "HH:MM" string. No native dependency — just snapping ScrollViews.
const ITEM_H = 40;
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const AMPM = ['AM', 'PM'];

function Wheel({ values, value, onChange, format, width }) {
  const ref = useRef(null);
  const index = Math.max(0, values.indexOf(value));
  const settle = (e) => {
    let i = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    i = Math.max(0, Math.min(values.length - 1, i));
    if (values[i] !== value) onChange(values[i]);
  };
  return (
    <View style={[styles.wheel, width ? { width } : null]}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        nestedScrollEnabled
        onLayout={() => ref.current?.scrollTo({ y: index * ITEM_H, animated: false })}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        contentContainerStyle={{ paddingVertical: ITEM_H }}
      >
        {values.map((v) => (
          <View key={v} style={styles.wheelRow}>
            <Text style={[styles.wheelItem, v === value && styles.wheelItemSel]}>{format ? format(v) : v}</Text>
          </View>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={styles.wheelHighlight} />
    </View>
  );
}

export function parseTime(hhmm) {
  const [hRaw, mRaw] = String(hhmm || '19:00').split(':').map(Number);
  const h = Number.isNaN(hRaw) ? 19 : hRaw;
  const m = Number.isNaN(mRaw) ? 0 : mRaw;
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return { h12, min: m, ampm: h >= 12 ? 'PM' : 'AM' };
}

function to24(h12, min, ampm) {
  let h = h12 % 12;
  if (ampm === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// Human label for a stored 24h "HH:MM" — e.g. "7:05 PM".
export function formatTime12(hhmm) {
  const { h12, min, ampm } = parseTime(hhmm);
  return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
}

export default function TimeWheel({ value, onChange }) {
  const { h12, min, ampm } = parseTime(value);
  const set = (nh, nm, na) => onChange(to24(nh, nm, na));
  return (
    <View style={styles.row}>
      <Wheel values={HOURS} value={h12} onChange={(v) => set(v, min, ampm)} />
      <Text style={styles.colon}>:</Text>
      <Wheel values={MINUTES} value={min} onChange={(v) => set(h12, v, ampm)} format={(m) => String(m).padStart(2, '0')} />
      <Wheel values={AMPM} value={ampm} onChange={(v) => set(h12, min, v)} width={64} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  colon: { color: COLORS.text, fontSize: 22, fontWeight: '800' },
  wheel: { width: 58, height: ITEM_H * 3, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  wheelRow: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  wheelItem: { color: COLORS.textMuted, fontSize: 17, fontWeight: '600' },
  wheelItemSel: { color: COLORS.text, fontWeight: '800' },
  wheelHighlight: { position: 'absolute', left: 6, right: 6, top: ITEM_H, height: ITEM_H, borderRadius: 8, backgroundColor: COLORS.primary + '1A' },
});
