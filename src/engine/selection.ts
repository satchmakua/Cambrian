/**
 * Selection — Breeder mode (DESIGN §6.1) + the **niched litter** (MORPHOLOGY §11.3).
 *
 * `breederOffspring` is a plain litter (used by directed evolution, M4). The breeder UI uses
 * `breederLitter`, which spreads the nine offspring across morphospace — a few conservative,
 * a few exploratory, a couple of **saltation** (basin-hop) and one **confluence** (a hybrid
 * blended with a random morphotype) — so every generation offers genuinely divergent choices
 * instead of nine near-clones. Deterministic: a (parent, streamSeed) pair reproduces the litter.
 */
import { mutate, type MutationRates, DEFAULT_RATES } from './mutate';
import { mix32 } from './rng';
import { randomGenome } from './random';
import type { Genome } from './genome';

export function breederOffspring(
  parent: Genome,
  streamSeed: number,
  count = 9,
  rates: MutationRates = DEFAULT_RATES,
  lockSymmetry = false,
): Genome[] {
  return Array.from({ length: count }, (_, n) => mutate(parent, streamSeed, n, rates, lockSymmetry));
}

// --- niched litter -----------------------------------------------------------

const CONSERVATIVE: MutationRates = { point: 0.22, pointSigma: 0.06, structural: 0.06, duplication: 0.03, macro: 0.0 };
const EXPLORATORY: MutationRates = { point: 0.45, pointSigma: 0.12, structural: 0.3, duplication: 0.15, macro: 0.05 };
const SALTATION: MutationRates = { point: 0.4, pointSigma: 0.1, structural: 0.6, duplication: 0.25, macro: 0.45 };

/** A divergent breeder litter: conservative · exploratory · saltation · one confluence hybrid. */
export function breederLitter(parent: Genome, streamSeed: number, count = 9, lockSymmetry = false): Genome[] {
  const lo = Math.max(1, Math.round(count * 0.34));
  const mid = Math.max(lo + 1, Math.round(count * 0.67));
  const out: Genome[] = [];
  for (let n = 0; n < count; n++) {
    if (n < lo) out.push(mutate(parent, streamSeed, n, CONSERVATIVE, lockSymmetry));
    else if (n < mid) out.push(mutate(parent, streamSeed, n, EXPLORATORY, lockSymmetry));
    else if (n < count - 1) out.push(mutate(parent, streamSeed, n, SALTATION, lockSymmetry)); // basin-hop
    else out.push(confluence(parent, mix32(streamSeed, n, 0x51c0), lockSymmetry)); // hybrid wildcard
  }
  return out;
}

/**
 * Confluence: graft a couple of another creature's **decorative** parts (wings, fins, horns, a tail)
 * onto the parent, keeping the parent's own body and **face** — a coherent hybrid (griffin), not a
 * faceless splice (M24). The bauplan pass keeps the result symmetric and faced.
 */
function confluence(parent: Genome, seed: number, lockSymmetry: boolean): Genome {
  const child = structuredClone(parent);
  const mode = lockSymmetry ? (parent.symmetry === 'radial' ? 'radial' : 'bilateral') : 'auto';
  const other = randomGenome(seed, mode);

  const donor = other.body.appendages.filter((a) => a.kind !== 'leg' && a.terminal !== 'eye' && a.terminal !== 'mouth');
  for (const a of donor.slice(0, 2)) {
    if (child.body.appendages.length < 14) child.body.appendages.push(structuredClone(a)); // borrow wings/fins/…
  }
  child.seed = mix32(parent.seed, seed); // reproducible growth jitter
  return child;
}
