import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const CATEGORY_COLORS = {
  warmup: '#06B6D4',
  technique: '#3B82F6',
  theory: '#8B5CF6',
  ear_training: '#10B981',
  repertoire: '#0EA5E9',
  improvisation: '#6366F1',
};

export default function PlanScreen() {
  const [plan, setPlan] = useState(null);
  const [selectedDay, setSelectedDay] = useState(
    new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  );
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    React.useCallback(() => {
      loadPlan();
    }, [])
  );

  const loadPlan = async () => {
    try {
      const uid = auth.currentUser.uid;
      const snap = await getDoc(doc(db, 'users', uid));
      setPlan(snap.data()?.practicePlan?.weeklyPlan || null);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading your plan...</Text>
      </View>
    );
  }

  const selectedSessions = plan?.[selectedDay]?.sessions || [];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  return (
    <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Weekly Plan</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
        {DAY_ORDER.map((day) => {
          const hasSessions = plan?.[day]?.sessions?.length > 0;
          const isToday = day === today;
          const isSelected = day === selectedDay;
          return (
            <TouchableOpacity
              key={day}
              style={[styles.dayBtn, isSelected && styles.dayBtnSelected, isToday && styles.dayBtnToday]}
              onPress={() => setSelectedDay(day)}
            >
              <Text style={[styles.dayBtnText, isSelected && styles.dayBtnTextSelected]}>
                {day.slice(0, 3).toUpperCase()}
              </Text>
              {hasSessions && <View style={[styles.dot, isSelected && styles.dotSelected]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.dayTitle}>
        {selectedDay.charAt(0).toUpperCase() + selectedDay.slice(1)}
        {selectedDay === today && <Text style={styles.todayLabel}> · Today</Text>}
      </Text>

      {selectedSessions.length === 0 ? (
        <View style={styles.restDay}>
          <Text style={styles.restIcon}>😴</Text>
          <Text style={styles.restText}>Rest day — no sessions scheduled</Text>
        </View>
      ) : (
        selectedSessions.map((session, i) => (
          <View key={session.id || i} style={styles.sessionCard}>
            <View style={styles.sessionLeft}>
              <View style={[styles.sessionDot, { backgroundColor: CATEGORY_COLORS[session.category] || COLORS.primary }]} />
              <View style={styles.connector} />
            </View>
            <View style={styles.sessionRight}>
              <Text style={styles.sessionTitle}>{session.title}</Text>
              <Text style={styles.sessionDesc}>{session.description}</Text>
              <View style={styles.sessionMeta}>
                <Text style={styles.sessionDuration}>{session.duration} min</Text>
                <Text style={[styles.sessionCategory, { color: CATEGORY_COLORS[session.category] || COLORS.primary }]}>
                  {session.category.replace('_', ' ')}
                </Text>
              </View>
            </View>
          </View>
        ))
      )}
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: COLORS.textSecondary },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: SPACING.lg },
  dayScroll: { marginHorizontal: -SPACING.xl, paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl },
  dayBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 10,
    marginRight: SPACING.sm,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    minWidth: 52,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dayBtnSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayBtnToday: { borderColor: COLORS.primary },
  dayBtnText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  dayBtnTextSelected: { color: COLORS.text },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.textMuted, marginTop: 3 },
  dotSelected: { backgroundColor: COLORS.text },
  dayTitle: { color: COLORS.text, fontSize: 20, fontWeight: '700', marginBottom: SPACING.lg },
  todayLabel: { color: COLORS.primary, fontWeight: '500' },
  restDay: { alignItems: 'center', paddingTop: SPACING.xxl },
  restIcon: { fontSize: 48, marginBottom: SPACING.md },
  restText: { color: COLORS.textSecondary, fontSize: 16 },
  sessionCard: { flexDirection: 'row', marginBottom: SPACING.lg },
  sessionLeft: { width: 24, alignItems: 'center', marginRight: SPACING.md },
  sessionDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  connector: { flex: 1, width: 2, backgroundColor: COLORS.border, marginTop: SPACING.xs },
  sessionRight: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  sessionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  sessionDesc: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: SPACING.sm },
  sessionMeta: { flexDirection: 'row', gap: SPACING.md },
  sessionDuration: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  sessionCategory: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
});
