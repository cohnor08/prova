import * as ImagePicker from 'expo-image-picker';
import { createUploadTask, getInfoAsync, FileSystemUploadType } from 'expo-file-system/legacy';
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

// Shared upload core. The Firebase JS SDK's blob upload (uploadBytes /
// uploadBytesResumable) HANGS in Expo Go — the clip sits on "Uploading…"
// forever with no error, because the SDK's blob handling isn't supported there.
// Instead we upload the file NATIVELY with expo-file-system: it streams the
// file straight from disk to Firebase Storage's REST endpoint, authenticated
// with the user's Firebase ID token, so the Storage rules run exactly as they
// would through the SDK. This works in Expo Go without a dev build.
async function uploadMedia(uri, path, type, onProgress) {
  const user = auth.currentUser;
  if (!user) {
    const err = new Error('You need to be signed in to upload.');
    err.friendly = true;
    throw err;
  }

  // Size guard first, for a clear message instead of a raw HTTP 403 from the
  // rules' 50 MB cap. Ignore getInfo failures — the server still enforces it.
  try {
    const info = await getInfoAsync(uri);
    if (info?.size && info.size > MAX_UPLOAD_BYTES) {
      const mb = Math.round(info.size / (1024 * 1024));
      const err = new Error(`This video is too large to upload (${mb} MB, max 50 MB). Try a shorter clip.`);
      err.friendly = true;
      throw err;
    }
  } catch (e) {
    if (e.friendly) throw e;
  }

  const bucket = storage.app.options.storageBucket;
  const token = await user.getIdToken();
  const encodedPath = encodeURIComponent(path);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedPath}`;
  console.log('[proof-upload] uploading', path);

  const task = createUploadTask(
    url,
    uri,
    {
      httpMethod: 'POST',
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Firebase ${token}`,
        'Content-Type': contentTypeFor(uri, type),
      },
    },
    (data) => {
      if (onProgress && data.totalBytesExpectedToSend > 0) {
        onProgress(Math.round((data.totalBytesSent / data.totalBytesExpectedToSend) * 100));
      }
    }
  );

  // Guard against a native upload that never settles — a clear timeout beats an
  // endless "Uploading…".
  let timer;
  const res = await Promise.race([
    task.uploadAsync(),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { task.cancelAsync(); } catch (e) { /* already settled */ }
        const err = new Error('Upload timed out — check your connection and try again.');
        err.friendly = true;
        reject(err);
      }, 120000);
    }),
  ]);
  clearTimeout(timer);
  console.log('[proof-upload] http status', res?.status);

  if (!res || res.status < 200 || res.status >= 300) {
    const err = new Error(
      res?.status === 403
        ? "The upload was blocked — check you're signed in and the clip is under 50 MB."
        : `Upload failed (HTTP ${res?.status ?? 'no response'}).`
    );
    err.friendly = res?.status === 403;
    err.code = `http/${res?.status ?? 'none'}`;
    throw err;
  }

  // Build the tokenized download URL straight from the REST response. Do NOT
  // call the Firebase Storage SDK's getDownloadURL here: EVERY Storage-SDK call
  // hangs in Expo Go (that was the "stuck on Uploading… forever" bug — the
  // native upload finished but getDownloadURL never returned). The upload
  // response already carries the download token.
  let meta = {};
  try { meta = JSON.parse(res.body); } catch (_) { /* non-JSON body */ }
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
