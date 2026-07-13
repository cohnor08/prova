import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../lib/firebase';
import { COLORS, SPACING } from '../../constants/theme';
import { loadSavedLogin, saveLogin } from '../../lib/savedLogin';
import { track } from '../../lib/analytics';

const FIREBASE_ERRORS = {
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/network-request-failed': 'Network error. Check your connection.',
};

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [rememberMe, setRememberMe] = useState(true);

  // Prefill the last remembered login (email always; password when the build
  // has SecureStore) so switching accounts doesn't mean retyping everything.
  useEffect(() => {
    loadSavedLogin().then(({ remember, email: e, password: p }) => {
      setRememberMe(remember);
      if (e) setEmail(e);
      if (p) setPassword(p);
    });
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      track('logged_in');
      saveLogin(email.trim().toLowerCase(), password, rememberMe);
    } catch (error) {
      const message = FIREBASE_ERRORS[error.code] || 'Login failed. Please try again.';
      Alert.alert('Login Failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.navigate('Welcome')}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="chevron-back" size={24} color={COLORS.textSecondary} />
      </TouchableOpacity>
      <View style={styles.inner}>
        <View style={styles.logoArea}>
          <View style={styles.logoGlow}>
            <Text style={styles.logo}>PROVA</Text>
          </View>
          <Text style={styles.tagline}>Your AI Music Coach</Text>
        </View>

        <View style={styles.form}>
          <View style={[styles.inputWrapper, focusedField === 'email' && styles.inputWrapperFocused]}>
            <Ionicons name="mail-outline" size={18} color={focusedField === 'email' ? COLORS.primary : COLORS.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={COLORS.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
            />
            {email.length > 0 && (
              <TouchableOpacity onPress={() => setEmail('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.inputWrapper, focusedField === 'password' && styles.inputWrapperFocused]}>
            <Ionicons name="lock-closed-outline" size={18} color={focusedField === 'password' ? COLORS.primary : COLORS.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={COLORS.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="password"
              textContentType="password"
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.rememberRow}
            onPress={() => setRememberMe((v) => !v)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8 }}
          >
            <Ionicons
              name={rememberMe ? 'checkbox' : 'square-outline'}
              size={20}
              color={rememberMe ? COLORS.primary : COLORS.textMuted}
            />
            <Text style={styles.rememberText}>Remember me</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={COLORS.text} size="small" />
              : <Text style={styles.buttonText}>Log In</Text>
            }
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('Welcome')} hitSlop={{ top: 8, bottom: 8 }}>
          <Text style={styles.linkText}>
            Don't have an account? <Text style={styles.linkAccent}>Sign up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  backButton: { position: 'absolute', top: 56, left: SPACING.lg, zIndex: 10 },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACING.xl },
  logoArea: { alignItems: 'center', marginBottom: SPACING.xxl },
  logoGlow: {
    borderWidth: 1,
    borderColor: COLORS.primary + '44',
    borderRadius: 20,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.primary + '0D',
  },
  logo: {
    fontSize: 42,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 10,
  },
  tagline: {
    fontSize: 13,
    color: COLORS.textSecondary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  form: { marginBottom: SPACING.xl },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    height: 52,
  },
  inputWrapperFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '0A',
  },
  inputIcon: { marginRight: SPACING.sm },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    height: '100%',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    alignSelf: 'flex-start',
  },
  rememberText: { color: COLORS.textSecondary, fontSize: 14 },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: COLORS.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  linkText: { color: COLORS.textSecondary, textAlign: 'center', fontSize: 14 },
  linkAccent: { color: COLORS.primary, fontWeight: '600' },
});
