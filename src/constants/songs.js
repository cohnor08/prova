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

// Songs curated for the given instrument + level, each with a stable id so it
// can be featured/tagged consistently across renders and screens.
export function getRecommendedSongs(instrument, level) {
  const inst = SONG_CATALOG[instrument] ? instrument : DEFAULT_INSTRUMENT;
  const lvl = SONG_CATALOG[inst][level] ? level : DEFAULT_LEVEL;
  return SONG_CATALOG[inst][lvl].map((s, i) => ({
    id: `rec-${inst}-${lvl}-${i}`,
    recommended: true,
    instrument: inst,
    level: lvl,
    ...s,
  }));
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
  const recs = getRecommendedSongs(instrument, level);
  if (!recs.length) return null;
  return recs[getDailyIndex() % recs.length];
}

// Apple's iTunes Search API is rate-limited (~20 calls/min per IP) and its terms
// ask that results not be persisted to disk. We keep a single in-memory result
// per song for the life of the app session: it both honours the rate limit and
// avoids re-querying the same cover/preview every time a card re-renders. The
// cache is intentionally a plain module-level Map — it clears when the app does.
const _itunesCache = new Map(); // "title|artist" → { artwork, preview }

async function _lookupSong(title, artist) {
  const key = `${(title || '').toLowerCase().trim()}|${(artist || '').toLowerCase().trim()}`;
  if (_itunesCache.has(key)) return _itunesCache.get(key);

  const term = encodeURIComponent(`${title} ${artist || ''}`.trim());
  const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=1`;
  let result = { artwork: null, preview: null };
  try {
    const res = await fetch(url);
    const json = await res.json();
    const hit = json?.results?.[0];
    if (hit) {
      // iTunes returns 100x100; request a crisper 300x300 by swapping the size token.
      const art = hit.artworkUrl100;
      result = {
        artwork: art ? art.replace('100x100bb', '300x300bb') : null,
        preview: hit.previewUrl || null,
      };
    }
  } catch (e) {
    console.warn('iTunes lookup failed:', e);
  }
  _itunesCache.set(key, result);
  return result;
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
