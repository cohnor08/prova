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
      { text: 'Practise the same shape in 3 keys by sliding it up the neck (G, A, C). 80 BPM, even notes.', yt: 'movable major scale shape guitar' },
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
];
