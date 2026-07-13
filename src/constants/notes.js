// Static require map for the synthesized note samples (MIDI 48–72 = C3–C5).
// Generated plucked-string tones — see assets/notes/.
export const NOTE_FILES = {
  48: require('../../assets/notes/m48.wav'),
  49: require('../../assets/notes/m49.wav'),
  50: require('../../assets/notes/m50.wav'),
  51: require('../../assets/notes/m51.wav'),
  52: require('../../assets/notes/m52.wav'),
  53: require('../../assets/notes/m53.wav'),
  54: require('../../assets/notes/m54.wav'),
  55: require('../../assets/notes/m55.wav'),
  56: require('../../assets/notes/m56.wav'),
  57: require('../../assets/notes/m57.wav'),
  58: require('../../assets/notes/m58.wav'),
  59: require('../../assets/notes/m59.wav'),
  60: require('../../assets/notes/m60.wav'),
  61: require('../../assets/notes/m61.wav'),
  62: require('../../assets/notes/m62.wav'),
  63: require('../../assets/notes/m63.wav'),
  64: require('../../assets/notes/m64.wav'),
  65: require('../../assets/notes/m65.wav'),
  66: require('../../assets/notes/m66.wav'),
  67: require('../../assets/notes/m67.wav'),
  68: require('../../assets/notes/m68.wav'),
  69: require('../../assets/notes/m69.wav'),
  70: require('../../assets/notes/m70.wav'),
  71: require('../../assets/notes/m71.wav'),
  72: require('../../assets/notes/m72.wav'),
};

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const midiName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
