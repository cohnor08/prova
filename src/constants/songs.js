// Curated song suggestions matched to a player's instrument + skill level.
// Used to feature a daily "song to practice" and to surface a recommended
// list in the Practice tab. Levels mirror LEVELS in theme.js.

export const SONG_CATALOG = {
  Guitar: {
    Beginner: [
      { title: 'Horse with No Name', artist: 'America' },
      { title: "Knockin' on Heaven's Door", artist: 'Bob Dylan' },
      { title: 'Smoke on the Water (riff)', artist: 'Deep Purple' },
      { title: 'Three Little Birds', artist: 'Bob Marley' },
      { title: 'Bad Moon Rising', artist: 'Creedence Clearwater Revival' },
      { title: 'Love Me Do', artist: 'The Beatles' },
    ],
    Novice: [
      { title: 'Wonderwall', artist: 'Oasis' },
      { title: 'Wish You Were Here', artist: 'Pink Floyd' },
      { title: 'Good Riddance (Time of Your Life)', artist: 'Green Day' },
      { title: 'Brown Eyed Girl', artist: 'Van Morrison' },
      { title: 'Seven Nation Army', artist: 'The White Stripes' },
      { title: 'Zombie', artist: 'The Cranberries' },
    ],
    Intermediate: [
      { title: "Sweet Child O' Mine", artist: 'Guns N\' Roses' },
      { title: 'Hotel California', artist: 'Eagles' },
      { title: 'Stairway to Heaven', artist: 'Led Zeppelin' },
      { title: 'Nothing Else Matters', artist: 'Metallica' },
      { title: 'Layla (Unplugged)', artist: 'Eric Clapton' },
      { title: 'Black', artist: 'Pearl Jam' },
    ],
    Advanced: [
      { title: 'Crazy Train', artist: 'Ozzy Osbourne' },
      { title: 'Master of Puppets', artist: 'Metallica' },
      { title: 'Comfortably Numb (solo)', artist: 'Pink Floyd' },
      { title: 'Texas Flood', artist: 'Stevie Ray Vaughan' },
      { title: 'Little Wing', artist: 'Jimi Hendrix' },
      { title: 'Cliffs of Dover', artist: 'Eric Johnson' },
    ],
    Elite: [
      { title: 'Eruption', artist: 'Van Halen' },
      { title: 'For the Love of God', artist: 'Steve Vai' },
      { title: 'Tornado of Souls (solo)', artist: 'Megadeth' },
      { title: 'Far Beyond the Sun', artist: 'Yngwie Malmsteen' },
      { title: 'Through the Fire and Flames', artist: 'DragonForce' },
      { title: 'Scarified', artist: 'Racer X' },
    ],
  },
  Bass: {
    Beginner: [
      { title: 'Seven Nation Army', artist: 'The White Stripes' },
      { title: 'Another One Bites the Dust', artist: 'Queen' },
      { title: 'Come As You Are', artist: 'Nirvana' },
      { title: 'With or Without You', artist: 'U2' },
      { title: 'Billie Jean', artist: 'Michael Jackson' },
      { title: 'Smoke on the Water', artist: 'Deep Purple' },
    ],
    Novice: [
      { title: 'Should I Stay or Should I Go', artist: 'The Clash' },
      { title: 'Under Pressure', artist: 'Queen & David Bowie' },
      { title: 'Sunshine of Your Love', artist: 'Cream' },
      { title: 'Money', artist: 'Pink Floyd' },
      { title: 'Otherside', artist: 'Red Hot Chili Peppers' },
      { title: 'Day Tripper', artist: 'The Beatles' },
    ],
    Intermediate: [
      { title: 'Hysteria', artist: 'Muse' },
      { title: 'Higher Ground', artist: 'Red Hot Chili Peppers' },
      { title: 'Longview', artist: 'Green Day' },
      { title: 'My Generation', artist: 'The Who' },
      { title: 'The Trooper', artist: 'Iron Maiden' },
      { title: 'Around the World', artist: 'Red Hot Chili Peppers' },
    ],
    Advanced: [
      { title: 'YYZ', artist: 'Rush' },
      { title: 'Schism', artist: 'Tool' },
      { title: 'Roundabout', artist: 'Yes' },
      { title: 'Aeroplane', artist: 'Red Hot Chili Peppers' },
      { title: 'Portrait of Tracy', artist: 'Jaco Pastorius' },
      { title: 'Stratus', artist: 'Billy Cobham' },
    ],
    Elite: [
      { title: 'Teen Town', artist: 'Weather Report' },
      { title: 'Donna Lee', artist: 'Jaco Pastorius' },
      { title: 'Classical Thump', artist: 'Victor Wooten' },
      { title: 'Continuum', artist: 'Jaco Pastorius' },
      { title: 'The Dance of Eternity', artist: 'Dream Theater' },
      { title: 'Birdland', artist: 'Weather Report' },
    ],
  },
};

const DEFAULT_INSTRUMENT = 'Guitar';
const DEFAULT_LEVEL = 'Beginner';
const LEVEL_ORDER = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];

function resolveCatalog(instrument, level) {
  const inst = SONG_CATALOG[instrument] ? instrument : DEFAULT_INSTRUMENT;
  const lvl = SONG_CATALOG[inst][level] ? level : DEFAULT_LEVEL;
  return { inst, lvl };
}

// All curated songs for one exact instrument+level, each with a stable id.
function levelSongs(inst, lvl) {
  return (SONG_CATALOG[inst][lvl] || []).map((s, i) => ({
    id: `rec-${inst}-${lvl}-${i}`,
    recommended: true,
    instrument: inst,
    level: lvl,
    ...s,
  }));
}

// Songs for the "Picked for your level" carousel. To give plenty to scroll
// through, this pulls the player's level first, then the level just below
// (easier, familiar) and the level just above (a stretch), de-duped by title.
export function getRecommendedSongs(instrument, level) {
  const { inst, lvl } = resolveCatalog(instrument, level);
  const i = LEVEL_ORDER.indexOf(lvl);
  const order = [lvl, LEVEL_ORDER[i - 1], LEVEL_ORDER[i + 1]].filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const L of order) {
    for (const song of levelSongs(inst, L)) {
      const key = `${song.title.toLowerCase()}|${(song.artist || '').toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(song);
    }
  }
  return out;
}

// Day-of-year index — changes daily but is stable within a single day.
export function getDailyIndex() {
  return Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
}

// The song to feature today — a stable, level-matched recommendation that
// rotates daily. Kept independent of the user's library so it's deterministic
// (the same pick shows on both Today and Practice and can be safely auto-synced).
export function getDailySong(instrument, level) {
  // Stays on the player's EXACT level (not the wider carousel set) so the daily
  // pick is always level-appropriate.
  const { inst, lvl } = resolveCatalog(instrument, level);
  const recs = levelSongs(inst, lvl);
  if (!recs.length) return null;
  return recs[getDailyIndex() % recs.length];
}

// Apple's iTunes Search API is rate-limited (~20 calls/min per IP) and its terms
// ask that results not be persisted to disk. We keep a single in-memory result
// per song for the life of the app session: it both honours the rate limit and
// avoids re-querying the same cover/preview every time a card re-renders. The
// cache is intentionally a plain module-level Map — it clears when the app does.
const _itunesCache = new Map(); // "title|artist" → { artwork, preview }
const _inflight = new Map();    // key → the in-flight promise, so duplicates share one request

// Apple throttles at roughly 20 calls a minute per IP, and when it throttles it
// answers with HTML or an empty body rather than JSON — which is why opening a
// 20-song setlist used to spray "JSON Parse error: Unexpected character: R"
// across the log. Every card asked at once, Apple refused most of them, and
// res.json() threw on the refusal page.
//
// Three guards, in order of importance:
//   1. requests are queued with a gap instead of fired in parallel,
//   2. the body is read as text and only parsed if it actually looks like JSON,
//   3. a throttle or parse failure starts a cooldown, so we stop hammering an
//      API that has already said no.
const ITUNES_GAP_MS = 140;      // ~7 calls/sec ceiling, well under the limit
const ITUNES_COOLDOWN_MS = 60000;
let _queue = Promise.resolve();
let _cooldownUntil = 0;

function _enqueue(fn) {
  const run = _queue.then(fn, fn);
  _queue = run.then(() => new Promise((r) => setTimeout(r, ITUNES_GAP_MS)),
                    () => new Promise((r) => setTimeout(r, ITUNES_GAP_MS)));
  return run;
}

// Fetch + parse defensively. Returns null when iTunes didn't give us JSON,
// rather than throwing a parse error into the caller's console.
export async function itunesGet(url) {
  if (Date.now() < _cooldownUntil) return null;
  const res = await fetch(url);
  if (!res.ok) {                       // 403/429 = throttled
    if (res.status === 403 || res.status === 429) _cooldownUntil = Date.now() + ITUNES_COOLDOWN_MS;
    return null;
  }
  const text = await res.text();
  const body = text.trim();
  if (!body || (body[0] !== '{' && body[0] !== '[')) {
    _cooldownUntil = Date.now() + ITUNES_COOLDOWN_MS;   // an HTML error page
    return null;
  }
  try { return JSON.parse(body); } catch (e) { return null; }
}

async function _lookupSong(title, artist) {
  const key = `${(title || '').toLowerCase().trim()}|${(artist || '').toLowerCase().trim()}`;
  if (_itunesCache.has(key)) return _itunesCache.get(key);
  if (_inflight.has(key)) return _inflight.get(key);     // same song, one request

  const term = encodeURIComponent(`${title} ${artist || ''}`.trim());
  const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=1`;

  const p = _enqueue(async () => {
    let result = { artwork: null, preview: null };
    let ok = false;                    // only a real response (even "no results") is cacheable
    try {
      const json = await itunesGet(url);
      if (json) {
        ok = true;
        const hit = json?.results?.[0];
        if (hit) {
          // iTunes returns 100x100; request a crisper 300x300 by swapping the size token.
          const art = hit.artworkUrl100;
          result = {
            artwork: art ? art.replace('100x100bb', '300x300bb') : null,
            preview: hit.previewUrl || null,
          };
        }
      }
    } catch (e) { /* network hiccup — leave it uncached so it can retry */ }
    // Don't cache a failure: that would poison the song's cover for the session.
    if (ok) _itunesCache.set(key, result);
    _inflight.delete(key);
    return result;
  });

  _inflight.set(key, p);
  return p;
}

// Resolve a free-text query (e.g. "good times bad times by led zep") to the
// canonical track via Apple's iTunes Search API. Returns the proper, fully
// spelled title + artist ("Led Zeppelin", not "led") plus artwork/preview, or
// null if nothing matches. Primes the lookup cache so the resolved song's
// cover/preview aren't fetched again.
export async function searchTrack(queryStr) {
  const q = String(queryStr || '').trim();
  if (!q) return null;
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=1`;
  try {
    const json = await itunesGet(url);
    if (!json) return null;
    const hit = json?.results?.[0];
    if (!hit || !hit.trackName) return null;
    const art = hit.artworkUrl100;
    const result = {
      title: hit.trackName,
      artist: hit.artistName || '',
      artwork: art ? art.replace('100x100bb', '300x300bb') : null,
      preview: hit.previewUrl || null,
    };
    const key = `${result.title.toLowerCase().trim()}|${result.artist.toLowerCase().trim()}`;
    _itunesCache.set(key, { artwork: result.artwork, preview: result.preview });
    return result;
  } catch (e) {
    console.warn('iTunes track search failed:', e);
    return null;
  }
}

// Fetch a 30-second preview clip URL for a song using Apple's free iTunes
// Search API (no auth required). Returns null if no match/preview is found.
export async function fetchSongPreview(title, artist) {
  return (await _lookupSong(title, artist)).preview;
}

// Fetch album artwork for a song via Apple's free iTunes Search API. Returns a
// ~300px square cover image URL, or null if no match is found.
//
// IMPORTANT (App Store / Apple Media Services terms): album artwork must always
// be shown *with a link to the content on an Apple store*. In the UI, tapping a
// cover opens the "Open in Apple Music / Spotify" sheet — never display a cover
// without that path to the store, and never download or bundle these images.
export async function fetchSongArtwork(title, artist) {
  return (await _lookupSong(title, artist)).artwork;
}

// Deep links to play the full song in the user's own music app (these services
// hold the license — Prova just hands off). Both route to the installed app if
// present, otherwise the web player.
export function appleMusicSearchUrl(title, artist) {
  const term = encodeURIComponent(`${title} ${artist || ''}`.trim());
  return `https://music.apple.com/search?term=${term}`;
}

export function spotifySearchUrl(title, artist) {
  const q = encodeURIComponent(`${title} ${artist || ''}`.trim());
  return `https://open.spotify.com/search/${q}`;
}
