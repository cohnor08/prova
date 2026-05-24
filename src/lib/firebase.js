import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyAP7411t8bn81DoCtJI7ajy30UGaPdaRNU',
  authDomain: 'prova-583c9.firebaseapp.com',
  projectId: 'prova-583c9',
  storageBucket: 'prova-583c9.firebasestorage.app',
  messagingSenderId: '1043852862211',
  appId: '1:1043852862211:web:67435ca8660d6d5afd7f36',
  measurementId: 'G-97M1KEBVS8',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Cache auth in a global so hot reloads don't lose the initialized instance
if (!global._firebaseAuth) {
  global._firebaseAuth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

export const auth = global._firebaseAuth;
export const db = getFirestore(app);
