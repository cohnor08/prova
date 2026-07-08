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

// Read a local file:// URI into a blob via XMLHttpRequest. In Expo Go,
// fetch(file://).blob() frequently returns an EMPTY/unreadable blob, which is
// what silently breaks Storage uploads (they hang or fail instantly). XHR reads
// the file reliably every time — the canonical Expo upload fix.
function uriToBlob(uri) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response);
    xhr.onerror = () => {
      const err = new Error("Couldn't read the video file off your device. Please try again.");
      err.friendly = true;
      reject(err);
    };
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

// Shared upload core. We always send an explicit contentType (the Storage rules
// reject anything that isn't image/* or video/*, and RN blobs often arrive
// type-less) and upload resumable so we get progress + a real error callback.
// A hard timeout means a stalled upload becomes a visible error, never an
// endless spinner.
async function uploadMedia(uri, path, type, onProgress) {
  const blob = await uriToBlob(uri);
  if (!blob || blob.size === 0) {
    const err = new Error('That clip came through empty — try recording it again.');
    err.friendly = true;
    throw err;
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    const mb = Math.round(blob.size / (1024 * 1024));
    const err = new Error(`This video is too large to upload (${mb} MB, max 50 MB). Try a shorter clip.`);
    err.friendly = true;
    throw err;
  }
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, blob, { contentType: contentTypeFor(uri, type) });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try { task.cancel(); } catch (e) { /* already settled */ }
        const err = new Error('Upload timed out — check your connection and try again.');
        err.friendly = true;
        reject(err);
      }, 90000);
      task.on(
        'state_changed',
        (snap) => {
          if (onProgress && snap.totalBytes > 0) {
            onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
          }
        },
        (err) => { clearTimeout(timer); reject(err); },
        () => { clearTimeout(timer); resolve(); }
      );
    });
  } finally {
    if (blob.close) blob.close(); // free the RN blob's backing memory
  }
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
