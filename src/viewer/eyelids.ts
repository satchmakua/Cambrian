/**
 * Eyelids — how shut a creature's eyes are right now (asleep, drowsy). The World and the Studio
 * motion preview provide one per creature; with none in context the eyes are awake. Blinking runs
 * on its own clock inside the eye (every few seconds, both eyes together).
 */
import { createContext } from 'react';

export interface LidControl {
  /** 0 wide awake … 1 shut (asleep) */
  shut: number;
}

export const LidContext = createContext<LidControl | null>(null);

/** A blink envelope 0..1 at time `t` (s) for a creature-specific phase: a quick close-open every
 *  ~3–6 s, occasionally doubled. */
export function blinkAt(t: number, phase: number): number {
  const period = 3.4 + 2.2 * ((phase * 7.13) % 1);
  const u = (t + phase * 11.7) % period;
  const one = (x: number) => (x >= 0 && x < 0.16 ? Math.sin((x / 0.16) * Math.PI) : 0);
  // every third cycle a double blink
  const dbl = Math.floor((t + phase * 11.7) / period) % 3 === 0 ? one(u - 0.24) : 0;
  return Math.max(one(u), dbl);
}
