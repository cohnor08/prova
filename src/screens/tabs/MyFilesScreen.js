import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING, themedStyles } from '../../constants/theme';
import { useThemeSync } from '../../lib/ThemeContext';
import TaskAttachments from '../../components/TaskAttachments';

// Every file a teacher has attached to a task, gathered in one place, plus the
// student's own (users/{uid}.myFiles, added from the web app's My files card).
// Grouped by the task each came from, so "the PDF for Wish You Were Here" is
// findable after the task itself has left Today.
export default function MyFilesScreen({ navigation }) {
  useThemeSync();
  const [me, setMe] = useState(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setMe({}); return undefined; }
    return onSnapshot(doc(db, 'users', uid), (snap) => setMe(snap.data() || {}), () => setMe({}));
  }, []);

  // One group per task with files; a file attached to several tasks shows once.
  const seen = new Set();
  const groups = (Array.isArray(me?.assignedTasks) ? me.assignedTasks : [])
    .map((t) => ({
      title: t.title,
      files: (Array.isArray(t.attachments) ? t.attachments : []).filter((a) => {
        if (!a?.url || seen.has(a.url)) return false;
        seen.add(a.url);
        return true;
      }),
    }))
    .filter((g) => g.files.length > 0);
  const own = (Array.isArray(me?.myFiles) ? me.myFiles : []).filter((a) => a?.url);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>My files</Text>
        <View style={{ width: 64 }} />
      </View>

      {me === null ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : groups.length === 0 && own.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="folder-open-outline" size={40} color={COLORS.textMuted} />
          <Text style={styles.empty}>Nothing here yet</Text>
          <Text style={styles.emptySub}>Sheet music and backing tracks your teacher attaches to a task show up here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {groups.length > 0 && <Text style={styles.sectionLabel}>FROM YOUR TEACHER</Text>}
          {groups.map((g, i) => (
            <View key={`${g.title}_${i}`} style={styles.group}>
              <Text style={styles.groupTitle} numberOfLines={2}>{g.title}</Text>
              <TaskAttachments attachments={g.files} />
            </View>
          ))}
          {own.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: SPACING.md }]}>YOURS</Text>
              <View style={styles.group}><TaskAttachments attachments={own} /></View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 64 },
  backText: { color: COLORS.primary, fontSize: 16, fontWeight: '600' },
  navTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  empty: { color: COLORS.text, fontSize: 15, fontWeight: '700', marginTop: SPACING.md },
  emptySub: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  content: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  sectionLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: SPACING.sm },
  group: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.sm },
  groupTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700', marginBottom: SPACING.sm },
}));
