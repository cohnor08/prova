const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';
const API_URL = 'https://api.anthropic.com/v1/messages';

async function callClaude(prompt, maxTokens = 2000, model = 'claude-haiku-4-5-20251001') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generatePracticePlan(userProfile) {
  const { instrument, level, goals, skills, availableDays, dailyDuration } = userProfile;

  const prompt = `You are Prova, a world-class music practice coach. Generate a structured weekly practice plan for a ${instrument} player.

User Profile:
- Instrument: ${instrument}
- Level: ${level}
- Goals: ${goals.join(', ')}
- Skills to focus on: ${skills.join(', ')}
- Available days: ${availableDays.join(', ')}
- Daily practice time: ${dailyDuration} minutes

Generate a JSON response with this exact structure:
{
  "weeklyPlan": {
    "monday": { "sessions": [...] },
    "tuesday": { "sessions": [...] },
    "wednesday": { "sessions": [...] },
    "thursday": { "sessions": [...] },
    "friday": { "sessions": [...] },
    "saturday": { "sessions": [...] },
    "sunday": { "sessions": [...] }
  }
}

For days the user is NOT available, set the value to null instead of an object.

Each session object:
{
  "id": "unique_string",
  "title": "Exercise name",
  "description": "What to do and how",
  "duration": number_in_minutes,
  "category": "warmup" | "technique" | "theory" | "ear_training" | "repertoire" | "improvisation"
}

Rules:
- Total session durations must equal the daily practice time exactly
- Be very specific (e.g. "A minor pentatonic, positions 1-3 at 60bpm" not "practice scales")
- Always start with a warmup
- Match difficulty to the user's level
- Only include sessions for available days, set others to null

Return only valid JSON, no markdown fences, no explanation.`;

  const text = await callClaude(prompt, 4000);
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

export async function adjustSessionFromRating(sessions, rating, feedback) {
  const prompt = `You are Prova, a music practice coach. A user just completed a practice session.

Session completed:
${JSON.stringify(sessions, null, 2)}

Rating: ${rating} (too_easy / just_right / too_hard)
Feedback: "${feedback || 'None'}"

Return an adjusted JSON array of session objects for next time. Same structure as input. Make harder if too_easy, easier if too_hard, slightly progress if just_right.

Return only a valid JSON array, no markdown.`;

  const text = await callClaude(prompt, 1000);
  return JSON.parse(text);
}
