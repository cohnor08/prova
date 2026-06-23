// Static teaching resources for the Teacher "Resources" tab. Organised by
// instrument → level band → categories (exercises, songs, tips). Each item is
// concrete enough for a teacher to hand straight to a student. `yt` is an
// optional YouTube SEARCH phrase (the screen builds a search URL from it).
//
// Difficulty ramps hard across the five levels: Beginner is open chords/roots,
// Elite is shred/virtuoso material (sweep arpeggios, 8-finger tapping, Jaco/
// Wooten technique) that takes months to master.

export const RESOURCE_LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];

// Every level now has its own curated content, so nothing falls back. Kept as an
// empty map so existing imports keep working.
export const RESOURCE_LEVEL_FALLBACK = {};

export const RESOURCES = {
  Guitar: {
    Beginner: {
      exercises: [
        { title: 'Spider walk warm-up', detail: 'Low E string, frets 1-2-3-4 with index-middle-ring-pinky, one note per click at 60 BPM, then across all six strings and back. 3 min.', yt: 'spider walk guitar warm up exercise' },
        { title: 'G ↔ C chord changes', detail: 'Switch between G and C every 4 strums for 3 min. G = low-E 3rd, A 2nd, high-E 3rd. C = A 3rd, D 2nd, B 1st.', yt: 'G to C chord change beginner guitar' },
        { title: 'One-minute changes', detail: 'Pick any two open chords and count how many clean changes the student makes in 60 seconds. Repeat daily and track the number.', yt: 'one minute chord changes justinguitar' },
      ],
      songs: [
        { title: 'Horse With No Name — America', detail: 'Two chords (Em, D6add9/F#). Great first full-song win.', yt: 'horse with no name guitar lesson easy' },
        { title: 'Knockin\' on Heaven\'s Door — Dylan', detail: 'G, D, Am, C — four common open chords in a slow 4/4.', yt: 'knockin on heavens door guitar chords' },
      ],
      tips: [
        { title: 'One goal per week', detail: 'Keep early lessons to a single clear objective — e.g. "clean G chord" — so the student always knows what success looks like.' },
        { title: 'Fingertips behind the fret', detail: 'Most beginner buzzing is fixed by pressing just behind the fret with the very tip of the finger, not the pad.' },
      ],
    },
    Novice: {
      exercises: [
        { title: 'Power-chord shifts', detail: 'E5 → A5 → D5 → A5 (two-finger root-fifth shapes), four down-strums each, 80 BPM. Mute with the palm between shifts. 4 min.', yt: 'power chord exercise beginner guitar' },
        { title: 'A minor pentatonic — box 1', detail: 'Am pentatonic at the 5th fret, ascend and descend with strict alternate picking at 70 BPM, no buzzing. 4 min.', yt: 'a minor pentatonic box 1 alternate picking slow' },
        { title: 'D – A – E open loop', detail: 'Cycle D, A, E open chords every 2 bars to a click, all six strings ringing on each. 3 min.', yt: 'D A E chord change exercise' },
      ],
      songs: [
        { title: 'Smoke on the Water — Deep Purple', detail: 'The four-note riff every guitarist learns — two strings, no chords.', yt: 'smoke on the water riff guitar lesson' },
        { title: 'Come As You Are — Nirvana', detail: 'Single-note riff on the low strings; great for picking accuracy.', yt: 'come as you are guitar lesson riff' },
      ],
      tips: [
        { title: 'Economy of motion', detail: 'Keep fretting fingers hovering close to the strings — lifting them high is the biggest hidden speed killer.' },
        { title: 'Count out loud', detail: 'Have the student say "1-and-2-and" while strumming; timing problems vanish once they vocalise the beat.' },
      ],
    },
    Intermediate: {
      exercises: [
        { title: 'F barre ↔ C', detail: 'Switch F major barre (1st fret, E-shape, strings 1-6) to open C, 8 clean reps. Every string of the F must ring.', yt: 'F barre chord to C change clean' },
        { title: 'Pentatonic — 5 positions', detail: 'A minor pentatonic, all five connected boxes up the neck, strict alternate picking at 90 BPM. 6 min.', yt: 'five pentatonic positions connect alternate picking' },
        { title: '16th-note gallop', detail: 'Palm-muted down-down-up gallop on the low E (Iron Maiden style) at 120 BPM, even and tight. 4 min.', yt: 'galloping rhythm guitar exercise iron maiden' },
      ],
      songs: [
        { title: 'Sweet Child O\' Mine — Guns N\' Roses', detail: 'The intro: string-skipping single notes over a D arpeggio. A precision benchmark.', yt: 'sweet child o mine intro guitar lesson' },
        { title: 'Wonderwall — Oasis', detail: 'Em7, G, Dsus4, A7sus4 with a capo on 2 — a rite of passage.', yt: 'wonderwall guitar lesson capo 2' },
        { title: 'Back in Black — AC/DC', detail: 'Open-chord riffing with attitude; teaches groove and let-ring control.', yt: 'back in black guitar lesson riff' },
      ],
      tips: [
        { title: 'Barre from the shoulder', detail: 'Tell students to roll the index slightly onto its side and pull back with the arm, not squeeze with the thumb.' },
        { title: 'Slow is fast', detail: 'Have them loop the trickiest 2 bars at half speed for 10 perfect reps before speeding up.' },
      ],
    },
    Advanced: {
      exercises: [
        { title: 'Alternate-picking pentatonics', detail: 'A minor pentatonic in strict 16th notes at 130 BPM, zero buzz, even pick attack. Push 5 BPM only when 3 clean reps land. 5 min.', yt: 'alternate picking pentatonic 16th notes 130 bpm' },
        { title: 'Three-string sweep', detail: 'Sweep a 3-string A minor arpeggio (frets 12-14 on G/B/high-E), one note per string, 10 perfect reps up and down at 100 BPM.', yt: 'three string sweep picking arpeggio exercise' },
        { title: 'Legato 3-notes-per-string', detail: 'A minor scale, three notes per string, hammer-on/pull-off only (pick just the first note of each string) at 110 BPM. 5 min.', yt: 'legato 3 notes per string exercise' },
      ],
      songs: [
        { title: 'Crazy Train solo — Ozzy/Randy Rhoads', detail: 'Pedal-point picking, position shifts and pull-offs — a true lead-guitar milestone.', yt: 'crazy train solo guitar lesson randy rhoads' },
        { title: 'Cliffs of Dover — Eric Johnson', detail: 'Legato, string skipping and economy picking in one piece.', yt: 'cliffs of dover guitar lesson' },
        { title: 'Little Wing — Hendrix', detail: 'Chord embellishments + thumb-over fretting; superb for phrasing.', yt: 'little wing guitar lesson chords' },
      ],
      tips: [
        { title: 'Push then back off', detail: 'Take a lick they can play at 100 BPM, push 5 BPM until it breaks, then drop back — that edge is where speed grows.' },
        { title: 'Record, then critique', detail: 'Have advanced students film one take a week; hearing themselves catches timing/dynamics issues lessons miss.' },
      ],
    },
    Elite: {
      exercises: [
        { title: '5-string sweep arpeggios', detail: 'Major and minor 5-string sweeps (root on the A string), one note per string with rolled fretting, clean at 140 BPM 16ths. Mute every transition. 6 min.', yt: 'five string sweep picking arpeggios exercise 140 bpm' },
        { title: '8-finger tapping passage', detail: 'Two-hand tapping across an A minor arpeggio (Eruption-style), even tone between picked and tapped notes, no extra string noise. 5 min.', yt: 'eight finger tapping exercise guitar' },
        { title: 'Inside-picking string changes', detail: 'Petrucci-style 16th-note runs crossing strings with strict inside picking at 160 BPM. Isolate the two-note string change that fails. 6 min.', yt: 'john petrucci inside picking exercise' },
        { title: 'Economy-picking triplets', detail: 'Pentatonic in 16th-note triplets using economy picking at 150 BPM, perfectly even. 5 min.', yt: 'economy picking triplets pentatonic 150 bpm' },
      ],
      songs: [
        { title: 'Tornado of Souls solo — Megadeth', detail: 'Marty Friedman\'s solo — the modern benchmark. Exotic phrasing, fast alternate picking and wide bends. Months of work.', yt: 'tornado of souls solo lesson marty friedman' },
        { title: 'Eruption — Van Halen', detail: 'Tapping, tremolo picking and whammy dives — the piece that rewrote the rulebook.', yt: 'eruption van halen guitar lesson tapping' },
        { title: 'Far Beyond the Sun — Yngwie Malmsteen', detail: 'Neoclassical sweeps, diminished runs and pedal-point shred at full tilt.', yt: 'far beyond the sun guitar lesson yngwie' },
        { title: 'Glasgow Kiss — John Petrucci', detail: 'Hybrid picking, legato and odd-time phrasing — a complete technical exam.', yt: 'glasgow kiss petrucci guitar lesson' },
      ],
      tips: [
        { title: 'Speed is built on the weak link', detail: 'Have them isolate the single two-note transition that breaks down and loop only that — never the whole lick.' },
        { title: 'Metronome + recorder, always', detail: 'At this level intonation and timing slip invisibly under speed; bar-by-bar recording against a click is the only honest mirror.' },
      ],
    },
  },
  Bass: {
    Beginner: {
      exercises: [
        { title: 'Lock to the click', detail: 'Open E on every beat at 70 BPM for 3 min — dead-on timing is the whole goal.', yt: 'bass timing exercise metronome beginner' },
        { title: 'Root notes E A D', detail: 'Hold open E, A, D for 4 beats each, looped to a metronome. 3 min.', yt: 'bass root notes beginner exercise' },
        { title: 'Octave jumps', detail: 'A (E string 5th fret) to its octave (D string 7th fret), back and forth at 80 BPM. 4 min.', yt: 'bass octave exercise beginner' },
      ],
      songs: [
        { title: 'Seven Nation Army — White Stripes', detail: 'Iconic single-line riff; perfect first bassline.', yt: 'seven nation army bass lesson' },
        { title: 'Another One Bites the Dust — Queen', detail: 'The definitive groove for locking in time and space.', yt: 'another one bites the dust bass lesson' },
      ],
      tips: [
        { title: 'Mute everything else', detail: 'Clean bass tone is mostly muting — teach floating-thumb and left-hand muting early.' },
        { title: 'Feel the kick drum', detail: 'Have students lock root notes to the kick of any song they like; groove beats theory at this stage.' },
      ],
    },
    Novice: {
      exercises: [
        { title: 'One-octave G major', detail: 'G major scale from the E string 3rd fret, one octave up and down, one note per click at 80 BPM. 4 min.', yt: 'one octave major scale bass exercise' },
        { title: 'Root–fifth–octave', detail: 'Play root, fifth, octave across strings for E, A and D, looped to a click at 80 BPM. 4 min.', yt: 'root fifth octave bass exercise' },
        { title: 'Steady eighth-note groove', detail: 'Eighth notes on a single root, i-m alternation, perfectly even at 90 BPM. 3 min.', yt: 'eighth note bass groove exercise metronome' },
      ],
      songs: [
        { title: 'With or Without You — U2', detail: 'Four-note root motion — pure feel and patience.', yt: 'with or without you bass lesson' },
        { title: 'Billie Jean — Michael Jackson', detail: 'Steady, iconic eighth-note groove; a timing classic.', yt: 'billie jean bass lesson' },
      ],
      tips: [
        { title: 'One finger per fret', detail: 'Set the left hand up with a finger-per-fret span early; it pays off for every scale and line later.' },
        { title: 'Keep i-m even', detail: 'Watch the plucking hand — uneven alternation between index and middle is where groove falls apart.' },
      ],
    },
    Intermediate: {
      exercises: [
        { title: 'Two-octave G major', detail: 'G major scale (E string 3rd fret), two octaves, up and down at 90 BPM. 5 min.', yt: 'two octave major scale bass exercise' },
        { title: 'Walking line in A', detail: 'Quarter-note walk A – C# – E – G under a steady click, landing chord tones on the beat. 4 min.', yt: 'walking bass line beginner intermediate' },
        { title: 'Ghost-note 16th groove', detail: 'Funk groove with muted ghost notes between roots, 16ths at 95 BPM, even dynamics. 4 min.', yt: 'ghost note bass groove exercise funk' },
      ],
      songs: [
        { title: 'Hysteria — Muse', detail: 'Driving fuzz-octave line — relentless and a real endurance test.', yt: 'hysteria muse bass lesson' },
        { title: 'Come Together — Beatles', detail: 'Swampy, syncopated line; great for feel and slides.', yt: 'come together bass lesson' },
        { title: 'Money — Pink Floyd', detail: '7/4 groove — fantastic for counting odd time.', yt: 'money pink floyd bass lesson' },
      ],
      tips: [
        { title: 'Chord tones first', detail: 'Teach them to land on root/3rd/5th on strong beats before adding passing notes.' },
        { title: 'Learn by ear', detail: 'Assign working out 8 bars of a favourite bassline with no tab — ear training pays off fastest here.' },
      ],
    },
    Advanced: {
      exercises: [
        { title: '12-bar blues walk', detail: 'Walk a bassline over a 12-bar blues in A — quarter notes, chord tones on the beat, smooth voice-leading. 5 min.', yt: '12 bar blues walking bass line A' },
        { title: 'Slap & pop', detail: 'Thumb the E, pop the G, steady 16th notes at 100 BPM, dead-even dynamics. 5 min.', yt: 'slap bass exercise thumb pop 100 bpm' },
        { title: 'Double-stops & raking', detail: 'Two-note double-stops with right-hand raking across strings, clean and ringing at 90 BPM. 4 min.', yt: 'bass double stop raking exercise' },
      ],
      songs: [
        { title: 'YYZ — Rush', detail: 'Geddy Lee\'s angular, syncopated lines in 5/4 — precision and stamina.', yt: 'yyz bass lesson rush' },
        { title: 'Higher Ground — Red Hot Chili Peppers', detail: 'Relentless slap-and-pop sixteenths; a real workout.', yt: 'higher ground bass lesson slap' },
        { title: 'Schism — Tool', detail: 'Shifting odd time signatures led by the bass — counting and feel under pressure.', yt: 'schism tool bass lesson' },
      ],
      tips: [
        { title: 'Dynamics over speed', detail: 'Advanced slap is about consistent dynamics — have them play soft, then loud, same groove.' },
        { title: 'Transcribe a hero', detail: 'Pick one bassist and transcribe a full song; vocabulary jumps faster than any exercise.' },
      ],
    },
    Elite: {
      exercises: [
        { title: 'Double-thumb slap', detail: 'Wooten-style down-up thumb with pops, even 16th notes at 110 BPM. Both thumb strokes must sound identical. 6 min.', yt: 'double thumb slap bass exercise wooten' },
        { title: 'Two-hand tapping line', detail: 'Tap a walking bass with the left hand while the right taps a melody on top (Stu Hamm style), clean separation. 5 min.', yt: 'two hand tapping bass exercise stu hamm' },
        { title: 'Harmonics melody', detail: 'Play a melody using natural and artificial harmonics (Jaco "Portrait of Tracy" approach), each note ringing clearly. 5 min.', yt: 'bass harmonics exercise portrait of tracy' },
        { title: 'Fast fingerstyle raking', detail: 'Three-finger raking across strings, 16ths at 130 BPM, perfectly even attack and muting. 6 min.', yt: 'three finger bass technique fast 130 bpm' },
      ],
      songs: [
        { title: 'Donna Lee — Jaco Pastorius', detail: 'The bebop head on bass — blistering fingerstyle and bebop phrasing. A lifelong piece.', yt: 'donna lee bass lesson jaco' },
        { title: 'Teen Town — Weather Report', detail: 'Jaco\'s fast, melodic 16th-note line at full tempo — the virtuoso benchmark.', yt: 'teen town bass lesson jaco full speed' },
        { title: 'Portrait of Tracy — Jaco Pastorius', detail: 'An entire solo piece built from harmonics — touch, intonation and control.', yt: 'portrait of tracy bass lesson harmonics' },
        { title: 'Classical Thump — Victor Wooten', detail: 'Double-thumb, tapping and chordal bass at once — the deep end of solo bass.', yt: 'classical thump victor wooten bass lesson' },
      ],
      tips: [
        { title: 'Dead-even at speed', detail: 'Record slap passages and check the waveform — elite slap is judged on every note being the same volume, not on tempo.' },
        { title: 'Transcribe note-for-note', detail: 'Have them transcribe a full Jaco or Wooten solo by ear; nothing else builds elite vocabulary as fast.' },
      ],
    },
  },
};

export const CATEGORY_META = {
  exercises: { label: 'Exercises', icon: 'barbell' },
  songs: { label: 'Songs to assign', icon: 'musical-notes' },
  tips: { label: 'Teaching tips', icon: 'bulb' },
};
