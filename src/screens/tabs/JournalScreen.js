// Practice journal — a private, structured reflection log. Each entry captures
// a written reflection plus what you focused on, how productive it felt (1–5)
// and your mood. A stats strip up top surfaces a journaling streak, totals and
// this week's count. Reflection is one of the strongest drivers of deliberate
// practice and it costs nothing (no AI). Entries live on the user's own doc
// (journalEntries) so no new backend rules are needed. Older entries that only
// have text/mood keep working — every structured field is optional.
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Keyboard,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';
import { track } from '../../lib/analytics';

const MOODS = ['Tough', 'Okay', 'Good', 'Great'];
const MOOD_COLOR = { Tough: '#dc2626', Okay: '#F5C044', Good: '#3B82F6', Great: '#16a34a' };
const FOCI = ['Technique', 'Songs', 'Scales', 'Theory', 'Timing', 'Improv', 'Repertoire', 'Ear'];
const PROMPTS = [
  'What went well today, and what felt hard?',
  'What is one thing you want to improve next session?',
  'Did anything finally click today?',
  'How did your hands / timing / tone feel?',
  'What did you spend the most time on?',
  'What will you practise tomorrow?',
];
const dateLabel = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// Consecutive calendar days (ending today or yesterday) that have an entry.
function journalStreak(entries) {
  if (!entries.length) return 0;
  const days = new Set(entries.map((e) => new Date(e.date).toDateString()));
  const d = new Date();
  if (!days.has(d.toDateString())) {
    d.setDate(d.getDate() - 1);
    if (!days.has(d.toDateString())) return 0;
  }
  let streak = 0;
  while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

// ── small reusable pickers ───────────────────────────────────────────────
function FocusPicker({ value, onToggle }) {
  return (
    <View style={styles.chipWrap}>
      {FOCI.map((f) => {
        const on = value.includes(f);
        return (
          <TouchableOpacity key={f} style={[styles.focusChip, on && styles.focusChipOn]} onPress={() => onToggle(f)} activeOpacity={0.8}>
            <Text style={[styles.focusChipText, on && { color: '#fff' }]}>{f}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
function StarPicker({ value, onSet }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onSet(value === n ? null : n)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} activeOpacity={0.7}>
          <Ionicons name={value >= n ? 'star' : 'star-outline'} size={26} color={value >= n ? '#F5C044' : COLORS.textMuted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}
function MoodPicker({ value, onSet }) {
  return (
    <View style={styles.moodRow}>
      {MOODS.map((m) => (
        <TouchableOpacity
          key={m}
          style={[styles.moodChip, value === m && { backgroundColor: MOOD_COLOR[m], borderColor: MOOD_COLOR[m] }]}
          onPress={() => onSet(value === m ? null : m)}
          activeOpacity={0.8}
        >
          <Text style={[styles.moodText, value === m && { color: '#fff' }]}>{m}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function JournalScreen({ navigation }) {
  useThemeSync();
  const [entries, setEntries] = useState([]);
  const [text, setText] = useState('');
  const [mood, setMood] = useState(null);
  const [rating, setRating] = useState(null);
  const [focus, setFocus] = useState([]);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(null);   // entry being viewed/edited, or null
  const [eText, setEText] = useState('');
  const [eMood, setEMood] = useState(null);
  const [eRating, setERating] = useState(null);
  const [eFocus, setEFocus] = useState([]);

  const prompt = PROMPTS[new Date().getDate() % PROMPTS.length];

  const load = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const d = (await getDoc(doc(db, 'users', uid))).data() || {};
      setEntries(Array.isArray(d.journalEntries) ? d.journalEntries : []);
    } catch (e) { /* keep whatever we have */ }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = (list, setter, tag) => setter(list.includes(tag) ? list.filter((x) => x !== tag) : [...list, tag]);

  const streak = journalStreak(entries);
  const weekAgo = Date.now() - 7 * 86400000;
  const thisWeek = entries.filter((e) => new Date(e.date).getTime() >= weekAgo).length;

  const save = async () => {
    const body = text.trim();
    if (!body || saving) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    Keyboard.dismiss();
    setSaving(true);
    const entry = { id: String(Date.now()), date: new Date().toISOString(), text: body, mood, rating, focus };
    const nextEntries = [entry, ...entries];
    setEntries(nextEntries); setText(''); setMood(null); setRating(null); setFocus([]);   // optimistic
    try {
      await updateDoc(doc(db, 'users', uid), { journalEntries: nextEntries });
      track('journal_entry_added', { hasMood: !!mood, rating: rating || 0, focusCount: focus.length, length: body.length });
    } catch (e) {
      setEntries(entries); setText(body); setMood(entry.mood); setRating(entry.rating); setFocus(entry.focus);
      Alert.alert('Could not save', 'Please try again.');
    }
    setSaving(false);
  };

  const openEntry = (e) => {
    setEditing(e); setEText(e.text); setEMood(e.mood || null); setERating(e.rating || null); setEFocus(Array.isArray(e.focus) ? e.focus : []);
  };
  const closeEntry = () => { Keyboard.dismiss(); setEditing(null); };

  const saveEdit = async () => {
    const body = eText.trim();
    if (!body || !editing) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    Keyboard.dismiss();
    const nextEntries = entries.map((e) => (e.id === editing.id
      ? { ...e, text: body, mood: eMood, rating: eRating, focus: eFocus, editedAt: new Date().toISOString() } : e));
    setEntries(nextEntries); setEditing(null);   // optimistic
    try { await updateDoc(doc(db, 'users', uid), { journalEntries: nextEntries }); track('journal_entry_edited', {}); } catch (e) { load(); }
  };

  const remove = (id) => {
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const uid = auth.currentUser?.uid;
          if (!uid) return;
          const nextEntries = entries.filter((e) => e.id !== id);
          setEntries(nextEntries); setEditing(null);
          try { await updateDoc(doc(db, 'users', uid), { journalEntries: nextEntries }); } catch (e) { load(); }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Practice Journal</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.stats}>
          {[
            { n: streak, l: streak === 1 ? 'day streak' : 'day streak', icon: 'flame-outline' },
            { n: entries.length, l: 'entries', icon: 'book-outline' },
            { n: thisWeek, l: 'this week', icon: 'calendar-outline' },
          ].map((s, i) => (
            <View key={i} style={styles.statCell}>
              <Ionicons name={s.icon} size={16} color={COLORS.primary} />
              <Text style={styles.statNum}>{s.n}</Text>
              <Text style={styles.statLabel}>{s.l}</Text>
            </View>
          ))}
        </View>

        <View style={styles.composer}>
          <Text style={styles.prompt}>{prompt}</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Write a few lines about today's practice…"
            placeholderTextColor={COLORS.textMuted}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.fieldLabel}>WHAT DID YOU WORK ON?</Text>
          <FocusPicker value={focus} onToggle={(t) => toggle(focus, setFocus, t)} />
          <Text style={styles.fieldLabel}>HOW PRODUCTIVE?</Text>
          <StarPicker value={rating} onSet={setRating} />
          <Text style={styles.fieldLabel}>MOOD</Text>
          <MoodPicker value={mood} onSet={setMood} />
          <TouchableOpacity
            style={[styles.saveBtn, (!text.trim() || saving) && styles.saveBtnOff]}
            onPress={save}
            disabled={!text.trim() || saving}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.saveText}>Save entry</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>PAST ENTRIES</Text>
        {entries.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Ionicons name="book-outline" size={28} color={COLORS.primary} /></View>
            <Text style={styles.emptyText}>No entries yet. Your reflections will show up here.</Text>
          </View>
        ) : (
          entries.map((e) => (
            <TouchableOpacity key={e.id} style={styles.entry} onPress={() => openEntry(e)} activeOpacity={0.7}>
              <View style={styles.entryHead}>
                <Text style={styles.entryDate}>{dateLabel(e.date)}</Text>
                {!!e.rating && (
                  <View style={styles.entryStars}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Ionicons key={n} name={e.rating >= n ? 'star' : 'star-outline'} size={11} color={e.rating >= n ? '#F5C044' : COLORS.textMuted} />
                    ))}
                  </View>
                )}
                {!!e.mood && <Text style={[styles.entryMood, { color: MOOD_COLOR[e.mood] || COLORS.textSecondary }]}>{e.mood}</Text>}
                <View style={{ flex: 1 }} />
                {!!e.editedAt && <Text style={styles.editedTag}>edited</Text>}
                <Ionicons name="create-outline" size={16} color={COLORS.textMuted} />
              </View>
              {Array.isArray(e.focus) && e.focus.length > 0 && (
                <View style={styles.entryFocusRow}>
                  {e.focus.map((f) => <Text key={f} style={styles.entryFocus}>{f}</Text>)}
                </View>
              )}
              <Text style={styles.entryText}>{e.text}</Text>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: SPACING.xxl || 40 }} />
      </ScrollView>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={closeEntry}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalDate}>{editing ? dateLabel(editing.date) : ''}</Text>
              <TouchableOpacity onPress={closeEntry} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TextInput
                style={styles.input}
                value={eText}
                onChangeText={setEText}
                placeholder="Your reflection…"
                placeholderTextColor={COLORS.textMuted}
                multiline
                textAlignVertical="top"
              />
              <Text style={styles.fieldLabel}>WHAT DID YOU WORK ON?</Text>
              <FocusPicker value={eFocus} onToggle={(t) => toggle(eFocus, setEFocus, t)} />
              <Text style={styles.fieldLabel}>HOW PRODUCTIVE?</Text>
              <StarPicker value={eRating} onSet={setERating} />
              <Text style={styles.fieldLabel}>MOOD</Text>
              <MoodPicker value={eMood} onSet={setEMood} />
              <TouchableOpacity
                style={[styles.saveBtn, !eText.trim() && styles.saveBtnOff]}
                onPress={saveEdit}
                disabled={!eText.trim()}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.saveText}>Save changes</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => editing && remove(editing.id)} style={styles.deleteRow} hitSlop={{ top: 8, bottom: 8 }}>
                <Ionicons name="trash-outline" size={15} color="#dc2626" />
                <Text style={styles.deleteText}>Delete entry</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  body: { padding: SPACING.lg, paddingBottom: 40 },
  stats: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, paddingVertical: SPACING.md, marginBottom: SPACING.lg },
  statCell: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { color: COLORS.text, fontSize: 22, fontWeight: '900' },
  statLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700' },
  composer: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, marginBottom: SPACING.xl },
  prompt: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600', marginBottom: SPACING.md, lineHeight: 20 },
  input: { color: COLORS.text, fontSize: 15, minHeight: 96, lineHeight: 22, backgroundColor: COLORS.background, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md },
  fieldLabel: { color: COLORS.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.5, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  focusChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  focusChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  focusChipText: { color: COLORS.textSecondary, fontSize: 12.5, fontWeight: '700' },
  starRow: { flexDirection: 'row', gap: SPACING.sm },
  moodRow: { flexDirection: 'row', gap: SPACING.sm },
  moodChip: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, alignItems: 'center' },
  moodText: { color: COLORS.textSecondary, fontSize: 12.5, fontWeight: '700' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 13, marginTop: SPACING.xl },
  saveBtnOff: { opacity: 0.4 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  sectionLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: SPACING.md },
  empty: { alignItems: 'center', paddingVertical: SPACING.xl },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.primary + '14', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  emptyText: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
  entry: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.md },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 6 },
  entryDate: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  entryStars: { flexDirection: 'row' },
  entryMood: { fontSize: 12, fontWeight: '700' },
  editedTag: { color: COLORS.textMuted, fontSize: 11, fontStyle: 'italic', marginRight: 6 },
  entryFocusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  entryFocus: { color: COLORS.primary, backgroundColor: COLORS.primary + '18', fontSize: 11, fontWeight: '700', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, overflow: 'hidden' },
  entryText: { color: COLORS.textSecondary, fontSize: 14.5, lineHeight: 21 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: SPACING.lg },
  modalCard: { backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, maxHeight: '88%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  modalDate: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  deleteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: SPACING.md },
  deleteText: { color: '#dc2626', fontSize: 14, fontWeight: '700' },
}));
