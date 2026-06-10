// Spotify playlist export — creates a real playlist in the user's Spotify
// account from a Prova setlist, using the Spotify Web API.
//
// Auth uses the Authorization Code + PKCE flow (handled in the screen via
// expo-auth-session), so there is NO client secret in the app — the Client ID
// below is public and safe to ship. Get yours from the Spotify Developer
// Dashboard and put it in .env as EXPO_PUBLIC_SPOTIFY_CLIENT_ID.

export const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || '';

// Spotify export is fully built but hidden for now: the OAuth redirect is
// unstable in Expo Go (it's tied to the laptop's changing IP). Flip this to
// true once Prova runs as a development build with the fixed `prova://` scheme —
// then register `prova://redirect` once in the Spotify dashboard and it works.
export const SPOTIFY_EXPORT_ENABLED = false;

// We only need to create playlists and add tracks — nothing else.
export const SPOTIFY_SCOPES = ['playlist-modify-public', 'playlist-modify-private'];

// OAuth endpoints for expo-auth-session's useAuthRequest.
export const SPOTIFY_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

export const isSpotifyConfigured = () => SPOTIFY_CLIENT_ID.length > 0;

async function spotifyFetch(token, path, options = {}) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) throw new Error('Spotify session expired — please connect again.');
  if (res.status === 403) {
    // In Development mode Spotify only allows allowlisted accounts. This is the
    // usual cause of a 403 on a fresh app — surface it in plain language.
    const endpoint = path.split('?')[0];
    throw new Error(
      `Spotify blocked this (403) on ${endpoint}. Your app is in Development mode, so the Spotify account you logged in with must be added under the app's "User Management" with the exact email it uses.`,
    );
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify error ${res.status} on ${path.split('?')[0]}: ${body.slice(0, 140)}`);
  }
  return res.status === 204 ? null : res.json();
}

// Find a single best-match track URI for a song. Returns null if nothing matches.
async function findTrackUri(token, title, artist) {
  const q = artist ? `track:${title} artist:${artist}` : `track:${title}`;
  const data = await spotifyFetch(token, `/search?type=track&limit=1&q=${encodeURIComponent(q)}`);
  let uri = data?.tracks?.items?.[0]?.uri || null;
  // Fall back to a looser free-text search if the structured query missed.
  if (!uri) {
    const loose = await spotifyFetch(
      token,
      `/search?type=track&limit=1&q=${encodeURIComponent(`${title} ${artist || ''}`.trim())}`,
    );
    uri = loose?.tracks?.items?.[0]?.uri || null;
  }
  return uri;
}

// Create a Spotify playlist named after the setlist and fill it with its songs.
// Returns { url, addedCount, missed: [{title, artist}] }.
export async function exportSetlistToSpotify(token, setlist, grantedScope = '') {
  const me = await spotifyFetch(token, '/me');
  const userId = me?.id;
  if (!userId) throw new Error('Could not read your Spotify profile.');
  const who = me?.display_name ? `${me.display_name} (${userId})` : userId;
  // If Spotify never granted the playlist permission, fail early with a clear
  // message rather than a bare 403 on the create call.
  if (!grantedScope.includes('playlist-modify')) {
    throw new Error(
      `Logged in as: ${who}\n\nSpotify did NOT grant playlist permission.\nGranted: "${grantedScope || 'nothing'}".\n\nThis means the consent screen wasn't accepted with the playlist permissions — try again and tap Agree.`,
    );
  }

  // Resolve every song to a Spotify URI (in parallel), tracking misses.
  const uris = [];
  const missed = [];
  await Promise.all(
    (setlist.songs || []).map(async (s) => {
      try {
        const uri = await findTrackUri(token, s.title, s.artist);
        if (uri) uris.push(uri);
        else missed.push({ title: s.title, artist: s.artist });
      } catch {
        missed.push({ title: s.title, artist: s.artist });
      }
    }),
  );

  let playlist;
  try {
    playlist = await spotifyFetch(token, `/users/${userId}/playlists`, {
      method: 'POST',
      body: JSON.stringify({
        name: setlist.name || 'Prova setlist',
        public: false,
        description: `Built with Prova${setlist.setting ? ` for: ${setlist.setting}` : ''}`,
      }),
    });
  } catch (e) {
    if (String(e.message).includes('403')) {
      throw new Error(
        `Logged in as: ${who}\n\nSpotify blocked creating a playlist (403), even though permission was granted. This account is not the app owner and isn't on the allowlist.\n\nFix: in the Spotify dashboard → Prova → User Management, add THIS account's email — or log in with the account that created the app.`,
      );
    }
    throw e;
  }

  // Add tracks in batches of 100 (Spotify's per-request limit), preserving order.
  for (let i = 0; i < uris.length; i += 100) {
    await spotifyFetch(token, `/playlists/${playlist.id}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
  }

  return {
    url: playlist?.external_urls?.spotify || null,
    addedCount: uris.length,
    missed,
  };
}
