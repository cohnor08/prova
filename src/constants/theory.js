// Music-theory quiz question generators. Everything is computed from chromatic
// indices so answers are always correct; note names use sharps and the root
// pools are curated so the sharp spelling is the theoretically right one for
// that key/chord (e.g. A major → A C# E, never a flat). Four categories, each
// with three difficulty levels. makeTheoryQuestion(categoryId, level) returns
// { prompt, answer, choices } with the answer shuffled into four choices.

const CHROMA = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const idx = (n) => CHROMA.indexOf(n);
const note = (i) => CHROMA[(((i % 12) + 12) % 12)];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

// On the hardest level, choicesFrom widens to the WHOLE pool (recall mode) —
// name it, don't pick from four. Toggled per question by makeTheoryQuestion.
let RECALL = false;

// Build unique choices that include `answer`, drawing the rest from `pool`.
// n is the cap; in recall mode the cap lifts to the full pool.
function choicesFrom(answer, pool, n = 4) {
  const cap = RECALL ? pool.length + 1 : n;
  const set = new Set([answer]);
  for (const x of shuffle(pool)) {
    if (set.size >= cap) break;
    if (x !== answer) set.add(x);
  }
  return shuffle([...set]);
}

export const CATEGORIES = [
  { id: 'intervals', label: 'Intervals' },
  { id: 'chords', label: 'Chords' },
  { id: 'keys', label: 'Keys' },
  { id: 'scales', label: 'Scales' },
];

const INTERVALS = [
  { name: 'Minor 2nd', semis: 1 }, { name: 'Major 2nd', semis: 2 },
  { name: 'Minor 3rd', semis: 3 }, { name: 'Major 3rd', semis: 4 },
  { name: 'Perfect 4th', semis: 5 }, { name: 'Tritone', semis: 6 },
  { name: 'Perfect 5th', semis: 7 }, { name: 'Minor 6th', semis: 8 },
  { name: 'Major 6th', semis: 9 }, { name: 'Minor 7th', semis: 10 },
  { name: 'Major 7th', semis: 11 }, { name: 'Octave', semis: 12 },
];
const INTERVAL_SETS = {
  1: INTERVALS.filter((i) => [3, 4, 5, 7, 12].includes(i.semis)),
  2: INTERVALS.filter((i) => [2, 3, 4, 5, 7, 9, 12].includes(i.semis)),
  3: INTERVALS,
};
// Roots whose sharp spelling reads naturally.
const CLEAN_ROOTS = ['C', 'G', 'D', 'A', 'E', 'F', 'B'];

function genInterval(level) {
  const set = INTERVAL_SETS[level] || INTERVALS;
  const iv = pick(set);
  const roll = Math.random();
  if (roll < 0.4) {
    return {
      prompt: `How many semitones are in a ${iv.name}?`,
      answer: String(iv.semis),
      choices: choicesFrom(String(iv.semis), INTERVALS.map((x) => String(x.semis))),
    };
  }
  if (level >= 3 && roll < 0.7) {
    const a = pick(CLEAN_ROOTS);
    const b = note(idx(a) + iv.semis);
    return {
      prompt: `Ascending, the interval from ${a} to ${b} is?`,
      answer: iv.name,
      choices: choicesFrom(iv.name, INTERVALS.map((x) => x.name)),
    };
  }
  const root = pick(CLEAN_ROOTS);
  const target = note(idx(root) + iv.semis);
  return {
    prompt: `A ${iv.name} above ${root} is which note?`,
    answer: target,
    choices: choicesFrom(target, CHROMA),
  };
}

const TRIADS = {
  Major: [0, 4, 7], Minor: [0, 3, 7], Diminished: [0, 3, 6], Augmented: [0, 4, 8],
};
const MAJOR_ROOTS = ['C', 'G', 'D', 'A', 'E', 'F'];
const MINOR_ROOTS = ['A', 'E', 'B', 'D', 'F#', 'C#'];
const spell = (root, offsets) => offsets.map((o) => note(idx(root) + o)).join(' – ');

function genChord(level) {
  const qualities = level === 1 ? ['Major', 'Minor'] : level === 2 ? ['Major', 'Minor', 'Diminished'] : ['Major', 'Minor', 'Diminished', 'Augmented'];
  const quality = pick(qualities);
  const rootPool = quality === 'Minor' ? MINOR_ROOTS : MAJOR_ROOTS;
  const root = pick(rootPool);
  const offsets = TRIADS[quality];
  const roll = Math.random();
  if (roll < 0.4) {
    // Name the third (major/minor triads only) or the fifth.
    const which = quality === 'Diminished' || Math.random() < 0.5 ? 5 : 3;
    const off = which === 3 ? offsets[1] : offsets[2];
    const target = note(idx(root) + off);
    return {
      prompt: `The ${which === 3 ? '3rd' : '5th'} of ${root} ${quality.toLowerCase()} is?`,
      answer: target,
      choices: choicesFrom(target, CHROMA),
    };
  }
  if (roll < 0.7) {
    const target = spell(root, offsets);
    const wrong = shuffle(rootPool).filter((r) => r !== root).slice(0, 2).map((r) => spell(r, offsets));
    const otherQ = pick(Object.keys(TRIADS).filter((q) => q !== quality));
    return {
      prompt: `Which notes spell a ${root} ${quality.toLowerCase()} triad?`,
      answer: target,
      choices: shuffle([target, ...wrong, spell(root, TRIADS[otherQ])]).slice(0, 4),
    };
  }
  const spelled = spell(root, offsets);
  const label = `${root} ${quality.toLowerCase()}`;
  const wrongLabels = shuffle([...new Set([...MAJOR_ROOTS, ...MINOR_ROOTS])]).filter((r) => r !== root).slice(0, 3)
    .map((r) => `${r} ${quality.toLowerCase()}`);
  return {
    prompt: `${spelled} — which chord is this?`,
    answer: label,
    choices: shuffle([label, ...wrongLabels]),
  };
}

// [key, sharps]. Relative-minor roots kept to clean spellings.
const SHARP_KEYS = [['G', 1], ['D', 2], ['A', 3], ['E', 4], ['B', 5], ['F#', 6]];
const FLAT_KEYS = [['F', 1], ['Bb', 2], ['Eb', 3], ['Ab', 4], ['Db', 5]];
const RELMINOR_KEYS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb'];

function genKey(level) {
  const roll = Math.random();
  if (level >= 3 && roll < 0.45) {
    const key = pick(RELMINOR_KEYS);
    // idx() only knows sharps, so map the one flat root we use by pitch class.
    const rootIdx = key === 'Bb' ? 10 : idx(key);
    const ans = `${note(rootIdx - 3)} minor`;
    return {
      prompt: `The relative minor of ${key} major is?`,
      answer: ans,
      choices: choicesFrom(ans, CHROMA.map((n) => `${n} minor`)),
    };
  }
  if (level >= 2 && roll < 0.5) {
    const [key, n] = pick(FLAT_KEYS);
    return {
      prompt: `How many flats are in the key of ${key} major?`,
      answer: String(n),
      choices: choicesFrom(String(n), ['0', '1', '2', '3', '4', '5', '6']),
    };
  }
  if (roll < 0.75) {
    const [key, n] = pick(SHARP_KEYS.slice(0, level === 1 ? 3 : 6));
    return {
      prompt: `How many sharps are in the key of ${key} major?`,
      answer: String(n),
      choices: choicesFrom(String(n), ['0', '1', '2', '3', '4', '5', '6']),
    };
  }
  const [key, n] = pick(SHARP_KEYS.slice(0, level === 1 ? 3 : 6));
  return {
    prompt: `Which major key has ${n} sharp${n === 1 ? '' : 's'}?`,
    answer: key,
    choices: choicesFrom(key, SHARP_KEYS.map((k) => k[0])),
  };
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const DEGREE_NAMES = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
// Roots whose major scale is entirely natural/sharp (correct sharp spelling).
const SCALE_ROOTS = ['C', 'G', 'D', 'A', 'E', 'B'];

function genScale(level) {
  const root = pick(SCALE_ROOTS.slice(0, level === 1 ? 3 : 6));
  const inScale = MAJOR_SCALE.map((s) => note(idx(root) + s));
  const roll = Math.random();
  if (roll < 0.5) {
    const outNote = pick(CHROMA.filter((n) => !inScale.includes(n)));
    return {
      prompt: `Which note is NOT in the ${root} major scale?`,
      answer: outNote,
      choices: shuffle([outNote, ...shuffle(inScale).slice(0, 3)]),
    };
  }
  const deg = 1 + Math.floor(Math.random() * (level === 1 ? 4 : 6)); // 2nd..5th (L1) or 2nd..7th
  const target = inScale[deg];
  return {
    prompt: `The ${DEGREE_NAMES[deg]} degree of ${root} major is?`,
    answer: target,
    choices: choicesFrom(target, CHROMA),
  };
}

const GENERATORS = { intervals: genInterval, chords: genChord, keys: genKey, scales: genScale };

export function makeTheoryQuestion(categoryId, level) {
  // Hardest level → recall mode: name-from-a-pool questions show every option.
  RECALL = level >= 3;
  const q = (GENERATORS[categoryId] || genInterval)(level);
  q.recall = RECALL && q.choices.length > 4;
  return q;
}
