import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';
import { RESOURCES, RESOURCE_LEVELS, RESOURCE_LEVEL_FALLBACK, CATEGORY_META } from '../../constants/resources';

const INSTRUMENTS = ['Guitar', 'Bass'];

function openYouTube(phrase) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(phrase)}`;
  Linking.openURL(url).catch(() => {});
}

// A teacher-added link: open it directly if it's a URL, otherwise treat it as a
// YouTube search phrase.
function openResource(value) {
  const v = (value || '').trim();
  if (/^https?:\/\//i.test(v)) { Linking.openURL(v).catch(() => {}); return; }
  openYouTube(v);
}

function Pill({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ResourceItem({ item }) {
  return (
    <View style={styles.item}>
      <Text style={styles.itemTitle}>{item.title}</Text>
      <Text style={styles.itemDetail}>{item.detail}</Text>
      {item.yt && (
        <TouchableOpacity style={styles.ytRow} onPress={() => openYouTube(item.yt)} activeOpacity={0.7}>
          <Ionicons name="logo-youtube" size={15} color="#FF0000" />
          <Text style={styles.ytText} numberOfLines={1}>Watch: {item.yt}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function ResourceLibraryScreen() {
  const [instrument, setInstrument] = useState('Guitar');
  const [level, setLevel] = useState('Beginner');

  // Teacher-added resources, stored on the teacher's own user doc.
  const [custom, setCustom] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then((s) => setCustom(Array.isArray(s.data()?.customResources) ? s.data().customResources : []))
      .catch(() => {});
  }, []);

  const saveCustom = (next) => {
    setCustom(next);
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { customResources: next }).catch(() => {});
  };

  const addResource = () => {
    if (!newTitle.trim() || !newUrl.trim()) {
      Alert.alert('Add a title and link', 'Both a title and a YouTube link (or search) are needed.');
      return;
    }
    const item = { id: Date.now().toString(), title: newTitle.trim(), url: newUrl.trim(), instrument, level };
    saveCustom([item, ...custom]);
    setNewTitle(''); setNewUrl(''); setShowAdd(false);
  };

  const removeResource = (item) => {
    Alert.alert('Remove resource?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => saveCustom(custom.filter((x) => x.id !== item.id)) },
    ]);
  };

  // Show the teacher's own links that match the current instrument + level.
  const myResources = custom.filter((r) => r.instrument === instrument && r.level === level);

  const effLevel = RESOURCES[instrument]?.[level] ? level : (RESOURCE_LEVEL_FALLBACK[level] || level);
  const data = RESOURCES[instrument]?.[effLevel] || {};
  const categories = Object.keys(CATEGORY_META).filter((c) => (data[c] || []).length > 0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>TEACHING LIBRARY</Text>
        <Text style={styles.title}>Resources</Text>
        <Text style={styles.subtitle}>Ready-to-use exercises, tips and songs to hand to your students.</Text>

        <View style={styles.pillRow}>
          {INSTRUMENTS.map((i) => (
            <Pill key={i} label={i} active={instrument === i} onPress={() => setInstrument(i)} />
          ))}
        </View>
        <View style={styles.pillRow}>
          {RESOURCE_LEVELS.map((l) => (
            <Pill key={l} label={l} active={level === l} onPress={() => setLevel(l)} />
          ))}
        </View>

        {/* Teacher's own added resources for this instrument + level */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="bookmark" size={16} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Your resources</Text>
            <TouchableOpacity style={styles.addResBtn} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
              <Ionicons name="add" size={16} color={COLORS.primary} />
              <Text style={styles.addResBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
          {myResources.length === 0 ? (
            <Text style={styles.emptyRes}>No links added for {instrument} · {level} yet. Tap “Add” to save one.</Text>
          ) : (
            myResources.map((r) => (
              <View key={r.id} style={styles.item}>
                <View style={styles.customRow}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{r.title}</Text>
                  <TouchableOpacity onPress={() => removeResource(r)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={17} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.ytRow} onPress={() => openResource(r.url)} activeOpacity={0.7}>
                  <Ionicons name="logo-youtube" size={15} color="#FF0000" />
                  <Text style={styles.ytText} numberOfLines={1}>Open: {r.url}</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {categories.map((cat) => {
          const meta = CATEGORY_META[cat];
          return (
            <View key={cat} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name={meta.icon} size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>{meta.label}</Text>
              </View>
              {data[cat].map((item, idx) => (
                <ResourceItem key={`${cat}_${idx}`} item={item} />
              ))}
            </View>
          );
        })}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add resource</Text>
              <Text style={styles.modalSub}>Saved under {instrument} · {level}</Text>
              <TextInput
                style={styles.input}
                placeholder="Title (e.g. Beginner strumming drill)"
                placeholderTextColor={COLORS.textMuted}
                value={newTitle}
                onChangeText={setNewTitle}
              />
              <TextInput
                style={styles.input}
                placeholder="YouTube link or search phrase"
                placeholderTextColor={COLORS.textMuted}
                value={newUrl}
                onChangeText={setNewUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowAdd(false); setNewTitle(''); setNewUrl(''); }}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={addResource}>
                  <Text style={styles.saveText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg },
  kicker: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.xs },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginTop: SPACING.xs, marginBottom: SPACING.lg },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  pill: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  pillTextActive: { color: COLORS.text },
  section: { marginTop: SPACING.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: SPACING.sm },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  item: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: SPACING.md,
    marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  itemTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  itemDetail: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19 },
  ytRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm },
  ytText: { color: COLORS.textSecondary, fontSize: 12, flexShrink: 1, textDecorationLine: 'underline' },
  addResBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: COLORS.primary },
  addResBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  emptyRes: { color: COLORS.textMuted, fontSize: 13, lineHeight: 19 },
  customRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, paddingBottom: SPACING.xl },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  modalSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, marginBottom: SPACING.md },
  input: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 14, marginBottom: SPACING.sm },
  modalBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.card },
  cancelText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.primary },
  saveText: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
});
