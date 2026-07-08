import * as ImagePicker from 'expo-image-picker';
import { auth, storage } from './firebase';

// Storage rules cap uploads at 50 MB and require an image/* or video/* content
// type — enforce both client-side so failures are a clear message, not a
// permission error after a long wait.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function contentTypeFor(uri, type) {
  const ext = (uri.split('?')[0].split('.').pop() || '').toLowerCase();
  if (type === 'video') return ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  return ext === 'png' ? 'image/png' : 'image/jpeg';
}

// Shared upload core. History on this: the Firebase Storage SDK (uploadBytes)
// worked once but now hangs in Expo Go, and expo-file-system's uploadAsync
// hangs at the transfer too. So we do the most basic thing the app already
// relies on everywhere else — a direct XMLHttpRequest POST of the file blob to
// Firebase Storage's REST endpoint, authed with the user's Firebase ID token so
// the Storage rules still apply. XHR is the same transport the SDK uses under
// the hood (it worked on July 6), but without the SDK's wrapper, and it gives
// real upload-progress events + a hard timeout so it can never spin forever.
async function uploadMedia(uri, path, type, onProgress, onStep) {
  const step = (s) => { console.log('[proof-upload] step:', s); if (onStep) onStep(s); };
  const user = auth.currentUser;
  if (!user) {
    const err = new Error('You need to be signed in to upload.');
    err.friendly = true;
    throw err;
  }

  step('Preparing…');
  const bucket = storage.app.options.storageBucket;
  const token = await user.getIdToken();
  const encodedPath = encodeURIComponent(path);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedPath}`;

  // Read the file into a blob (this part works — the original code got a blob
  // fine; the hang was always the SDK, not this).
  step('Reading…');
  const response = await fetch(uri);
  const blob = await response.blob();
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

  step('Uploading…');
  console.log('[proof-upload] POST', url, 'size', blob.size);
  const responseText = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Firebase ${token}`);
    xhr.setRequestHeader('Content-Type', contentTypeFor(uri, type));
    xhr.timeout = 60000;
    if (xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      console.log('[proof-upload] http status', xhr.status);
      if (xhr.status >= 200 && xhr.status < 300) { resolve(xhr.responseText); return; }
      const err = new Error(
        xhr.status === 403
          ? "The upload was blocked — check you're signed in and the clip is under 50 MB."
          : `Upload failed (HTTP ${xhr.status}).`
      );
      err.friendly = xhr.status === 403;
      err.code = `http/${xhr.status}`;
      reject(err);
    };
    xhr.onerror = () => {
      const err = new Error("Network error during upload — check your Wi-Fi/data and try again.");
      err.friendly = true;
      err.code = 'xhr/error';
      reject(err);
    };
    xhr.ontimeout = () => {
      const err = new Error('Upload timed out — check your connection and try again.');
      err.friendly = true;
      err.code = 'xhr/timeout';
      reject(err);
    };
    xhr.send(blob);
  });

  step('Saving…');
  let meta = {};
  try { meta = JSON.parse(responseText); } catch (_) { /* non-JSON body */ }
  const dlToken = meta.downloadTokens ? String(meta.downloadTokens).split(',')[0] : '';
  if (!dlToken) {
    const err = new Error('Upload saved but no download link came back — please try again.');
    err.code = 'no-download-token';
    throw err;
  }
  console.log('[proof-upload] done');
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${dlToken}`;
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
    // Default to the BACK camera. The front camera mirrors what it records
    // (text/hands come out flipped — the "inverted" video), and for proof of
    // practice you want to film the instrument/hands anyway. The user can still
    // flip to selfie in the camera UI if they want.
    cameraType: ImagePicker.CameraType.back,
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
export async function uploadChatMedia(uri, chatId, type, onProgress, onStep) {
  const ext = type === 'video' ? 'mp4' : 'jpg';
  return uploadMedia(uri, `chatMedia/${chatId}/${Date.now()}.${ext}`, type, onProgress, onStep);
}

// Uploads a practice-proof clip for a student's task. Stored under the chatMedia
// rule space (`chatMedia/proof_{uid}`) so the existing Storage rules already
// cover it — the student may upload, the teacher watches via the download URL.
export async function uploadProofMedia(uri, uid, type, onProgress, onStep) {
  const ext = type === 'video' ? 'mp4' : 'jpg';
  return uploadMedia(uri, `chatMedia/proof_${uid}/${Date.now()}.${ext}`, type, onProgress, onStep);
}
