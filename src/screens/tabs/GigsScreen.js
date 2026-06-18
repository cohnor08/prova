import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';

const PRE_GIG_WINDOW = 14; // days before a gig that Pre-Gig Mode kicks in

// Local YYYY-MM-DD (avoids the timezone shift that toISOString() introduces).
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Whole days from today until a YYYY-MM-DD date (0 = today, negative = past).
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  return Math.round((d - today) / 86400000);
}

// Tap-a-day month calendar — no external date-picker dependency.
function MiniCalendar({ selected, onSelect }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const atCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const step = (delta) => setView(new Date(year, month + delta, 1));

  return (
    <View style={calStyles.wrap}>
      <View style={calStyles.header}>
        <TouchableOpacity onPress={() => step(-1)} disabled={atCurrentMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={20} color={atCurrentMonth ? COLORS.border : COLORS.textSecondary} />
        </TouchableOpacity>
        <Text style={calStyles.monthLabel}>
          {view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={() => step(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={calStyles.dowRow}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} style={calStyles.dowLabel}>{d}</Text>
        ))}
      </View>
      <View style={calStyles.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={i} style={calStyles.cell} />;
          const key = ymd(day);
          const isPast = day < today;
          const isSelected = key === selected;
          return (
            <TouchableOpacity
              key={i}
              style={calStyles.cell}
              disabled={isPast}
              onPress={() => onSelect(key)}
              activeOpacity={0.7}
            >
              <View style={[calStyles.dayDot, isSelected && calStyles.dayDotSelected]}>
                <Text style={[
                  calStyles.dayText,
                  isPast && calStyles.dayTextPast,
                  isSelected && calStyles.dayTextSelected,
                ]}>
                  {day.getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function GigsScreen() {
  const [gigs, setGigs] = useState([]);
  const [setlists, setSetlists] = useState([]);
  const [showAddGig, setShowAddGig] = useState(false);
  const [newGigName, setNewGigName] = useState('');
  const [newGigDate, setNewGigDate] = useState('');         // YYYY-MM-DD
  const [newGigSetlistId, setNewGigSetlistId] = useState(null);

  const loadData = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'users', uid));
      const data = snap.data();
      setGigs(Array.isArray(data?.gigs) ? data.gigs : []);
      setSetlists(Array.isArray(data?.setlists) ? data.setlists : []);
    } catch (err) {
      console.warn('Failed to load gigs:', err);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const saveGigs = async (next) => {
    setGigs(next);
    try {
      const uid = auth.currentUser?.uid;
      if (uid) await setDoc(doc(db, 'users', uid), { gigs: next }, { merge: true });
    } catch (err) {
      console.warn('Failed to save gigs:', err);
      Alert.alert('Error', "Couldn't save your gig. Check your connection and try again.");
    }
  };

  const addGig = () => {
    const name = newGigName.trim();
    if (!name || !newGigDate) {
      Alert.alert('Almost there', 'Add a name and pick a date for the gig.');
      return;
    }
    const gig = {
      id: `gig_${Date.now()}`,
      name: name.slice(0, 60),
      date: newGigDate,
      setlistId: newGigSetlistId || null,
      createdAt: new Date().toISOString(),
    };
    saveGigs([...gigs, gig].sort((a, b) => a.date.localeCompare(b.date)));
    setNewGigName('');
    setNewGigDate('');
    setNewGigSetlistId(null);
    setShowAddGig(false);
    Keyboard.dismiss();
  };

  const removeGig = (id) => saveGigs(gigs.filter((g) => g.id !== id));

  const upcomingGigs = [...gigs]
    .filter((g) => daysUntil(g.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sub}>
          Add a performance date and Prova flips into Pre-Gig Mode {PRE_GIG_WINDOW} days before —
          your song tasks jump to the top of Practice.
        </Text>

        {/* Add-gig form */}
        {showAddGig ? (
          <View style={styles.gigForm}>
            <TextInput
              style={styles.gigInput}
              placeholder="Gig name (e.g. Sarah's wedding)"
              placeholderTextColor={COLORS.textMuted}
              value={newGigName}
              onChangeText={setNewGigName}
              maxLength={60}
            />
            <Text style={styles.gigFormLabel}>Date</Text>
            <MiniCalendar selected={newGigDate} onSelect={setNewGigDate} />

            {setlists.length > 0 && (
              <>
                <Text style={styles.gigFormLabel}>Setlist (optional)</Text>
                <View style={styles.gigSetlistChips}>
                  {setlists.map((s) => {
                    const on = newGigSetlistId === s.id;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.gigChip, on && styles.gigChipOn]}
                        onPress={() => setNewGigSetlistId(on ? null : s.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.gigChipText, on && styles.gigChipTextOn]} numberOfLines={1}>{s.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.gigFormBtns}>
              <TouchableOpacity
                style={styles.gigCancelBtn}
                onPress={() => { setShowAddGig(false); setNewGigName(''); setNewGigDate(''); setNewGigSetlistId(null); }}
              >
                <Text style={styles.gigCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.gigSaveBtn} onPress={addGig} activeOpacity={0.85}>
                <Text style={styles.gigSaveText}>Add gig</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.gigNewBtn} activeOpacity={0.85} onPress={() => setShowAddGig(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.gigNewBtnText}>Add a gig</Text>
          </TouchableOpacity>
        )}

        {/* Upcoming list */}
        {upcomingGigs.length === 0 ? (
          !showAddGig && (
            <View style={styles.gigEmptyBox}>
              <Ionicons name="calendar-outline" size={26} color={COLORS.textMuted} style={{ marginBottom: 6 }} />
              <Text style={styles.gigEmptyBoxText}>No gigs yet — add one to unlock Pre-Gig Mode.</Text>
            </View>
          )
        ) : (
          <View style={{ marginTop: SPACING.md }}>
            {upcomingGigs.map((g) => {
              const days = daysUntil(g.date);
              const soon = days <= PRE_GIG_WINDOW;
              const sl = g.setlistId ? setlists.find((s) => s.id === g.setlistId) : null;
              const dateLabel = new Date(`${g.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              return (
                <View key={g.id} style={styles.gigRow}>
                  <View style={[styles.gigCountdown, soon && styles.gigCountdownSoon]}>
                    <Text style={[styles.gigCountdownNum, soon && { color: COLORS.primary }]}>{days}</Text>
                    <Text style={styles.gigCountdownUnit}>{days === 1 ? 'day' : 'days'}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.gigName} numberOfLines={1}>{g.name}</Text>
                    <Text style={styles.gigMeta} numberOfLines={1}>
                      {dateLabel}{sl ? ` · ${sl.name}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => Alert.alert('Remove gig?', g.name, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => removeGig(g.id) },
                    ])}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  sub: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: SPACING.lg },

  gigNewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12,
  },
  gigNewBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  gigForm: { gap: SPACING.sm, marginBottom: SPACING.md },
  gigInput: { backgroundColor: COLORS.surface, color: COLORS.text, borderRadius: 10, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  gigFormLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: SPACING.xs },
  gigSetlistChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  gigChip: { paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, maxWidth: '100%' },
  gigChipOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '22' },
  gigChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  gigChipTextOn: { color: COLORS.primary },
  gigFormBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  gigCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  gigCancelText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  gigSaveBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  gigSaveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  gigEmptyBox: { alignItems: 'center', paddingVertical: SPACING.xl },
  gigEmptyBoxText: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center' },
  gigRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  gigCountdown: { width: 46, height: 46, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  gigCountdownSoon: { borderColor: COLORS.primary + '66', backgroundColor: COLORS.primary + '14' },
  gigCountdownNum: { color: COLORS.text, fontSize: 18, fontWeight: '900', lineHeight: 20 },
  gigCountdownUnit: { color: COLORS.textMuted, fontSize: 9, fontWeight: '600' },
  gigName: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  gigMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 1 },
});

const calStyles = StyleSheet.create({
  wrap: { backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm },
  monthLabel: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  dowRow: { flexDirection: 'row', marginBottom: 4 },
  dowLabel: { width: `${100 / 7}%`, textAlign: 'center', color: COLORS.textMuted, fontSize: 10, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  dayDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayDotSelected: { backgroundColor: COLORS.primary },
  dayText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  dayTextPast: { color: COLORS.border },
  dayTextSelected: { color: COLORS.text, fontWeight: '800' },
});
