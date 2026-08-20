export const TONE_ORDER = ['gong', 'shang', 'jue', 'zhi', 'yu']

export const TONES = {
  gong: {
    char: '宫',
    roman: 'GŌNG',
    solfege: 'DO',
    color: 0xefb542,
    rgb: [0.94, 0.71, 0.26],
    duration: 1.15,
  },
  shang: {
    char: '商',
    roman: 'SHĀNG',
    solfege: 'RE',
    color: 0xf0f2db,
    rgb: [0.94, 0.95, 0.86],
    duration: 0.85,
  },
  jue: {
    char: '角',
    roman: 'JUÉ',
    solfege: 'MI',
    color: 0x47e38c,
    rgb: [0.28, 0.89, 0.55],
    duration: 1.15,
  },
  zhi: {
    char: '徵',
    roman: 'ZHǏ',
    solfege: 'SOL',
    color: 0xff3d1f,
    rgb: [1, 0.24, 0.12],
    duration: 1.2,
  },
  yu: {
    char: '羽',
    roman: 'YǓ',
    solfege: 'LA',
    color: 0x3db8ff,
    rgb: [0.24, 0.72, 1],
    duration: 1.45,
  },
}

export const AUDIO_URLS = {
  gong: require('./assets/moon_rabbit_five_tones_samples/gong_C4.mp3'),
  shang: require('./assets/moon_rabbit_five_tones_samples/shang_D4.mp3'),
  jue: require('./assets/moon_rabbit_five_tones_samples/jue_E4.mp3'),
  zhi: require('./assets/moon_rabbit_five_tones_samples/zhi_G4.mp3'),
  yu: require('./assets/moon_rabbit_five_tones_samples/yu_A4.mp3'),
}

export const TARGET_IMAGE_URL = require('./assets/target.jpg')
export const POSTER_IMAGE_URL = require('./assets/poster.jpg')

export const MAX_SEGMENT_MS = 30000
export const SEGMENT_GAP_MS = 300
export const RHYTHM_BPM = 90
export const RHYTHM_GRID_MS = 60000 / RHYTHM_BPM / 2

export const isTone = value => TONE_ORDER.includes(value)

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

