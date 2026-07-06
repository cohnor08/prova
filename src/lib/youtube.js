import { auth } from './firebase';

const FUNCTIONS_BASE = 'https://us-central1-prova-583c9.cloudfunctions.net';

// Search YouTube for real, embeddable videos matching a phrase.
// Returns { results: [{ videoId, title, channel, thumbnail }], cached }.
// Mirrors the manual fetch/ID-token approach in src/lib/claude.js (httpsCallable
// is unreliable in React Native).
export async function searchYouTube(q, max = 6) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');

  const idToken = await user.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${FUNCTIONS_BASE}/searchYouTube`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ data: { q, max } }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Server error ${response.status}: ${text.slice(0, 200)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Bad response (${response.status})`);
    }
    if (json.error) throw new Error(json.error.message || 'Search failed');

    const result = json.result || {};
    return { results: Array.isArray(result.results) ? result.results : [], cached: !!result.cached };
  } finally {
    clearTimeout(timeoutId);
  }
}
