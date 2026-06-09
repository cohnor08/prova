// Static teaching resources for the Teacher "Resources" tab. Organised by
// instrument → level band → categories (exercises, tips, songs). Each item is
// concrete enough for a teacher to hand straight to a student. `yt` is an
// optional YouTube SEARCH phrase (the screen builds a search URL from it).

export const RESOURCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

export const RESOURCES = {
  Guitar: {
    Beginner: {
      exercises: [
        { title: 'Spider walk warm-up', detail: 'Low E string, frets 1-2-3-4 with index-middle-ring-pinky, one note per click at 60 BPM, then across all six strings and back. 3 min.', yt: 'spider walk guitar warm up exercise' },
        { title: 'G ↔ C chord changes', detail: 'Switch between G and C every 4 strums for 3 min. G = low-E 3rd, A 2nd, high-E 3rd. C = A 3rd, D 2nd, B 1st.', yt: 'G to C chord change beginner guitar' },
        { title: 'One-minute changes', detail: 'Pick any two open chords and count how many clean changes the student makes in 60 seconds. Repeat daily and track the number.', yt: 'one minute chord changes justinguitar' },
      ],
      tips: [
        { title: 'One goal per week', detail: 'Keep early lessons to a single clear objective — e.g. "clean G chord" — so the student always knows what success looks like.' },
        { title: 'Fingertips behind the fret', detail: 'Most beginner buzzing is fixed by pressing just behind the fret with the very tip of the finger, not the pad.' },
      ],
      songs: [
        { title: 'Horse With No Name — America', detail: 'Two chords (Em, D6add9/F#). Great first full-song win.', yt: 'horse with no name guitar lesson easy' },
        { title: 'Knockin\' on Heaven\'s Door — Dylan', detail: 'G, D, Am, C — four common open chords in a slow 4/4.', yt: 'knockin on heavens door guitar chords' },
      ],
    },
    Intermediate: {
      exercises: [
        { title: 'F barre ↔ C', detail: 'Switch F major barre (1st fret, E-shape, strings 1-6) to open C, 8 clean reps. Every string of the F must ring.', yt: 'F barre chord to C change clean' },
        { title: 'A minor pentatonic position 1', detail: 'Start low-E 5th fret, ascend/descend to a metronome at 80 BPM, strict alternate picking. 5 min.', yt: 'A minor pentatonic position 1 alternate picking' },
      ],
      tips: [
        { title: 'Barre from the shoulder', detail: 'Tell students to roll the index slightly onto its side and pull back with the arm, not squeeze with the thumb.' },
        { title: 'Slow is fast', detail: 'Have them loop the trickiest 2 bars at half speed for 10 perfect reps before speeding up.' },
      ],
      songs: [
        { title: 'Wonderwall — Oasis', detail: 'Em7, G, Dsus4, A7sus4 with a capo on 2 — a rite of passage.', yt: 'wonderwall guitar lesson capo 2' },
        { title: 'Sunshine of Your Love — Cream', detail: 'D-minor-pentatonic riff in D; great for picking accuracy.', yt: 'sunshine of your love riff guitar lesson' },
      ],
    },
    Advanced: {
      exercises: [
        { title: 'Alternate-picking pentatonics', detail: 'A minor pentatonic (5th fret) in strict 16th notes at 110 BPM, zero buzzing. 5 min.', yt: 'alternate picking pentatonic 16th notes 110 bpm' },
        { title: 'Three-string sweep', detail: 'Sweep a 3-string A minor arpeggio (frets 12-14 on G/B/high-E), 10 perfect reps up and down.', yt: 'three string sweep picking arpeggio exercise' },
      ],
      tips: [
        { title: 'Push then back off', detail: 'Take a lick they can play at 100 BPM, push 5 BPM until it breaks, then drop back — that edge is where speed grows.' },
        { title: 'Record, then critique', detail: 'Have advanced students film one take a week; hearing themselves catches timing/dynamics issues lessons miss.' },
      ],
      songs: [
        { title: 'Little Wing — Hendrix', detail: 'Chord embellishments + thumb-over fretting; superb for phrasing.', yt: 'little wing guitar lesson chords' },
        { title: 'Cliffs of Dover — Eric Johnson', detail: 'Legato, string skipping and economy picking in one piece.', yt: 'cliffs of dover guitar lesson' },
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
      tips: [
        { title: 'Mute everything else', detail: 'Clean bass tone is mostly muting — teach floating-thumb and left-hand muting early.' },
        { title: 'Feel the kick drum', detail: 'Have students lock root notes to the kick of any song they like; groove beats theory at this stage.' },
      ],
      songs: [
        { title: 'Seven Nation Army — White Stripes', detail: 'Iconic single-line riff; perfect first bassline.', yt: 'seven nation army bass lesson' },
        { title: 'Another One Bites the Dust — Queen', detail: 'The definitive groove for locking in time and space.', yt: 'another one bites the dust bass lesson' },
      ],
    },
    Intermediate: {
      exercises: [
        { title: 'Two-octave G major', detail: 'G major scale (E string 3rd fret), two octaves, up and down at 90 BPM. 5 min.', yt: 'two octave major scale bass exercise' },
        { title: 'Walking line in A', detail: 'Quarter notes A – C# – E – G under a steady click. 4 min.', yt: 'walking bass line beginner intermediate' },
      ],
      tips: [
        { title: 'Chord tones first', detail: 'Teach them to land on root/3rd/5th on strong beats before adding passing notes.' },
        { title: 'Learn by ear', detail: 'Assign working out 8 bars of a favourite bassline with no tab — ear training pays off fastest here.' },
      ],
      songs: [
        { title: 'Come Together — Beatles', detail: 'Swampy, syncopated line; great for feel and slides.', yt: 'come together bass lesson' },
        { title: 'Money — Pink Floyd', detail: '7/4 groove — fantastic for counting odd time.', yt: 'money pink floyd bass lesson' },
      ],
    },
    Advanced: {
      exercises: [
        { title: '12-bar blues walk', detail: 'Walk a bassline over a 12-bar blues in A — quarter notes, chord tones on the beat. 5 min.', yt: '12 bar blues walking bass line A' },
        { title: 'Slap & pop', detail: 'Thumb the E, pop the G, steady 8th notes at 90 BPM, even dynamics. 4 min.', yt: 'slap bass exercise thumb pop 90 bpm' },
      ],
      tips: [
        { title: 'Dynamics over speed', detail: 'Advanced slap is about consistent dynamics — have them play soft, then loud, same groove.' },
        { title: 'Transcribe a hero', detail: 'Pick one bassist and transcribe a full song; vocabulary jumps faster than any exercise.' },
      ],
      songs: [
        { title: 'Higher Ground — Red Hot Chili Peppers', detail: 'Relentless slap-and-pop sixteenths; a real workout.', yt: 'higher ground bass lesson slap' },
        { title: 'Teen Town — Weather Report', detail: 'Jaco\'s fast, melodic line — the advanced benchmark.', yt: 'teen town bass lesson jaco' },
      ],
    },
  },
};

export const CATEGORY_META = {
  exercises: { label: 'Exercises', icon: 'barbell' },
  tips: { label: 'Teaching tips', icon: 'bulb' },
  songs: { label: 'Songs to assign', icon: 'musical-notes' },
};
