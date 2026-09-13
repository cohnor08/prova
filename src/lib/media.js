import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { auth, storage } from './firebase';
import {
  TASK_FILE_MAX_BYTES, TASK_FILE_MAX_LABEL, TASK_FILE_ACCEPT,
  contentTypeForFile, kindForContentType, cleanFileName, storageFileName,
} from './attachments';

// Storage rules cap uploads at 150 MB and require an image/* or video/* content
// type — enforce both client-side so failures are a clear message, not a
// permission error after a long wait. (150 MB fits ~2 min of 720p video.)
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;

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
//
// `opts` is for task files (PDFs, audio): an explicit content type, a bigger
// size cap, and wording that isn't about video.
async function uploadMedia(uri, path, type, onProgress, onStep, opts = {}) {
  const contentType = opts.contentType || contentTypeFor(uri, type);
  const maxBytes = opts.maxBytes || MAX_UPLOAD_BYTES;
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
    const err = new Error(opts.empty || 'That clip came through empty — try recording it again.');
    err.friendly = true;
    throw err;
  }
  if (opts.onSize) opts.onSize(blob.size);
  if (blob.size > maxBytes) {
    const mb = Math.round(blob.size / (1024 * 1024));
    const err = new Error(opts.tooBig
      ? opts.tooBig(mb)
      : `This video is too large to upload (${mb} MB, max 150 MB). Try a shorter clip.`);
    err.friendly = true;
    throw err;
  }

  step('Uploading…');
  console.log('[proof-upload] POST', url, 'size', blob.size);
  const responseText = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Firebase ${token}`);
    xhr.setRequestHeader('Content-Type', contentType);
    // On Android this is a limit on the WHOLE request, not on silence, so a
    // flat minute would kill any big file mid-upload. Allow a slow connection
    // (32 KB/s) to finish; small files keep the one-minute floor.
    xhr.timeout = Math.max(60000, Math.ceil(blob.size / (32 * 1024)) * 1000);
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
          ? (opts.blocked || "The upload was blocked — check you're signed in and the clip is under 150 MB.")
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
    // Re-encode picked videos to 720p H.264 — `quality` only compresses
    // PHOTOS, so without this a library video uploads at full size (easily
    // hundreds of MB). 720p keeps fingers/frets clearly visible while staying
    // well under the upload cap.
    videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
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
    // Record at 720p — Medium (~480p) was too blurry to see finger placement.
    // Full-res High (1080p/4K) is still avoided: huge files, slow uploads.
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.IFrame1280x720,
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

// Uploads a teacher's resource/task image under chatMedia/resource_{uid}/…,
// covered by the existing (non-proof) chatMedia Storage rules — no deploy needed.
export async function uploadResourceMedia(uri, uid, type, onProgress, onStep) {
  const ext = type === 'video' ? 'mp4' : 'jpg';
  return uploadMedia(uri, `chatMedia/resource_${uid}/${Date.now()}.${ext}`, type, onProgress, onStep);
}

// ── Task files: PDFs and audio ─────────────────────────────────────────────
// Opens the system file browser (Files on iOS, the document picker on Android)
// so a teacher can attach sheet music, tabs or a backing track to a task.
// Returns { uri, name, size, contentType, kind }, null if they backed out, or
// { error } for a file a task can't carry.
//
// The picker is expo-file-system's File.pickFileAsync, which ships inside
// `expo` itself — so it's already in the App Store build and this works over
// an OTA update, no new native module. It's required lazily so that if it
// were ever missing, only this button fails, never app start.
export async function pickDocument() {
  if (Platform.OS === 'web') return pickDocumentWeb();
  let File;
  try {
    ({ File } = require('expo-file-system'));
  } catch (e) {
    return { error: 'Attaching files needs the latest version of Prova from the App Store.' };
  }
  if (!File || typeof File.pickFileAsync !== 'function') {
    return { error: 'Attaching files needs the latest version of Prova from the App Store.' };
  }
  let picked;
  try {
    // No type filter: iOS can only filter to ONE type, and the teacher needs
    // to see PDFs and audio side by side. Anything else is turned away below.
    picked = await File.pickFileAsync();
  } catch (e) {
    if (/cancel/i.test(String(e && (e.message || e.code)))) return null;
    return { error: 'The file browser could not be opened. Please try again.' };
  }
  const f = Array.isArray(picked) ? picked[0] : picked;
  if (!f || !f.uri) return null;
  // Each of these reads the file on the native side and can throw on an odd
  // provider — none is essential (the upload re-checks the size from the bytes).
  const read = (fn, fallback) => { try { const v = fn(); return v == null ? fallback : v; } catch (e) { return fallback; } };
  const name = cleanFileName(read(() => f.name, '') || f.uri);
  return describePicked({ uri: f.uri, name, size: read(() => f.size, 0), reported: read(() => f.type, '') });
}

// react-native-web has no native picker — a hidden <input type="file"> is the
// web's own. Never resolves if the dialog is dismissed without the browser
// telling us, which is harmless: nothing is busy until a file comes back.
function pickDocumentWeb() {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = TASK_FILE_ACCEPT;
    input.style.display = 'none';
    const done = (v) => { input.remove(); resolve(v); };
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) { done(null); return; }
      done(describePicked({
        uri: URL.createObjectURL(file), name: file.name, size: file.size, reported: file.type,
      }));
    });
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

function describePicked({ uri, name, size, reported }) {
  const contentType = contentTypeForFile(name, reported);
  const kind = kindForContentType(contentType);
  if (!kind) {
    return { error: 'That file type can\'t be attached. Use a PDF, an audio file (MP3, M4A, WAV), a photo or a video.' };
  }
  if (size > TASK_FILE_MAX_BYTES) {
    const mb = Math.round(size / (1024 * 1024));
    return { error: `That file is ${mb} MB — the limit is ${TASK_FILE_MAX_LABEL}.` };
  }
  return { uri, name, size: size || 0, contentType, kind };
}

// Uploads a picked task file to taskFiles/{uid}/…, which only that teacher may
// write (storage.rules). Resolves to the attachment to store on the task.
export async function uploadTaskFile(picked, uid, onProgress, onStep) {
  const path = `taskFiles/${uid}/${Date.now()}_${storageFileName(picked.name)}`;
  let size = picked.size || 0;
  const url = await uploadMedia(picked.uri, path, picked.kind, onProgress, onStep, {
    contentType: picked.contentType,
    onSize: (n) => { size = n; },
    empty: 'That file came through empty — try picking it again.',
    maxBytes: TASK_FILE_MAX_BYTES,
    tooBig: (mb) => `That file is ${mb} MB — the limit is ${TASK_FILE_MAX_LABEL}.`,
    blocked: `The upload was blocked — check you're signed in and the file is under ${TASK_FILE_MAX_LABEL}.`,
  });
  if (Platform.OS === 'web' && String(picked.uri).startsWith('blob:')) {
    try { URL.revokeObjectURL(picked.uri); } catch (e) { /* nothing to free */ }
  }
  return {
    type: picked.kind,
    url,
    title: picked.name,
    size,
    contentType: picked.contentType,
  };
}
