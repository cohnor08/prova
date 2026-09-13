// What a teacher can attach to a task, and how every app recognises it.
//
// Shared word-for-word with the web apps (scripts/sync-shared.cjs mirrors this
// file into web/shared/), so Studio, the student web app and the phone all
// agree on which files are allowed, how big they can be, and what kind of
// thing each attachment is. Keep it free of imports — that's what lets it be
// shared.
//
// Attachment shape on a task (assignedTasks[].attachments[]):
//   { type: 'photo' | 'video' | 'audio' | 'pdf', url, title, size?, contentType? }
// `title` is the original file name. `size` and `contentType` only exist on
// attachments uploaded since audio/PDF support landed; older ones are photos
// and videos with just type/url/title.

// Matches storage.rules (taskFiles/…). 300 MB is roughly 30 minutes of WAV or
// several hours of MP3 — enough for a full backing track or a lesson recording.
export const TASK_FILE_MAX_BYTES = 300 * 1024 * 1024;
export const TASK_FILE_MAX_LABEL = '300 MB';

// Extension → content type. Used when the browser or the phone doesn't report
// a type (common for .m4a, .flac and .aif) or reports a vague one.
const EXT_TYPES = {
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

// For a web <input type="file" accept="…">. Extensions are listed as well as
// types because some systems don't map .m4a/.flac/.aif to audio/*.
export const TASK_FILE_ACCEPT =
  'application/pdf,audio/*,image/*,video/*,' +
  Object.keys(EXT_TYPES).map((e) => '.' + e).join(',');

const safeDecode = (s) => {
  try { return decodeURIComponent(s); } catch (e) { return s; }
};

export const extensionOf = (name) => {
  const base = String(name || '').split('?')[0].split('#')[0];
  const dot = base.lastIndexOf('.');
  return dot > -1 ? base.slice(dot + 1).toLowerCase() : '';
};

const SUPPORTED = /^(audio\/|image\/|video\/)|^application\/pdf$/;

// The content type to upload a file with, or '' if it isn't something a task
// can carry. A reported type wins when it's specific; otherwise the extension
// decides.
export function contentTypeForFile(name, reported) {
  const r = String(reported || '').toLowerCase().split(';')[0].trim();
  if (SUPPORTED.test(r)) return r;
  return EXT_TYPES[extensionOf(name)] || '';
}

export function kindForContentType(contentType) {
  const t = String(contentType || '').toLowerCase();
  if (t === 'application/pdf') return 'pdf';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('image/')) return 'photo';
  return null;
}

// What kind of thing an attachment already on a task is. Trusts `type` when
// it's one we know, then falls back to the content type, then the file name.
export function attachmentKind(a) {
  if (!a) return null;
  if (a.type === 'photo' || a.type === 'video' || a.type === 'audio' || a.type === 'pdf') return a.type;
  if (a.type === 'image') return 'photo';
  return kindForContentType(a.contentType)
    || kindForContentType(EXT_TYPES[extensionOf(a.title)])
    || kindForContentType(EXT_TYPES[extensionOf(safeDecode(String(a.url || '').split('?')[0]))])
    || 'file';
}

export function formatBytes(n) {
  const b = Number(n) || 0;
  if (b <= 0) return '';
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  const mb = b / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

// The label under an attachment's name — "PDF · 2.4 MB", "Audio · 8 MB".
export function attachmentMeta(a) {
  const kind = attachmentKind(a);
  const label = kind === 'pdf' ? 'PDF' : kind === 'audio' ? 'Audio'
    : kind === 'video' ? 'Video' : kind === 'photo' ? 'Photo' : 'File';
  const size = formatBytes(a && a.size);
  return size ? `${label} · ${size}` : label;
}

// A file name fit to show a person: no folders, no %20s.
export function cleanFileName(name) {
  const s = safeDecode(String(name || '')).split(/[\\/]/).pop().split(':').pop().trim();
  return s || 'File';
}

// A file name fit for a Storage path: the original name, minus anything that
// would need escaping, so a download still arrives called "Blues in A.mp3".
export function storageFileName(name) {
  const clean = cleanFileName(name).replace(/[^A-Za-z0-9._ -]+/g, '').replace(/\s+/g, ' ').trim();
  return (clean || 'file').slice(-80);
}
