'use client';
/**
 * Centralized Web Audio utilities — single source of truth for all alert sounds.
 *
 * Module-level singleton AudioContext is shared across all pages.
 * The `if (typeof window !== 'undefined')` block auto-unlocks audio on first
 * user gesture (required on iOS/Android mobile browsers).
 *
 * Usage:
 *   import { playNewOrderAlert } from '@/lib/audio';
 *   playNewOrderAlert();
 */

let _ac: AudioContext | null = null;

function getAC(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!_ac || _ac.state === 'closed') _ac = new AudioCtx();
  if (_ac.state === 'suspended') _ac.resume();
  return _ac;
}

// Auto-unlock on first user gesture (required on mobile)
if (typeof window !== 'undefined') {
  const _unlock = () => {
    const c = getAC();
    if (c && c.state === 'suspended') c.resume();
    window.removeEventListener('touchstart', _unlock);
    window.removeEventListener('click', _unlock);
  };
  window.addEventListener('touchstart', _unlock, { once: true });
  window.addEventListener('click', _unlock, { once: true });
}

/** Smooth ramp tone — used for fluid melodic alerts */
function tone(f: number, t: number, d: number, v = 0.22): void {
  const c = getAC(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.connect(g); g.connect(c.destination);
  o.type = 'sine'; o.frequency.value = f;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.02);
  g.gain.setValueAtTime(v, t + d * 0.7);
  g.gain.linearRampToValueAtTime(0.001, t + d);
  o.start(t); o.stop(t + d);
}

/** Hard beep — used for crisp attention-grabbing alerts */
function beepHard(ctx: AudioContext, t: number, f: number, d = 0.1, vol = 0.8): void {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sine'; o.frequency.value = f; g.gain.value = vol;
  o.start(t); o.stop(t + d);
}

/** Decaying beep — used for status change notifications */
function beepSoft(ctx: AudioContext, t: number, f: number, dur = 0.13): void {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sine'; o.frequency.value = f;
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t); o.stop(t + dur + 0.01);
}

// ─── Public exports ────────────────────────────────────────────────────────────

/**
 * Cash register Ka-ching! — professional alert sound.
 *
 * Structure (~4 seconds total):
 *  t=0.00  STRIKE 1 — heavy mechanical "KA" thump + noise burst
 *  t=0.08  CHING 1  — full bell chord, rich harmonics, long sustain
 *  t=0.90  STRIKE 2 — lighter echo "KA" (drawer bounce)
 *  t=0.96  CHING 2  — secondary shimmer ring
 *  t=1.40  SHIMMER  — persistent high sparkle for urgency
 *  t≈4.0s  tail     — warm pad sustain fades out
 *
 * Total duration ≈ 4.2 s. Loop interval should be ≥ 4500 ms.
 */
export function playKaChing(): void {
  try {
    const ctx = getAC(); if (!ctx) return;
    const now = ctx.currentTime;

    // ─── Helper: noise burst (drawer click / strike) ───────────────────────
    function noiseBurst(ac: AudioContext, t: number, durationSec: number, vol: number) {
      const len = Math.floor(ac.sampleRate * durationSec);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
      }
      const src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = buf;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + durationSec);
      src.connect(g); g.connect(ac.destination);
      src.start(t);
    }

    // ─── Helper: bell partial ───────────────────────────────────────────────
    function bell(ac: AudioContext, t: number, freq: number, vol: number, decay: number, type: OscillatorType = 'sine') {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.007);
      g.gain.exponentialRampToValueAtTime(0.001, t + decay);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + decay + 0.05);
    }

    // ─── Helper: pitch-drop thump (mechanical drawer punch) ────────────────
    function thump(ac: AudioContext, t: number, startHz: number, endHz: number, vol: number, dur: number) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(startHz, t);
      o.frequency.exponentialRampToValueAtTime(endHz, t + dur * 0.55);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + dur + 0.02);
    }

    // ════════════════════════════════════════════════════════════
    //  STRIKE 1 — heavy drawer slam  (t = 0)
    // ════════════════════════════════════════════════════════════
    thump(ctx, now, 220, 48, 0.90, 0.14);
    noiseBurst(ctx, now, 0.065, 1.3);

    // ════════════════════════════════════════════════════════════
    //  CHING 1 — full bell chord  (t = 80 ms)
    // ════════════════════════════════════════════════════════════
    const ch1 = now + 0.08;

    // Rich C-major bell chord — layered sines simulating a real register bell
    const bells1: [number, number, number][] = [
      [523,  0.60, 3.5],   // C5  — warm fundamental
      [659,  0.48, 3.2],   // E5
      [784,  0.40, 2.9],   // G5
      [1047, 0.32, 2.6],   // C6
      [1319, 0.24, 2.2],   // E6
      [1568, 0.17, 1.8],   // G6
      [2093, 0.11, 1.4],   // C7
      [2637, 0.07, 1.0],   // E7
      [3520, 0.04, 0.70],  // A7
      [4186, 0.03, 0.50],  // C8
    ];
    for (const [f, v, dec] of bells1) bell(ctx, ch1, f, v, dec);

    // Inharmonic partial — imperfect metallic character
    bell(ctx, ch1 + 0.01, 3136, 0.16, 1.4);   // G7
    bell(ctx, ch1 + 0.01, 4978, 0.10, 0.9);   // D#8

    // High shimmer — bright metallic sparkle
    bell(ctx, ch1, 5400, 0.24, 0.7, 'triangle');
    bell(ctx, ch1, 7040, 0.08, 0.4, 'triangle');

    // Warm sustain pad — makes the tail feel full
    const pad1 = ctx.createOscillator(), pg1 = ctx.createGain();
    pad1.type = 'sine'; pad1.frequency.value = 523;
    pg1.gain.setValueAtTime(0, ch1 + 0.06);
    pg1.gain.linearRampToValueAtTime(0.10, ch1 + 0.25);
    pg1.gain.exponentialRampToValueAtTime(0.001, ch1 + 3.8);
    pad1.connect(pg1); pg1.connect(ctx.destination);
    pad1.start(ch1 + 0.06); pad1.stop(ch1 + 3.85);

    // ════════════════════════════════════════════════════════════
    //  STRIKE 2 — lighter bounce / echo  (t = 900 ms)
    // ════════════════════════════════════════════════════════════
    const s2 = now + 0.90;
    thump(ctx, s2, 160, 52, 0.55, 0.10);
    noiseBurst(ctx, s2, 0.042, 0.75);

    // ════════════════════════════════════════════════════════════
    //  CHING 2 — secondary shimmer ring  (t = 960 ms)
    // ════════════════════════════════════════════════════════════
    const ch2 = now + 0.96;
    const bells2: [number, number, number][] = [
      [1047, 0.28, 2.0],   // C6
      [1319, 0.20, 1.7],   // E6
      [1568, 0.14, 1.4],   // G6
      [2093, 0.09, 1.1],   // C7
      [2637, 0.06, 0.75],  // E7
    ];
    for (const [f, v, dec] of bells2) bell(ctx, ch2, f, v, dec);
    bell(ctx, ch2, 3520, 0.08, 0.55);

    // ════════════════════════════════════════════════════════════
    //  URGENCY SPARKLE — persistent high shimmer  (t = 1.4 s)
    // ════════════════════════════════════════════════════════════
    const sp = now + 1.40;
    bell(ctx, sp, 5400, 0.14, 0.80, 'triangle');
    bell(ctx, sp + 0.18, 4978, 0.09, 0.60, 'triangle');
    bell(ctx, sp + 0.38, 5400, 0.07, 0.50, 'triangle');

  } catch { /* blocked */ }
}

/** Ka-ching! — driver sees a new delivery order in the feed */
export function playNewOrderAlert(): void { playKaChing(); }

/** Rising scale — offer accepted / order confirmed */
export function playAccepted(): void {
  try {
    const c = getAC(); if (!c) return;
    const n = c.currentTime;
    ([523, 659, 784, 1047] as number[]).forEach((f, i) => tone(f, n + i * 0.18, 0.35, 0.28));
  } catch { /* silent */ }
}

/** Looping triple wave — client (mis-envios) receives new driver offer */
export function playOfferAlert(): void {
  try {
    const c = getAC(); if (!c) return;
    const n = c.currentTime;
    for (let g = 0; g < 3; g++) {
      const t = n + g * 2.3;
      tone(660, t, 0.15); tone(880, t + 0.25, 0.15); tone(1100, t + 0.55, 0.35);
    }
  } catch { /* silent */ }
}

/** Ka-ching! — tecnico sees a new service job available */
export function playNewJobAlert(): void { playKaChing(); }


/** Short ascending triple ding — client (mis-servicios) receives new tecnico offer */
export function playClientOfferAlert(): void {
  try {
    const c = getAC(); if (!c) return;
    const t = c.currentTime;
    beepHard(c, t, 1000, 0.1, 0.6);
    beepHard(c, t + 0.14, 1200, 0.1, 0.6);
    beepHard(c, t + 0.28, 1400, 0.1, 0.6);
  } catch { /* silent */ }
}

/** Status-specific notification sounds for tecnico job transitions */
export function playStatusSound(status: string): void {
  try {
    const c = getAC(); if (!c) return;
    const t = c.currentTime;
    if (status === 'accepted')            { beepSoft(c, t, 880); beepSoft(c, t+0.16, 1100); beepSoft(c, t+0.32, 1320); }
    else if (status === 'en_camino')      { beepSoft(c, t, 660); beepSoft(c, t+0.2, 880); }
    else if (status === 'llegue')         { beepSoft(c, t, 880); beepSoft(c, t+0.13, 880); beepSoft(c, t+0.3, 1100); }
    else if (status === 'en_proceso')     { beepSoft(c, t, 660, 0.28); beepSoft(c, t+0.35, 880, 0.18); }
    else if (status === 'completion_pending') {
      beepSoft(c, t, 1000); beepSoft(c, t+0.14, 1200); beepSoft(c, t+0.28, 1000); beepSoft(c, t+0.42, 1200);
    }
    else if (status === 'completado')     { beepSoft(c, t, 523); beepSoft(c, t+0.16, 659); beepSoft(c, t+0.32, 784); beepSoft(c, t+0.48, 1047); }
  } catch { /* silent */ }
}

/** Two-tone soft ping — new chat message received */
export function playMessageAlert(): void {
  try {
    const c = getAC(); if (!c) return;
    const t = c.currentTime;
    beepSoft(c, t,        800, 0.10);
    beepSoft(c, t + 0.13, 1050, 0.10);
  } catch { /* silent */ }
}
