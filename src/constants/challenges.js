import { getDailyIndex } from './songs';

// The "daily challenge" — a quick, doable task that keeps a streak alive on days
// a full session doesn't happen, and pays a little Prova Score. One is featured
// per day (rotates deterministically), so it's the same all day and changes
// tomorrow.

export const CHALLENGE_POINTS = 75;

const CHALLENGES = [
  { icon: 'flash',         title: 'Clean chord changes', detail: 'Switch between two tricky chords for 3 minutes — no stopping, no buzzing.' },
  { icon: 'speedometer',   title: 'Beat the clock',       detail: 'Play a scale to a metronome, then nudge the tempo up a few BPM over 5 minutes.' },
  { icon: 'ear',           title: 'Learn it by ear',      detail: 'Pick a short riff you love and figure it out by ear — no tabs allowed.' },
  { icon: 'repeat',        title: 'Loop the hard bit',    detail: 'Take the trickiest bar of a song and loop it slowly 10 times, perfectly.' },
  { icon: 'flame',         title: 'Improvise',            detail: 'Improvise for 5 minutes over a backing track, a drone, or a single chord.' },
  { icon: 'barbell',       title: 'Finger gym',           detail: 'Run a 1-2-3-4 finger-independence exercise across all strings for 3 minutes.' },
  { icon: 'musical-notes', title: 'Write a riff',         detail: 'Make up a 4-bar riff of your own and play it until it sticks.' },
  { icon: 'trending-up',   title: 'Slow to fast',         detail: 'Play a lick perfectly at half speed, then build it back up to full tempo.' },
  { icon: 'pulse',         title: 'Lock the groove',      detail: 'Play along to a song and focus only on staying perfectly in time for 5 minutes.' },
  { icon: 'headset',       title: 'Play it through',      detail: 'Pick one song you know and play it start to finish without stopping.' },
  { icon: 'hand-left',     title: 'Stretch & warm up',    detail: 'Spend 3 minutes on slow chromatic stretches to loosen your fretting hand.' },
  { icon: 'sparkles',      title: 'Try something new',    detail: 'Learn one new chord, scale shape, or technique you have never played before.' },
];

// Today's featured challenge (stable within the day).
export function getDailyChallenge() {
  return CHALLENGES[getDailyIndex() % CHALLENGES.length];
}
