import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

// Opens the device library to pick a photo or video. Returns { uri, type }
// where type is 'image' | 'video', or null if the user cancelled / denied.
export async function pickMedia() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return { error: 'Permission to access your photos is required.' };
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.7,
    videoMaxDuration: 120,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const type = asset.type === 'video' ? 'video' : 'image';
  return { uri: asset.uri, type };
}

// Opens the camera to take a photo or record a video, then returns it the same
// shape as pickMedia. Returns null if cancelled, or { error } if denied.
export async function captureMedia() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    return { error: 'Camera access is required to record.' };
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.7,
    videoMaxDuration: 120,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const type = asset.type === 'video' ? 'video' : 'image';
  return { uri: asset.uri, type };
}

// Uploads a local file URI to Firebase Storage under the chat's folder and
// returns the public download URL.
export async function uploadChatMedia(uri, chatId, type) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = type === 'video' ? 'mp4' : 'jpg';
  const path = `chatMedia/${chatId}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

// Uploads a practice-proof clip for a student's task. Stored under the chatMedia
// rule space (`chatMedia/proof_{uid}`) so the existing Storage rules already
// cover it — any signed-in user can read (so the teacher can watch) and upload.
export async function uploadProofMedia(uri, uid, type) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = type === 'video' ? 'mp4' : 'jpg';
  const path = `chatMedia/proof_${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}
