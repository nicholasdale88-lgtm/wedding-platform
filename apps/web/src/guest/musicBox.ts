import type { Player } from './audio';

/**
 * Our own music, played in the browser: a slow music-box waltz composed for The Yes List (no one else's song
 * or recording, so nothing to license, and nothing to download). Soft bells over gently rolling chords, in a
 * room-like echo, fading in. Used by the sample invitation (audioUrl 'yl:musicbox').
 */
export const MUSIC_BOX = 'yl:musicbox';

// D major, three-four time. Each bar: a chord (as notes for the rolling left hand) and three melody notes
// (0 = rest). MIDI note numbers.
const BARS: { chord: number[]; tune: number[] }[] = [
  { chord: [50, 57, 62, 66], tune: [74, 0, 73] }, // D
  { chord: [47, 54, 59, 62], tune: [71, 73, 74] }, // Bm
  { chord: [43, 50, 55, 59], tune: [76, 0, 74] }, // G
  { chord: [45, 52, 57, 61], tune: [73, 0, 69] }, // A
  { chord: [50, 57, 62, 66], tune: [74, 76, 78] }, // D
  { chord: [42, 49, 54, 57], tune: [76, 0, 73] }, // F#m
  { chord: [43, 50, 55, 59], tune: [71, 74, 79] }, // G
  { chord: [45, 52, 57, 61], tune: [78, 0, 76] }, // A
  { chord: [47, 54, 59, 62], tune: [74, 0, 71] }, // Bm
  { chord: [43, 50, 55, 59], tune: [71, 74, 76] }, // G
  { chord: [50, 57, 62, 66], tune: [78, 0, 74] }, // D
  { chord: [45, 52, 57, 61], tune: [76, 73, 69] }, // A
  { chord: [43, 50, 55, 59], tune: [71, 0, 74] }, // G
  { chord: [45, 52, 57, 61], tune: [73, 0, 76] }, // A
  { chord: [50, 57, 62, 66], tune: [74, 0, 0] }, // D
  { chord: [50, 57, 62, 66], tune: [0, 0, 0] }, // D (a breath)
];
const BEAT = 0.62; // seconds a beat: a slow waltz

const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export function musicBox(): Player | null {
  const AC = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!AC) return null;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let timer = 0;
  let next = 0; // when the next bar starts (audio clock)
  let bar = 0;
  let muted = false;

  const bell = (at: number, note: number, loud: number, long: number) => {
    if (!ctx || !master) return;
    const f = hz(note);
    // A music-box tine: a pure tone, a touch of its octave and a bright, quickly fading strike.
    for (const [mult, amt, wave] of [
      [1, 1, 'sine'],
      [2, 0.28, 'sine'],
      [4.2, 0.08, 'triangle'],
    ] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = wave;
      o.frequency.value = f * mult;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(loud * amt, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + long / (mult > 2 ? 4 : 1));
      o.connect(g).connect(master);
      o.start(at);
      o.stop(at + long + 0.05);
    }
  };

  const schedule = () => {
    if (!ctx) return;
    while (next < ctx.currentTime + 1.2) {
      const { chord, tune } = BARS[bar % BARS.length]!;
      // The left hand rolls the chord across the bar: root, then up and back.
      [chord[0]!, chord[1]!, chord[2]!, chord[3]!, chord[2]!, chord[1]!].forEach((n, i) => bell(next + (i * BEAT) / 2, n, i === 0 ? 0.16 : 0.09, 2.6));
      tune.forEach((n, i) => n && bell(next + i * BEAT, n, 0.2, 3.2));
      next += BEAT * 3;
      bar++;
    }
  };

  const start = () => {
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      // A small room: a soft echo that fades.
      const delay = ctx.createDelay();
      delay.delayTime.value = 0.23;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2600;
      master.connect(ctx.destination);
      master.connect(delay);
      delay.connect(tone).connect(fb).connect(delay);
      tone.connect(ctx.destination);
      master.gain.setValueAtTime(0, ctx.currentTime);
      master.gain.linearRampToValueAtTime(muted ? 0 : 0.55, ctx.currentTime + 2.5);
      next = ctx.currentTime + 0.15;
    }
    void ctx.resume();
    window.clearInterval(timer);
    timer = window.setInterval(schedule, 250);
    schedule();
  };

  return {
    play: start,
    pause: () => {
      window.clearInterval(timer);
      void ctx?.suspend();
    },
    setMuted: (m) => {
      muted = m;
      if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.15);
    },
    stop: () => {
      window.clearInterval(timer);
      void ctx?.close();
      ctx = null;
      master = null;
    },
  };
}
