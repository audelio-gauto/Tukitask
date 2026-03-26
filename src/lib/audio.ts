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

/** Triple wave alert — driver sees a new delivery order in the feed */
export function playNewOrderAlert(): void {
  try {
    const c = getAC(); if (!c) return;
    const n = c.currentTime;
    for (let g = 0; g < 3; g++) {
      const t = n + g * 2.3;
      tone(880, t, 0.15); tone(880, t + 0.25, 0.15); tone(1100, t + 0.55, 0.35);
    }
  } catch { /* silent */ }
}

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

/** Rapid quad-burst — tecnico sees a new service job available */
export function playNewJobAlert(): void {
  try {
    const c = getAC(); if (!c) return;
    for (let r = 0; r < 4; r++) {
      const t = c.currentTime + r * 0.5;
      beepHard(c, t, 660, 0.1); beepHard(c, t + 0.13, 880, 0.1); beepHard(c, t + 0.26, 1100, 0.14);
    }
  } catch { /* silent */ }
}

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
