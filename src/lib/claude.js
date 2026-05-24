import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

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
    "monday": { "sessions": [...] } or null if not available,
    "tuesday": { "sessions": [...] } or null,
    "wednesday": { "sessions": [...] } or null,
    "thursday": { "sessions": [...] } or null,
    "friday": { "sessions": [...] } or null,
    "saturday": { "sessions": [...] } or null,
    "sunday": { "sessions": [...] } or null
  }
}

Each session object:
{
  "id": "unique_string",
  "title": "Exercise name",
  "description": "What to do and how",
  "duration": number_in_minutes,
  "category": "warmup" | "technique" | "theory" | "ear_training" | "repertoire" | "improvisation"
}

Rules:
- Total session durations must equal the daily practice time
- Be very specific (e.g. "A minor pentatonic scale, 3 positions, 60bpm" not "practice scales")
- Vary exercises across the week to prevent boredom
- Start with warmup each session
- Match difficulty to the user's level
- Only include days the user marked as available

Return only valid JSON, no markdown, no explanation.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].text;
  return JSON.parse(text);
}

export async function adjustSessionFromRating(session, rating, feedback) {
  const prompt = `You are Prova, a music practice coach. A user just completed a practice session and gave feedback.

Session that was completed:
${JSON.stringify(session, null, 2)}

User rating: ${rating} (options: "too_easy", "just_right", "too_hard")
User feedback: "${feedback || 'No additional feedback'}"

Generate an adjusted version of this session for next time. Return only a JSON array of session objects with the same structure. Make it harder if "too_easy", easier if "too_hard", or slightly progress if "just_right".

Return only valid JSON array, no markdown.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  return JSON.parse(message.content[0].text);
}
