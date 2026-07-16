import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, themedStyles } from '../constants/theme';

// Calendar + time picker for a task due date (no external dependency). Rendered
// as an in-place overlay so it can sit over another sheet (iOS won't reliably
// stack two Modals). Calls onSet(ISO | null) then onClose.
export default function DueDatePicker({ initial, onClose, onSet }) {
  const base = initial ? new Date(initial) : null;
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const [day, setDay] = useState(() => {
    const d = base ? new Date(base) : new Date();
    d.setHours(0, 0, 0, 0); return d;
  });
  const [view, setView] = useState(() => new Date((base || new Date()).getFullYear(), (base || new Date()).getMonth(), 1));
  const [hour24, setHour24] = useState(base ? base.getHours() : 17);
  const [minute, setMinute] = useState(base ? base.getMinutes() : 0);

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  const atCurMonth = year === today0.getFullYear() && month === today0.getMonth();

  const h12 = hour24 % 12 || 12;
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  const stepHour = (n) => setHour24((h) => (h + n + 24) % 24);
  const stepMin = (n) => setMinute((m) => (m + n + 60) % 60);

  const confirm = () => {
    const d = new Date(day);
    d.setHours(hour24, minute, 0, 0);
    onSet(d.toISOString());
    onClose();
  };

  return (
    <View style={styles.dpBackdrop}>
      <View style={styles.dpCard}>
        <View style={styles.dpHeader}>
          <TouchableOpacity onPress={() => setView(new Date(year, month - 1, 1))} disabled={atCurMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={20} color={atCurMonth ? COLORS.border : COLORS.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.dpMonth}>{view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
          <TouchableOpacity onPress={() => setView(new Date(year, month + 1, 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.dpDowRow}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <Text key={i} style={styles.dpDow}>{d}</Text>)}
        </View>
        <View style={styles.dpGrid}>
          {cells.map((d, i) => {
            if (!d) return <View key={i} style={styles.dpCell} />;
            const past = d < today0;
            const sel = d.getTime() === day.getTime();
            return (
              <TouchableOpacity key={i} style={styles.dpCell} disabled={past} onPress={() => setDay(d)} activeOpacity={0.7}>
                <View style={[styles.dpDayDot, sel && styles.dpDaySel]}>
                  <Text style={[styles.dpDayText, past && styles.dpDayPast, sel && styles.dpDaySelText]}>{d.getDate()}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.dpTimeRow}>
          <Text style={styles.dpTimeLabel}>Time</Text>
          <View style={styles.dpTimeCtrls}>
            <TouchableOpacity style={styles.dpStep} onPress={() => stepHour(1)}><Ionicons name="chevron-up" size={14} color={COLORS.text} /></TouchableOpacity>
            <Text style={styles.dpTimeVal}>{h12}</Text>
            <TouchableOpacity style={styles.dpStep} onPress={() => stepHour(-1)}><Ionicons name="chevron-down" size={14} color={COLORS.text} /></TouchableOpacity>
            <Text style={styles.dpColon}>:</Text>
            <TouchableOpacity style={styles.dpStep} onPress={() => stepMin(5)}><Ionicons name="chevron-up" size={14} color={COLORS.text} /></TouchableOpacity>
            <Text style={styles.dpTimeVal}>{String(minute).padStart(2, '0')}</Text>
            <TouchableOpacity style={styles.dpStep} onPress={() => stepMin(-5)}><Ionicons name="chevron-down" size={14} color={COLORS.text} /></TouchableOpacity>
            <TouchableOpacity style={styles.dpAmPm} onPress={() => stepHour(12)}><Text style={styles.dpAmPmText}>{ampm}</Text></TouchableOpacity>
          </View>
        </View>

        <View style={styles.dpBtns}>
          <TouchableOpacity style={styles.dpClear} onPress={() => { onSet(null); onClose(); }}>
            <Text style={styles.dpClearText}>No due date</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dpSet} onPress={confirm} activeOpacity={0.85}>
            <Text style={styles.dpSetText}>Set</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  dpBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  dpCard: { width: '100%', maxWidth: 340, backgroundColor: COLORS.surface, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg },
  dpHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  dpMonth: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  dpDowRow: { flexDirection: 'row', marginBottom: 4 },
  dpDow: { width: `${100 / 7}%`, textAlign: 'center', color: COLORS.textMuted, fontSize: 10, fontWeight: '700' },
  dpGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dpCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  dpDayDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dpDaySel: { backgroundColor: COLORS.primary },
  dpDayText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  dpDayPast: { color: COLORS.border },
  dpDaySelText: { color: '#fff', fontWeight: '800' },
  dpTimeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md },
  dpTimeLabel: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  dpTimeCtrls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dpStep: { width: 26, height: 26, borderRadius: 8, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  dpTimeVal: { color: COLORS.text, fontSize: 18, fontWeight: '800', minWidth: 26, textAlign: 'center', fontVariant: ['tabular-nums'] },
  dpColon: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  dpAmPm: { marginLeft: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.primary + '22', borderWidth: 1, borderColor: COLORS.primary + '44' },
  dpAmPmText: { color: COLORS.primary, fontSize: 13, fontWeight: '800' },
  dpBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  dpClear: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  dpClearText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  dpSet: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  dpSetText: { color: '#fff', fontWeight: '700', fontSize: 14 },
}));
