import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';

const parseYmd = (s) => { const [y, m, d] = (s || '').split('-').map(Number); return new Date(y, m - 1, d); };
function prettyDate(s) {
  const d = parseYmd(s);
  return isNaN(d) ? s : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function timeLabel(v) {
  const [h, m] = (v || '').split(':').map(Number);
  if (isNaN(h)) return '';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// A dedicated full screen for one lesson's note — pushed from the calendar.
// Notes live in the teacher's `attendance` map alongside that lesson's
// status/mark, keyed by `${lessonId}__${date}`.
export default function LessonNoteScreen({ navigation, route }) {
  useThemeSync();
  const { lessonId, dateStr, studentName, studentUid, time, note: initialNote } = route.params || {};
  const key = `${lessonId}__${dateStr}`;
  const [text, setText] = useState(initialNote || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) { navigation.goBack(); return; }
    setSaving(true);
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const att = snap.data()?.attendance || {};
      const cur = att[key] || {};
      const rec = { ...cur, note: text.trim(), studentUid, studentName, date: dateStr };
      const next = { ...att };
      if (!rec.status && !rec.mark && !rec.note) delete next[key];
      else next[key] = rec;
      await updateDoc(doc(db, 'users', uid), { attendance: next });
      navigation.goBack();
    } catch (e) {
      setSaving(false);
      Alert.alert('Error', "Couldn't save the note. Please try again.");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Lesson note</Text>
        <TouchableOpacity onPress={save} disabled={saving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.saveBtn}>
          {saving ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Text style={styles.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.student} numberOfLines={1}>{studentName || 'Lesson'}</Text>
          <Text style={styles.meta}>{prettyDate(dateStr)}{time ? ` · ${timeLabel(time)}` : ''}</Text>
          <TextInput
            style={styles.input}
            placeholder="What did you cover? What should they work on before next time?"
            placeholderTextColor={COLORS.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            textAlignVertical="top"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 64 },
  backText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  saveBtn: { width: 64, alignItems: 'flex-end' },
  saveText: { color: COLORS.primary, fontSize: 15, fontWeight: '800' },
  content: { padding: SPACING.lg },
  student: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  meta: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600', marginTop: 2, marginBottom: SPACING.lg },
  input: {
    backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    color: COLORS.text, fontSize: 15, lineHeight: 22, padding: SPACING.md, minHeight: 240,
  },
}));
