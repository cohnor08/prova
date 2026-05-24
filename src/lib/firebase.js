import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
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

const app = initializeApp(firebaseConfig);

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  auth = getAuth(app);
}
export { auth };

export const db = getFirestore(app);
