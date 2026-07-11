// Guitar chord shapes for the Chord Library.
//
// `frets` is low-to-high: [6th (low E), 5th (A), 4th (D), 3rd (G), 2nd (B), 1st (high E)].
//   -1 = muted (×), 0 = open (○), n = press fret n.
// `fingers` (optional, same order) is which finger to use: 0 = open/none, 1–4.
// The diagram component figures out the base fret (for barre shapes higher up
// the neck) from the fret numbers, so shapes can live anywhere on the board.

export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Display order for the type filter (common → niche).
export const CHORD_TYPES = [
  'Major', 'Minor', '7', 'm7', 'maj7', '5', 'sus4', 'sus2',
  '6', 'm6', '9', 'add9', 'maj9', '13', 'dim', 'dim7', 'm7b5', 'aug',
];

const HAND_CHORDS = [
  // C
  { name: 'C',      root: 'C',  type: 'Major', frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  { name: 'Cmaj7',  root: 'C',  type: 'maj7',  frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
  { name: 'C7',     root: 'C',  type: '7',     frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  { name: 'Cm',     root: 'C',  type: 'Minor', frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1] },
  // C#/Db
  { name: 'C#m',    root: 'C#', type: 'Minor', frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1] },
  // D
  { name: 'D',      root: 'D',  type: 'Major', frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  { name: 'Dm',     root: 'D',  type: 'Minor', frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  { name: 'D7',     root: 'D',  type: '7',     frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  { name: 'Dmaj7',  root: 'D',  type: 'maj7',  frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 1, 1] },
  { name: 'Dm7',    root: 'D',  type: 'm7',    frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] },
  { name: 'Dsus4',  root: 'D',  type: 'sus4',  frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 3, 4] },
  { name: 'Dsus2',  root: 'D',  type: 'sus2',  frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0] },
  // E
  { name: 'E',      root: 'E',  type: 'Major', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  { name: 'Em',     root: 'E',  type: 'Minor', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  { name: 'E7',     root: 'E',  type: '7',     frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  { name: 'Em7',    root: 'E',  type: 'm7',    frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] },
  { name: 'Esus4',  root: 'E',  type: 'sus4',  frets: [0, 2, 2, 2, 0, 0], fingers: [0, 1, 2, 3, 0, 0] },
  // F
  { name: 'F',      root: 'F',  type: 'Major', frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1] },
  { name: 'Fmaj7',  root: 'F',  type: 'maj7',  frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
  { name: 'Fm',     root: 'F',  type: 'Minor', frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1] },
  // F#
  { name: 'F#m',    root: 'F#', type: 'Minor', frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1] },
  // G
  { name: 'G',      root: 'G',  type: 'Major', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  { name: 'G7',     root: 'G',  type: '7',     frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  { name: 'Gmaj7',  root: 'G',  type: 'maj7',  frets: [3, 2, 0, 0, 0, 2], fingers: [3, 1, 0, 0, 0, 2] },
  { name: 'Gm',     root: 'G',  type: 'Minor', frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1] },
  // A
  { name: 'A',      root: 'A',  type: 'Major', frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  { name: 'Am',     root: 'A',  type: 'Minor', frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  { name: 'A7',     root: 'A',  type: '7',     frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
  { name: 'Am7',    root: 'A',  type: 'm7',    frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
  { name: 'Amaj7',  root: 'A',  type: 'maj7',  frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0] },
  { name: 'Asus4',  root: 'A',  type: 'sus4',  frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 4, 0] },
  { name: 'Asus2',  root: 'A',  type: 'sus2',  frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0] },
  // B
  { name: 'B',      root: 'B',  type: 'Major', frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 3, 3, 3, 1] },
  { name: 'Bm',     root: 'B',  type: 'Minor', frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1] },
  { name: 'B7',     root: 'B',  type: '7',     frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },
  { name: 'Bm7',    root: 'B',  type: 'm7',    frets: [-1, 2, 0, 2, 0, 2], fingers: [0, 2, 0, 3, 0, 4] },

  // ── Power chords (5) ──
  { name: 'C5',   root: 'C',  type: '5',    frets: [-1, 3, 5, 5, -1, -1], fingers: [0, 1, 3, 4, 0, 0] },
  { name: 'D5',   root: 'D',  type: '5',    frets: [-1, -1, 0, 2, 3, -1], fingers: [0, 0, 0, 1, 2, 0] },
  { name: 'E5',   root: 'E',  type: '5',    frets: [0, 2, 2, -1, -1, -1], fingers: [0, 1, 2, 0, 0, 0] },
  { name: 'F5',   root: 'F',  type: '5',    frets: [1, 3, 3, -1, -1, -1], fingers: [1, 3, 4, 0, 0, 0] },
  { name: 'G5',   root: 'G',  type: '5',    frets: [3, 5, 5, -1, -1, -1], fingers: [1, 3, 4, 0, 0, 0] },
  { name: 'A5',   root: 'A',  type: '5',    frets: [-1, 0, 2, 2, -1, -1], fingers: [0, 0, 1, 2, 0, 0] },

  // ── Sixth (6 / m6) ──
  { name: 'C6',   root: 'C',  type: '6',    frets: [-1, 3, 2, 2, 1, 0], fingers: [0, 4, 2, 3, 1, 0] },
  { name: 'D6',   root: 'D',  type: '6',    frets: [-1, -1, 0, 2, 0, 2], fingers: [0, 0, 0, 2, 0, 3] },
  { name: 'E6',   root: 'E',  type: '6',    frets: [0, 2, 2, 1, 2, 0], fingers: [0, 2, 3, 1, 4, 0] },
  { name: 'G6',   root: 'G',  type: '6',    frets: [3, 2, 0, 0, 0, 0], fingers: [3, 2, 0, 0, 0, 0] },
  { name: 'A6',   root: 'A',  type: '6',    frets: [-1, 0, 2, 2, 2, 2], fingers: [0, 0, 1, 1, 1, 1] },
  { name: 'Em6',  root: 'E',  type: 'm6',   frets: [0, 2, 2, 0, 2, 0], fingers: [0, 2, 3, 0, 4, 0] },
  { name: 'Am6',  root: 'A',  type: 'm6',   frets: [-1, 0, 2, 2, 1, 2], fingers: [0, 0, 2, 3, 1, 4] },
  { name: 'Dm6',  root: 'D',  type: 'm6',   frets: [-1, -1, 0, 2, 0, 1], fingers: [0, 0, 0, 2, 0, 1] },

  // ── Ninth (9 / add9 / maj9) ──
  { name: 'C9',    root: 'C',  type: '9',    frets: [-1, 3, 2, 3, 3, 3], fingers: [0, 2, 1, 3, 3, 3] },
  { name: 'E9',    root: 'E',  type: '9',    frets: [0, 2, 0, 1, 0, 2], fingers: [0, 2, 0, 1, 0, 3] },
  { name: 'A9',    root: 'A',  type: '9',    frets: [-1, 0, 2, 4, 2, 3], fingers: [0, 0, 1, 4, 2, 3] },
  { name: 'B9',    root: 'B',  type: '9',    frets: [-1, 2, 1, 2, 2, 2], fingers: [0, 2, 1, 3, 3, 3] },
  { name: 'Cadd9', root: 'C',  type: 'add9', frets: [-1, 3, 2, 0, 3, 0], fingers: [0, 3, 2, 0, 4, 0] },
  { name: 'Gadd9', root: 'G',  type: 'add9', frets: [3, 2, 0, 2, 0, 3], fingers: [2, 1, 0, 3, 0, 4] },
  { name: 'Cmaj9', root: 'C',  type: 'maj9', frets: [-1, 3, 2, 4, 3, 0], fingers: [0, 2, 1, 4, 3, 0] },

  // ── Thirteenth (13) ──
  { name: 'E13',  root: 'E',  type: '13',   frets: [0, 2, 0, 1, 2, 2], fingers: [0, 2, 0, 1, 3, 4] },
  { name: 'A13',  root: 'A',  type: '13',   frets: [-1, 0, 2, 0, 2, 2], fingers: [0, 0, 2, 0, 3, 4] },

  // ── Diminished (dim / dim7) ──
  { name: 'Adim',  root: 'A', type: 'dim',  frets: [-1, 0, 1, 2, 1, -1], fingers: [0, 0, 1, 3, 2, 0] },
  { name: 'Bdim',  root: 'B', type: 'dim',  frets: [-1, 2, 3, 4, 3, -1], fingers: [0, 1, 2, 4, 3, 0] },
  { name: 'Cdim7', root: 'C', type: 'dim7', frets: [-1, 3, 4, 2, 4, -1], fingers: [0, 2, 3, 1, 4, 0] },
  { name: 'Ddim7', root: 'D', type: 'dim7', frets: [-1, -1, 0, 1, 0, 1], fingers: [0, 0, 0, 2, 0, 3] },
  { name: 'Bdim7', root: 'B', type: 'dim7', frets: [-1, 2, 3, 1, 3, -1], fingers: [0, 2, 3, 1, 4, 0] },

  // ── Half-diminished (m7b5) ──
  { name: 'Am7b5', root: 'A', type: 'm7b5', frets: [-1, 0, 1, 0, 1, -1], fingers: [0, 0, 1, 0, 2, 0] },
  { name: 'Bm7b5', root: 'B', type: 'm7b5', frets: [-1, 2, 3, 2, 3, -1], fingers: [0, 1, 3, 2, 4, 0] },
  { name: 'Em7b5', root: 'E', type: 'm7b5', frets: [0, 1, 2, 0, 3, -1], fingers: [0, 1, 2, 0, 3, 0] },

  // ── Augmented (aug) ──
  { name: 'Caug',  root: 'C', type: 'aug',  frets: [-1, 3, 2, 1, 1, 0], fingers: [0, 4, 3, 1, 2, 0] },
  { name: 'Eaug',  root: 'E', type: 'aug',  frets: [0, 3, 2, 1, 1, 0], fingers: [0, 4, 3, 1, 2, 0] },
  { name: 'Gaug',  root: 'G', type: 'aug',  frets: [3, 2, 1, 0, 0, 3], fingers: [3, 2, 1, 0, 0, 4] },
];

// ── Movable barre chords ────────────────────────────────────────────────────
// The two standard shapes (root on the 6th string = "E shape", root on the 5th
// string = "A shape") slid up the neck to cover every root. Generated so the
// library is complete without hand-typing ~80 chords; exact duplicates of an
// open/hand shape are skipped.
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SUFFIX = { Major: '', Minor: 'm', 7: '7', m7: 'm7', maj7: 'maj7' };

// openIdx = chromatic index of the barre string's open note (6th=E=4, 5th=A=9).
// rel = fret offsets from the barre; fingers = a sensible barre fingering.
const BARRE_SHAPES = [
  { k: 'E', type: 'Major', openIdx: 4, rel: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
  { k: 'E', type: 'Minor', openIdx: 4, rel: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
  { k: 'E', type: '7',     openIdx: 4, rel: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
  { k: 'E', type: 'm7',    openIdx: 4, rel: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
  { k: 'E', type: 'maj7',  openIdx: 4, rel: [0, 2, 1, 1, 0, 0], fingers: [1, 3, 2, 2, 1, 1] },
  { k: 'A', type: 'Major', openIdx: 9, rel: [-1, 0, 2, 2, 2, 0], fingers: [0, 1, 3, 3, 3, 1] },
  { k: 'A', type: 'Minor', openIdx: 9, rel: [-1, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1] },
  { k: 'A', type: '7',     openIdx: 9, rel: [-1, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1] },
  { k: 'A', type: 'm7',    openIdx: 9, rel: [-1, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1] },
  { k: 'A', type: 'maj7',  openIdx: 9, rel: [-1, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 1] },
];

function generateBarres() {
  const seen = new Set(HAND_CHORDS.map((c) => `${c.name}:${c.frets.join(',')}`));
  const out = [];
  for (const s of BARRE_SHAPES) {
    for (let b = 1; b <= 8; b++) { // frets 1–8 covers every root, at least once
      const root = CHROMATIC[(s.openIdx + b) % 12];
      const frets = s.rel.map((f) => (f < 0 ? -1 : b + f));
      const name = root + SUFFIX[s.type];
      const sig = `${name}:${frets.join(',')}`;
      if (seen.has(sig)) continue; // don't duplicate an open/hand shape
      seen.add(sig);
      out.push({ id: `${name}-${s.k}${b}`, name, root, type: s.type, frets, fingers: s.fingers });
    }
  }
  return out;
}

export const GUITAR_CHORDS = [...HAND_CHORDS, ...generateBarres()];
