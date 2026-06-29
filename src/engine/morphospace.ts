/**
 * Morphospace & coherence (MORPHOLOGY §11) — the attractor-basin engine's measuring tape.
 *
 * `describe()` reduces a grown creature to an ~8-D **morphospace descriptor** (computed, not
 * stored — so a creature reports its *true current* form). Each morphotype has a **centroid**
 * here (an attractor), sampled from the generator. `coherence()` reports the nearest centroid
 * and how close — high near a centroid (a clear species), low in the valleys between (uncanny
 * hybrids). Pure & deterministic. The niched breeder litters (selection.ts) use this space to
 * spread offspring; the menagerie (M14) will tile it.
 */
import { grow, type Phenotype } from './grow';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from './random';

const DIMS = 8;

/** [elongation, limbCount, finniness, bulk, eyeCount, winged, tailed, radial] — each ~[0,1]. */
export function describe(p: Phenotype): number[] {
  const { min, max } = p.bounds;
  const dx = max[0] - min[0];
  const dy = max[1] - min[1];
  const dz = max[2] - min[2];

  let legs = 0;
  let fins = 0;
  let wings = 0;
  let tails = 0;
  let eyes = 0;
  let tentacles = 0;
  let rMax = 0;
  for (const n of p.nodes) {
    if (n.radius > rMax) rMax = n.radius;
    if (n.terminal === 'foot' || n.terminal === 'claw' || n.terminal === 'pincer') legs++;
    else if (n.terminal === 'eye') eyes++;
    const k = n.part?.kind;
    if (k === 'fin') fins++;
    else if (k === 'wing') wings++;
    else if (k === 'tail') tails++;
    else if (k === 'tentacle') tentacles++;
  }

  const t = (x: number, c: number) => Math.tanh(x / c); // soft-normalize positives to ~[0,1)
  return [
    t(dz / Math.max((dx + dy) / 2, 0.1), 4), // elongation
    t(legs, 4), // limb count
    (fins + wings) / (fins + wings + legs + 1), // finniness
    t(rMax / Math.max((dx + dy + dz) / 3, 0.1), 0.4), // bulk
    t(eyes, 3), // eye count
    wings > 0 ? 1 : 0, // winged
    tails > 0 ? 1 : 0, // tailed
    p.genomeRef.symmetry === 'radial' || tentacles > 0 ? 1 : 0, // radial
  ];
}

export function distance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < DIMS; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

// --- attractor centroids (sampled once per morphotype, memoized) -------------

interface Centroid {
  id: string;
  v: number[];
}
let CENTROIDS: Centroid[] | null = null;

function centroids(): Centroid[] {
  if (CENTROIDS) return CENTROIDS;
  const N = 16;
  CENTROIDS = MORPHOTYPE_IDS.map((id) => {
    const acc = new Array<number>(DIMS).fill(0);
    for (let s = 0; s < N; s++) {
      const d = describe(grow(genomeOfMorphotype(s * 131 + 7, id)));
      for (let i = 0; i < DIMS; i++) acc[i] += d[i];
    }
    return { id, v: acc.map((x) => x / N) };
  });
  return CENTROIDS;
}

export interface Coherence {
  nearest: string; // the closest morphotype
  score: number; // 0..1 — high = a clear species, low = an uncanny valley
}

/** How clearly a creature reads as a known morphotype (and which one). */
export function coherence(p: Phenotype): Coherence {
  const d = describe(p);
  const cs = centroids();
  let nearest = cs[0].id;
  let best = Infinity;
  for (const c of cs) {
    const dist = distance(d, c.v);
    if (dist < best) {
      best = dist;
      nearest = c.id;
    }
  }
  const sigma = 0.32;
  return { nearest, score: Math.exp(-(best * best) / (2 * sigma * sigma)) };
}
