import { getDailyIndex } from './songs';

// The "daily challenge" — a quick, CONCRETE task that keeps a streak alive on
// days a full session doesn't happen, and pays a little Prova Score. Challenges
// are picked by instrument + level so they're always specific and doable: exact
// chords (with fret positions), scales, strings and tempos — never vague.

export const CHALLENGE_POINTS = 75;

// Beginner/Novice → easy, Intermediate → mid, Advanced/Elite → hard.
const LEVEL_BAND = {
  Beginner: 'easy', Novice: 'easy', Intermediate: 'mid', Advanced: 'hard', Elite: 'hard',
};

const CHALLENGES = {
  Guitar: {
    easy: [
      { icon: 'repeat',        title: 'G ↔ C chord changes', detail: 'Switch between G and C every 4 strums for 3 min. G = low-E 3rd fret, A 2nd, high-E 3rd. C = A 3rd, D 2nd, B 1st. Keep strumming through the change.' },
      { icon: 'barbell',       title: 'Finger warm-up',      detail: 'On the low E string play frets 1-2-3-4 (one finger each), one note per beat, then move up to each string and back. 3 min, slow and even.' },
      { icon: 'musical-notes', title: 'Smoke on the Water',  detail: 'Play the riff on the D string: 0-3-5, 0-3-6-5, 0-3-5, 3-0. Loop it slowly for 5 min.' },
      { icon: 'flash',         title: 'Em → Am → C loop',    detail: 'Loop Em → Am → C, 4 beats each, for 5 min. Em = A 2nd, D 2nd. Am = D 2nd, G 2nd, B 1st. C = A 3rd, D 2nd, B 1st.' },
      { icon: 'pulse',         title: 'Strum in time',       detail: 'Hold one G chord and strum down on every beat to a metronome at 70 BPM for 3 min — focus only on timing.' },
    ],
    mid: [
      { icon: 'speedometer',  title: 'A minor pentatonic',  detail: 'Play A minor pentatonic position 1 (starts 5th fret, low E) up and down to a metronome at 80 BPM. 5 min, clean.' },
      { icon: 'barbell',      title: 'Power chord shifts',  detail: 'Down-pick E5 (low-E open + A 2nd) → G5 (low-E 3rd + A 5th) → A5 (low-E 5th + A 7th), 2 beats each, looped 4 min.' },
      { icon: 'trending-up',  title: 'Barre chord drill',   detail: 'Switch F major barre (1st fret) ↔ open C, 8 clean reps. Make every string of the F ring out.' },
      { icon: 'repeat',       title: 'Slow it down',        detail: 'Take the trickiest 2 bars of a song you’re learning and loop them at half speed — 10 perfect reps.' },
      { icon: 'flame',        title: 'Improvise in Am',     detail: 'Improvise using A minor pentatonic (5th fret) over a held Am chord or a backing track. 5 min.' },
    ],
    hard: [
      { icon: 'speedometer', title: 'Alternate picking',   detail: 'A minor pentatonic (5th fret), strict alternate picking in 16th notes at 110 BPM. 5 min, zero buzzing.' },
      { icon: 'flash',       title: 'Three-string sweep',  detail: 'Sweep a 3-string A minor arpeggio (frets 12-14 on the G, B and high-E strings) slowly — 10 perfect reps up and down.' },
      { icon: 'trending-up', title: 'String skipping',     detail: 'Play a C major arpeggio skipping the D string, ascending and descending, to a metronome at 90 BPM for 5 min.' },
      { icon: 'pulse',       title: 'Legato run',          detail: 'Hammer-ons/pull-offs through A minor pentatonic (5th fret) — pick only the first note of each string. 4 min.' },
      { icon: 'repeat',      title: 'Tempo push',          detail: 'Take a lick you can play at 100 BPM and push it 5 BPM at a time until it breaks, then back off. 5 min.' },
    ],
  },
  Bass: {
    easy: [
      { icon: 'pulse',        title: 'Lock to the click',  detail: 'Play the open E string on every beat to a metronome at 70 BPM for 3 min. Aim for dead-on timing.' },
      { icon: 'barbell',      title: 'Finger warm-up',     detail: 'On the E string play frets 1-2-3-4 (one finger each), one per beat, then across to the G string and back. 3 min.' },
      { icon: 'trending-up',  title: 'Octave jumps',       detail: 'Play A (E string 5th fret) then its octave (D string 7th fret), back and forth in time at 80 BPM. 4 min.' },
      { icon: 'musical-notes',title: 'Root notes',         detail: 'Play roots E (open E), A (open A), D (open D), holding each 4 beats, looped to a metronome. 3 min.' },
      { icon: 'repeat',       title: 'G major scale',      detail: 'Play a G major scale (start on the E string 3rd fret), one octave up and down to a metronome at 70 BPM. 5 min.' },
    ],
    mid: [
      { icon: 'speedometer', title: 'Two-octave scale',   detail: 'G major scale (E string 3rd fret), two octaves, to a metronome at 90 BPM, up and down. 5 min.' },
      { icon: 'flame',       title: 'Walking line in A',  detail: 'Walk a bassline in A: quarter notes hitting A – C# – E – G under a steady click. 4 min.' },
      { icon: 'pulse',       title: 'Ghost notes',        detail: 'Play a one-bar groove on A with muted ghost notes on the off-beats, locked to a metronome. 4 min.' },
      { icon: 'trending-up', title: 'Octave groove',      detail: 'Groove on E using root + octave (E string open and D string 2nd fret) in eighth notes. 4 min.' },
      { icon: 'repeat',      title: 'Learn a line by ear',detail: 'Pick a bassline you like and work out the first 8 bars by ear — no tabs.' },
    ],
    hard: [
      { icon: 'flame',       title: '12-bar blues walk',  detail: 'Walk a bassline over a 12-bar blues in A — quarter notes, chord tones on the beat. 5 min.' },
      { icon: 'flash',       title: 'Slap & pop',         detail: 'Thumb the E string, pop the G string, in steady 8th notes at 90 BPM. 4 min, even dynamics.' },
      { icon: 'speedometer', title: 'Scale sprint',       detail: 'A minor pentatonic (E string 5th fret), 16th notes at 100 BPM, alternating index/middle. 5 min.' },
      { icon: 'trending-up', title: 'Position shifts',    detail: 'Play a G major scale shifting up the neck through 3 positions, smoothly in time. 5 min.' },
      { icon: 'repeat',      title: 'Tempo push',         detail: 'Take a fast line you nearly have and push the metronome 4 BPM at a time until it breaks. 5 min.' },
    ],
  },
};

// Today's featured challenge for this player (stable within the day).
export function getDailyChallenge(instrument, level) {
  const inst = CHALLENGES[instrument] ? instrument : 'Guitar';
  const band = LEVEL_BAND[level] || 'easy';
  const pool = CHALLENGES[inst][band];
  return pool[getDailyIndex() % pool.length];
}
