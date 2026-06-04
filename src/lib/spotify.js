// Spotify playlist export — creates a real playlist in the user's Spotify
// account from a Prova setlist, using the Spotify Web API.
//
// Auth uses the Authorization Code + PKCE flow (handled in the screen via
// expo-auth-session), so there is NO client secret in the app — the Client ID
// below is public and safe to ship. Get yours from the Spotify Developer
// Dashboard and put it in .env as EXPO_PUBLIC_SPOTIFY_CLIENT_ID.

export const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || '';

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
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify error ${res.status}: ${body.slice(0, 160)}`);
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
export async function exportSetlistToSpotify(token, setlist) {
  const me = await spotifyFetch(token, '/me');
  const userId = me?.id;
  if (!userId) throw new Error('Could not read your Spotify profile.');

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

  const playlist = await spotifyFetch(token, `/users/${userId}/playlists`, {
    method: 'POST',
    body: JSON.stringify({
      name: setlist.name || 'Prova setlist',
      public: false,
      description: `Built with Prova${setlist.setting ? ` for: ${setlist.setting}` : ''}`,
    }),
  });

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
