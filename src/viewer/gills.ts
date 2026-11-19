/**
 * Gills that lie in the skin: a bony fish's gill COVER — one curved edge, the rear rim of the plate
 * over its gills — and a shark's SLITS, five thin cuts (drawn as dark lenses flat in the skin: gillSlits).
 *
 * They are drawn on the surface, so they are laid on the surface: each mark is a line traced over the
 * skin as it is actually drawn — every one of its points dropped onto the blended body field — and
 * drawn as a thin dark cord sunk in it. Placed flat in the plane of the gill's node (which sits on its
 * trunk link's own ellipsoid) two marks in three were under the skin: the blended surface stands
 * 0.1–0.5 of a gill's radius clear of that plane, and by a different amount at each end of a mark.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Phenotype } from '../engine/grow';
import { projectToSurface } from './bodyField';
import { surfacePrims, type SkinSurface } from './mouthLine';

export type GillCut = 'cover' | 'bars' | 'slits';
/** the look a gill part's style gene gives it (bars: the rake of dark bars standing off the neck) */
export const gillCutOf = (style: number): GillCut => (style < 0.35 ? 'cover' : style > 0.65 ? 'slits' : 'bars');

const COVER_SPAN = 0.45 * Math.PI; // half the cover's arc, either side of the tailward direction
const COVER_PTS = 13;
const COVER_RX = 1.15; // ×gill radius: the rim's reach toward the tail …
const COVER_RY = 1.35; // … and up and down the flank
const SLITS = [-0.72, -0.36, 0, 0.36, 0.72]; // ×gill radius along the body
const SLIT_PTS = 5;
const SLIT_LEAN = 0.16; // each slit leans, its top toward the tail
const COVER_CORD = 0.03; // ×the cover's radius: the cord's own radius
const SLIT_CORD = 0.05;
/** a cord's centre stands this many of its radii above the skin (the rest of it is sunk) */
const PROUD = 0.35;

/** a gill cover's radius, at the least, ×the half-depth of the body link it lies on */
export const COVER_OF_DEPTH = 0.4;
/** …and a shark's slits: each runs about half the flank's depth. (The size of the gill part, five creases
 *  a twelfth of it long, they were a smudge in front of the fin: no shark at all; at a third of it, five
 *  tiny scratches.) */
export const SLITS_OF_DEPTH = 0.95;

/**
 * How big a flush gill is drawn. Bars are the size of the gill part itself. A gill COVER is the plate
 * over a bony fish's gills — its rim crosses more than half the depth of the flank — so it is sized to
 * the body link it lies on, or to the gill part if that is larger. (Sized to the part alone, a third
 * of a girth, it was a comma scratched on the flank.)
 */
export function gillRadiusOf(p: Phenotype, idx: number, cut: GillCut, r: number): number {
  if (cut === 'bars') return r;
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  let c = parent.get(idx);
  while (c !== undefined && p.nodes[c].kind !== 'spine') c = parent.get(c);
  if (c === undefined) return r;
  const link = p.nodes[c];
  return Math.max(r, (cut === 'cover' ? COVER_OF_DEPTH : SLITS_OF_DEPTH) * link.radius * (link.scale?.[1] ?? 1));
}

export interface GillMarks {
  /** each mark's centre line, relative to the gill node's position (body frame) */
  lines: THREE.Vector3[][];
  /** the cord's radius */
  radius: number;
}

/** The marks of a flush gill — the cover's rim, or the five slits — traced over the skin. */
export function gillMarks(p: Phenotype, idx: number, surface: SkinSurface, cut: 'cover' | 'slits', r: number): GillMarks {
  const prims = surfacePrims(p, surface);
  const o = p.nodes[idx].pos;
  // a frame on the skin where the gill sits: n out of it, x toward the head, y up the flank
  const seat = projectToSurface(prims, [], [o[0], o[1], o[2]]);
  const n = new THREE.Vector3(seat.n[0], seat.n[1], seat.n[2]).normalize();
  const x = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0).addScaledVector(n, -n.x);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(n, x);
  if (y.y < 0) y.negate(); // (the same way up on both flanks)
  const radius = r * (cut === 'cover' ? COVER_CORD : SLIT_CORD);
  const at = (u: number, v: number): THREE.Vector3 => {
    const hit = projectToSurface(prims, [], [seat.p[0] + x.x * u + y.x * v, seat.p[1] + x.y * u + y.y * v, seat.p[2] + x.z * u + y.z * v]);
    const k = PROUD * radius;
    return new THREE.Vector3(hit.p[0] + hit.n[0] * k - o[0], hit.p[1] + hit.n[1] * k - o[1], hit.p[2] + hit.n[2] * k - o[2]);
  };
  const lines: THREE.Vector3[][] = [];
  if (cut === 'cover') {
    // an arc bulging toward the tail, open toward the head: a gill cover's rear edge
    const line: THREE.Vector3[] = [];
    for (let i = 0; i < COVER_PTS; i++) {
      const th = -COVER_SPAN + (2 * COVER_SPAN * i) / (COVER_PTS - 1);
      line.push(at(-Math.cos(th) * COVER_RX * r, Math.sin(th) * COVER_RY * r));
    }
    lines.push(line);
  } else {
    for (const off of SLITS) {
      const len = r * (1.05 - 0.12 * Math.abs(off));
      const line: THREE.Vector3[] = [];
      for (let j = 0; j < SLIT_PTS; j++) {
        const t = j / (SLIT_PTS - 1) - 0.5;
        line.push(at(off * r - SLIT_LEAN * t * len, t * len));
      }
      lines.push(line);
    }
  }
  return { lines, radius };
}

/** a slit's half-width at its middle (×the gill's radius): a cut, narrowing to a point at either end */
export const SLIT_HALF = 0.035;
/** …and how far it lies over the skin (×the gill's radius): a hair, so the polygonized skin's facets
 *  and vertices, a little off the field, never cover it — and nothing of it stands out of the outline */
export const SLIT_LIFT = 0.01;
const SLIT_ROWS = 13;

/**
 * A shark's gill SLITS as the skin draws them: each a dark lens lying flat in the skin, SLIT_LIFT over it,
 * its rows across the slit re-laid on the surface and lit by the skin's own normal. (Drawn as round cords
 * a tenth of the gill's radius thick and a third of it proud, they were five black rods standing on the
 * flank: from three-quarters a vent grille bolted to the head, the far ones breaking its outline.)
 * Node-relative, like the marks: the same five slits, at the same places, as gillMarks traces.
 */
export function gillSlits(p: Phenotype, idx: number, surface: SkinSurface, r: number): THREE.BufferGeometry {
  const prims = surfacePrims(p, surface);
  const o = p.nodes[idx].pos;
  const seat = projectToSurface(prims, [], [o[0], o[1], o[2]]);
  const n = new THREE.Vector3(seat.n[0], seat.n[1], seat.n[2]).normalize();
  const x = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0).addScaledVector(n, -n.x);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(n, x);
  if (y.y < 0) y.negate();
  const lift = SLIT_LIFT * r;
  const pos: number[] = [];
  const nrm: number[] = [];
  const index: number[] = [];
  const lay = (q: THREE.Vector3) => {
    const hit = projectToSurface(prims, [], [q.x, q.y, q.z]);
    const hn = new THREE.Vector3(hit.n[0], hit.n[1], hit.n[2]).normalize();
    pos.push(hit.p[0] + hn.x * lift - o[0], hit.p[1] + hn.y * lift - o[1], hit.p[2] + hn.z * lift - o[2]);
    nrm.push(hn.x, hn.y, hn.z);
  };
  for (const off of SLITS) {
    const len = r * (1.05 - 0.12 * Math.abs(off));
    // the slit's centre line on the skin, then a row across it at each point
    const mid: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
    for (let j = 0; j < SLIT_ROWS; j++) {
      const t = j / (SLIT_ROWS - 1) - 0.5;
      const u = off * r - SLIT_LEAN * t * len, v = t * len;
      const hit = projectToSurface(prims, [], [seat.p[0] + x.x * u + y.x * v, seat.p[1] + x.y * u + y.y * v, seat.p[2] + x.z * u + y.z * v]);
      mid.push({ p: new THREE.Vector3(hit.p[0], hit.p[1], hit.p[2]), n: new THREE.Vector3(hit.n[0], hit.n[1], hit.n[2]).normalize() });
    }
    const first = pos.length / 3;
    for (let j = 0; j < SLIT_ROWS; j++) {
      const along = mid[Math.min(SLIT_ROWS - 1, j + 1)].p.clone().sub(mid[Math.max(0, j - 1)].p);
      const across = new THREE.Vector3().crossVectors(mid[j].n, along).normalize();
      const w = SLIT_HALF * r * Math.sin((Math.PI * j) / (SLIT_ROWS - 1)) ** 0.5;
      for (const s of [-1, 0, 1]) lay(mid[j].p.clone().addScaledVector(across, s * w));
    }
    for (let j = 0; j < SLIT_ROWS - 1; j++)
      for (let k = 0; k < 2; k++) {
        const a = first + j * 3 + k, b = a + 3;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(index);
  return g;
}

/**
 * A bony fish's gill COVER as a plate (the operculum), not a line painted on the cheek: a band of skin over
 * the back of the head, flush at its front (COVER_FLAP.from of the way out to the rim) and rising to its rear
 * edge — the rim gillMarks traces — COVER_FLAP.lift × the cover's radius proud of the skin, then dropping
 * back to the skin just behind it (COVER_FLAP.wall past the rim), so the edge stands and the light catches
 * its top and leaves the step behind it in shadow. It wears the body's own skin (bake it in body space: see
 * CreatureMesh's bakeSkin); the dark cord of gillMarks is laid in the step at its foot, thinner. (Drawn as a
 * dark cord alone, the rim was an arc in ink: with the mouth's seam, a smile.) Node-relative, like the marks.
 */
export const COVER_FLAP = { from: 0.62, lift: 0.1, wall: 0.06, sink: 0.25, cols: 25 } as const;
export function gillCoverFlap(p: Phenotype, idx: number, surface: SkinSurface, r: number): { flap: THREE.BufferGeometry; crease: THREE.BufferGeometry } {
  const prims = surfacePrims(p, surface);
  const o = p.nodes[idx].pos;
  const seat = projectToSurface(prims, [], [o[0], o[1], o[2]]);
  const n = new THREE.Vector3(seat.n[0], seat.n[1], seat.n[2]).normalize();
  const x = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0).addScaledVector(n, -n.x);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(n, x);
  if (y.y < 0) y.negate();
  const at = (u: number, v: number, h: number): THREE.Vector3 => {
    const hit = projectToSurface(prims, [], [seat.p[0] + x.x * u + y.x * v, seat.p[1] + x.y * u + y.y * v, seat.p[2] + x.z * u + y.z * v]);
    return new THREE.Vector3(hit.p[0] + hit.n[0] * h - o[0], hit.p[1] + hit.n[1] * h - o[1], hit.p[2] + hit.n[2] * h - o[2]);
  };
  const L = COVER_FLAP.lift * r;
  // rows out from the plate's front to its rim, then down the wall behind it: [share of the rim's reach, height]
  const rows: [number, number][] = [];
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    rows.push([COVER_FLAP.from + (1 - COVER_FLAP.from) * t, L * (-COVER_FLAP.sink + (1 + COVER_FLAP.sink) * t * t * (3 - 2 * t))]);
  }
  rows.push([1 + COVER_FLAP.wall * 0.5, L * 0.35], [1 + COVER_FLAP.wall, -L * COVER_FLAP.sink]);
  const C = COVER_FLAP.cols;
  const pos: number[] = [];
  const crease: THREE.Vector3[] = [];
  for (let i = 0; i < C; i++) {
    const th = -COVER_SPAN + (2 * COVER_SPAN * i) / (C - 1);
    // (its ends, where the rim runs out onto the nape and under the throat, settle into the skin)
    const end = Math.sin(((i / (C - 1)) * Math.PI)) ** 0.5;
    for (const [s, h] of rows) {
      const q = at(-Math.cos(th) * COVER_RX * r * s, Math.sin(th) * COVER_RY * r * s, h * end - (1 - end) * L * COVER_FLAP.sink);
      pos.push(q.x, q.y, q.z);
    }
    crease.push(at(-Math.cos(th) * COVER_RX * r * (1 + COVER_FLAP.wall * 0.8), Math.sin(th) * COVER_RY * r * (1 + COVER_FLAP.wall * 0.8), 0));
  }
  const R = rows.length;
  const index: number[] = [];
  for (let i = 0; i < C - 1; i++)
    for (let k = 0; k < R - 1; k++) {
      const a = i * R + k, b = (i + 1) * R + k;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const flap = new THREE.BufferGeometry();
  flap.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  flap.setIndex(index);
  flap.computeVertexNormals();
  // (wound so its normals face out of the head: flip if they came out facing in)
  const nrm = flap.getAttribute('normal') as THREE.BufferAttribute;
  const mid = Math.floor(C / 2) * R + 2;
  if (nrm.getX(mid) * n.x + nrm.getY(mid) * n.y + nrm.getZ(mid) * n.z < 0) {
    for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]];
    flap.setIndex(index);
    flap.computeVertexNormals();
  }
  return { flap, crease: gillGeometry({ lines: [crease], radius: r * COVER_CORD * 0.7 }) };
}

/** The marks as one mesh: a cord along each line. */
export function gillGeometry(m: GillMarks): THREE.BufferGeometry {
  const cords = m.lines.map((pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), (pts.length - 1) * 2, m.radius, 5, false));
  const merged = mergeGeometries(cords);
  if (!merged) return cords[0];
  for (const c of cords) c.dispose();
  return merged;
}
