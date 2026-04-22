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
 * Cash register Ka-ching! — professional two-part sound.
 * "KA": mechanical drawer thump + noise burst.
 * "CHING": rich bell chord with long sustain (~2s).
 */
export function playKaChing(): void {
  try {
    const ctx = getAC(); if (!ctx) return;
    const now = ctx.currentTime;

    // ═══ "KA" — mechanical drawer punch (t=0) ═══

    // Low thump: pitch drops fast like a drawer slamming
    const thump = ctx.createOscillator(), tg = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(200, now);
    thump.frequency.exponentialRampToValueAtTime(55, now + 0.10);
    tg.gain.setValueAtTime(0.75, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    thump.connect(tg); tg.connect(ctx.destination);
    thump.start(now); thump.stop(now + 0.15);

    // Noise click burst
    const clickBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.055), ctx.sampleRate);
    const cd = clickBuf.getChannelData(0);
    for (let i = 0; i < cd.length; i++) {
      cd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / cd.length, 2.5);
    }
    const click = ctx.createBufferSource(), cg = ctx.createGain();
    click.buffer = clickBuf;
    cg.gain.setValueAtTime(1.1, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    click.connect(cg); cg.connect(ctx.destination);
    click.start(now);

    // ═══ "CHING" — rich metallic bell chord (t=80ms) ═══
    const ch = now + 0.08;

    // Bell harmonics — layered sines simulating a real register bell
    const bells: [number, number, number][] = [
      // [freq Hz, peak volume, decay seconds]
      [523,  0.50, 2.2],   // C5  — warm fundamental
      [659,  0.40, 2.0],   // E5
      [784,  0.35, 1.8],   // G5
      [1047, 0.28, 1.6],   // C6
      [1319, 0.20, 1.4],   // E6
      [1568, 0.14, 1.1],   // G6
      [2093, 0.09, 0.85],  // C7
      [2637, 0.06, 0.65],  // E7
      [3520, 0.04, 0.50],  // A7
    ];
    for (const [freq, vol, decay] of bells) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, ch);
      g.gain.linearRampToValueAtTime(vol, ch + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, ch + decay);
      o.connect(g); g.connect(ctx.destination);
      o.start(ch); o.stop(ch + decay + 0.05);
    }

    // Inharmonic ring — adds that imperfect metallic character
    const ring = ctx.createOscillator(), rg = ctx.createGain();
    ring.type = 'sine'; ring.frequency.value = 3136; // G7
    rg.gain.setValueAtTime(0.13, ch + 0.01);
    rg.gain.exponentialRampToValueAtTime(0.001, ch + 1.1);
    ring.connect(rg); rg.connect(ctx.destination);
    ring.start(ch + 0.01); ring.stop(ch + 1.15);

    // High shimmer — bright metallic sparkle
    const sh = ctx.createOscillator(), sg = ctx.createGain();
    sh.type = 'triangle'; sh.frequency.value = 5400;
    sg.gain.setValueAtTime(0.20, ch);
    sg.gain.exponentialRampToValueAtTime(0.001, ch + 0.5);
    sh.connect(sg); sg.connect(ctx.destination);
    sh.start(ch); sh.stop(ch + 0.55);

    // Soft sustain pad — makes the tail feel warm and full
    const pad = ctx.createOscillator(), pg = ctx.createGain();
    pad.type = 'sine'; pad.frequency.value = 523;
    pg.gain.setValueAtTime(0, ch + 0.05);
    pg.gain.linearRampToValueAtTime(0.08, ch + 0.2);
    pg.gain.exponentialRampToValueAtTime(0.001, ch + 2.4);
    pad.connect(pg); pg.connect(ctx.destination);
    pad.start(ch + 0.05); pad.stop(ch + 2.45);

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
