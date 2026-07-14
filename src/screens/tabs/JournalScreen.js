// Practice journal — a private reflection log. Write how a session went; look
// back over past entries. Reflection is one of the strongest drivers of
// deliberate practice, and it costs nothing (no AI). Entries live on the user's
// own doc (journalEntries) so no new backend rules are needed.
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';
import { track } from '../../lib/analytics';

const MOODS = ['Tough', 'Okay', 'Good', 'Great'];
const MOOD_COLOR = { Tough: '#dc2626', Okay: '#F5C044', Good: '#3B82F6', Great: '#16a34a' };
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

export default function JournalScreen({ navigation }) {
  const [entries, setEntries] = useState([]);
  const [text, setText] = useState('');
  const [mood, setMood] = useState(null);
  const [saving, setSaving] = useState(false);
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

  const save = async () => {
    const body = text.trim();
    if (!body || saving) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    Keyboard.dismiss();
    setSaving(true);
    const entry = { id: String(Date.now()), date: new Date().toISOString(), text: body, mood };
    const nextEntries = [entry, ...entries];
    setEntries(nextEntries); setText(''); setMood(null);   // optimistic
    try {
      await updateDoc(doc(db, 'users', uid), { journalEntries: nextEntries });
      track('journal_entry_added', { hasMood: !!mood, length: body.length });
    } catch (e) {
      setEntries(entries); setText(body); setMood(entry.mood);
      Alert.alert('Could not save', 'Please try again.');
    }
    setSaving(false);
  };

  const remove = (id) => {
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const uid = auth.currentUser?.uid;
          if (!uid) return;
          const nextEntries = entries.filter((e) => e.id !== id);
          setEntries(nextEntries);
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
          <View style={styles.moodRow}>
            {MOODS.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.moodChip, mood === m && { backgroundColor: MOOD_COLOR[m], borderColor: MOOD_COLOR[m] }]}
                onPress={() => setMood(mood === m ? null : m)}
                activeOpacity={0.8}
              >
                <Text style={[styles.moodText, mood === m && { color: '#fff' }]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
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
            <View key={e.id} style={styles.entry}>
              <View style={styles.entryHead}>
                <Text style={styles.entryDate}>{dateLabel(e.date)}</Text>
                {!!e.mood && <Text style={[styles.entryMood, { color: MOOD_COLOR[e.mood] || COLORS.textSecondary }]}>{e.mood}</Text>}
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => remove(e.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={styles.entryText}>{e.text}</Text>
            </View>
          ))
        )}
        <View style={{ height: SPACING.xxl || 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  body: { padding: SPACING.lg, paddingBottom: 40 },
  composer: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, marginBottom: SPACING.xl },
  prompt: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600', marginBottom: SPACING.md, lineHeight: 20 },
  input: { color: COLORS.text, fontSize: 15, minHeight: 96, lineHeight: 22, backgroundColor: COLORS.background, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md },
  moodRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  moodChip: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, alignItems: 'center' },
  moodText: { color: COLORS.textSecondary, fontSize: 12.5, fontWeight: '700' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 13, marginTop: SPACING.lg },
  saveBtnOff: { opacity: 0.4 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  sectionLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: SPACING.md },
  empty: { alignItems: 'center', paddingVertical: SPACING.xl },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.primary + '14', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  emptyText: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
  entry: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.md },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 6 },
  entryDate: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  entryMood: { fontSize: 12, fontWeight: '700' },
  entryText: { color: COLORS.textSecondary, fontSize: 14.5, lineHeight: 21 },
});
