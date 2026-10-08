/**
 * Flight posture — how far a creature's wings are spread and where they are in the wingbeat, right
 * now. The World provides one per flying creature (and the Studio's "fly" preview one for its
 * specimen); a wing with no control in context keeps its resting build: a bird's folded along its
 * flank, a membrane wing held half-raised.
 */
import { createContext } from 'react';

export interface FlightControl {
  /** 0 folded / at rest … 1 fully spread for flight */
  spread: number;
  /** the wingbeat: the wing's roll about the body axis at the shoulder (rad, + raises it) */
  flap: number;
}

export const FlightContext = createContext<FlightControl | null>(null);

/** One wingbeat cycle: a quick powered downstroke, a slower recovery, the wing held a little high. */
export function wingbeat(phase: number, power: number): number {
  const p = phase % (Math.PI * 2);
  // downstroke over the first ~40% of the cycle, upstroke over the rest (asymmetric, like a bird's)
  const t = p / (Math.PI * 2);
  const stroke = t < 0.4 ? Math.cos((t / 0.4) * Math.PI) : -Math.cos(((t - 0.4) / 0.6) * Math.PI);
  return 0.12 + power * 0.62 * stroke;
}
