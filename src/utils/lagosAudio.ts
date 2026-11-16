// Lagos Life Authentic Sound & Music Engine
// Strictly playing the official Lagos Life Theme (96 BPM) from https://lagoslife.app/

let audioCtx: AudioContext | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let masterGain: GainNode | null = null;

// Sound & Music persistence in localStorage
const SOUND_KEY = 'lagoslife_sound_enabled';
const GROOVE_KEY = 'lagoslife_music_enabled';

let isSoundEnabled = true;
let isMusicEnabled = true;

if (typeof window !== 'undefined') {
  const storedSound = localStorage.getItem(SOUND_KEY);
  if (storedSound !== null) {
    isSoundEnabled = storedSound !== 'false';
  }
  const storedGroove = localStorage.getItem(GROOVE_KEY);
  if (storedGroove !== null) {
    isMusicEnabled = storedGroove !== 'false';
  } else {
    localStorage.setItem(GROOVE_KEY, 'true');
  }
}

// Audio state listeners for UI sync
export interface AudioState {
  sound: boolean;
  music: boolean;
}

type AudioStateListener = (state: AudioState) => void;
const listeners = new Set<AudioStateListener>();

function getAudioState(): AudioState {
  return {
    sound: isSoundEnabled,
    music: isMusicEnabled,
  };
}

export function subscribeAudioState(fn: AudioStateListener): () => void {
  listeners.add(fn);
  fn(getAudioState());
  return () => {
    listeners.delete(fn);
  };
}

function notifyListeners() {
  const state = getAudioState();
  listeners.forEach((fn) => fn(state));
}

// Semitone frequency formula from https://lagoslife.app/ (C5 base = 523.25Hz)
export function W(semitone: number): number {
  return 523.25 * Math.pow(2, semitone / 12);
}

// Core Web Audio Context Initialization
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    try {
      audioCtx = new AudioContextClass();

      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.85;

      // Dynamics compressor matching https://lagoslife.app/
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.ratio.value = 3;

      masterGain.connect(compressor).connect(audioCtx.destination);

      // SFX Bus
      sfxGain = audioCtx.createGain();
      sfxGain.gain.value = isSoundEnabled ? 0.9 : 0;
      sfxGain.connect(masterGain);

      // Music Bus (eq = 0.2 in lagoslife.app)
      musicGain = audioCtx.createGain();
      musicGain.gain.value = isMusicEnabled ? 0.35 : 0;
      musicGain.connect(masterGain);
    } catch {
      return null;
    }
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

// Reusable noise buffer generators (from lagoslife.app)
let shakerBuffer: AudioBuffer | null = null;

function createNoiseBuffer(
  ctx: AudioContext,
  durationSec: number,
  envelopeFn: (t: number) => number
): AudioBuffer {
  const sampleCount = Math.floor(ctx.sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    data[i] = (2 * Math.random() - 1) * envelopeFn(i / sampleCount);
  }
  return buffer;
}

// ---------------- LOW-LEVEL SOUND SYNTHESIZERS (from lagoslife.app) ----------------

// J: FM synthesis generator (electric piano chords, plucks, cash chimes)
function playFMNote(
  freq: number,
  opts: {
    ratio?: number;
    index?: number;
    vol?: number;
    dur?: number;
    delay?: number;
    dest?: GainNode;
  } = {}
) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const targetBus = opts.dest ?? sfxGain;
  if (!targetBus) return;
  if (!opts.dest && !isSoundEnabled) return;

  const n = ctx.currentTime + (opts.delay ?? 0);
  const r = opts.dur ?? 0.6;
  const carrier = ctx.createOscillator();
  const modulator = ctx.createOscillator();
  const modGain = ctx.createGain();
  const outGain = ctx.createGain();

  carrier.frequency.value = freq;
  modulator.frequency.value = freq * (opts.ratio ?? 3.5);

  modGain.gain.setValueAtTime(freq * (opts.index ?? 2.2), n);
  modGain.gain.exponentialRampToValueAtTime(Math.max(1, 0.05 * freq), n + 0.6 * r);

  modulator.connect(modGain).connect(carrier.frequency);

  outGain.gain.setValueAtTime(0.0001, n);
  outGain.gain.exponentialRampToValueAtTime(opts.vol ?? 0.16, n + 0.005);
  outGain.gain.exponentialRampToValueAtTime(0.0001, n + r);

  carrier.connect(outGain).connect(targetBus);

  carrier.start(n);
  modulator.start(n);
  carrier.stop(n + r + 0.05);
  modulator.stop(n + r + 0.05);
}

// K: Pitch-drop sine wave generator (taps, clicks)
function playSineDrop(
  freq: number,
  opts: {
    vol?: number;
    dur?: number;
    drop?: number;
    delay?: number;
  } = {}
) {
  if (!isSoundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || !sfxGain) return;

  const n = ctx.currentTime + (opts.delay ?? 0);
  const r = opts.dur ?? 0.12;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 1.6, n);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * (opts.drop ?? 0.85)), n + r);

  gain.gain.setValueAtTime(0.0001, n);
  gain.gain.exponentialRampToValueAtTime(opts.vol ?? 0.18, n + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, n + r);

  osc.connect(gain).connect(sfxGain);
  osc.start(n);
  osc.stop(n + r + 0.02);
}

// L: Bandpass noise sweep (bill rustle, air swoosh)
function playNoiseSweep(
  dur: number,
  opts: {
    vol?: number;
    from?: number;
    to?: number;
    delay?: number;
  } = {}
) {
  if (!isSoundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || !sfxGain) return;

  const n = ctx.currentTime + (opts.delay ?? 0);
  const buffer = createNoiseBuffer(ctx, dur, () => 1);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(opts.from ?? 900, n);
  filter.frequency.exponentialRampToValueAtTime(opts.to ?? 3200, n + dur);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, n);
  gain.gain.exponentialRampToValueAtTime(opts.vol ?? 0.05, n + 0.35 * dur);
  gain.gain.exponentialRampToValueAtTime(0.0001, n + dur);

  source.connect(filter).connect(gain).connect(sfxGain);
  source.start(n);
}

// Kick Drum (110Hz -> 48Hz exponential ramp from lagoslife.app)
function playKick(ctx: AudioContext, dest: GainNode, time: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(110, time);
  osc.frequency.exponentialRampToValueAtTime(48, time + 0.1);
  gain.gain.setValueAtTime(0.45, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
  osc.connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + 0.25);
}

// Shaker (highpass 6500Hz linear decay from lagoslife.app)
function playShaker(ctx: AudioContext, dest: GainNode, time: number, vol: number) {
  if (!shakerBuffer) {
    shakerBuffer = createNoiseBuffer(ctx, 0.06, (t) => 1 - t);
  }
  const source = ctx.createBufferSource();
  source.buffer = shakerBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 6500;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  source.connect(filter).connect(gain).connect(dest);
  source.start(time);
}

// Triangle Lowpass Bass (lowpass 600Hz from lagoslife.app)
function playBass(
  ctx: AudioContext,
  dest: GainNode,
  time: number,
  semitone: number,
  dur: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = 'triangle';
  osc.frequency.value = W(semitone - 12);
  filter.type = 'lowpass';
  filter.frequency.value = 600;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.5, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(filter).connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + dur + 0.05);
}

// FM Electric Piano Chord (ratio 14, index 0.5 from lagoslife.app)
function playFMChord(
  ctx: AudioContext,
  dest: GainNode,
  time: number,
  chordNotes: number[],
  dur: number,
  vol = 0.05
) {
  for (const semitone of chordNotes) {
    playFMNote(W(semitone), {
      ratio: 14,
      index: 0.5,
      vol,
      dur,
      delay: time - ctx.currentTime,
      dest,
    });
  }
}

// FM Melodic Pluck (ratio 1, index 2.5 from lagoslife.app)
function playFMPluck(
  ctx: AudioContext,
  dest: GainNode,
  time: number,
  semitone: number,
  vol = 0.05
) {
  playFMNote(W(semitone), {
    ratio: 1,
    index: 2.5,
    vol,
    dur: 0.28,
    delay: time - ctx.currentTime,
    dest,
  });
}

// ---------------- EXPORTED LAGOS LIFE SFX ----------------

export function playTapSound() {
  playSineDrop(W(7), { vol: 0.14, dur: 0.07 });
}

export function playCashSound() {
  playFMNote(W(12), { ratio: 3.5, vol: 0.16, dur: 0.5 });
  playFMNote(W(19), { ratio: 3.5, vol: 0.14, dur: 0.8, delay: 0.09 });
  playNoiseSweep(0.25, { vol: 0.035, from: 4000, to: 9000, delay: 0.05 });
}

export function playClaimCelebrationSound() {
  [0, 4, 7, 12, 16].forEach((semitone, i) => {
    playFMNote(W(semitone), { ratio: 3.5, vol: 0.15, dur: 0.7, delay: 0.08 * i });
  });
  playNoiseSweep(0.6, { vol: 0.04, from: 2000, to: 9500, delay: 0.12 });
  setTimeout(() => {
    [16, 19, 24].forEach((semitone, i) => {
      playFMNote(W(semitone), { ratio: 3.5, vol: 0.12, dur: 0.9, delay: 0.05 * i });
    });
  }, 450);
}

export function playClaimNoticeSound() {
  playFMNote(W(7), { ratio: 3.5, index: 1.4, vol: 0.09, dur: 0.45 });
  playFMNote(W(12), { ratio: 3.5, index: 1.4, vol: 0.08, dur: 0.65, delay: 0.1 });
}

export function playWelcomeChime() {
  playFMNote(W(16), { ratio: 1, index: 0.25, vol: 0.14, dur: 1.2 });
  playFMNote(W(12), { ratio: 1, index: 0.25, vol: 0.12, dur: 1.5, delay: 0.45 });
}

export function playErrorSound() {
  playSineDrop(W(-3), { vol: 0.16, dur: 0.15, drop: 0.95 });
  playSineDrop(W(-8), { vol: 0.16, dur: 0.22, drop: 0.9, delay: 0.14 });
}

export function playDanfoHorn(delay = 0, dur = 0.22) {
  if (!isSoundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || !sfxGain) return;

  const now = ctx.currentTime + delay;
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  filter.type = 'lowpass';
  filter.frequency.value = 1700;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
  gain.gain.setValueAtTime(0.12, now + dur - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  const tones: [number, OscillatorType][] = [
    [392, 'square'],
    [494, 'square'],
    [196, 'sawtooth'],
  ];

  tones.forEach(([freq, type]) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(filter);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  });

  filter.connect(gain).connect(sfxGain);
}

// ---------------- EXCLUSIVELY OFFICIAL LAGOS LIFE THEME TRACK ----------------
// Extracted 1:1 from https://lagoslife.app/ (chunk 3uc2yz3zccxq6.js)

const LL_CHORDS = [
  [-7, -3, 0, 4],
  [-8, -5, -1, 2],
  [-10, -7, -3, 0],
  [-5, -1, 2, 5],
  [-12, -8, -5, -1],
  [-15, -12, -8, -5],
  [-10, -7, -3, 4],
  [-5, -1, 2, 9],
];
const LL_BASS = [-19, -20, -22, -17, -24, -27, -22, -17];
const LL_PLUCK = [null, 2, null, 1, 3, null, 2, null, null, 2, null, 3, 1, null, 2, 0];
const STEP_DURATION = 0.15625; // Exact 96 BPM 16th note timing

let grooveTimer: NodeJS.Timeout | null = null;
let nextStepTime = 0;
let currentGrooveStep = 0;
const LOOKAHEAD = 0.25;

function scheduleMusicStep(
  ctx: AudioContext,
  dest: GainNode,
  time: number,
  stepIndex: number
) {
  const step16 = stepIndex % 16;
  const bar = Math.floor(stepIndex / 16);
  const chordIndex = bar % LL_CHORDS.length;
  const currentChord = LL_CHORDS[chordIndex];
  const currentBass = LL_BASS[chordIndex];

  // 1. Kick on steps 0 and 10
  if (step16 === 0 || step16 === 10) {
    playKick(ctx, dest, time);
  }

  // 2. Highpass Shaker on every 16th step (accent on step 2)
  const shakerVol = step16 % 4 === 2 ? 0.1 : step16 % 2 === 0 ? 0.05 : 0.03;
  playShaker(ctx, dest, time, shakerVol);

  // 3. Triangle Lowpass Bass on steps 0, 6, 10, 14
  if (step16 === 0) playBass(ctx, dest, time, currentBass, 0.78125);
  if (step16 === 6) playBass(ctx, dest, time, currentBass + 7, 0.46875);
  if (step16 === 10) playBass(ctx, dest, time, currentBass + 12, 0.46875);
  if (step16 === 14) playBass(ctx, dest, time, currentBass + 10, 0.3125);

  // 4. FM Chords on steps 0 and 7
  if (step16 === 0) playFMChord(ctx, dest, time, currentChord, 0.15625 * 7, 0.045);
  if (step16 === 7) playFMChord(ctx, dest, time, currentChord, 0.15625 * 6, 0.038);

  // 5. Melodic FM Plucks
  const pluckIdx = LL_PLUCK[step16];
  if (pluckIdx !== null && pluckIdx !== undefined) {
    playFMPluck(ctx, dest, time, currentChord[pluckIdx] + 12, 0.048);
  }
}

function scheduleGroove() {
  if (!isMusicEnabled) return;
  if (typeof document !== 'undefined' && document.hidden) {
    pauseAudioWhenHidden();
    return;
  }
  const ctx = getAudioContext();
  if (!ctx || !musicGain) return;

  if (ctx.state !== 'running') {
    ctx.resume().catch(() => {});
    return;
  }

  if (nextStepTime < ctx.currentTime) {
    nextStepTime = ctx.currentTime + 0.05;
  }

  while (nextStepTime < ctx.currentTime + LOOKAHEAD) {
    scheduleMusicStep(ctx, musicGain, nextStepTime, currentGrooveStep);
    nextStepTime += STEP_DURATION;
    currentGrooveStep++;
  }
}

export function pauseAudioWhenHidden() {
  if (grooveTimer) {
    clearInterval(grooveTimer);
    grooveTimer = null;
  }

  if (audioCtx) {
    try {
      const now = audioCtx.currentTime;
      if (masterGain) {
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(0, now);
      }
      if (musicGain) {
        musicGain.gain.cancelScheduledValues(now);
        musicGain.gain.setValueAtTime(0, now);
      }
      if (sfxGain) {
        sfxGain.gain.cancelScheduledValues(now);
        sfxGain.gain.setValueAtTime(0, now);
      }

      if (audioCtx.state === 'running') {
        audioCtx.suspend().catch(() => {});
      }
    } catch {
      // ignore
    }
  }
}

export function resumeAudioWhenVisible() {
  if (typeof document !== 'undefined' && document.hidden) {
    return;
  }

  if (!isMusicEnabled && !isSoundEnabled) {
    return;
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    if (masterGain) {
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(0.85, now);
    }
    if (musicGain) {
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(isMusicEnabled ? 0.35 : 0, now);
    }
    if (sfxGain) {
      sfxGain.gain.cancelScheduledValues(now);
      sfxGain.gain.setValueAtTime(isSoundEnabled ? 0.9 : 0, now);
    }

    ctx
      .resume()
      .then(() => {
        if (isMusicEnabled && typeof document !== 'undefined' && !document.hidden) {
          startAmbientGroove();
        }
      })
      .catch(() => {});
  } catch {
    // ignore
  }
}

export function startAmbientGroove() {
  if (typeof document !== 'undefined' && document.hidden) {
    return;
  }
  if (grooveTimer) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (musicGain) {
    musicGain.gain.value = 0.35;
  }

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  nextStepTime = ctx.currentTime + 0.05;
  scheduleGroove();
  grooveTimer = setInterval(scheduleGroove, 40);
}

export function stopAmbientGroove() {
  if (grooveTimer) {
    clearInterval(grooveTimer);
    grooveTimer = null;
  }
  if (musicGain && audioCtx) {
    musicGain.gain.value = 0;
  }
}

// ---------------- TOGGLE CONTROLS ----------------

export function toggleSound(): boolean {
  isSoundEnabled = !isSoundEnabled;
  if (typeof window !== 'undefined') {
    localStorage.setItem(SOUND_KEY, isSoundEnabled ? 'true' : 'false');
  }
  if (sfxGain) {
    sfxGain.gain.value = isSoundEnabled ? 0.9 : 0;
  }
  if (isSoundEnabled) {
    unlockAudio();
    playTapSound();
  }
  notifyListeners();
  return isSoundEnabled;
}

export function toggleMusic(): boolean {
  isMusicEnabled = !isMusicEnabled;
  if (typeof window !== 'undefined') {
    localStorage.setItem(GROOVE_KEY, isMusicEnabled ? 'true' : 'false');
  }
  if (musicGain) {
    musicGain.gain.value = isMusicEnabled ? 0.35 : 0;
  }
  if (isMusicEnabled) {
    if (typeof document === 'undefined' || !document.hidden) {
      unlockAudio();
      startAmbientGroove();
    }
  } else {
    stopAmbientGroove();
  }
  notifyListeners();
  return isMusicEnabled;
}

export function getAudioSettings() {
  return {
    sound: isSoundEnabled,
    music: isMusicEnabled,
  };
}

// ---------------- UNLOCK & AUTOPLAY (INSTANT START) ----------------

export function unlockAudio() {
  if (typeof document !== 'undefined' && document.hidden) {
    return;
  }

  const ctx = getAudioContext();
  if (ctx) {
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // ignore
    }

    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => {
          if (isMusicEnabled && (typeof document === 'undefined' || !document.hidden)) {
            startAmbientGroove();
          }
        })
        .catch(() => {});
    } else if (isMusicEnabled) {
      startAmbientGroove();
    }
  }
}

// Global lifecycle listener setup to prevent background playback
let isVisibilityBound = false;

export function setupVisibilityLifecycle() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || isVisibilityBound) {
    return;
  }
  isVisibilityBound = true;

  const onVisibilityChange = () => {
    if (document.hidden) {
      pauseAudioWhenHidden();
    } else {
      resumeAudioWhenVisible();
    }
  };

  const onPageLeave = () => {
    pauseAudioWhenHidden();
  };

  const onWindowBlur = () => {
    // If user switched tabs, minimized, or opened another app
    if (document.hidden) {
      pauseAudioWhenHidden();
    }
  };

  const onWindowFocus = () => {
    if (!document.hidden) {
      resumeAudioWhenVisible();
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageLeave);
  window.addEventListener('beforeunload', onPageLeave);
  window.addEventListener('freeze', onPageLeave);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('focus', onWindowFocus);
}

export function initAutoplay() {
  if (typeof window === 'undefined') return;

  setupVisibilityLifecycle();

  isSoundEnabled = true;
  isMusicEnabled = true;

  const tryStart = () => {
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    try {
      const ctx = getAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        startAmbientGroove();
      }
    } catch {
      // ignore
    }
  };

  if (typeof document === 'undefined' || !document.hidden) {
    tryStart();
  }

  const onAnyInteraction = () => {
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }
    tryStart();
    unlockAudio();
  };

  const gestureEvents = [
    'pointerdown',
    'touchstart',
    'touchend',
    'mousedown',
    'mouseup',
    'click',
    'keydown',
  ];

  gestureEvents.forEach((evt) => {
    window.addEventListener(evt, onAnyInteraction, { capture: true, passive: true });
    document.addEventListener(evt, onAnyInteraction, { capture: true, passive: true });
  });
}

if (typeof window !== 'undefined') {
  setupVisibilityLifecycle();
  initAutoplay();
  if (document.readyState === 'complete') {
    initAutoplay();
  } else {
    window.addEventListener('DOMContentLoaded', initAutoplay, { once: true });
    window.addEventListener('load', initAutoplay, { once: true });
  }
}

