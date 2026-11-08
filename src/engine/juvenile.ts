/**
 * Baby proportions.
 *
 * A young animal is not its parent shrunk: its head is big for its body, its eyes big for its head,
 * its snout short, its legs short and thick, its tail and horns stubs. (Scaled-down adults trotting
 * at their mothers' heels read as miniatures, not as young.) `juvenileGenome` returns the same
 * creature with those proportions — a pure, deterministic transform that stays inside GENE_BOUNDS —
 * for the viewer to draw while an animal is small. The simulation never sees it.
 */
import { GENE_BOUNDS } from './bounds';
import type { AppendageGene, Genome, SegmentGene } from './genome';

const S = GENE_BOUNDS.segment;
const A = GENE_BOUNDS.appendage;
const clamp = (v: number, [lo, hi]: readonly [number, number]) => (v < lo ? lo : v > hi ? hi : v);

function scaleSize(seg: SegmentGene, x: number, y: number, z: number): void {
  seg.size = [clamp(seg.size[0] * x, S.size), clamp(seg.size[1] * y, S.size), clamp(seg.size[2] * z, S.size)];
}

function babyPart(a: AppendageGene): void {
  const len = (k: number) => (a.length = clamp(a.length * k, A.length));
  const thick = (k: number) => (a.thickness = clamp(a.thickness * k, A.thickness));
  if (a.terminal === 'eye') {
    thick(1.45); // big eyes
    return;
  }
  switch (a.kind) {
    case 'leg':
      len(0.78); // short, chunky legs
      thick(1.15);
      break;
    case 'arm':
      len(0.82);
      thick(1.1);
      break;
    case 'tail':
      len(0.72);
      break;
    case 'horn':
    case 'spine':
      len(0.35); // nubs
      thick(0.8);
      break;
    case 'ear':
      thick(1.15); // a baby's ears are big for its head
      break;
    case 'wing':
      len(0.8);
      break;
    default:
      break;
  }
}

/** the young wear these proportions until they are this far to maturity (by age) */
export const JUVENILE_UNTIL = 0.6;

const JUVENILE = new WeakMap<Genome, Genome>();

/** The same creature with a youngster's proportions (cached per genome object). */
export function juvenileGenome(g: Genome): Genome {
  const hit = JUVENILE.get(g);
  if (hit) return hit;
  const j = structuredClone(g) as Genome;
  const chain: SegmentGene[] = [];
  for (let s: SegmentGene | undefined = j.body; s; s = s.child) chain.push(s);
  const head = chain.length > 1 ? chain[chain.length - 1] : null;
  chain.forEach((seg, i) => {
    if (seg === head) scaleSize(seg, 1.42, 1.42, 0.95); // a big round head, the snout shorter
    else if (i === 0) scaleSize(seg, 1, 1, 0.9); // a shorter, rounder body
    else scaleSize(seg, 1, 1, 0.85); // a short neck
    for (const a of seg.appendages) babyPart(a);
  });
  JUVENILE.set(g, j);
  return j;
}
