import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image,
} from 'react-native';
import Ghost from '../../components/Ghost';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { pickMedia, captureMedia, uploadChatMedia } from '../../lib/media';
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
  // Photos/clips on this lesson — a shot of the sheet music, or how a passage
  // should sound. Same `attachments` field Studio writes, so a note attached on
  // the web shows here and vice versa.
  const [atts, setAtts] = useState([]);
  const [attBusy, setAttBusy] = useState(false);

  // The caller only passes the note text, so read the record for anything
  // already attached — otherwise saving here would wipe it.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let alive = true;
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (!alive) return;
        const rec = snap.data()?.attendance?.[key];
        if (Array.isArray(rec?.attachments)) setAtts(rec.attachments);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [key]);

  // chatMedia/lesson_{teacherUid}/… — already writable by a teacher under
  // storage.rules (only the proof_* prefix is locked to its owner).
  const addAttachment = async (pick) => {
    if (attBusy) return;
    const picked = await pick();
    if (!picked) return;
    if (picked.error) { Alert.alert('Cannot attach', picked.error); return; }
    setAttBusy(true);
    try {
      const uid = auth.currentUser.uid;
      const url = await uploadChatMedia(picked.uri, `lesson_${uid}`, picked.type);
      // pickMedia says 'image'; the student's Notes screen keys on 'photo'.
      setAtts((prev) => [...prev, {
        type: picked.type === 'video' ? 'video' : 'photo',
        url,
        title: picked.type === 'video' ? 'Video' : 'Photo',
      }]);
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'That file could not be uploaded.');
    } finally {
      setAttBusy(false);
    }
  };

  const save = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) { navigation.goBack(); return; }
    setSaving(true);
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const att = snap.data()?.attendance || {};
      const cur = att[key] || {};
      const rec = { ...cur, note: text.trim(), studentUid, studentName, date: dateStr, attachments: atts };
      const next = { ...att };
      // A note that is only a photo is still a note — attachments have to count
      // here or saving one on its own would delete the record.
      if (!rec.status && !rec.mark && !rec.note && !atts.length) delete next[key];
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
          {saving ? <Ghost size="small" color={COLORS.primary} /> : <Text style={styles.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1, minWidth: 0 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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

          <Text style={styles.attLabel}>ATTACHMENTS</Text>
          {atts.map((a, i) => (
            <View key={`${a.url}_${i}`} style={styles.attRow}>
              {a.type === 'photo'
                ? <Image source={{ uri: a.url }} style={styles.attThumb} />
                : <View style={[styles.attThumb, styles.attThumbVid]}>
                    <Ionicons name={a.type === 'video' ? 'videocam' : 'link'} size={16} color={COLORS.primary} />
                  </View>}
              <Text style={styles.attName} numberOfLines={1}>{a.title || 'Attachment'}</Text>
              <TouchableOpacity
                onPress={() => setAtts((prev) => prev.filter((_, k) => k !== i))}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.attBtnRow}>
            <TouchableOpacity style={[styles.attBtn, attBusy && styles.attBtnOff]} onPress={() => addAttachment(pickMedia)} disabled={attBusy} activeOpacity={0.8}>
              <Ionicons name="image-outline" size={16} color={COLORS.primary} />
              <Text style={styles.attBtnText}>Photo or video</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.attBtn, attBusy && styles.attBtnOff]} onPress={() => addAttachment(captureMedia)} disabled={attBusy} activeOpacity={0.8}>
              <Ionicons name="camera-outline" size={16} color={COLORS.primary} />
              <Text style={styles.attBtnText}>Record</Text>
            </TouchableOpacity>
          </View>
          {attBusy ? (
            <View style={styles.attBusyRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.attHint}>Uploading…</Text>
            </View>
          ) : null}
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
  attLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  attRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  attThumb: { width: 38, height: 38, borderRadius: 8, backgroundColor: COLORS.card },
  attThumbVid: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  // flex:1 + minWidth:0 so a long name shrinks rather than pushing the remove
  // button off the row (CLAUDE.md truncation rules).
  attName: { flex: 1, minWidth: 0, color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  attBtnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  attBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  attBtnOff: { opacity: 0.5 },
  attBtnText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  attBusyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md },
  attHint: { color: COLORS.textMuted, fontSize: 12 },
}));
