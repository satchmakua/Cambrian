/**
 * Selection — Breeder mode (DESIGN §6.1).
 *
 * The Biomorphs-style core loop: show a grid of mutant offspring of the current
 * creature; the human picks one and it becomes the next parent. Cheap (no physics),
 * maximally steerable, and the most fun. Deterministic: a (parent, streamSeed) pair
 * always yields the same litter, so a lineage can be replayed (M3).
 */
import { mutate, type MutationRates, DEFAULT_RATES } from './mutate';
import type { Genome } from './genome';

export function breederOffspring(
  parent: Genome,
  streamSeed: number,
  count = 9,
  rates: MutationRates = DEFAULT_RATES,
): Genome[] {
  return Array.from({ length: count }, (_, n) => mutate(parent, streamSeed, n, rates));
}
