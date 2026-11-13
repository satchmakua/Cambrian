/**
 * Gills that lie in the skin: a bony fish's gill COVER — one curved edge, the rear rim of the plate
 * over its gills — and a shark's SLITS, five thin creases.
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
/** …and a shark's slits: each runs about a third of the flank's depth. (The size of the gill part,
 *  five creases a twelfth of it long, they were a smudge in front of the fin: no shark at all.) */
export const SLITS_OF_DEPTH = 0.6;

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

/** The marks as one mesh: a cord along each line. */
export function gillGeometry(m: GillMarks): THREE.BufferGeometry {
  const cords = m.lines.map((pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), (pts.length - 1) * 2, m.radius, 5, false));
  const merged = mergeGeometries(cords);
  if (!merged) return cords[0];
  for (const c of cords) c.dispose();
  return merged;
}
