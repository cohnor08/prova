// Scales for the library, as semitone intervals from the root.
// The diagram maps these onto the fretboard for any root.

export const SCALE_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SCALES = [
  // Common
  { name: 'Major',            intervals: [0, 2, 4, 5, 7, 9, 11] }, // Ionian
  { name: 'Minor',            intervals: [0, 2, 3, 5, 7, 8, 10] }, // natural minor / Aeolian
  { name: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10] },
  { name: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9] },
  { name: 'Blues',            intervals: [0, 3, 5, 6, 7, 10] },
  { name: 'Major Blues',      intervals: [0, 2, 3, 4, 7, 9] },
  // Modes of the major scale
  { name: 'Dorian',           intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Phrygian',         intervals: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'Lydian',           intervals: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'Mixolydian',       intervals: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Locrian',          intervals: [0, 1, 3, 5, 6, 8, 10] },
  // Minor variants + exotic
  { name: 'Harmonic Minor',    intervals: [0, 2, 3, 5, 7, 8, 11] },
  { name: 'Melodic Minor',     intervals: [0, 2, 3, 5, 7, 9, 11] },
  { name: 'Phrygian Dominant', intervals: [0, 1, 4, 5, 7, 8, 10] },
  { name: 'Whole Tone',        intervals: [0, 2, 4, 6, 8, 10] },
  { name: 'Diminished (W–H)',  intervals: [0, 2, 3, 5, 6, 8, 9, 11] },
  { name: 'Diminished (H–W)',  intervals: [0, 1, 3, 4, 6, 7, 9, 10] },
];

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Standard tuning, high E (1st string) first → low E (6th) last, as pitch classes
// (C = 0). Matches TAB orientation (high string on top).
export const OPEN_STRINGS = [
  { label: 'E', pc: 4 },
  { label: 'B', pc: 11 },
  { label: 'G', pc: 7 },
  { label: 'D', pc: 2 },
  { label: 'A', pc: 9 },
  { label: 'E', pc: 4 },
];
