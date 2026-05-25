import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAP7411t8bn81DoCtJI7ajy30UGaPdaRNU',
  authDomain: 'prova-583c9.firebaseapp.com',
  projectId: 'prova-583c9',
  storageBucket: 'prova-583c9.firebasestorage.app',
  messagingSenderId: '1043852862211',
  appId: '1:1043852862211:web:67435ca8660d6d5afd7f36',
  measurementId: 'G-97M1KEBVS8',
};

let app, auth;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} else {
  app = getApp();
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
