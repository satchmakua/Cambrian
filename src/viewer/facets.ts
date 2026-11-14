/**
 * Cut stone: a crystal beast's trunk as one cut gem.
 *
 * The crystalline beast's hide was faceted only in its shading at first: its outline stayed the soft
 * round body every other creature has, a pig in a glass texture. Then its smooth skin was cut in place —
 * partitioned into Voronoi cells, every vertex laid onto its cell's plane — and every edge between two
 * faces ran through the mesh, a band of chips tilted every way: a loaf of torn paper (six rounds of tuning
 * never got the chips under a few percent of the hide). Now the trunk wears a separate stone over its
 * uncut skin: the meet of a few dozen planes, each face exactly one plane, each edge exactly two (see
 * gemGeometry). Pure.
 */
import * as THREE from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import type { Phenotype } from '../engine/grow';
import { unitHash } from '../engine/rng';
import { legWeights } from './feet';

/** how many faces a crystal trunk is cut with (mirrored pairs), how much the cuts favour its flanks over
 *  its ends, how far a face stands off the skin it touches */
export const GEM_CUTS = 36;
const GEM_LONG = 1.8;
const GEM_PAD = 0.015;
/** a trunk longer than GEM_SPAN of its girths, or bent off its chord by more than GEM_BEND of its radius
 *  (a snake's), is no single stone: it gets none */
const GEM_SPAN = 3;
const GEM_BEND = 0.6;

/**
 * A crystal beast's trunk as ONE CUT STONE. (Cutting its smooth skin in place — every vertex laid on the
 * innermost nearby face's plane, see facetSkin — ran each edge between two faces through the mesh: the
 * triangles across it were chips tilted every way, a seventh of the hide, and wherever a plane fell out
 * of a vertex's neighbourhood the faces stepped instead of meeting. Lit triangle by triangle, it was a
 * loaf of torn paper.) The stone is the meet of GEM_CUTS planes, each touching the trunk's own skin from
 * its side, in mirrored pairs: every face exactly one plane, every edge exactly the meet of two, the
 * faces turning 40° or so between them. Built as the polar dual of the convex hull of the planes' poles.
 * It encloses the trunk's skin; the neck, head and legs come out of it, and the back's shards stand
 * rooted in it. Pure; null for a trunk no stone fits.
 */
export function gemGeometry(p: Phenotype, skin: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const trunkIdx = p.nodes.map((n, i) => (n.kind === 'spine' && (n.segment ?? 0) === 0 ? i : -1)).filter((i) => i >= 0);
  if (trunkIdx.length === 0) return null;
  const tn = trunkIdx.map((i) => p.nodes[i]);
  const rMax = Math.max(...tn.map((n) => n.radius));
  const a = tn[0].pos, b = tn[tn.length - 1].pos;
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(ab[0], ab[1], ab[2]);
  if (L > GEM_SPAN * 2 * rMax) return null;
  for (const n of tn) {
    const ap = [n.pos[0] - a[0], n.pos[1] - a[1], n.pos[2] - a[2]];
    const t = L > 1e-9 ? (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (L * L) : 0;
    if (Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t) > GEM_BEND * rMax) return null;
  }
  // the trunk's own skin: the vertices whose nearest node surface is a trunk node's, off the legs
  const pos = skin.getAttribute('position').array as Float32Array;
  const nV = (skin.userData.tubeFrom?.vertex as number | undefined) ?? pos.length / 3;
  const legs = legWeights(p, pos, nV);
  const trunk = new Set(trunkIdx);
  const pts: number[] = [];
  for (let v = 0; v < nV; v++) {
    if (legs[v] >= 0.2) continue;
    let best = Infinity, bi = -1;
    for (let i = 0; i < p.nodes.length; i++) {
      const n = p.nodes[i];
      const d = Math.hypot(pos[v * 3] - n.pos[0], pos[v * 3 + 1] - n.pos[1], pos[v * 3 + 2] - n.pos[2]) - n.radius;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    if (trunk.has(bi)) pts.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
  }
  const count = pts.length / 3;
  if (count < 8) return null;
  const c = new THREE.Vector3();
  for (let i = 0; i < count; i++) c.add(new THREE.Vector3(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]));
  c.divideScalar(count);
  c.x = 0; // (on the midline: the stone is cut in mirrored pairs)
  // the cutting directions: a seeded half Fibonacci sphere (x ≥ 0) and its mirror across the midline
  const seed = p.genomeRef.seed;
  const half = GEM_CUTS / 2;
  const ds: THREE.Vector3[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  const turn = unitHash(seed, 0x9e7) * Math.PI * 2;
  for (let i = 0; i < half; i++) {
    const z = 1 - (2 * (i + 0.5)) / half; // along the body
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const az = turn + i * ga + (unitHash(seed, i, 0x9e8) - 0.5) * 0.8;
    // (half the sphere, x = |cos|: its mirror makes the other half)
    const d = new THREE.Vector3(Math.abs(Math.cos(az)) * r, Math.sin(az) * r, z / GEM_LONG).normalize();
    ds.push(d, new THREE.Vector3(-d.x, d.y, d.z));
  }
  const h = ds.map((d) => {
    let m = -Infinity;
    for (let i = 0; i < count; i++) m = Math.max(m, d.x * (pts[i * 3] - c.x) + d.y * (pts[i * 3 + 1] - c.y) + d.z * (pts[i * 3 + 2] - c.z));
    return m + GEM_PAD;
  });
  // (each mirrored pair stands off at the farther of its two: the skin's mesh is a hair off mirror-true,
  // and a face cut on one side only left the stone lopsided)
  for (let i = 0; i < h.length; i += 2) h[i] = h[i + 1] = Math.max(h[i], h[i + 1]);
  if (h.some((x) => !(x > 1e-4))) return null; // (the centre must lie inside the stone)
  const poles = ds.map((d, i) => d.clone().divideScalar(h[i]));
  const hull = new ConvexHull().setFromPoints(poles);
  const which = new Map<THREE.Vector3, number>();
  poles.forEach((q, i) => which.set(q, i));
  // a face of the poles' hull (n·q = k) is a corner of the stone (c + n/k), shared by the faces whose
  // poles it holds
  const around = new Map<number, THREE.Vector3[]>();
  for (const f of hull.faces) {
    const corner = f.normal.clone().divideScalar(f.constant).add(c);
    let e = f.edge;
    do {
      const i = which.get(e.head().point)!;
      if (!around.has(i)) around.set(i, []);
      around.get(i)!.push(corner);
      e = e.next;
    } while (e !== f.edge);
  }
  const P: number[] = [];
  const N: number[] = [];
  const tmp = new THREE.Vector3();
  for (const [i, cs] of around) {
    const n = ds[i];
    const poly: THREE.Vector3[] = [];
    for (const q of cs) if (!poly.some((u) => u.distanceToSquared(q) < 1e-10)) poly.push(q);
    if (poly.length < 3) continue;
    const m = poly.reduce((acc, q) => acc.add(q), new THREE.Vector3()).divideScalar(poly.length);
    const u = tmp.subVectors(poly[0], m).normalize().clone();
    const w = new THREE.Vector3().crossVectors(n, u);
    const ang = (q: THREE.Vector3) => Math.atan2(w.dot(tmp.subVectors(q, m)), u.dot(tmp.subVectors(q, m)));
    poly.sort((x, y) => ang(x) - ang(y)); // (counter-clockwise seen from outside: front faces)
    for (let k = 1; k + 1 < poly.length; k++)
      for (const q of [poly[0], poly[k], poly[k + 1]]) {
        P.push(q.x, q.y, q.z);
        N.push(n.x, n.y, n.z);
      }
  }
  const g = new THREE.BufferGeometry();
  const at = new THREE.Float32BufferAttribute(P, 3);
  g.setAttribute('position', at);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  // what the creature material reads: rest-pose body place, no mouth flesh, open to the sky — and cut
  // (lit face by face: see the material's flat branch)
  g.setAttribute('aBodyPos', at.clone());
  g.setAttribute('aFlesh', new THREE.Float32BufferAttribute(new Float32Array(at.count), 1));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(new Float32Array(at.count).fill(1), 1));
  g.setAttribute('aCut', new THREE.Float32BufferAttribute(new Float32Array(at.count).fill(1), 1));
  g.userData.planes = [...around.keys()].map((i) => ({ n: ds[i].clone(), d: ds[i].dot(c) + h[i] }));
  g.computeBoundingSphere();
  return g;
}
