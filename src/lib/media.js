import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

// Storage rules cap uploads at 50 MB and require an image/* or video/* content
// type — enforce both client-side so failures are a clear message, not a
// permission error after a long wait.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function contentTypeFor(uri, type) {
  const ext = (uri.split('?')[0].split('.').pop() || '').toLowerCase();
  if (type === 'video') return ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  return ext === 'png' ? 'image/png' : 'image/jpeg';
}

// Shared upload core. React Native's fetch(file://).blob() can lose the MIME
// type (uploads then arrive as octet-stream and the rules REJECT them), and
// single-shot uploadBytes is known to stall on multi-MB blobs in RN — so we
// always send an explicit contentType and upload resumable (chunked), with
// optional progress reporting.
async function uploadMedia(uri, path, type, onProgress) {
  const response = await fetch(uri);
  const blob = await response.blob();
  if (blob.size > MAX_UPLOAD_BYTES) {
    const mb = Math.round(blob.size / (1024 * 1024));
    const err = new Error(`This video is too large to upload (${mb} MB, max 50 MB). Try a shorter clip.`);
    err.friendly = true;
    throw err;
  }
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, blob, { contentType: contentTypeFor(uri, type) });
  await new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        if (onProgress && snap.totalBytes > 0) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      reject,
      resolve
    );
  });
  return getDownloadURL(storageRef);
}

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
    // Re-encode picked videos to 540p — `quality` only compresses PHOTOS, so
    // without this a library video uploads at full size (easily 100MB+),
    // making uploads and the teacher's playback crawl.
    videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
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
    // Record at medium quality — full-res camera video is huge and slow to
    // upload/stream (quality only affects photos).
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const type = asset.type === 'video' ? 'video' : 'image';
  return { uri: asset.uri, type };
}

// Uploads a local file URI to Firebase Storage under the chat's folder and
// returns the public download URL.
export async function uploadChatMedia(uri, chatId, type, onProgress) {
  const ext = type === 'video' ? 'mp4' : 'jpg';
  return uploadMedia(uri, `chatMedia/${chatId}/${Date.now()}.${ext}`, type, onProgress);
}

// Uploads a practice-proof clip for a student's task. Stored under the chatMedia
// rule space (`chatMedia/proof_{uid}`) so the existing Storage rules already
// cover it — the student may upload, the teacher watches via the download URL.
export async function uploadProofMedia(uri, uid, type, onProgress) {
  const ext = type === 'video' ? 'mp4' : 'jpg';
  return uploadMedia(uri, `chatMedia/proof_${uid}/${Date.now()}.${ext}`, type, onProgress);
}
