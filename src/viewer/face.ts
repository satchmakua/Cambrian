/**
 * Bare faces.
 *
 * An ape's face is skin, not pelt: the coat gives way round the eyes, the nose and the muzzle, and
 * the fur stops at its edge. Drawn in full fur with a dog's glossy rhinarium on the snout, every
 * primate read as a teddy bear. The mask is a body-space sphere over the face (the covering shader
 * swaps the coat for skin inside it and the fur shells stop there), sized from the eyes and mouth.
 */
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import { unitHash } from '../engine/rng';
import { projectToSurface, rayToSurface } from './bodyField';
import { eyeSeat } from './eyeSeat';
import { surfacePrims } from './mouthLine';
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

// (all dark, like the animals': a salmon-pink face, hard against the coat, was a rubber mask — and
// turned the nose on it into a pig's)
const FACES: readonly [number, number, number][] = [
  [0.06, 0.18, 0.2], // a chimp's dark grey-brown
  [0.05, 0.24, 0.29], // a lighter umber
  [0.06, 0.26, 0.25], // a warm dark tan
  [0.07, 0.1, 0.13], // a gorilla's near-black
  [0.055, 0.2, 0.24], // a dark brown
];

export function faceMaskOf(p: Phenotype): FaceMask | null {
  if (!isApe(p)) return null;
  const eyes = p.nodes.filter((n) => n.terminal === 'eye');
  const mouth = p.nodes.find((n) => n.terminal === 'mouth');
  if (eyes.length === 0 || !mouth) return null;
  const e: [number, number, number] = [0, 0, 0];
  for (const n of eyes) for (let k = 0; k < 3; k++) e[k] += n.pos[k] / eyes.length;
  // the face runs from the brow (just above the eyes) to the chin: centred between eyes and mouth
  // (and set forward, off the skull: centred in the skin, a sphere wide enough to reach from brow to
  // chin also took in the whole front of the head — forehead, temples and cheeks bare to the ears, a
  // balaclava. From out in front it cuts the head in a smaller round: the fur closes in over the brow)
  const c: [number, number, number] = [(e[0] + mouth.pos[0]) / 2, (e[1] + mouth.pos[1]) / 2 + 0.1 * mouth.radius, (e[2] + mouth.pos[2]) / 2 + MASK_FORWARD * mouth.radius];
  // …and just wide enough to hold the eyes and the mouth in its bare core
  let r = 0;
  for (const n of [...eyes, mouth]) r = Math.max(r, Math.hypot(n.pos[0] - c[0], n.pos[1] - c[1], n.pos[2] - c[2]) + MASK_MARGIN * n.radius);
  const [h, s, l] = FACES[Math.floor(unitHash(p.genomeRef.seed, 0xface) * FACES.length)];
  return { c, r: r / MASK_CORE, color: srgbHSL(h, s, l).getHex() };
}

/**
 * The HEAD as a body-space capsule, from its braincase to the tip of its snout (the chain's head
 * section, the one that holds the mouth). A bold transverse band stops at it and the head takes the
 * coat's one tone. (Where a band's edge fell across a face it drew a bill on it:
 * a dragon with a tan snout on a brown head was a duck's; a lizard wore a mask.) Null when there is
 * no band, or no head apart from the trunk.
 */
export interface HeadMask {
  a: [number, number, number]; // the braincase
  b: [number, number, number]; // the snout's tip
  r: number; // the head's girth: plain within 1.1r of the a–b line (the skull's skin and the eyes on it), the marking back by 1.5r
}

export function headMaskOf(p: Phenotype): HeadMask | null {
  // (bands only: a tiger's or a tabby's stripes run on over its face, and kept off it the cat wore a
  // plain pale hood that stopped dead at the neck. And plumage: a bird's head is smooth-feathered,
  // its feathers' edges kept to its back and wings — see the covering shader)
  if (p.genomeRef.covering.pattern !== 'bands' && p.genomeRef.covering.type !== 'feathers') return null;
  const mouth = p.nodes.findIndex((n) => n.terminal === 'mouth');
  const holder = mouth < 0 ? undefined : p.edges.find(([, b]) => b === mouth);
  const seg = holder ? p.nodes[holder[0]] : undefined;
  if (!seg || seg.kind !== 'spine' || !seg.segment) return null; // a face on the trunk itself
  const head = p.nodes.filter((n) => n.kind === 'spine' && n.segment === seg.segment);
  if (head.length === 0) return null;
  let r = 0;
  for (const n of head) r = Math.max(r, n.radius * Math.max(n.scale?.[0] ?? 1, n.scale?.[1] ?? 1));
  return { a: [...head[0].pos] as [number, number, number], b: [...head[head.length - 1].pos] as [number, number, number], r };
}

/** how far in front of the face the mask's centre stands (×the mouth's radius); how much of each
 *  eye and the mouth its bare core takes in past their centres (×their radius); and the core's share
 *  of the mask's radius (the covering shader's: full skin inside it, fading to coat at the edge) */
const MASK_FORWARD = 0.7;
const MASK_MARGIN = 0.45;
const MASK_CORE = 0.62;

/** An ape's brow ridge: its height above the eye's centre, how far past the eye's outer corner it
 *  runs and its thickness at the middle, all ×the eye's radius. */
const BROW_RISE = 1.05;
const BROW_REACH = 1.3;
const BROW_THICK = 0.4;

/**
 * Half of an ape's BROW RIDGE — the bar of bone over its eyes — from the middle of the forehead out
 * past this eye's outer corner, where it turns down round the orbit; the two eyes' halves meet in
 * the middle. It lies on the skull's own surface, standing about half an eye proud of it, so the
 * eyes look out from under it: on a smooth dome they were two marbles on an egg, and nothing above
 * them said ape. Node-relative (the eye node's rest position is the origin), in the body frame.
 */
export function browRidgeGeometry(p: Phenotype, eyeIdx: number): THREE.BufferGeometry | null {
  if (!isApe(p)) return null;
  const eye = p.nodes[eyeIdx];
  if (!eye || eye.terminal !== 'eye' || Math.abs(eye.pos[0]) < 1e-6) return null;
  const r = Math.max(eye.radius, 0.06);
  const at = eyeSeat(p, eyeIdx, eye.quat, r).centre ?? eye.pos;
  const side = at[0] >= 0 ? 1 : -1;
  const prims = surfacePrims(p, 'hybrid');
  const N = 12; // stations from the midline (just across it, so the halves overlap) to the outer end
  const RING = 10;
  const x0 = -side * 0.08 * r;
  const x1 = side * (Math.abs(at[0]) + BROW_REACH * r);
  const centres: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const out = Math.max(0, (u - 0.62) / 0.38); // 0 over the eye … 1 at the outer end
    const x = x0 + (x1 - x0) * u;
    const y = at[1] + r * (BROW_RISE - 0.95 * out * out);
    // the skull's skin straight ahead of this station (found from inside the head, looking forward,
    // so the bar keeps its height over the eye however the forehead slopes)
    const s = rayToSurface(prims, [], [x, y, at[2] - 1.5 * r], [0, 0, 1]) ?? projectToSurface(prims, [], [x, y, at[2] + 0.45 * r]);
    const rad = r * BROW_THICK * (1 - 0.55 * out * out);
    const n = new THREE.Vector3(s.n[0], s.n[1], s.n[2]).normalize();
    // (sunk at the outer end, so the bar runs into the temple instead of ending in a knob)
    centres.push(new THREE.Vector3(s.p[0], s.p[1], s.p[2]).addScaledVector(n, rad * (0.12 - 0.5 * out * out)));
    normals.push(n);
    radii.push(rad);
  }
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = centres[Math.min(N, i + 1)].clone().sub(centres[Math.max(0, i - 1)]).normalize();
    const n = normals[i].clone().addScaledVector(t, -normals[i].dot(t)).normalize();
    const b = new THREE.Vector3().crossVectors(t, n);
    for (let k = 0; k < RING; k++) {
      const a = (k / RING) * Math.PI * 2;
      // (flatter than it is tall: a shelf over the eye, not a sausage laid on the forehead)
      const v = centres[i].clone().addScaledVector(n, Math.cos(a) * radii[i] * 0.85).addScaledVector(b, Math.sin(a) * radii[i] * 1.2);
      pos.push(v.x - eye.pos[0], v.y - eye.pos[1], v.z - eye.pos[2]);
    }
  }
  // (the ring's turn depends on which side the bar runs to: face the triangles outward)
  const v = (i: number) => new THREE.Vector3(pos[i * 3] + eye.pos[0], pos[i * 3 + 1] + eye.pos[1], pos[i * 3 + 2] + eye.pos[2]);
  const flip = new THREE.Vector3().crossVectors(v(1).sub(v(0)), v(RING).sub(v(0))).dot(v(0).sub(centres[0])) < 0;
  for (let i = 0; i < N; i++)
    for (let k = 0; k < RING; k++) {
      const a = i * RING + k, b = i * RING + ((k + 1) % RING), c = a + RING, d = b + RING;
      if (flip) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
