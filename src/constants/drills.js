// The skill-drill mini-games, in one place so the Today screen, the teacher's
// assign-task modal and the student's teacher-task card all agree on the same
// keys, labels, icons and routes. `route` is the screen name inside PracticeStack;
// `counter` is the per-game daily counter field on the user doc.
export const DRILLS = [
  { key: 'ear',    title: 'Ear training',  sub: 'Name what you hear',  icon: 'ear-outline',    route: 'EarTraining',   counter: 'earTraining' },
  { key: 'rhythm', title: 'Rhythm tapper', sub: 'Lock in your timing', icon: 'pulse',          route: 'RhythmTapper',  counter: 'rhythmTapper' },
  { key: 'fret',   title: 'Fretboard',     sub: 'Find the note',       icon: 'locate',         route: 'FretboardGame', counter: 'fretGame' },
  { key: 'theory', title: 'Theory quiz',   sub: 'Test your knowledge', icon: 'school-outline', route: 'TheoryQuiz',    counter: 'theoryQuiz' },
];

export const getDrill = (key) => DRILLS.find((d) => d.key === key) || null;

// Two drills for today, rotating by day so it varies but is stable within a day.
export function pickTodaysDrills() {
  const dayIdx = Math.floor(Date.now() / 86400000);
  return [DRILLS[dayIdx % DRILLS.length], DRILLS[(dayIdx + 1) % DRILLS.length]];
}
