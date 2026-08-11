// Music-theory quiz question generators. Four categories, three levels each.
//
// Notes are spelled by LETTER + ACCIDENTAL, not by chromatic index. That matters:
// a minor 3rd above C is Eb, never D#, and a C diminished triad is C–Eb–Gb, never
// C–D#–F#. The old index-only version got every diminished chord and every
// flat-side interval wrong, so `spellUp()` below is the heart of this file —
// it picks the letter first, then whatever accidental lands on the right pitch.
//
// Root pools are COMPUTED, not hand-listed: a root is offered for a question
// only if every note that question produces spells cleanly (see READABLE). That
// keeps Cb/E#/double-accidentals out of a beginner quiz without anyone having to
// maintain a list by hand — and it widened the usable pools a lot, which is what
// makes rounds stop repeating themselves.
//
// makeTheoryQuestion(categoryId, level) -> { prompt, answer, choices, recall }
// makeTheoryRound(categoryId, level, n) -> n questions with no repeated prompt.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function parseNote(n) {
  const m = /^([A-G])(#{1,2}|b{1,2})?$/.exec(n);
  if (!m) return null;
  const acc = !m[2] ? 0 : m[2][0] === '#' ? m[2].length : -m[2].length;
  return { letter: m[1], acc };
}
export function pitchClass(n) {
  const p = parseNote(n);
  return p ? (((LETTER_PC[p.letter] + p.acc) % 12) + 12) % 12 : null;
}
const accStr = (a) => (a === 0 ? '' : a > 0 ? '#'.repeat(a) : 'b'.repeat(-a));

// The note `letterSteps` letters above `root`, adjusted to sit `semitones` above
// it. This is what makes Eb an Eb: the letter is decided by the interval number,
// the accidental only corrects the pitch.
function spellUp(root, letterSteps, semitones) {
  const p = parseNote(root);
  if (!p) return null;
  const li = LETTERS.indexOf(p.letter);
  const letter = LETTERS[(li + letterSteps) % 7];
  const want = (pitchClass(root) + semitones) % 12;
  let acc = (want - LETTER_PC[letter]) % 12;
  if (acc > 6) acc -= 12;
  if (acc < -6) acc += 12;
  return Math.abs(acc) > 2 ? null : letter + accStr(acc);
}

// Spellings a learner should actually see: naturals, plus single sharps and
// single flats — but not Cb/Fb/E#/B#, which are correct yet only confuse people
// at this level. Anything a question would produce outside this set means we
// simply don't ask that question about that root.
const READABLE = new Set([
  'C', 'D', 'E', 'F', 'G', 'A', 'B',
  'C#', 'D#', 'F#', 'G#', 'A#',
  'Db', 'Eb', 'Gb', 'Ab', 'Bb',
]);
const readable = (...notes) => notes.every((n) => n && READABLE.has(n));

// Level 3 is recall, not recognition: the choice list widens to the whole pool
// so you name the answer instead of spotting it among four.
let RECALL = false;

// Distractors must never repeat the answer's PITCH, only its spelling family —
// offering both D# and Eb in one list makes a question unanswerable.
function noteChoices(answer, pool, n = 4) {
  const cap = RECALL ? pool.length + 1 : n;
  const usedPc = new Set([pitchClass(answer)]);
  const out = [answer];
  for (const x of shuffle(pool)) {
    if (out.length >= cap) break;
    const pc = pitchClass(x);
    if (usedPc.has(pc)) continue;
    usedPc.add(pc);
    out.push(x);
  }
  return shuffle(out);
}

// Plain (non-note) choices: labels, numbers, interval names.
function choicesFrom(answer, pool, n = 4) {
  const cap = RECALL ? pool.length + 1 : n;
  const set = new Set([answer]);
  for (const x of shuffle(pool)) {
    if (set.size >= cap) break;
    set.add(x);
  }
  return shuffle([...set]);
}

export const CATEGORIES = [
  { id: 'intervals', label: 'Intervals' },
  { id: 'chords', label: 'Chords' },
  { id: 'keys', label: 'Keys' },
  { id: 'scales', label: 'Scales' },
];

// ── Intervals ────────────────────────────────────────────────────────────────
// steps = how many letter names it spans (a 3rd spans 2), semis = its size.
const INTERVALS = [
  { name: 'Minor 2nd', steps: 1, semis: 1 },
  { name: 'Major 2nd', steps: 1, semis: 2 },
  { name: 'Minor 3rd', steps: 2, semis: 3 },
  { name: 'Major 3rd', steps: 2, semis: 4 },
  { name: 'Perfect 4th', steps: 3, semis: 5 },
  // Ascending, a tritone is spelled as an augmented 4th (C–F#, not C–Gb).
  { name: 'Tritone', steps: 3, semis: 6 },
  { name: 'Perfect 5th', steps: 4, semis: 7 },
  { name: 'Minor 6th', steps: 5, semis: 8 },
  { name: 'Major 6th', steps: 5, semis: 9 },
  { name: 'Minor 7th', steps: 6, semis: 10 },
  { name: 'Major 7th', steps: 6, semis: 11 },
  { name: 'Octave', steps: 7, semis: 12 },
];
const INTERVAL_SETS = {
  1: INTERVALS.filter((i) => [3, 4, 5, 7, 12].includes(i.semis)),
  2: INTERVALS.filter((i) => [2, 3, 4, 5, 7, 9, 12].includes(i.semis)),
  3: INTERVALS,
};
const ALL_ROOTS = [...READABLE];
// Every root this interval can be built on and still spell readably.
const rootsFor = (iv) => ALL_ROOTS.filter((r) => {
  const t = spellUp(r, iv.steps, iv.semis);
  return readable(r, t);
});

function genInterval(level) {
  const iv = pick(INTERVAL_SETS[level] || INTERVALS);
  const roll = Math.random();

  if (roll < 0.35) {
    return {
      prompt: `How many semitones are in a ${iv.name}?`,
      answer: String(iv.semis),
      choices: choicesFrom(String(iv.semis), INTERVALS.map((x) => String(x.semis))),
    };
  }

  // "Name the interval" — an octave is excluded because with note names alone
  // C to C is equally a unison, so the question would have two right answers.
  if (level >= 2 && roll < 0.65) {
    const named = (INTERVAL_SETS[level] || INTERVALS).filter((x) => x.semis !== 12);
    const iv2 = pick(named);
    const roots = rootsFor(iv2);
    const a = pick(roots);
    const b = spellUp(a, iv2.steps, iv2.semis);
    return {
      prompt: `Ascending, the interval from ${a} to ${b} is?`,
      answer: iv2.name,
      choices: choicesFrom(iv2.name, INTERVALS.map((x) => x.name)),
    };
  }

  // An octave above X is X — true but not worth asking, and it makes the
  // distractor list nonsense. It stays in the semitone-count question instead.
  const named = (INTERVAL_SETS[level] || INTERVALS).filter((x) => x.semis !== 12);
  const iv3 = pick(named);
  const root = pick(rootsFor(iv3));
  const target = spellUp(root, iv3.steps, iv3.semis);
  return {
    prompt: `A ${iv3.name} above ${root} is which note?`,
    answer: target,
    choices: noteChoices(target, ALL_ROOTS),
  };
}

// ── Chords ───────────────────────────────────────────────────────────────────
// [letterSteps, semitones] per chord tone, so each quality spells correctly.
const TRIADS = {
  Major: [[0, 0], [2, 4], [4, 7]],
  Minor: [[0, 0], [2, 3], [4, 7]],
  Diminished: [[0, 0], [2, 3], [4, 6]],
  Augmented: [[0, 0], [2, 4], [4, 8]],
};
const spellTriad = (root, quality) => TRIADS[quality].map(([st, se]) => spellUp(root, st, se));
// Computed, so F never turns up as a diminished root (F–Ab–Cb) and A never as
// an augmented one (A–C#–E#).
const TRIAD_ROOTS = Object.fromEntries(
  Object.keys(TRIADS).map((q) => [q, ALL_ROOTS.filter((r) => readable(...spellTriad(r, q)))]),
);

function genChord(level) {
  const qualities = level === 1 ? ['Major', 'Minor']
    : level === 2 ? ['Major', 'Minor', 'Diminished']
      : ['Major', 'Minor', 'Diminished', 'Augmented'];
  const quality = pick(qualities);
  const roots = TRIAD_ROOTS[quality];
  const root = pick(roots);
  const tones = spellTriad(root, quality);
  const label = `${root} ${quality.toLowerCase()}`;
  const roll = Math.random();

  if (roll < 0.35) {
    // The 3rd tells major from minor; the 5th is the one that moves in dim/aug.
    const which = quality === 'Major' || quality === 'Minor'
      ? (Math.random() < 0.5 ? 3 : 5)
      : 5;
    const target = which === 3 ? tones[1] : tones[2];
    return {
      prompt: `The ${which === 3 ? '3rd' : '5th'} of ${label} is?`,
      answer: target,
      choices: noteChoices(target, ALL_ROOTS),
    };
  }

  if (roll < 0.7) {
    const answer = tones.join(' – ');
    // Same root / different quality is the sharpest distractor, but some roots
    // have no second quality that spells readably (A# diminished, say), so the
    // other-root spellings backfill and the list is never short of four.
    const otherQs = Object.keys(TRIADS).filter((q) => q !== quality && readable(...spellTriad(root, q)));
    const sameRoot = otherQs.map((q) => spellTriad(root, q).join(' – '));
    const otherRoots = roots.filter((r) => r !== root).map((r) => spellTriad(r, quality).join(' – '));
    return {
      prompt: `Which notes spell a ${label} triad?`,
      answer,
      choices: choicesFrom(answer, [...sameRoot, ...otherRoots]),
    };
  }

  // Identify the chord from its notes. Distractors share the quality so the
  // question tests the root, not the word.
  const wrongLabels = shuffle(roots).filter((r) => r !== root).slice(0, 3)
    .map((r) => `${r} ${quality.toLowerCase()}`);
  return {
    prompt: `${tones.join(' – ')} — which chord is this?`,
    answer: label,
    choices: choicesFrom(label, wrongLabels),
  };
}

// ── Keys ─────────────────────────────────────────────────────────────────────
const SHARP_KEYS = [['G', 1], ['D', 2], ['A', 3], ['E', 4], ['B', 5], ['F#', 6]];
const FLAT_KEYS = [['F', 1], ['Bb', 2], ['Eb', 3], ['Ab', 4], ['Db', 5], ['Gb', 6]];
const REL_MINOR_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Eb', 'Ab'];
const REL_MAJOR_KEYS = ['A', 'E', 'B', 'F#', 'C#', 'D', 'G', 'C', 'F'];
// Key names people actually meet, so a distractor is never "Gb minor".
const MAJOR_KEY_NAMES = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db'];
const MINOR_KEY_NAMES = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D', 'G', 'C', 'F', 'Bb', 'Eb'];

function genKey(level) {
  // Level 1 covers both accidentals — sharps alone gave only eight possible
  // questions, so every ten-question round repeated.
  const sharpPool = SHARP_KEYS.slice(0, level === 1 ? 4 : 6);
  const flatPool = FLAT_KEYS.slice(0, level === 1 ? 3 : level === 2 ? 4 : 6);
  const roll = Math.random();

  if (level >= 3 && roll < 0.2) {
    const key = pick(REL_MAJOR_KEYS);
    const ans = spellUp(key, 2, 3); // up a minor 3rd from the minor tonic
    return {
      prompt: `The relative major of ${key} minor is?`,
      answer: `${ans} major`,
      choices: choicesFrom(`${ans} major`, MAJOR_KEY_NAMES.map((n) => `${n} major`)),
    };
  }
  if (level >= 2 && roll < 0.4) {
    const key = pick(REL_MINOR_KEYS);
    const ans = spellUp(key, 5, 9); // up a major 6th = down a minor 3rd
    return {
      prompt: `The relative minor of ${key} major is?`,
      answer: `${ans} minor`,
      choices: choicesFrom(`${ans} minor`, MINOR_KEY_NAMES.map((n) => `${n} minor`)),
    };
  }
  if (roll < 0.6) {
    const [key, n] = pick(flatPool);
    return {
      prompt: `How many flats are in the key of ${key} major?`,
      answer: String(n),
      choices: choicesFrom(String(n), ['0', '1', '2', '3', '4', '5', '6']),
    };
  }
  if (roll < 0.8) {
    const [key, n] = pick(sharpPool);
    return {
      prompt: `How many sharps are in the key of ${key} major?`,
      answer: String(n),
      choices: choicesFrom(String(n), ['0', '1', '2', '3', '4', '5', '6']),
    };
  }
  // "Which key has N sharps" — one right answer, and the distractors are other
  // sharp keys, so no two choices can both be correct.
  const [key, n] = pick(sharpPool);
  return {
    prompt: `Which major key has ${n} sharp${n === 1 ? '' : 's'}?`,
    answer: key,
    choices: choicesFrom(key, SHARP_KEYS.filter(([, c]) => c !== n).map(([k]) => k)),
  };
}

// ── Scales ───────────────────────────────────────────────────────────────────
const MAJOR_STEPS = [0, 1, 2, 3, 4, 5, 6];
const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11];
const DEGREE_NAMES = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
const majorScale = (root) => MAJOR_STEPS.map((st, i) => spellUp(root, st, MAJOR_SEMIS[i]));
// C G D A E B F Bb Eb Ab Db — every major scale that spells inside READABLE.
const SCALE_ROOTS = ALL_ROOTS.filter((r) => readable(...majorScale(r)));

function genScale(level) {
  const pool = level === 1 ? SCALE_ROOTS.slice(0, 4) : level === 2 ? SCALE_ROOTS.slice(0, 8) : SCALE_ROOTS;
  const root = pick(pool);
  const inScale = majorScale(root);
  const inPc = new Set(inScale.map(pitchClass));
  const roll = Math.random();

  if (roll < 0.4) {
    // Only one choice may sit outside the scale, or the question has two answers.
    const outside = [...READABLE].filter((n) => !inPc.has(pitchClass(n)));
    const outNote = pick(outside);
    return {
      prompt: `Which note is NOT in the ${root} major scale?`,
      answer: outNote,
      choices: shuffle([outNote, ...shuffle(inScale).slice(0, 3)]),
    };
  }
  if (level >= 2 && roll < 0.7) {
    const deg = 1 + Math.floor(Math.random() * 6);
    return {
      prompt: `Which degree of the ${root} major scale is ${inScale[deg]}?`,
      answer: DEGREE_NAMES[deg],
      choices: choicesFrom(DEGREE_NAMES[deg], DEGREE_NAMES),
    };
  }
  const deg = 1 + Math.floor(Math.random() * (level === 1 ? 4 : 6));
  return {
    prompt: `The ${DEGREE_NAMES[deg]} degree of ${root} major is?`,
    answer: inScale[deg],
    choices: noteChoices(inScale[deg], ALL_ROOTS),
  };
}

const GENERATORS = { intervals: genInterval, chords: genChord, keys: genKey, scales: genScale };

export function makeTheoryQuestion(categoryId, level) {
  RECALL = level >= 3;
  const q = (GENERATORS[categoryId] || genInterval)(level);
  q.recall = RECALL && q.choices.length > 4;
  RECALL = false;
  return q;
}

// A whole round at once, with no prompt asked twice. Pools are finite, so give
// up after enough tries rather than spin — a repeat beats a hang.
export function makeTheoryRound(categoryId, level, n) {
  const out = [];
  const seen = new Set();
  for (let tries = 0; out.length < n && tries < n * 40; tries++) {
    const q = makeTheoryQuestion(categoryId, level);
    if (seen.has(q.prompt)) continue;
    seen.add(q.prompt);
    out.push(q);
  }
  while (out.length < n) out.push(makeTheoryQuestion(categoryId, level));
  return out;
}
