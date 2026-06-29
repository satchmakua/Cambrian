/**
 * Directed pressures (DESIGN §6.1, ROADMAP M4) — "set a direction and run".
 *
 * Instead of hand-picking offspring, the user sets a `Pressure` vector and the engine
 * scores each offspring against it and auto-selects, fast-forwarding K generations
 * headlessly (the engine is graphics-free). Greedy hill-climbing with **elitism** (the
 * parent is always in the running), so the score never regresses — and the whole run is
 * deterministic from (root, streamSeed), so a directed lineage replays exactly.
 */
import { grow, type Phenotype } from './grow';
import { mix32 } from './rng';
import { breederOffspring } from './selection';
import { describe, distance } from './morphospace';
import type { Genome } from './genome';

/** Each component in [-1, 1]; 0 = "don't care". */
export interface Pressure {
  size: number; // -1 smaller … +1 bigger
  limbCount: number; // -1 fewer … +1 more limbs
  bodyLength: number; // -1 stubby … +1 elongated
  aquatic: number; // -1 legs/terrestrial … +1 fins/streamlined
  predator: number; // -1 prey cues … +1 forward eyes + claws
  novelty: number; // -1 cling to known forms … +1 hunt morphospace far from what's seen (MORPHOLOGY §11.5)
}

export const ZERO_PRESSURE: Pressure = { size: 0, limbCount: 0, bodyLength: 0, aquatic: 0, predator: 0, novelty: 0 };

interface Metrics {
  size: number;
  limbTips: number;
  elong: number;
  legs: number;
  fins: number;
  eyes: number;
  claws: number;
}

function metrics(p: Phenotype): Metrics {
  let foot = 0;
  let claw = 0;
  let fin = 0;
  let eye = 0;
  for (const n of p.nodes) {
    if (n.terminal === 'foot') foot++;
    else if (n.terminal === 'claw') claw++;
    else if (n.terminal === 'fin') fin++;
    else if (n.terminal === 'eye') eye++;
  }
  const dx = p.bounds.max[0] - p.bounds.min[0];
  const dy = p.bounds.max[1] - p.bounds.min[1];
  const dz = p.bounds.max[2] - p.bounds.min[2];
  const legs = foot + claw;
  return {
    size: (dx + dy + dz) / 3,
    limbTips: legs + fin,
    elong: dz / Math.max((dx + dy) / 2, 0.1),
    legs,
    fins: fin,
    eyes: eye,
    claws: claw,
  };
}

/** Smooth, monotonic metric in (-1, 1), centered so `center` maps to 0. */
function soft(value: number, center: number): number {
  return Math.tanh((value - center) / Math.max(center, 1e-3));
}

/** Novelty: morphospace distance to the *nearest* reference form, soft-normalized to ~[0,1). */
function noveltyTerm(p: Phenotype, refs: number[][]): number {
  if (refs.length === 0) return 0;
  const d = describe(p);
  let min = Infinity;
  for (const r of refs) {
    const dist = distance(d, r);
    if (dist < min) min = dist;
  }
  return Math.tanh(min / 0.6); // 0 = a known form … →1 far from everything seen
}

/**
 * How well a phenotype matches the desired direction (higher = better). With a
 * single-axis pressure, elitist selection makes that axis's metric monotonic. `refs` are
 * the morphospace descriptors to be novel *away from* (the menagerie); only consulted when
 * the novelty axis is engaged.
 */
export function scorePhenotype(p: Phenotype, t: Pressure, refs: number[][] = []): number {
  const m = metrics(p);
  const aquatic = (m.fins - m.legs) / Math.max(m.fins + m.legs, 1); // +1 finny … -1 leggy
  const predator = 0.6 * soft(m.claws, 1.5) + 0.4 * soft(m.eyes, 2);
  let score =
    t.size * soft(m.size, 2.5) +
    t.limbCount * soft(m.limbTips, 4) +
    t.bodyLength * soft(m.elong, 2) +
    t.aquatic * aquatic +
    t.predator * predator;
  if (t.novelty !== 0) score += t.novelty * noveltyTerm(p, refs);
  return score;
}

export interface RunOptions {
  litter?: number; // offspring scored per generation
  lockSymmetry?: boolean;
  refs?: number[][]; // morphospace references for the novelty steer (MORPHOLOGY §11.5)
}

/**
 * Fast-forward `generations` of directed selection from `root`. Returns the path of
 * chosen genomes, length `generations + 1` (index 0 is `root`). Pure & deterministic.
 */
export function runGenerations(
  root: Genome,
  target: Pressure,
  generations: number,
  streamSeed: number,
  opts: RunOptions = {},
): Genome[] {
  const litter = opts.litter ?? 12;
  const lock = opts.lockSymmetry ?? false;
  const refs = opts.refs ?? [];
  const path: Genome[] = [root];

  let current = root;
  let currentScore = scorePhenotype(grow(current), target, refs);

  for (let g = 1; g <= generations; g++) {
    let best = current;
    let bestScore = currentScore;
    for (const child of breederOffspring(current, mix32(streamSeed, g), litter, undefined, lock)) {
      const sc = scorePhenotype(grow(child), target, refs);
      if (sc > bestScore) {
        best = child;
        bestScore = sc;
      }
    }
    current = best;
    currentScore = bestScore;
    path.push(current);
  }
  return path;
}
