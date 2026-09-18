// The cover art inside an MP3, so a real song looks like the song.
//
// Deliberately the file's OWN artwork (the ID3 "APIC" frame), not a lookup:
// Apple's terms only allow their artwork next to a link to their store (see
// paintArtwork in the web app), and a guessed cover on a teacher's backing
// track would often be the wrong record anyway.
//
// Shared with the web apps through web/shared/ — keep it free of imports.
// The parsing is pure: bytes in, { mime, bytes } out. Fetching and turning it
// into something displayable is the caller's job, because that differs between
// a browser (blob URL) and React Native (data URI).

// An ID3 tag sits at the very start of the file, and its header says how long
// it is — so two small range requests, never the whole song.
export const ID3_HEADER_BYTES = 10;
// A tag with a cover is usually well under a megabyte. Anything larger is
// either not artwork or not worth pulling over a phone connection.
export const ID3_MAX_TAG_BYTES = 2 * 1024 * 1024;

const latin1 = (bytes, from, to) => {
  let out = '';
  for (let i = from; i < to; i++) out += String.fromCharCode(bytes[i]);
  return out;
};

// ID3 sizes are "syncsafe": 7 bits per byte, so the tag can never contain a
// run of bits that looks like an MPEG frame header.
const syncsafe = (b, i) => ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);
const uint32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

// How long is the ID3 tag, from its first 10 bytes? 0 when there isn't one.
export function id3TagLength(header) {
  if (!header || header.length < ID3_HEADER_BYTES) return 0;
  if (header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) return 0;   // "ID3"
  const major = header[3];
  if (major < 2 || major > 4) return 0;
  // Unsynchronisation rewrites the bytes we're about to read. It's vanishingly
  // rare on files with artwork; refusing is better than parsing it wrongly.
  if (header[5] & 0x80) return 0;
  const size = syncsafe(header, 6);
  return size > 0 && size <= ID3_MAX_TAG_BYTES ? size + ID3_HEADER_BYTES : 0;
}

// Pull the front cover (or the first picture) out of a tag.
// `tag` is the whole tag INCLUDING its 10-byte header.
export function pictureFromId3(tag) {
  if (!tag || tag.length < ID3_HEADER_BYTES) return null;
  const major = tag[3];
  let i = ID3_HEADER_BYTES;
  // An extended header, when present, sits before the first frame.
  if (tag[5] & 0x40) i += major === 4 ? syncsafe(tag, i) : uint32(tag, i) + 4;

  const idLen = major === 2 ? 3 : 4;
  const headLen = major === 2 ? 6 : 10;
  let best = null;

  while (i + headLen <= tag.length) {
    const id = latin1(tag, i, i + idLen);
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;                 // padding — the frames are done
    const size = major === 2 ? ((tag[i + 3] << 16) | (tag[i + 4] << 8) | tag[i + 5])
      : major === 4 ? syncsafe(tag, i + 4)
      : uint32(tag, i + 4);
    const start = i + headLen;
    if (size <= 0 || start + size > tag.length) break;

    if (id === 'APIC' || id === 'PIC') {
      let p = start + 1;                                     // skip the text-encoding byte
      let mime;
      if (id === 'PIC') {                                    // v2.2: a 3-letter format, not a MIME type
        const fmt = latin1(tag, p, p + 3).toUpperCase();
        mime = fmt === 'PNG' ? 'image/png' : 'image/jpeg';
        p += 3;
      } else {
        const end = tag.indexOf(0, p);
        if (end < 0) break;
        mime = latin1(tag, p, end).toLowerCase() || 'image/jpeg';
        if (mime === 'jpeg' || mime === 'jpg') mime = 'image/jpeg';
        if (mime === 'png') mime = 'image/png';
        p = end + 1;
      }
      const picType = tag[p];
      p += 1;
      // The description is terminated by one null byte, or two for the 16-bit
      // encodings (1 = UTF-16 with BOM, 2 = UTF-16BE).
      const enc = tag[start];
      if (enc === 1 || enc === 2) {
        while (p + 1 < tag.length && !(tag[p] === 0 && tag[p + 1] === 0)) p += 2;
        p += 2;
      } else {
        while (p < tag.length && tag[p] !== 0) p += 1;
        p += 1;
      }
      const data = tag.slice(p, start + size);
      if (data.length > 100 && /^image\//.test(mime)) {
        const pic = { mime, bytes: data };
        if (picType === 3) return pic;                       // 3 = front cover, the one we want
        if (!best) best = pic;
      }
    }
    i = start + size;
  }
  return best;
}

// Only MP3 here: the cover in an .m4a or a .flac lives in a different
// container entirely, and those fall back to the icon rather than pretending.
export const couldHaveArtwork = (contentType, name) =>
  /^audio\/(mpeg|mp3)$/i.test(String(contentType || '')) || /\.mp3$/i.test(String(name || ''));

// Bytes → base64, so React Native can show the picture as a data URI without
// a Buffer or a polyfill.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b === undefined ? 0 : b) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c === undefined ? 0 : c) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}

// The two range requests, in one call. `fetchFn` is passed in so this stays
// import-free: the browser and React Native both hand it their own fetch.
export async function loadEmbeddedPicture(url, fetchFn) {
  try {
    const head = await fetchFn(url, { headers: { Range: `bytes=0-${ID3_HEADER_BYTES - 1}` } });
    const len = id3TagLength(new Uint8Array(await head.arrayBuffer()));
    if (!len) return null;
    const tag = await fetchFn(url, { headers: { Range: `bytes=0-${len - 1}` } });
    return pictureFromId3(new Uint8Array(await tag.arrayBuffer()));
  } catch (e) {
    return null;   // no artwork is not an error worth surfacing
  }
}
