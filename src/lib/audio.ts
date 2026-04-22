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
 * Cash register Ka-ching! — used for all new order/job alerts.
 * Percussive click + metallic bell partials + shimmer.
 */
export function playKaChing(): void {
  try {
    const ctx = getAC(); if (!ctx) return;
    const t = ctx.currentTime;

    // ── Percussive click (mechanical transient) ──
    const clickBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
    const cd = clickBuf.getChannelData(0);
    for (let i = 0; i < cd.length; i++) {
      cd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / cd.length, 3);
    }
    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = clickBuf;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.9, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    clickSrc.connect(cg); cg.connect(ctx.destination);
    clickSrc.start(t);

    // ── Metallic bell (harmonic partials — ka-ching timbre) ──
    const freqs = [1318, 1760, 2637, 3520];
    const vols  = [0.5,  0.34, 0.19, 0.11];
    for (let i = 0; i < freqs.length; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freqs[i];
      const st = t + 0.005 + i * 0.002;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(vols[i], st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.65 + i * 0.08);
      o.connect(g); g.connect(ctx.destination);
      o.start(st); o.stop(st + 0.75);
    }

    // ── Shimmer (metallic brightness) ──
    const sh = ctx.createOscillator(), shg = ctx.createGain();
    sh.type = 'triangle'; sh.frequency.value = 5200;
    shg.gain.setValueAtTime(0.22, t + 0.01);
    shg.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    sh.connect(shg); shg.connect(ctx.destination);
    sh.start(t + 0.01); sh.stop(t + 0.39);
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
