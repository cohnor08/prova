// Remembered login credentials for the "Remember me" toggle on Login.
// The email lives in AsyncStorage (it isn't a secret); the password goes in
// the device Keychain via expo-secure-store (encrypted, never in plain text).
// SecureStore is a native module — on a dev build made before it was added,
// the guarded require leaves it null and we simply don't remember the
// password until the next build. Email prefill still works everywhere.
import AsyncStorage from '@react-native-async-storage/async-storage';

let SecureStore = null;
try { SecureStore = require('expo-secure-store'); } catch (e) { /* not in this build yet */ }

const EMAIL_KEY = 'prova_saved_email';
const REMEMBER_KEY = 'prova_remember_login';
const PW_KEY = 'prova_saved_password';

// → { remember, email, password } (password '' when none saved / unsupported).
export async function loadSavedLogin() {
  try {
    const [remember, email] = await Promise.all([
      AsyncStorage.getItem(REMEMBER_KEY),
      AsyncStorage.getItem(EMAIL_KEY),
    ]);
    let password = '';
    if (remember !== 'false' && SecureStore) {
      password = (await SecureStore.getItemAsync(PW_KEY)) || '';
    }
    return { remember: remember !== 'false', email: email || '', password };
  } catch (e) {
    return { remember: true, email: '', password: '' };
  }
}

// Call after a successful sign-in. Remember off = clear everything saved.
export async function saveLogin(email, password, remember) {
  try {
    await AsyncStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false');
    if (remember) {
      await AsyncStorage.setItem(EMAIL_KEY, email);
      if (SecureStore) await SecureStore.setItemAsync(PW_KEY, password);
    } else {
      await AsyncStorage.removeItem(EMAIL_KEY);
      if (SecureStore) await SecureStore.deleteItemAsync(PW_KEY);
    }
  } catch (e) { /* best-effort — never block login on this */ }
}
