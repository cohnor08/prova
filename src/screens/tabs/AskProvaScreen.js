import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform, StyleSheet, Keyboard, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { askProva } from '../../lib/claude';
import { COLORS, SPACING } from '../../constants/theme';

// A few one-tap starter questions shown before the conversation begins.
const STARTERS = [
  'How do I switch between chords faster?',
  'Why does my barre chord buzz?',
  'Give me a 5-minute warm-up',
  'How should I practice to improve fastest?',
];

let _seq = 0;
const nextId = () => `m${Date.now()}_${_seq++}`;

export default function AskProvaScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({ instrument: 'Guitar', level: '' });
  const scrollRef = useRef(null);
  // The input bar's own bottom padding: = safe-area (min 10) when the keyboard is
  // down, = keyboard height when it's up. It lives ON the input bar (surface
  // colour) so the space below the field is never a dark gap, even mid-animation.
  const kbInset = useRef(new Animated.Value(Math.max(insets.bottom, 10))).current;
  const scrollY = useRef(0);        // live scroll offset, so the lift can carry it along
  const kbAnimating = useRef(false); // suppress other scroll triggers during the lift

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        const d = snap.data() || {};
        setProfile({ instrument: d.instrument || 'Guitar', level: d.level || '' });
      })
      .catch(() => {});
  }, []);

  // Drive the lift from the keyboard event itself — it carries the exact height
  // AND the animation duration, so the input moves in perfect lockstep with the
  // keyboard (no momentary gap, no lag — unlike KeyboardAvoidingView, which
  // animates on its own separate timing). iOS uses the will* events (fire at the
  // START of the animation); Android has no will*, so it uses did*.
  useEffect(() => {
    const rest = Math.max(insets.bottom, 10);
    const onShow = (e) => {
      const to = (e.endCoordinates?.height || 300) + 12; // +12 = small gap above the keyboard
      const base = scrollY.current;
      kbAnimating.current = true;
      // ONE motion: the same animation that lifts the input bar also carries the
      // scroll position, so the prompts and the box rise together (no second pass).
      const id = kbInset.addListener(({ value }) => {
        scrollRef.current?.scrollTo({ y: base + (value - rest), animated: false });
      });
      Animated.timing(kbInset, {
        toValue: to,
        duration: e.duration || 250,
        easing: Easing.out(Easing.ease), // matches the keyboard's own ease-out
        useNativeDriver: false,
      }).start(() => {
        kbInset.removeListener(id);
        scrollRef.current?.scrollToEnd({ animated: false }); // 0-distance settle in the common case
        kbAnimating.current = false;
      });
    };
    const onHide = (e) => {
      Animated.timing(kbInset, {
        toValue: rest,
        duration: e.duration || 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    };
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, onShow);
    const s2 = Keyboard.addListener(hideEvt, onHide);
    return () => { s1.remove(); s2.remove(); kbInset.removeAllListeners(); };
  }, [insets.bottom, kbInset]);

  const send = async (text) => {
    const q = (text != null ? text : input).trim();
    if (!q || loading) return;
    Keyboard.dismiss();
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: q }]);
    setInput('');
    setLoading(true);
    try {
      const res = await askProva({
        question: q,
        instrument: profile.instrument,
        level: profile.level,
        history,
      });
      const answer = (res?.answer || '').trim() || "I didn't quite catch that — try asking another way.";
      setMessages((prev) => [...prev, { id: nextId(), role: 'prova', text: answer }]);
    } catch (e) {
      const isLimit = /limit/i.test(e?.message || '');
      const msg = isLimit
        ? e.message
        : "Hmm, I couldn't answer that just now. Check your connection and try again.";
      setMessages((prev) => [...prev, { id: nextId(), role: 'prova', text: msg, error: true }]);
    } finally {
      setLoading(false);
    }
  };

  const empty = messages.length === 0;
  const instLabel = (profile.instrument || 'guitar').toLowerCase();

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerIcon}><Ionicons name="sparkles" size={15} color={COLORS.primary} /></View>
          <View>
            <Text style={styles.headerTitle}>Ask Prova</Text>
            <Text style={styles.headerSub}>Your AI {instLabel} coach</Text>
          </View>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollBody}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        onContentSizeChange={() => { if (!kbAnimating.current) scrollRef.current?.scrollToEnd({ animated: true }); }}
        keyboardShouldPersistTaps="handled"
      >
        {empty ? (
          <View style={styles.intro}>
            <View style={styles.introIcon}><Ionicons name="sparkles" size={26} color={COLORS.primary} /></View>
            <Text style={styles.introTitle}>Ask me anything about playing</Text>
            <Text style={styles.introText}>
              Chords, technique, theory, gear, or how to practice — I'm your{' '}
              {profile.level ? profile.level.toLowerCase() + ' ' : ''}{instLabel} coach.
            </Text>
            <View style={styles.starters}>
              {STARTERS.map((s) => (
                <TouchableOpacity key={s} style={styles.starterChip} onPress={() => send(s)} activeOpacity={0.85}>
                  <Ionicons name="chatbubble-ellipses-outline" size={15} color={COLORS.primary} />
                  <Text style={styles.starterText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          messages.map((m) => (
            <View key={m.id} style={[styles.bubbleRow, m.role === 'user' ? styles.rowRight : styles.rowLeft]}>
              <View style={[
                styles.bubble,
                m.role === 'user' ? styles.userBubble : styles.provaBubble,
                m.error && styles.errorBubble,
              ]}>
                <Text style={[styles.bubbleText, m.role === 'user' && styles.userBubbleText]}>{m.text}</Text>
              </View>
            </View>
          ))
        )}
        {loading && (
          <View style={[styles.bubbleRow, styles.rowLeft]}>
            <View style={[styles.bubble, styles.provaBubble, styles.typingBubble]}>
              <ActivityIndicator size="small" color={COLORS.textSecondary} />
              <Text style={styles.typingText}>Prova is thinking…</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input bar — owns the animated bottom inset so nothing dark shows below it */}
      <Animated.View style={[styles.inputBar, { paddingBottom: kbInset }]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about chords, technique, practice…"
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={500}
          keyboardAppearance="dark"
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnOff]}
          onPress={() => send()}
          disabled={!input.trim() || loading}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-up" size={20} color={COLORS.text} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  headerSub: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600' },

  scroll: { flex: 1, backgroundColor: COLORS.background },
  scrollBody: { padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.sm, flexGrow: 1, justifyContent: 'flex-end' },

  intro: { alignItems: 'center', paddingTop: SPACING.xl, paddingHorizontal: SPACING.sm },
  introIcon: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.primary + '18',
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md,
  },
  introTitle: { color: COLORS.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  introText: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  starters: { marginTop: SPACING.xl, alignSelf: 'stretch', gap: SPACING.sm },
  starterChip: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: SPACING.md, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  starterText: { color: COLORS.text, fontSize: 14, fontWeight: '600', flex: 1 },

  bubbleRow: { flexDirection: 'row' },
  rowRight: { justifyContent: 'flex-end' },
  rowLeft: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '86%', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 13 },
  userBubble: { backgroundColor: COLORS.primary, borderBottomRightRadius: 5 },
  provaBubble: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 5 },
  errorBubble: { borderColor: COLORS.error + '55' },
  bubbleText: { color: COLORS.text, fontSize: 15, lineHeight: 21 },
  userBubbleText: { color: '#FFFFFF' },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { color: COLORS.textSecondary, fontSize: 13, fontStyle: 'italic' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  input: {
    flex: 1, color: COLORS.text, fontSize: 15, maxHeight: 120,
    backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: COLORS.border },
});
