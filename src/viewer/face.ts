/**
 * Bare faces.
 *
 * An ape's face is skin, not pelt: the coat gives way round the eyes, the nose and the muzzle, and
 * the fur stops at its edge. Drawn in full fur with a dog's glossy rhinarium on the snout, every
 * primate read as a teddy bear. The mask is a body-space sphere over the face (the covering shader
 * swaps the coat for skin inside it and the fur shells stop there), sized from the eyes and mouth.
 */
import type { Phenotype } from '../engine/grow';
import { unitHash } from '../engine/rng';
import { srgbHSL } from './palette';

export interface FaceMask {
  c: [number, number, number]; // body-space centre
  r: number; // radius: full skin inside ~0.62r, fading to coat at r
  color: number; // the bare skin's tone
}

/** An ape: furred, with arms (a primate's grasping forelimbs) — the bare-faced kind. */
export function isApe(p: Phenotype): boolean {
  return p.genomeRef.covering.type === 'fur' && p.nodes.some((n) => n.part?.kind === 'arm');
}

const FACES: readonly [number, number, number][] = [
  [0.06, 0.18, 0.2], // a chimp's or a gorilla's dark grey-brown
  [0.05, 0.24, 0.3], // a lighter umber
  [0.02, 0.38, 0.52], // a macaque's pink
];

export function faceMaskOf(p: Phenotype): FaceMask | null {
  if (!isApe(p)) return null;
  const eyes = p.nodes.filter((n) => n.terminal === 'eye');
  const mouth = p.nodes.find((n) => n.terminal === 'mouth');
  if (eyes.length === 0 || !mouth) return null;
  const e: [number, number, number] = [0, 0, 0];
  for (const n of eyes) for (let k = 0; k < 3; k++) e[k] += n.pos[k] / eyes.length;
  // the face runs from the brow (just above the eyes) to the chin: centred between eyes and mouth
  const c: [number, number, number] = [(e[0] + mouth.pos[0]) / 2, (e[1] + mouth.pos[1]) / 2 + 0.1 * mouth.radius, (e[2] + mouth.pos[2]) / 2];
  let r = 0;
  for (const n of [...eyes, mouth]) r = Math.max(r, Math.hypot(n.pos[0] - c[0], n.pos[1] - c[1], n.pos[2] - c[2]) + n.radius);
  const [h, s, l] = FACES[Math.floor(unitHash(p.genomeRef.seed, 0xface) * FACES.length)];
  return { c, r: r * 1.15, color: srgbHSL(h, s, l).getHex() };
}
