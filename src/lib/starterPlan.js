// A practice plan built on the device, for when the AI one can't be reached.
//
// Onboarding used to write `onboardingComplete: true` only after
// generatePracticePlan returned. When that call failed the flag was never
// written, so the person landed back on the same screen — tap Finish, same
// error, forever. No way into the app at all. A brand-new user hitting a dead
// end in their first thirty seconds is the worst failure the app has, and it
// was one outage away the whole time.
//
// So the AI plan is now an upgrade rather than a gate. This is deliberately
// modest — real exercises with real fret numbers, matched to instrument and
// level, and nothing pretending to be personalised. `isStarter: true` marks it
// so Today can offer to build the real one once the service is back.
//
// Shape matches the AI contract exactly (see functions/index.js):
//   { weeklyPlan: { monday: { sessions: [...] } | null, ... } }
//   session: { id, title, description, duration, category, reference }

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Two blocks per instrument per broad level. Kept short on purpose — a starter
// plan that looks over-confident is worse than one that's obviously a starting
// point.
const GUITAR = {
  beginner: [
    { t: 'Finger warm-up', c: 'warmup', d: 5,
      x: 'Low E string, frets 1-2-3-4 with one finger each, one note per beat at 60 BPM. Then the same on every string and back down.',
      r: 'guitar finger warm up 1234 exercise beginner' },
    { t: 'G to C chord changes', c: 'technique', d: 10,
      x: 'G = low-E 3rd fret, A 2nd fret, high-E 3rd fret. C = A 3rd fret, D 2nd fret, B 1st fret. Switch every 4 strums for 10 minutes. Keep strumming through the change even if it buzzes.',
      r: 'G to C chord change beginner guitar lesson' },
    { t: 'Smoke on the Water riff', c: 'repertoire', d: 10,
      x: 'On the D string: 0-3-5, then 0-3-6-5, then 0-3-5, then 3-0. Loop slowly until it is clean, then speed up.',
      r: 'smoke on the water riff guitar lesson slow' },
  ],
  intermediate: [
    { t: 'Spider walk', c: 'warmup', d: 5,
      x: 'Frets 1-2-3-4 across all six strings with strict alternate picking, 80 BPM, no buzzing. Down and back.',
      r: 'spider walk guitar warm up exercise' },
    { t: 'A minor pentatonic, position 1', c: 'technique', d: 12,
      x: 'Starts low-E 5th fret. Ascend and descend with strict alternate picking at 80 BPM. Every note clean before you push the tempo.',
      r: 'a minor pentatonic position 1 alternate picking' },
    { t: 'F barre to C', c: 'technique', d: 8,
      x: 'F major barre at the 1st fret, E-shape, all six strings ringing. Switch to open C and back, 8 clean reps. Roll the index slightly onto its side.',
      r: 'F barre chord to C change clean guitar' },
  ],
  advanced: [
    { t: 'Chromatic warm-up at tempo', c: 'warmup', d: 5,
      x: '1-2-3-4 across all strings in 16th notes at 110 BPM, strict alternate picking, perfectly even.',
      r: 'chromatic warm up 16th notes guitar 110 bpm' },
    { t: 'Pentatonic, five positions', c: 'technique', d: 15,
      x: 'A minor pentatonic through all five connected boxes up the neck, alternate picking at 90 BPM. Focus on the position shifts, not the runs.',
      r: 'five pentatonic positions connected guitar' },
    { t: 'Three-string sweep', c: 'technique', d: 10,
      x: 'A minor arpeggio on G/B/high-E at frets 12-14, one note per string, 10 perfect reps up and down at 100 BPM. Mute behind each note.',
      r: 'three string sweep picking arpeggio exercise' },
  ],
};

const BASS = {
  beginner: [
    { t: 'Lock to the click', c: 'warmup', d: 5,
      x: 'Open E on every beat at 70 BPM for 5 minutes. Dead-on timing is the whole goal — nothing else.',
      r: 'bass timing exercise metronome beginner' },
    { t: 'Root notes E, A, D', c: 'technique', d: 10,
      x: 'Hold open E, then A, then D for 4 beats each, looped to a metronome at 70 BPM. Alternate index and middle finger.',
      r: 'bass root notes beginner exercise' },
    { t: 'Seven Nation Army', c: 'repertoire', d: 10,
      x: 'The main line on the A string: 7-7-10-7-5-3-2. Loop it slowly, then bring it up to speed.',
      r: 'seven nation army bass lesson slow' },
  ],
  intermediate: [
    { t: 'Octave jumps', c: 'warmup', d: 5,
      x: 'A on the E string 5th fret to its octave on the D string 7th fret, back and forth at 80 BPM. Mute the strings between.',
      r: 'bass octave exercise' },
    { t: 'Two-octave G major', c: 'technique', d: 12,
      x: 'G major from the E string 3rd fret, two octaves up and down at 90 BPM, one finger per fret.',
      r: 'two octave major scale bass exercise' },
    { t: 'Walking line in A', c: 'improvisation', d: 8,
      x: 'Quarter-note walk A – C# – E – G under a steady click at 80 BPM. Land a chord tone on every beat one.',
      r: 'walking bass line beginner intermediate' },
  ],
  advanced: [
    { t: 'Three-finger raking', c: 'warmup', d: 5,
      x: 'Three-finger raking across strings, 16th notes at 110 BPM, perfectly even attack and muting.',
      r: 'three finger bass technique fast' },
    { t: '12-bar blues walk', c: 'improvisation', d: 15,
      x: 'Walk a bassline over a 12-bar blues in A. Quarter notes, chord tones on the beat, smooth voice-leading between changes.',
      r: '12 bar blues walking bass line A' },
    { t: 'Slap and pop', c: 'technique', d: 10,
      x: 'Thumb the E, pop the G, steady 16th notes at 100 BPM. Judge it on every note being the same volume, not on speed.',
      r: 'slap bass exercise thumb pop' },
  ],
};

const band = (level) => {
  const l = String(level || '').toLowerCase();
  if (l === 'advanced' || l === 'elite') return 'advanced';
  if (l === 'beginner' || l === 'novice') return 'beginner';
  return 'intermediate';
};

// → the same object shape generatePracticePlan returns.
export function buildStarterPlan(profile = {}) {
  const set = (profile.instrument === 'Bass' ? BASS : GUITAR)[band(profile.level)];

  // Only the days they said they're free. Falling back to all seven would set
  // someone up to break a streak in week one.
  const chosen = Array.isArray(profile.availableDays) && profile.availableDays.length
    ? profile.availableDays.map((d) => String(d).toLowerCase())
    : DAYS;

  // Scale to the time they asked for, keeping the proportions of the set and
  // never dropping a block below 3 minutes.
  const target = Number(profile.dailyDuration) || 30;
  const base = set.reduce((n, s) => n + s.d, 0);
  const scale = target / base;

  const weeklyPlan = {};
  for (const day of DAYS) {
    if (!chosen.includes(day)) { weeklyPlan[day] = null; continue; }
    weeklyPlan[day] = {
      sessions: set.map((s, i) => ({
        id: `starter_${day}_${i}`,
        title: s.t,
        description: s.x,
        duration: Math.max(3, Math.round(s.d * scale)),
        category: s.c,
        reference: s.r,
      })),
    };
  }
  return { weeklyPlan, isStarter: true };
}
