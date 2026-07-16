// The skill-drill mini-games, in one place so the Today screen, the teacher's
// assign-task modal and the student's teacher-task card all agree on the same
// keys, labels, icons and routes. `route` is the screen name inside PracticeStack
// (and the teacher's Resources stack); `counter` is the per-game daily counter
// field on the user doc.
//
// Each game's level count depends on which MODE you're in — ear training has
// three scale levels but four interval levels — so levels live on the mode, not
// the drill. A drill with no modes (theory quiz) carries a plain `levels`.
export const DRILLS = [
  {
    key: 'ear', title: 'Ear training', sub: 'Name what you hear',
    icon: 'ear-outline', route: 'EarTraining', counter: 'earTraining',
    modes: [
      { key: 'intervals', label: 'Intervals', levels: 4 },
      { key: 'chords', label: 'Chords', levels: 4 },
      { key: 'scales', label: 'Scales', levels: 3 },
    ],
  },
  {
    key: 'rhythm', title: 'Rhythm tapper', sub: 'Lock in your timing',
    icon: 'pulse', route: 'RhythmTapper', counter: 'rhythmTapper',
    modes: [
      { key: 'click', label: 'With click', levels: 4 },
      { key: 'hold', label: 'Hold the time', levels: 4 },
    ],
  },
  {
    key: 'fret', title: 'Fretboard', sub: 'Find the note',
    icon: 'locate', route: 'FretboardGame', counter: 'fretGame',
    modes: [
      { key: 'find', label: 'Find the note', levels: 4 },
      { key: 'name', label: 'Name the note', levels: 4 },
    ],
  },
  {
    key: 'theory', title: 'Theory quiz', sub: 'Test your knowledge',
    icon: 'school-outline', route: 'TheoryQuiz', counter: 'theoryQuiz',
    modes: [],
    levels: 3,
  },
];

export const getDrill = (key) => DRILLS.find((d) => d.key === key) || null;

// The modes a drill offers ([] when it has none).
export const drillModes = (key) => getDrill(key)?.modes || [];

// The mode object for a drill, falling back to its first mode so a task saved
// without one still resolves to something playable.
export const getDrillMode = (key, modeKey) => {
  const modes = drillModes(key);
  if (!modes.length) return null;
  return modes.find((m) => m.key === modeKey) || modes[0];
};

// How many levels this drill has in this mode. Modeless drills use `levels`.
export function drillLevelCount(key, modeKey) {
  const d = getDrill(key);
  if (!d) return 0;
  const mode = getDrillMode(key, modeKey);
  return mode ? mode.levels : (d.levels || 0);
}

// "Intervals · Level 2" / "Level 2" — one label for a saved drill assignment.
export function drillAssignmentLabel(key, modeKey, level) {
  const mode = getDrillMode(key, modeKey);
  const lvl = level ? `Level ${level}` : '';
  if (!mode) return lvl;
  return lvl ? `${mode.label} · ${lvl}` : mode.label;
}

// Two drills for today, rotating by day so it varies but is stable within a day.
export function pickTodaysDrills() {
  const dayIdx = Math.floor(Date.now() / 86400000);
  return [DRILLS[dayIdx % DRILLS.length], DRILLS[(dayIdx + 1) % DRILLS.length]];
}
