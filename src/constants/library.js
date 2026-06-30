// Searchable lesson library — a static, no-AI bank of guitar/bass topics the
// student can look up. Each topic carries a few concrete practice tasks (frets,
// strings, BPM, reps) plus an optional `yt` YouTube SEARCH phrase (the screen
// builds a search URL from it — never a hard-coded video link).
//
// `instrument` is 'Guitar', 'Bass', or 'Both' (theory/ear/rhythm topics apply to
// both). To add content later, just append more topics to LIBRARY_TOPICS.

export const LIBRARY_CATEGORIES = [
  'Chords', 'Scales', 'Technique', 'Theory', 'Rhythm', 'Ear Training', 'Songs', 'Gear & Tone',
];

// Rough difficulty just for display/sorting; mirrors the app's level names.
export const LIBRARY_LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];

export const LIBRARY_TOPICS = [
  // ── Chords ────────────────────────────────────────────────────────────────
  {
    id: 'open-chords',
    title: 'Open chords',
    instrument: 'Guitar', category: 'Chords', level: 'Beginner',
    tags: ['open', 'cowboy chords', 'g', 'c', 'd', 'em', 'am', 'beginner'],
    summary: 'The first chords every guitarist learns — fretted near the nut with open strings ringing.',
    tasks: [
      { text: 'Learn G, C, D, Em, Am one at a time. Strum each 4 times slowly; every string must ring clean (no buzz, no muting).', yt: 'beginner open chords guitar G C D Em Am' },
      { text: 'One-minute changes: pick any two chords and count clean switches in 60 seconds. Track the number daily.', yt: 'one minute changes justinguitar' },
    ],
  },
  {
    id: 'barre-chords',
    title: 'Barre chords',
    instrument: 'Guitar', category: 'Chords', level: 'Intermediate',
    tags: ['barre', 'f chord', 'movable', 'e shape', 'a shape'],
    summary: 'Movable full-fret chords that let you play any major/minor chord anywhere on the neck.',
    tasks: [
      { text: 'F major barre — 1st fret, E-shape (index barres all 6 strings). 8 clean reps; every string must ring.', yt: 'F barre chord lesson clean' },
      { text: 'Barre from the shoulder: roll the index slightly onto its side and pull back with your arm, not your thumb.', yt: 'barre chord tips no buzz' },
      { text: 'Slide the E-shape barre up: F (1st) → G (3rd) → A (5th), 4 strums each, in time at 70 BPM.', yt: 'movable barre chord shapes up the neck' },
    ],
  },
  {
    id: 'power-chords',
    title: 'Power chords',
    instrument: 'Guitar', category: 'Chords', level: 'Novice',
    tags: ['power chord', '5 chord', 'rock', 'distortion', 'root fifth'],
    summary: 'Two/three-note root-and-fifth shapes — the backbone of rock and punk.',
    tasks: [
      { text: 'E5 → A5 → D5 → A5 (two-finger shapes), 4 down-strums each at 80 BPM. Palm-mute between shifts.', yt: 'power chord exercise beginner guitar' },
      { text: 'Palm-muting control: chug the low E with the side of your strumming palm, then lift for an open ring. 2 min.', yt: 'palm muting power chords lesson' },
    ],
  },
  {
    id: 'seventh-chords',
    title: '7th chords',
    instrument: 'Both', category: 'Chords', level: 'Intermediate',
    tags: ['7th', 'dominant', 'major 7', 'minor 7', 'jazz', 'blues'],
    summary: 'Four-note chords (maj7, m7, dom7) that add colour and drive blues, jazz and funk.',
    tasks: [
      { text: 'Compare A7, Amaj7, Am7 back to back — hear how the 7th changes the mood. 4 strums each.', yt: 'major 7 minor 7 dominant 7 chords explained' },
      { text: 'Play a 12-bar blues in A using A7, D7, E7. Keep steady quarter-note strums.', yt: '12 bar blues A7 D7 E7 rhythm guitar' },
    ],
  },

  // ── Scales ──────────────────────────────────────────────────────────────
  {
    id: 'minor-pentatonic',
    title: 'Minor pentatonic scale',
    instrument: 'Both', category: 'Scales', level: 'Novice',
    tags: ['pentatonic', 'box 1', 'solo', 'lead', 'blues', 'improvise'],
    summary: 'The five-note scale behind most rock and blues solos. Box 1 is the launchpad.',
    tasks: [
      { text: 'A minor pentatonic box 1 at the 5th fret. Ascend and descend with strict alternate picking at 70 BPM, no buzzing.', yt: 'a minor pentatonic box 1 slow alternate picking' },
      { text: 'Once clean, push to 90 BPM. Then noodle freely over a backing track in Am — make it musical, not just up-and-down.', yt: 'Am backing track minor pentatonic jam' },
    ],
  },
  {
    id: 'major-scale',
    title: 'Major scale',
    instrument: 'Both', category: 'Scales', level: 'Intermediate',
    tags: ['major', 'ionian', 'do re mi', 'positions', 'theory'],
    summary: 'The parent scale of Western music — learn it and the modes/keys open up.',
    tasks: [
      { text: 'C major scale, one position (open or 5th fret). Play it ascending/descending saying the note names aloud.', yt: 'major scale guitar one position note names' },
      { text: 'Practice the same shape in 3 keys by sliding it up the neck (G, A, C). 80 BPM, even notes.', yt: 'movable major scale shape guitar' },
    ],
  },
  {
    id: 'modes',
    title: 'Modes (Dorian, Mixolydian…)',
    instrument: 'Both', category: 'Scales', level: 'Advanced',
    tags: ['modes', 'dorian', 'phrygian', 'mixolydian', 'lydian', 'aeolian'],
    summary: 'Re-centring the major scale on different notes for distinct flavours.',
    tasks: [
      { text: 'D Dorian: play C major but treat D as home. Vamp on a Dm7 and target the natural 6th (B) to hear the colour.', yt: 'dorian mode explained guitar' },
      { text: 'G Mixolydian over a G7 vamp — emphasise the flat 7 (F natural). The classic dominant/rock sound.', yt: 'mixolydian mode lick guitar' },
    ],
  },

  // ── Technique ───────────────────────────────────────────────────────────
  {
    id: 'alternate-picking',
    title: 'Alternate picking',
    instrument: 'Guitar', category: 'Technique', level: 'Intermediate',
    tags: ['picking', 'down up', 'speed', 'accuracy', 'tremolo'],
    summary: 'Strict down-up-down-up picking — the foundation of clean speed.',
    tasks: [
      { text: 'Single string, 4 notes per fret (1-2-3-4) on the low E. Strict down-up at 80 BPM with a metronome. 4 min.', yt: 'alternate picking exercise beginner 1234' },
      { text: 'Only raise the BPM when it is perfectly clean. Watch the pick travels the same tiny distance each stroke.', yt: 'alternate picking technique tips economy of motion' },
    ],
  },
  {
    id: 'legato',
    title: 'Legato (hammer-ons & pull-offs)',
    instrument: 'Guitar', category: 'Technique', level: 'Advanced',
    tags: ['legato', 'hammer on', 'pull off', 'smooth', 'fluid'],
    summary: 'Smooth, picked-once phrases using fretting-hand strength.',
    tasks: [
      { text: 'Pick once, then hammer 5-7-9 and pull off 9-7-5 on the G string. Even volume across all notes. 70 BPM.', yt: 'legato exercise hammer on pull off guitar' },
      { text: 'Trill drill: hammer/pull between two notes (e.g. 5↔7) for 30s per finger pair to build endurance.', yt: 'trill exercise finger strength guitar' },
    ],
  },
  {
    id: 'fingerstyle',
    title: 'Fingerstyle / fingerpicking',
    instrument: 'Both', category: 'Technique', level: 'Intermediate',
    tags: ['fingerstyle', 'fingerpicking', 'travis', 'arpeggio', 'thumb'],
    summary: 'Plucking strings with individual fingers for arpeggios and independent bass lines.',
    tasks: [
      { text: 'Thumb plays the root on each beat; index/middle/ring pluck strings 3-2-1 in a steady pattern over an Am chord.', yt: 'fingerpicking pattern beginner PIMA' },
      { text: 'Travis picking: alternating thumb bass under a melody. Start dead slow over C and G.', yt: 'travis picking lesson slow' },
    ],
  },
  {
    id: 'slap-bass',
    title: 'Slap & pop',
    instrument: 'Bass', category: 'Technique', level: 'Advanced',
    tags: ['slap', 'pop', 'funk', 'thumb', 'flea', 'marcus miller'],
    summary: 'Percussive funk technique — thumb slaps the low strings, fingers pop the high ones.',
    tasks: [
      { text: 'Thumb-slap the open E on beats 1 & 3, pop the open G on 2 & 4. Keep it loose from the wrist. 70 BPM.', yt: 'slap bass for beginners thumb pop' },
      { text: 'Add a fretted octave: slap root, pop the octave. Mute unused strings with your fretting hand.', yt: 'slap bass octave exercise funk' },
    ],
  },
  {
    id: 'fretting-hand-finger-independence',
    title: 'Finger independence & warm-ups',
    instrument: 'Both', category: 'Technique', level: 'Beginner',
    tags: ['warm up', 'spider', 'dexterity', 'stretch', 'finger independence'],
    summary: 'Dexterity drills that wake up the fretting hand and prevent injury.',
    tasks: [
      { text: 'Spider walk: frets 1-2-3-4 (index-middle-ring-pinky), one note per click at 60 BPM, across all strings and back.', yt: 'spider walk warm up exercise' },
      { text: 'Keep fingers hovering close to the strings — lifting them high is the biggest hidden speed killer.', yt: 'finger economy of motion guitar' },
    ],
  },

  // ── Theory ──────────────────────────────────────────────────────────────
  {
    id: 'notes-on-the-fretboard',
    title: 'Notes on the fretboard',
    instrument: 'Both', category: 'Theory', level: 'Novice',
    tags: ['fretboard', 'note names', 'memorize', 'navigation'],
    summary: 'Knowing where every note is — the map that makes everything else easier.',
    tasks: [
      { text: 'Learn the natural notes on the low E and A strings first. Name them out loud up to the 12th fret.', yt: 'memorize fretboard notes E and A string' },
      { text: 'Octave shapes: from any note on the E string, the same note is 2 frets up / 2 strings over. Use it to find notes fast.', yt: 'octave shapes fretboard navigation' },
    ],
  },
  {
    id: 'intervals',
    title: 'Intervals',
    instrument: 'Both', category: 'Theory', level: 'Intermediate',
    tags: ['intervals', 'third', 'fifth', 'octave', 'distance', 'theory'],
    summary: 'The distance between two notes — the building blocks of chords and melody.',
    tasks: [
      { text: 'On one string, play a root then a note 2 frets up (major 2nd), 4 (major 3rd), 5 (perfect 4th), 7 (perfect 5th). Hear each.', yt: 'intervals explained guitar ear' },
      { text: 'Find the same intervals across two strings (shapes). Major 3rd and perfect 5th first — they build major chords.', yt: 'interval shapes guitar chords' },
    ],
  },
  {
    id: 'chord-construction',
    title: 'How chords are built',
    instrument: 'Both', category: 'Theory', level: 'Intermediate',
    tags: ['chord theory', 'triad', 'root third fifth', 'major minor'],
    summary: 'Triads = root + 3rd + 5th. Understand this and you can build any chord.',
    tasks: [
      { text: 'Build a C major triad: C (root), E (major 3rd), G (5th). Find those three notes anywhere and you have C.', yt: 'how chords are built triads' },
      { text: 'Make it minor by flattening the 3rd (E→Eb). Play C then Cm and hear the one-note difference.', yt: 'major vs minor triad theory' },
    ],
  },
  {
    id: 'keys-and-progressions',
    title: 'Keys & chord progressions',
    instrument: 'Both', category: 'Theory', level: 'Advanced',
    tags: ['key', 'progression', 'I IV V', 'nashville', 'diatonic'],
    summary: 'Why certain chords sound good together — the numbers (I–IV–V) behind songs.',
    tasks: [
      { text: 'In the key of G, the chords are G(I) Am(ii) Bm(iii) C(IV) D(V) Em(vi). Play a I–IV–V–I: G–C–D–G.', yt: 'I IV V chord progression explained' },
      { text: 'Play the I–V–vi–IV pop progression in G (G–D–Em–C) — you’ll recognise it from a hundred songs.', yt: 'four chord song progression G D Em C' },
    ],
  },

  // ── Rhythm ──────────────────────────────────────────────────────────────
  {
    id: 'strumming-patterns',
    title: 'Strumming patterns',
    instrument: 'Guitar', category: 'Rhythm', level: 'Beginner',
    tags: ['strumming', 'rhythm', 'down up', 'pattern', 'groove'],
    summary: 'Turning chords into a groove with consistent down/up motion.',
    tasks: [
      { text: 'Keep your strumming hand always moving down-up like a pendulum; only touch the strings when needed. D-DU-UDU.', yt: 'strumming pattern DDU UDU beginner' },
      { text: 'Count "1-and-2-and-3-and-4-and" out loud while strumming one chord. Timing problems vanish once you vocalise.', yt: 'count strumming rhythm out loud' },
    ],
  },
  {
    id: 'timing-and-subdivision',
    title: 'Timing & subdivisions',
    instrument: 'Both', category: 'Rhythm', level: 'Intermediate',
    tags: ['timing', 'metronome', 'eighth notes', 'sixteenths', 'pocket'],
    summary: 'Playing exactly in time and feeling the beat split into halves/quarters.',
    tasks: [
      { text: 'With a metronome at 70 BPM, play one note on each click (quarters), then 2 per click (8ths), then 4 (16ths). Stay locked.', yt: 'subdivision exercise metronome quarter eighth sixteenth' },
      { text: 'Put the click on beats 2 & 4 only (like a snare). Keep your groove steady against it.', yt: 'metronome on 2 and 4 practice' },
    ],
  },
  {
    id: 'bass-grooves',
    title: 'Locking with the drums (bass)',
    instrument: 'Bass', category: 'Rhythm', level: 'Intermediate',
    tags: ['groove', 'pocket', 'kick drum', 'root', 'feel'],
    summary: 'The bass job: lock the root notes to the kick drum and hold the pocket.',
    tasks: [
      { text: 'Play root notes on each beat, matching a simple kick pattern. Keep note lengths even — consistency over flash.', yt: 'bass locking with kick drum groove' },
      { text: 'Add a walk-up to the next chord on beat 4 (passing note). Keep it smooth and in time.', yt: 'walking bass passing notes beginner' },
    ],
  },

  // ── Ear Training ──────────────────────────────────────────────────────────
  {
    id: 'ear-intervals',
    title: 'Recognising intervals by ear',
    instrument: 'Both', category: 'Ear Training', level: 'Intermediate',
    tags: ['ear training', 'intervals', 'relative pitch', 'recognise'],
    summary: 'Hearing the distance between notes so you can play what you imagine.',
    tasks: [
      { text: 'Use song hooks: a perfect 4th = "Here Comes the Bride"; a perfect 5th = "Star Wars". Hum then find them on the neck.', yt: 'interval ear training song references' },
      { text: 'Play a random note, then sing a major 3rd above it, then check on the fretboard. 5 minutes daily.', yt: 'ear training intervals practice guitar' },
    ],
  },
  {
    id: 'play-by-ear',
    title: 'Figuring out songs by ear',
    instrument: 'Both', category: 'Ear Training', level: 'Advanced',
    tags: ['by ear', 'transcribe', 'learn songs', 'pitch'],
    summary: 'Working out riffs and chords without tabs — the most useful real-world skill.',
    tasks: [
      { text: 'Pick a simple riff. Find the first note by trial, then move by ear (up/down, big/small jumps). Loop a few seconds at a time.', yt: 'how to learn songs by ear beginner' },
      { text: 'For chords, find the bass note first (it’s usually the root), then test major vs minor over it.', yt: 'find chords by ear bass note root' },
    ],
  },

  // ── Songs ───────────────────────────────────────────────────────────────
  {
    id: 'first-songs-guitar',
    title: 'Great first songs (guitar)',
    instrument: 'Guitar', category: 'Songs', level: 'Beginner',
    tags: ['easy songs', 'first song', 'beginner songs'],
    summary: 'Real songs you can play with just a few open chords or a simple riff.',
    tasks: [
      { text: 'Horse With No Name (America): two chords. Knockin’ on Heaven’s Door (Dylan): G–D–Am–C.', yt: 'easy 2 chord songs guitar' },
      { text: 'Smoke on the Water riff (Deep Purple): four notes on two strings — a first riff win.', yt: 'smoke on the water riff lesson' },
    ],
  },
  {
    id: 'first-songs-bass',
    title: 'Great first songs (bass)',
    instrument: 'Bass', category: 'Songs', level: 'Beginner',
    tags: ['easy bass songs', 'first bass line', 'beginner'],
    summary: 'Iconic bass lines that are simple enough to nail early.',
    tasks: [
      { text: 'Seven Nation Army (White Stripes): one finger, unforgettable. Another One Bites the Dust (Queen): the groove of all grooves.', yt: 'easy bass songs for beginners' },
      { text: 'With or Without You (U2): four steady notes that teach you to lock the pocket.', yt: 'with or without you bass lesson' },
    ],
  },

  // ── Gear & Tone ───────────────────────────────────────────────────────────
  {
    id: 'amp-eq-basics',
    title: 'Amp & EQ basics',
    instrument: 'Both', category: 'Gear & Tone', level: 'Novice',
    tags: ['amp', 'eq', 'tone', 'gain', 'bass mid treble'],
    summary: 'What the knobs do, so you can dial a usable sound fast.',
    tasks: [
      { text: 'Start every knob at 12 o’clock. Gain = grit/distortion. Bass/Mid/Treble shape the tone — sweep each to hear its job.', yt: 'guitar amp eq settings explained beginner' },
      { text: 'Mids are where guitar/bass live in a band mix — don’t scoop them to zero or you disappear.', yt: 'why mids matter guitar tone' },
    ],
  },
  {
    id: 'changing-strings',
    title: 'Changing & caring for strings',
    instrument: 'Both', category: 'Gear & Tone', level: 'Beginner',
    tags: ['strings', 'restring', 'tuning stability', 'maintenance'],
    summary: 'Fresh strings = better tone and tuning. A core maintenance skill.',
    tasks: [
      { text: 'Change one string at a time to keep neck tension. Leave 2–3 winds around the post, wound downward, for tuning stability.', yt: 'how to restring a guitar properly' },
      { text: 'Stretch new strings by gently pulling them, then re-tune — repeat until they hold pitch.', yt: 'stretch new guitar strings stay in tune' },
    ],
  },

  // ── Elite & Advanced (virtuoso) ───────────────────────────────────────────
  {
    id: 'sweep-picking',
    title: 'Sweep picking arpeggios',
    instrument: 'Guitar', category: 'Technique', level: 'Elite',
    tags: ['sweep', 'arpeggio', 'shred', 'neoclassical', 'malmsteen'],
    summary: 'One fluid pick stroke across strings to rip through arpeggios at speed.',
    tasks: [
      { text: 'Three-string Am sweep (5th–12th frets): one continuous down-stroke up, one up-stroke down. Mute each note as you leave it. Start 50 BPM.', yt: 'sweep picking for beginners 3 string arpeggio' },
      { text: 'Once clean, extend to five-string shapes and add the rolling pinky on the top. Speed comes only after the muting is spotless.', yt: 'five string sweep picking exercise clean' },
    ],
  },
  {
    id: 'tapping',
    title: 'Two-hand & 8-finger tapping',
    instrument: 'Guitar', category: 'Technique', level: 'Elite',
    tags: ['tapping', 'eruption', 'van halen', 'eight finger', 'shred'],
    summary: 'Fretting notes with the picking hand for wide, fast intervallic runs.',
    tasks: [
      { text: 'Eruption-style: tap 12th fret with the picking-hand finger, pull off to fretted 5 and 8 on the B string. Even volume across all three. 70 BPM.', yt: 'eruption tapping lesson van halen' },
      { text: 'Build to 8-finger tapping: both hands tap independent patterns. Start with a simple repeating shape and a metronome.', yt: 'eight finger tapping exercise' },
    ],
  },
  {
    id: 'economy-picking-speed',
    title: 'Economy picking at speed',
    instrument: 'Guitar', category: 'Technique', level: 'Elite',
    tags: ['economy picking', 'gambale', 'speed', 'fusion'],
    summary: 'Combining alternate and sweep motion for the most efficient fast runs.',
    tasks: [
      { text: 'Three-note-per-string scale runs where the string change uses a sweep (same-direction stroke), not an alternate. Frank Gambale style. 90 BPM, build up.', yt: 'economy picking exercise three note per string' },
      { text: 'Record yourself at the target tempo and listen for evenness — economy picking exposes any timing wobble.', yt: 'economy picking clean fast practice' },
    ],
  },
  {
    id: 'shred-solos',
    title: 'Iconic shred solos',
    instrument: 'Guitar', category: 'Songs', level: 'Elite',
    tags: ['shred', 'solo', 'tornado of souls', 'cliffs of dover', 'far beyond the sun'],
    summary: 'Benchmark virtuoso solos — work them up slowly, phrase by phrase.',
    tasks: [
      { text: 'Tornado of Souls (Megadeth) solo: legato runs + wide bends + sweep bursts. Loop 4 bars at a time at half speed.', yt: 'tornado of souls solo lesson slow' },
      { text: 'Cliffs of Dover (Eric Johnson): hybrid picking, cascading pentatonics, pristine tone control.', yt: 'cliffs of dover solo lesson' },
      { text: 'Far Beyond the Sun (Malmsteen): neoclassical sweeps + harmonic minor runs. The sweep + tapping graduation piece.', yt: 'far beyond the sun lesson slow' },
    ],
  },
  {
    id: 'altered-jazz-chords',
    title: 'Altered & extended jazz chords',
    instrument: 'Guitar', category: 'Chords', level: 'Elite',
    tags: ['altered', '13', '7#9', 'jazz', 'comping', 'voice leading'],
    summary: 'Rich 9/11/13 and altered dominants, voice-led through a progression.',
    tasks: [
      { text: 'Play a ii–V–I in C with extensions: Dm9 → G7#9 → Cmaj9. Keep common tones, move only what must move (voice leading).', yt: 'jazz chord voicings ii V I extensions guitar' },
      { text: 'Comp through a jazz blues in F using rootless 13th and altered voicings, only the top 4 strings.', yt: 'jazz blues comping rootless voicings guitar' },
    ],
  },
  {
    id: 'melodic-minor-modes',
    title: 'Melodic minor modes & superlocrian',
    instrument: 'Both', category: 'Scales', level: 'Elite',
    tags: ['melodic minor', 'superlocrian', 'altered scale', 'jazz', 'lydian dominant'],
    summary: 'The advanced colour palette for soloing over altered dominants and modern jazz.',
    tasks: [
      { text: 'Superlocrian (7th mode of melodic minor) over a G7alt: it spells every alteration (b9 #9 b5 #5). Resolve it to Cm. 80 BPM.', yt: 'altered scale superlocrian lesson' },
      { text: 'Lydian dominant (4th mode) over a static dom7#11 vamp — the bright fusion sound. Target the #11.', yt: 'lydian dominant scale lesson' },
    ],
  },
  {
    id: 'reharmonization',
    title: 'Reharmonization & negative harmony',
    instrument: 'Both', category: 'Theory', level: 'Elite',
    tags: ['reharmonization', 'tritone sub', 'negative harmony', 'substitution'],
    summary: 'Reshaping a chord progression with substitutions and modern harmonic theory.',
    tasks: [
      { text: 'Tritone subs: replace each V7 with the dom7 a tritone away (G7 → Db7). Apply across a ii–V–I and hear the chromatic bass.', yt: 'tritone substitution explained' },
      { text: 'Negative harmony: mirror a progression around the tonic axis and compare the reharmonized version to the original.', yt: 'negative harmony explained simply' },
    ],
  },
  {
    id: 'double-thumb-slap',
    title: 'Double-thumb & Wooten technique',
    instrument: 'Bass', category: 'Technique', level: 'Elite',
    tags: ['double thumb', 'victor wooten', 'slap', 'open hammer pluck', 'funk'],
    summary: 'Victor Wooten’s thumb-as-a-pick approach for blistering slap lines.',
    tasks: [
      { text: 'Double thumb: down-stroke then up-stroke with the side of the thumb, like a pick. Even 16ths on one note at 80 BPM.', yt: 'double thumb technique victor wooten lesson' },
      { text: 'Open-hammer-pluck: open string, hammer a fret, pluck the octave — combine with double thumb for a rolling groove.', yt: 'open hammer pluck wooten lesson' },
    ],
  },
  {
    id: 'fretless-and-jaco',
    title: 'Fretless & Jaco-style fingerstyle',
    instrument: 'Bass', category: 'Technique', level: 'Elite',
    tags: ['fretless', 'jaco', 'intonation', 'harmonics', 'donna lee'],
    summary: 'Singing fretless lines, precise intonation, and Jaco Pastorius vocabulary.',
    tasks: [
      { text: 'Intonation drill: play a melody on fretless against a drone, adjusting each note until the beating disappears. Use your ear, not fret markers.', yt: 'fretless bass intonation exercise' },
      { text: 'Learn the head to Donna Lee (Jaco) — bebop sixteenths that demand clean right-hand fingerstyle and left-hand accuracy.', yt: 'donna lee bass lesson jaco' },
    ],
  },
  {
    id: 'virtuoso-bass-songs',
    title: 'Virtuoso bass benchmarks',
    instrument: 'Bass', category: 'Songs', level: 'Elite',
    tags: ['teen town', 'yyz', 'jaco', 'rush', 'weather report'],
    summary: 'The bass lines that separate advanced players from elite ones.',
    tasks: [
      { text: 'Teen Town (Weather Report / Jaco) at full speed — fast sixteenth-note lines across the whole neck. Loop a bar at a time.', yt: 'teen town bass lesson slow' },
      { text: 'YYZ (Rush) — Geddy Lee’s precise, syncopated lines. Lock it tight to a click.', yt: 'yyz bass lesson rush' },
    ],
  },
  {
    id: 'improv-over-changes',
    title: 'Improvising over fast changes',
    instrument: 'Both', category: 'Ear Training', level: 'Advanced',
    tags: ['improvisation', 'changes', 'jazz', 'targeting', 'guide tones'],
    summary: 'Soloing that follows the chords, not just one scale — the jazz core skill.',
    tasks: [
      { text: 'Guide-tone lines: over a ii–V–I, play only the 3rds and 7ths of each chord, connecting them smoothly. This is the skeleton of every great solo.', yt: 'guide tones soloing jazz lesson' },
      { text: 'Target chord tones on the downbeats over a slow ii–V–I loop; fill the gaps with scale/chromatic approach notes.', yt: 'targeting chord tones improvisation' },
    ],
  },

  // ══════════════════════════ Library — part 2 ══════════════════════════

  // ── Chords ────────────────────────────────────────────────────────────────
  {
    id: 'drop-d-riffs',
    title: 'Drop D power chords & riffs',
    instrument: 'Guitar', category: 'Chords', level: 'Novice',
    tags: ['drop d', 'power chord', 'one finger', 'metal', 'tuning'],
    summary: 'Tune the low E down to D so a whole power chord is one barred finger.',
    tasks: [
      { text: 'Tune low E down to D (match it to the open D string an octave below). One finger barres frets on strings 6-5-4 for a power chord — slide it around.', yt: 'drop d tuning power chords lesson' },
      { text: 'Write a riff: chug the open D (strings 6-5-4 muted) then jump to the 3rd and 5th frets. Palm-mute for tightness.', yt: 'drop d riff lesson beginner' },
    ],
  },
  {
    id: 'sus-add-chords',
    title: 'Sus2, sus4 & add9 chords',
    instrument: 'Guitar', category: 'Chords', level: 'Intermediate',
    tags: ['sus2', 'sus4', 'add9', 'colour', 'embellish'],
    summary: 'Swap the 3rd for a 2nd/4th (sus) or add a 9th for shimmer.',
    tasks: [
      { text: 'From open D: lift/add the pinky to get Dsus2 and Dsus4, alternating back to D. Hear the tension resolve.', yt: 'sus2 sus4 chords guitar lesson' },
      { text: 'Add an open high E or B to G and C shapes for add9 colour — great for ringing acoustic parts.', yt: 'add9 chords acoustic guitar' },
    ],
  },
  {
    id: 'triads-top-strings',
    title: 'Triads on the top strings',
    instrument: 'Guitar', category: 'Chords', level: 'Intermediate',
    tags: ['triads', 'inversions', 'top strings', 'comping'],
    summary: 'Small 3-note chord shapes up the neck for clean, modern voicings.',
    tasks: [
      { text: 'Learn C major triad in its 3 inversions on strings 1-2-3, then slide the shape up the neck to make F, G, etc.', yt: 'major triads top three strings guitar' },
      { text: 'Comp a I-IV-V using only triads, keeping them in the same neck area (voice leading) instead of jumping shapes.', yt: 'triad chords comping guitar lesson' },
    ],
  },
  {
    id: 'bass-double-stops',
    title: 'Bass double stops & chords',
    instrument: 'Bass', category: 'Chords', level: 'Intermediate',
    tags: ['double stop', 'chords', 'octaves', 'fills'],
    summary: 'Two notes at once on bass — octaves, 5ths and tasteful chord fills.',
    tasks: [
      { text: 'Play octaves: root on the E string + octave on the D string, two strings apart. Mute the string between with your fretting finger.', yt: 'bass octaves technique lesson' },
      { text: 'Add a 10th (root + major 3rd an octave up) as a chord fill at the end of a phrase.', yt: 'bass chords double stops lesson' },
    ],
  },
  {
    id: 'open-tunings',
    title: 'Open & alternate tunings',
    instrument: 'Guitar', category: 'Chords', level: 'Advanced',
    tags: ['open g', 'dadgad', 'open d', 'slide', 'alternate tuning'],
    summary: 'Retune the strings so open strings form a chord — folk, blues & slide.',
    tasks: [
      { text: 'Open G (D-G-D-G-B-D): strum open for a G chord, then barre any fret for instant major chords. Try a Stones-style riff.', yt: 'open g tuning guitar lesson' },
      { text: 'DADGAD: explore the droney, modal sound with one-finger shapes. A staple of Celtic and modern fingerstyle.', yt: 'dadgad tuning beginner lesson' },
    ],
  },

  // ── Scales ──────────────────────────────────────────────────────────────
  {
    id: 'major-pentatonic',
    title: 'Major pentatonic scale',
    instrument: 'Both', category: 'Scales', level: 'Novice',
    tags: ['pentatonic', 'major', 'country', 'happy', 'solo'],
    summary: 'The bright, happy cousin of the minor pentatonic — country and pop leads.',
    tasks: [
      { text: 'G major pentatonic is the same shape as E minor pentatonic, just centred differently. Play box 1 and resolve to G, not E.', yt: 'major pentatonic scale guitar box 1' },
      { text: 'Solo over a G major backing track, landing on G, B and D. Notice the cheerful, open feel vs minor.', yt: 'major pentatonic backing track jam' },
    ],
  },
  {
    id: 'blues-scale',
    title: 'Blues scale',
    instrument: 'Both', category: 'Scales', level: 'Intermediate',
    tags: ['blues', 'blue note', 'pentatonic', 'flat 5', 'solo'],
    summary: 'Minor pentatonic + the "blue note" (♭5) for that crying blues sound.',
    tasks: [
      { text: 'A minor pentatonic box 1 with the added ♭5 (Eb) between the 4th and 5th. Slide into and out of the blue note — don’t sit on it.', yt: 'blues scale guitar box 1 blue note' },
      { text: 'Play a call-and-response blues lick over a 12-bar in A, using bends up to the blue note.', yt: 'blues licks beginner guitar a' },
    ],
  },
  {
    id: 'natural-minor',
    title: 'Natural minor scale',
    instrument: 'Both', category: 'Scales', level: 'Novice',
    tags: ['minor', 'aeolian', 'sad', 'scale', 'positions'],
    summary: 'The full 7-note minor scale — darker than pentatonic, the basis of minor keys.',
    tasks: [
      { text: 'A natural minor (A B C D E F G) in one position. Play it slowly, saying note names, and hear its melancholy character vs major.', yt: 'natural minor scale guitar lesson' },
      { text: 'Compare A minor to A major (raise the 3rd, 6th, 7th) so you feel exactly which notes make it minor.', yt: 'major vs minor scale difference guitar' },
    ],
  },
  {
    id: 'arpeggios',
    title: 'Major & minor arpeggios',
    instrument: 'Both', category: 'Scales', level: 'Intermediate',
    tags: ['arpeggio', 'chord tones', 'outline', 'solo'],
    summary: 'Playing a chord one note at a time — the strongest melodic outline for solos.',
    tasks: [
      { text: 'Play a C major arpeggio (C-E-G) across two octaves, then A minor (A-C-E). Strict alternate picking, 70 BPM.', yt: 'major minor arpeggios guitar exercise' },
      { text: 'Over a chord progression, play the matching arpeggio for each chord instead of one scale — instantly more musical.', yt: 'arpeggios over chords soloing lesson' },
    ],
  },
  {
    id: 'three-nps-scales',
    title: 'Three-note-per-string scales',
    instrument: 'Guitar', category: 'Scales', level: 'Advanced',
    tags: ['3nps', 'shred', 'legato', 'fluid', 'major scale'],
    summary: 'Even 3-notes-per-string fingerings that make fast scalar runs flow.',
    tasks: [
      { text: 'Play the G major scale 3-notes-per-string across all six strings. The even layout suits legato and fast picking. 80 BPM, build up.', yt: 'three note per string scales guitar' },
      { text: 'Practice the seven connected positions so you can run the scale anywhere on the neck.', yt: '3nps major scale positions connect' },
    ],
  },
  {
    id: 'harmonic-minor',
    title: 'Harmonic minor scale',
    instrument: 'Both', category: 'Scales', level: 'Advanced',
    tags: ['harmonic minor', 'neoclassical', 'exotic', 'raised 7th'],
    summary: 'Natural minor with a raised 7th — exotic, neoclassical, flamenco flavour.',
    tasks: [
      { text: 'A harmonic minor: A B C D E F G#. The gap between F and G# is the signature exotic sound. Play it over an E7→Am.', yt: 'harmonic minor scale guitar lesson' },
      { text: 'Write a neoclassical lick emphasising the raised 7th resolving to the root.', yt: 'harmonic minor lick neoclassical guitar' },
    ],
  },

  // ── Technique ───────────────────────────────────────────────────────────
  {
    id: 'bending-vibrato',
    title: 'String bending & vibrato',
    instrument: 'Guitar', category: 'Technique', level: 'Novice',
    tags: ['bending', 'vibrato', 'expression', 'pitch', 'blues'],
    summary: 'The two techniques that give a lead line its voice and emotion.',
    tasks: [
      { text: 'Bend the G string at the 7th fret UP a full tone — check it matches the 9th fret pitch exactly. Use 2-3 fingers for support.', yt: 'how to bend strings in tune guitar' },
      { text: 'Add vibrato: bend slightly up and release repeatedly from the wrist, even and controlled. Hold one note for 4 beats with vibrato.', yt: 'guitar vibrato technique lesson' },
    ],
  },
  {
    id: 'slides-technique',
    title: 'Slides & glissando',
    instrument: 'Guitar', category: 'Technique', level: 'Novice',
    tags: ['slide', 'glissando', 'legato', 'connect notes'],
    summary: 'Connecting notes by sliding the fretting finger — smooth and vocal.',
    tasks: [
      { text: 'Pick a note at the 5th fret, slide up to the 7th without re-picking. Keep even pressure so the second note rings.', yt: 'guitar slides technique lesson' },
      { text: 'Use a slide into the first note of a phrase for a vocal, expressive entrance.', yt: 'slide into notes guitar lead' },
    ],
  },
  {
    id: 'palm-muting',
    title: 'Palm muting',
    instrument: 'Guitar', category: 'Technique', level: 'Novice',
    tags: ['palm mute', 'chug', 'rock', 'metal', 'control'],
    summary: 'Resting the picking-hand palm on the strings for a tight, percussive chug.',
    tasks: [
      { text: 'Rest the edge of your palm lightly where the strings meet the bridge. Pick the low E — aim for a muted "chug", not a dead thud.', yt: 'palm muting technique guitar lesson' },
      { text: 'Alternate 4 palm-muted chugs with 4 open rings on a power chord, controlling exactly when the mute is on.', yt: 'palm muting exercise rhythm guitar' },
    ],
  },
  {
    id: 'hybrid-picking',
    title: 'Hybrid picking',
    instrument: 'Guitar', category: 'Technique', level: 'Advanced',
    tags: ['hybrid picking', 'pick and fingers', 'country', 'chicken pickin'],
    summary: 'Pick plus middle/ring fingers together — country twang and wide intervals.',
    tasks: [
      { text: 'Hold the pick normally; pluck the higher string with your middle finger at the same time. Play pick-on-D + finger-on-G as pairs.', yt: 'hybrid picking for beginners lesson' },
      { text: 'Play a country "chicken pickin" lick using the snap of the middle finger for the pop.', yt: 'chicken picking country guitar lesson' },
    ],
  },
  {
    id: 'string-skipping',
    title: 'String skipping',
    instrument: 'Guitar', category: 'Technique', level: 'Advanced',
    tags: ['string skipping', 'wide intervals', 'accuracy', 'arpeggio'],
    summary: 'Jumping over strings for wide, ear-catching intervals and arpeggios.',
    tasks: [
      { text: 'Play an A minor arpeggio skipping the B string each time (strings 4-2-... no, 4 then 1). Keep the skipped string muted. Slow and accurate first.', yt: 'string skipping exercise guitar' },
      { text: 'Build a lick that leaps between low and high strings — the gap creates a wider, more interesting line than scalar runs.', yt: 'string skipping licks lesson' },
    ],
  },
  {
    id: 'pinch-harmonics',
    title: 'Pinch (artificial) harmonics',
    instrument: 'Guitar', category: 'Technique', level: 'Advanced',
    tags: ['pinch harmonic', 'squeal', 'metal', 'zakk wylde'],
    summary: 'The screaming "squeal" — catch the string with your thumb as you pick.',
    tasks: [
      { text: 'Choke up on the pick so only a tiny tip shows. Pick a fretted note and let your thumb graze the string right after — find the sweet spots over the pickups.', yt: 'pinch harmonics for beginners lesson' },
      { text: 'Add a bend + vibrato to a pinch harmonic for the classic squealing lead sound.', yt: 'pinch harmonic squeal technique' },
    ],
  },
  {
    id: 'bass-finger-plucking',
    title: 'Two & three-finger plucking',
    instrument: 'Bass', category: 'Technique', level: 'Novice',
    tags: ['fingerstyle', 'plucking', 'alternating', 'right hand', 'bass'],
    summary: 'Clean, even right-hand fingerstyle — the foundation of bass tone and speed.',
    tasks: [
      { text: 'Alternate index and middle fingers on the open E, one per beat, perfectly even in tone and volume. 80 BPM for 3 min.', yt: 'bass two finger technique lesson' },
      { text: 'Add the ring finger for a 3-finger roll to handle faster lines without tension.', yt: 'three finger bass technique lesson' },
    ],
  },
  {
    id: 'ghost-notes',
    title: 'Ghost notes & muting',
    instrument: 'Both', category: 'Technique', level: 'Intermediate',
    tags: ['ghost notes', 'muting', 'groove', 'funk', 'percussive'],
    summary: 'Muted, percussive "dead" notes that make a groove breathe and feel funky.',
    tasks: [
      { text: 'Lightly rest the fretting fingers (don’t press) and pick — you get a muted click. Work ghost notes between real notes in a simple groove.', yt: 'ghost notes bass groove lesson' },
      { text: 'Play a 16th-note funk pattern with ghost notes on the off-beats for that percussive feel.', yt: 'funk ghost notes guitar lesson' },
    ],
  },
  {
    id: 'speed-building',
    title: 'Building speed with a metronome',
    instrument: 'Both', category: 'Technique', level: 'Intermediate',
    tags: ['speed', 'metronome', 'practice method', 'accuracy'],
    summary: 'The disciplined way to get faster without getting sloppy.',
    tasks: [
      { text: 'Pick any lick. Set the metronome where it’s perfectly clean. Play it 5x clean, bump +5 BPM, repeat. Drop back the moment it gets messy.', yt: 'how to build speed metronome guitar' },
      { text: 'Practice in bursts: play the phrase as fast-but-clean as possible, rest, repeat. Accuracy always beats raw speed.', yt: 'speed bursts practice guitar' },
    ],
  },

  // ── Theory ──────────────────────────────────────────────────────────────
  {
    id: 'reading-tab',
    title: 'Reading TAB & chord diagrams',
    instrument: 'Both', category: 'Theory', level: 'Beginner',
    tags: ['tab', 'chord chart', 'reading', 'notation', 'beginner'],
    summary: 'How to read the two systems every online lesson and songbook uses.',
    tasks: [
      { text: 'TAB: 6 lines = 6 strings (lowest at the bottom), numbers = frets. Read a simple riff left to right and play it.', yt: 'how to read guitar tabs beginner' },
      { text: 'Chord diagrams: vertical = strings, horizontal = frets, dots = fingers, X = don’t play, O = open. Read and play a G chord from a diagram.', yt: 'how to read chord diagrams guitar' },
    ],
  },
  {
    id: 'rhythm-notation',
    title: 'Rhythm notation & note values',
    instrument: 'Both', category: 'Theory', level: 'Beginner',
    tags: ['rhythm', 'note values', 'counting', 'quarter eighth', 'time'],
    summary: 'Whole, half, quarter and eighth notes — how long each note lasts.',
    tasks: [
      { text: 'In 4/4: a whole note = 4 beats, half = 2, quarter = 1, eighth = ½. Clap each while counting "1-2-3-4".', yt: 'note values explained beginner music' },
      { text: 'Play one note on the guitar using each value over a 70 BPM click, counting out loud.', yt: 'counting rhythm guitar beginner' },
    ],
  },
  {
    id: 'caged-system',
    title: 'The CAGED system',
    instrument: 'Guitar', category: 'Theory', level: 'Intermediate',
    tags: ['caged', 'fretboard', 'chord shapes', 'positions'],
    summary: 'Five movable shapes that map every chord and scale across the whole neck.',
    tasks: [
      { text: 'Learn the 5 open shapes (C-A-G-E-D) and see how they connect up the neck to play one chord (e.g. C) in five places.', yt: 'caged system explained guitar' },
      { text: 'Play a C major scale linked through all five CAGED positions so you "see" the fretboard as connected shapes.', yt: 'caged scales fretboard lesson' },
    ],
  },
  {
    id: 'circle-of-fifths',
    title: 'Circle of fifths',
    instrument: 'Both', category: 'Theory', level: 'Intermediate',
    tags: ['circle of fifths', 'keys', 'key signatures', 'theory'],
    summary: 'The map of all 12 keys — how they relate and which chords belong together.',
    tasks: [
      { text: 'Memorise the circle clockwise (C-G-D-A-E…), each a 5th up and adding one sharp. It tells you every key’s sharps/flats.', yt: 'circle of fifths explained simply' },
      { text: 'Use it to find a key’s I-IV-V: they sit next to each other on the circle. Try it for G.', yt: 'circle of fifths chord progressions' },
    ],
  },
  {
    id: 'capo-transpose',
    title: 'Capo & transposing',
    instrument: 'Guitar', category: 'Theory', level: 'Novice',
    tags: ['capo', 'transpose', 'key', 'singer', 'shapes'],
    summary: 'Use a capo to change key while keeping easy open-chord shapes.',
    tasks: [
      { text: 'Put a capo on fret 2 and play a G shape — it now sounds as A. Each fret up moves the key up one semitone.', yt: 'how to use a capo guitar transpose' },
      { text: 'Find a comfortable key for a singer by moving the capo up/down while keeping the same shapes.', yt: 'capo transpose key for singing' },
    ],
  },

  // ── Rhythm ──────────────────────────────────────────────────────────────
  {
    id: 'syncopation',
    title: 'Syncopation',
    instrument: 'Both', category: 'Rhythm', level: 'Intermediate',
    tags: ['syncopation', 'off beat', 'funk', 'groove', 'accents'],
    summary: 'Accenting the off-beats — the secret behind funk, reggae and great grooves.',
    tasks: [
      { text: 'Count "1-and-2-and"; play only on the "ands" (the off-beats). It feels lopsided at first — that’s the point.', yt: 'syncopation rhythm guitar lesson' },
      { text: 'Play a chord stab on the "and" of beat 2 and 4 reggae-style, muting in between.', yt: 'reggae offbeat strumming lesson' },
    ],
  },
  {
    id: 'triplets-shuffle',
    title: 'Triplets & shuffle feel',
    instrument: 'Both', category: 'Rhythm', level: 'Intermediate',
    tags: ['triplets', 'shuffle', 'swing', 'blues', 'feel'],
    summary: 'Dividing the beat into 3 — the bouncy feel under blues, swing and shuffles.',
    tasks: [
      { text: 'Count "1-trip-let, 2-trip-let" and play a note on each — three even notes per beat at 70 BPM.', yt: 'triplets rhythm exercise guitar' },
      { text: 'Play only the 1st and 3rd of each triplet for a shuffle/swing feel over a 12-bar blues.', yt: 'shuffle feel blues rhythm guitar' },
    ],
  },
  {
    id: 'time-signatures',
    title: 'Odd time signatures',
    instrument: 'Both', category: 'Rhythm', level: 'Advanced',
    tags: ['time signature', '7/8', '5/4', 'odd meter', 'prog'],
    summary: 'Playing in 5, 7 and beyond — the prog/math-rock challenge.',
    tasks: [
      { text: 'Count a bar of 7/8 as "1-2-3, 1-2, 1-2" and play a riff that lands with that grouping. Tap your foot on each "1".', yt: '7/8 time signature explained riff' },
      { text: 'Loop a riff in 5/4 (like Take Five) until the odd count feels natural.', yt: '5/4 time signature lesson guitar' },
    ],
  },
  {
    id: 'funk-strumming',
    title: 'Funk 16th-note strumming',
    instrument: 'Guitar', category: 'Rhythm', level: 'Advanced',
    tags: ['funk', '16th notes', 'strumming', 'rhythm', 'nile rodgers'],
    summary: 'Tight, percussive 16th-note rhythm playing — the Nile Rodgers school.',
    tasks: [
      { text: 'Keep your hand moving in constant 16ths (down-up-down-up). Only let chosen strums hit the strings; mute the rest. Start at 70 BPM.', yt: 'funk rhythm guitar 16th notes lesson' },
      { text: 'Use a tight 9th chord and add scratchy muted strums between the hits for groove.', yt: 'nile rodgers funk rhythm lesson' },
    ],
  },

  // ── Ear Training ──────────────────────────────────────────────────────────
  {
    id: 'chord-quality-ear',
    title: 'Hearing major vs minor',
    instrument: 'Both', category: 'Ear Training', level: 'Novice',
    tags: ['ear training', 'major minor', 'mood', 'recognise'],
    summary: 'The first ear-training win: instantly telling happy (major) from sad (minor).',
    tasks: [
      { text: 'Play C then Cm back to back, eyes closed, and feel the mood flip. Have someone (or an app) play one at random — name it.', yt: 'major vs minor chord ear training' },
      { text: 'Listen to songs and guess major or minor before checking — you’ll be right more than you expect.', yt: 'identify major minor by ear songs' },
    ],
  },
  {
    id: 'tune-by-ear',
    title: 'Tuning by ear',
    instrument: 'Both', category: 'Ear Training', level: 'Beginner',
    tags: ['tuning', 'by ear', '5th fret', 'reference', 'beats'],
    summary: 'Tune the guitar to itself using the 5th-fret method — no app needed.',
    tasks: [
      { text: '5th-fret method: fret the low E at 5 (an A) and match the open A string to it. Repeat across (the G string uses the 4th fret).', yt: 'tune guitar by ear 5th fret method' },
      { text: 'Listen for the "beating" (wobble) between two notes — it slows and disappears as they come into tune.', yt: 'tuning by ear beats explained' },
    ],
  },
  {
    id: 'transcribe-bassline',
    title: 'Transcribing a bassline',
    instrument: 'Bass', category: 'Ear Training', level: 'Advanced',
    tags: ['transcribe', 'by ear', 'bassline', 'learn songs'],
    summary: 'Working out a real bassline by ear — the skill that makes you a pro.',
    tasks: [
      { text: 'Pick a groove-based song. Find the root of each chord first, then fill in the connecting notes a few seconds at a time.', yt: 'how to transcribe bass by ear' },
      { text: 'Write out (or memorise) the line, then play along with the record to check timing and feel.', yt: 'learn bass lines by ear lesson' },
    ],
  },

  // ── Songs ───────────────────────────────────────────────────────────────
  {
    id: 'songs-acoustic-novice',
    title: 'Campfire acoustic songs',
    instrument: 'Guitar', category: 'Songs', level: 'Novice',
    tags: ['acoustic', 'open chords', 'strumming', 'easy songs'],
    summary: 'Crowd-pleasers built from a handful of open chords and a steady strum.',
    tasks: [
      { text: 'Wonderwall-style G-Em-C-D and Wagon Wheel (G-D-Em-C) — same four chords, dozens of songs. Loop the changes in time.', yt: 'easy 4 chord acoustic songs guitar' },
      { text: 'Three Little Birds (Bob Marley): A-D-E with an upbeat strum — practice switching cleanly.', yt: 'three little birds guitar lesson' },
    ],
  },
  {
    id: 'songs-riffs-intermediate',
    title: 'Essential rock riffs',
    instrument: 'Guitar', category: 'Songs', level: 'Intermediate',
    tags: ['riffs', 'rock', 'power chords', 'intermediate songs'],
    summary: 'The riffs every rock guitarist should have under their fingers.',
    tasks: [
      { text: 'Seven Nation Army, Back in Black (AC/DC), and Sunshine of Your Love (Cream) — single-note + power-chord riffs.', yt: 'essential rock riffs guitar lesson' },
      { text: 'Day Tripper (Beatles): a precise single-note riff that builds picking accuracy.', yt: 'day tripper riff guitar lesson' },
    ],
  },
  {
    id: 'songs-guitar-advanced',
    title: 'Advanced guitar workouts',
    instrument: 'Guitar', category: 'Songs', level: 'Advanced',
    tags: ['advanced songs', 'solos', 'technique', 'workout'],
    summary: 'Demanding songs that level up technique, timing and stamina.',
    tasks: [
      { text: 'Sweet Child O’ Mine (intro string-skipping), Master of Puppets (down-picking stamina), Hotel California (the harmonised solo).', yt: 'intermediate to advanced guitar songs' },
      { text: 'Crazy Train (Randy Rhoads): the riff + the iconic solo phrases, broken down slowly.', yt: 'crazy train guitar lesson solo' },
    ],
  },
  {
    id: 'songs-bass-intermediate',
    title: 'Groove bass classics',
    instrument: 'Bass', category: 'Songs', level: 'Intermediate',
    tags: ['bass songs', 'groove', 'funk', 'intermediate'],
    summary: 'Iconic basslines that teach groove, fingerstyle and feel.',
    tasks: [
      { text: 'Come Together (Beatles), Money (Pink Floyd, in 7/4), and Higher Ground (RHCP — a slap workout).', yt: 'iconic bass lines intermediate lesson' },
      { text: 'Good Times (Chic): the bassline that launched a thousand grooves — lock it to the click.', yt: 'good times chic bass lesson' },
    ],
  },
  {
    id: 'fingerstyle-pieces',
    title: 'Fingerstyle showpieces',
    instrument: 'Guitar', category: 'Songs', level: 'Advanced',
    tags: ['fingerstyle', 'arrangement', 'solo guitar', 'travis'],
    summary: 'Standalone fingerstyle arrangements — melody, bass and harmony at once.',
    tasks: [
      { text: 'Blackbird (Beatles): the pull-off melody over a moving bass — a fingerstyle rite of passage. Hands separately first.', yt: 'blackbird beatles fingerstyle lesson' },
      { text: 'Dust in the Wind: Travis-picked, constant alternating bass under a melody. Slow and steady.', yt: 'dust in the wind fingerstyle lesson' },
    ],
  },

  // ── Gear & Tone ───────────────────────────────────────────────────────────
  {
    id: 'effects-pedals',
    title: 'Effects pedals 101',
    instrument: 'Both', category: 'Gear & Tone', level: 'Intermediate',
    tags: ['pedals', 'effects', 'overdrive', 'delay', 'reverb', 'signal chain'],
    summary: 'What the main pedal types do and the order to plug them in.',
    tasks: [
      { text: 'Learn the big four: overdrive/distortion (grit), delay (echo), reverb (space), modulation (chorus/phaser). Try each one at a time.', yt: 'guitar pedals explained for beginners' },
      { text: 'Signal-chain order: tuner → drive → modulation → delay → reverb. Hear how reordering changes the sound.', yt: 'pedalboard signal chain order explained' },
    ],
  },
  {
    id: 'guitar-setup',
    title: 'Setting up your instrument',
    instrument: 'Both', category: 'Gear & Tone', level: 'Advanced',
    tags: ['setup', 'action', 'intonation', 'truss rod', 'maintenance'],
    summary: 'Action, intonation and neck relief — make any guitar play its best.',
    tasks: [
      { text: 'Action: lower the bridge saddles so strings are close to the frets without buzzing — easier playing. Adjust in tiny steps.', yt: 'guitar setup action adjustment lesson' },
      { text: 'Intonation: check the 12th-fret harmonic vs fretted note; move the saddle to make them match so it plays in tune up the neck.', yt: 'how to set guitar intonation' },
    ],
  },
  {
    id: 'bass-tone',
    title: 'Shaping your bass tone',
    instrument: 'Bass', category: 'Gear & Tone', level: 'Intermediate',
    tags: ['bass tone', 'eq', 'pickups', 'fingers vs pick'],
    summary: 'Pickup selection, EQ and right-hand position to dial in your bass sound.',
    tasks: [
      { text: 'Roll between neck and bridge pickups and hear fat vs punchy. Then sweep the tone knob to tame or add bite.', yt: 'bass tone pickups eq explained' },
      { text: 'Pluck near the neck for warmth, near the bridge for growl — your right-hand position is half your tone.', yt: 'bass right hand position tone' },
    ],
  },
  {
    id: 'looper-pedal',
    title: 'Using a looper pedal',
    instrument: 'Both', category: 'Gear & Tone', level: 'Advanced',
    tags: ['looper', 'practice tool', 'layering', 'solo over loop'],
    summary: 'Record a chord loop and solo over yourself — the ultimate practice tool.',
    tasks: [
      { text: 'Lay down a clean 4-bar chord loop, tapping in exact time so it loops seamlessly. Timing on the punch-in is everything.', yt: 'how to use a looper pedal beginner' },
      { text: 'Solo over your loop using the scale that fits — instant backing track for improv practice.', yt: 'practicing improvisation with a looper' },
    ],
  },
];
