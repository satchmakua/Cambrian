/**
 * Cut stone: a crystal beast as cut stones — its trunk one gem, its head another (cut at its mouth into a
 * skull and a jaw), every link of its legs a six-sided crystal.
 *
 * The crystalline beast's hide was faceted only in its shading at first: its outline stayed the soft
 * round body every other creature has, a pig in a glass texture. Then its smooth skin was cut in place —
 * partitioned into Voronoi cells, every vertex laid onto its cell's plane — and every edge between two
 * faces ran through the mesh, a band of chips tilted every way: a loaf of torn paper (six rounds of tuning
 * never got the chips under a few percent of the hide). Then the trunk wore a separate stone over its
 * uncut skin: the meet of a few dozen planes, each face exactly one plane, each edge exactly two (see
 * cutStone). But only the trunk: the head and the legs came out of it as the uncut skin in the cut
 * material (no relief, a clear coat) — glossy balloons, the head a ball with a circle where it met the gem,
 * a smooth ball at every hip and shoulder. Now every part is its own stone, and the skin under them is
 * never drawn (cullCovered). Pure.
 */
import * as THREE from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import type { Phenotype } from '../engine/grow';
import { unitHash } from '../engine/rng';
import { legWeights } from './feet';
import { eyeSeat } from './eyeSeat';
import { buildMouthLine, mouthSpec, runSeamBack } from './mouthLine';

/** how many faces a crystal trunk is cut with (mirrored pairs), how much the cuts favour its flanks over
 *  its ends, how far a face stands off the skin it touches */
export const GEM_CUTS = 36;
const GEM_LONG = 1.8;
const GEM_PAD = 0.015;
/** a trunk longer than GEM_SPAN of its girths, or bent off its chord by more than GEM_BEND of its radius
 *  (a snake's), is no single stone: it gets none */
const GEM_SPAN = 3;
const GEM_BEND = 0.6;
/** a crystal head's stone: how many cuts (mirrored pairs) besides a face for each eye, and how much they
 *  favour its sides over its ends */
export const HEAD_CUTS = 22;
const HEAD_LONG = 1.2;
/** how far an eye's own face stands over the plane the eye is pressed about (× the eye's radius): its
 *  pressed dome stands EYE_PROUD over that plane, so the gem of an eye stands a little proud of its face */
export const EYE_FACE = 0.04;
/** the mouth's cut: how wide it opens at the seam's front (× the head's height), and how far its upper face
 *  keeps under an eye's centre at the eye's place (× the eye's radius) */
export const MOUTH_CUT = 0.09;
const MOUTH_CLEAR = 1.0;
/** the shade of the mouth cut's two faces (their aAO: a cut in shadow) */
export const CUT_SHADE = 0.4;
/** the organs a head's stone takes in with its skull (a horn's root, a leg's, a tail's stay out of it) */
const FACE_PARTS: ReadonlySet<string> = new Set(['eyestalk', 'maw', 'ear', 'gill', 'whisker']);
/** a leg link's stone: six sides, its ends cut to low six-faced points this steep (rad off its sides) */
export const LINK_SIDES = 6;
const LINK_BEVEL = 0.75;

export interface Plane {
  n: THREE.Vector3;
  d: number;
}

/** Which node each of the first `count` vertices belongs to: the one whose ball's surface is nearest. */
export function skinOwners(p: Phenotype, pos: ArrayLike<number>, count: number): Int32Array {
  const out = new Int32Array(count);
  for (let v = 0; v < count; v++) {
    let best = Infinity, bi = -1;
    for (let i = 0; i < p.nodes.length; i++) {
      const n = p.nodes[i];
      const d = Math.hypot(pos[v * 3] - n.pos[0], pos[v * 3 + 1] - n.pos[1], pos[v * 3 + 2] - n.pos[2]) - n.radius;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    out[v] = bi;
  }
  return out;
}

/**
 * The meet of the half-spaces d_i·(x − c) ≤ h_i (every h_i > 0: c inside), built as the polar dual of the
 * convex hull of the poles d_i / h_i: a face of that hull (n·q = k) is a corner of the stone (c + n/k), shared
 * by the faces whose poles it holds — every face exactly one plane, every edge exactly the meet of two. Its
 * triangles (front faces, each with its own plane's normal) are appended to P and N, and each triangle's
 * plane index to F. Returns its planes (n·x ≤ d), or null when c is not inside.
 */
function cutStone(ds: readonly THREE.Vector3[], h: readonly number[], c: THREE.Vector3, P: number[], N: number[], F: number[]): Plane[] | null {
  if (h.some((x) => !(x > 1e-4))) return null;
  const poles = ds.map((d, i) => d.clone().divideScalar(h[i]));
  const hull = new ConvexHull().setFromPoints(poles);
  const which = new Map<THREE.Vector3, number>();
  poles.forEach((q, i) => which.set(q, i));
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
    for (let k = 1; k + 1 < poly.length; k++) {
      for (const q of [poly[0], poly[k], poly[k + 1]]) {
        P.push(q.x, q.y, q.z);
        N.push(n.x, n.y, n.z);
      }
      F.push(i);
    }
  }
  return [...around.keys()].map((i) => ({ n: ds[i].clone(), d: ds[i].dot(c) + h[i] }));
}

/** the farthest of the listed vertices along d from c, + pad */
function reach(pos: ArrayLike<number>, vs: readonly number[], d: THREE.Vector3, c: THREE.Vector3, pad: number): number {
  let m = -Infinity;
  for (const v of vs) m = Math.max(m, d.x * (pos[v * 3] - c.x) + d.y * (pos[v * 3 + 1] - c.y) + d.z * (pos[v * 3 + 2] - c.z));
  return m + pad;
}

/** a seeded half Fibonacci sphere (x ≥ 0), squeezed along the body by `long`, and its mirror across the midline */
function mirroredCuts(seed: number, half: number, long: number, salt: number): THREE.Vector3[] {
  const ds: THREE.Vector3[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  const turn = unitHash(seed, salt) * Math.PI * 2;
  for (let i = 0; i < half; i++) {
    const z = 1 - (2 * (i + 0.5)) / half; // along the body
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const az = turn + i * ga + (unitHash(seed, i, salt + 1) - 0.5) * 0.8;
    // (half the sphere, x = |cos|: its mirror makes the other half)
    const d = new THREE.Vector3(Math.abs(Math.cos(az)) * r, Math.sin(az) * r, z / long).normalize();
    ds.push(d, new THREE.Vector3(-d.x, d.y, d.z));
  }
  return ds;
}

/** The trunk's stone (see gemGeometry), appended to P/N/F; its planes, or null. */
function trunkStone(p: Phenotype, pos: Float32Array, nV: number, own: Int32Array, P: number[], N: number[], F: number[]): Plane[] | null {
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
  const legs = legWeights(p, pos, nV);
  const trunk = new Set(trunkIdx);
  const vs: number[] = [];
  for (let v = 0; v < nV; v++) if (legs[v] < 0.2 && trunk.has(own[v])) vs.push(v);
  if (vs.length < 8) return null;
  const c = new THREE.Vector3();
  for (const v of vs) c.add(new THREE.Vector3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
  c.divideScalar(vs.length);
  c.x = 0; // (on the midline: the stone is cut in mirrored pairs)
  const ds = mirroredCuts(p.genomeRef.seed, GEM_CUTS / 2, GEM_LONG, 0x9e7);
  const h = ds.map((d) => reach(pos, vs, d, c, GEM_PAD));
  // (each mirrored pair stands off at the farther of its two: the skin's mesh is a hair off mirror-true,
  // and a face cut on one side only left the stone lopsided)
  for (let i = 0; i < h.length; i += 2) h[i] = h[i + 1] = Math.max(h[i], h[i + 1]);
  return cutStone(ds, h, c, P, N, F);
}

/** the geometry the creature material reads off a set of stones: rest-pose body place, no mouth flesh, a
 *  shade per triangle (aAO), cut (lit face by face: see the material's flat branch) */
function stoneGeometry(P: number[], N: number[], ao: number[], bone: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const at = new THREE.Float32BufferAttribute(P, 3);
  const n = at.count;
  g.setAttribute('position', at);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aBodyPos', at.clone());
  g.setAttribute('aFlesh', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  const a = new Float32Array(n);
  for (let t = 0; t < ao.length; t++) a[t * 3] = a[t * 3 + 1] = a[t * 3 + 2] = ao[t];
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(a, 1));
  g.setAttribute('aCut', new THREE.Float32BufferAttribute(new Float32Array(n).fill(1), 1));
  // (a rigged body: each stone rides one bone, rigidly — the skeleton's bone k + 1 is node k's, as
  // ensureSkinWeights has it)
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let t = 0; t < bone.length; t++)
    for (let k = 0; k < 3; k++) {
      si[(t * 3 + k) * 4] = bone[t] + 1;
      sw[(t * 3 + k) * 4] = 1;
    }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.computeBoundingSphere();
  return g;
}

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
export function gemGeometry(p: Phenotype, skin: THREE.BufferGeometry, own?: Int32Array): THREE.BufferGeometry | null {
  const pos = skin.getAttribute('position').array as Float32Array;
  const nV = (skin.userData.tubeFrom?.vertex as number | undefined) ?? pos.length / 3;
  const P: number[] = [], N: number[] = [], F: number[] = [];
  const planes = trunkStone(p, pos, nV, own ?? skinOwners(p, pos, nV), P, N, F);
  if (!planes) return null;
  const g = stoneGeometry(P, N, F.map(() => 1), F.map(() => 0));
  g.userData.planes = planes;
  return g;
}

/**
 * A crystal beast as CUT STONES, one geometry: the trunk's gem (gemGeometry); the head's stone — HEAD_CUTS
 * planes touching the head's skin in mirrored pairs and one face for each eye, through the plane its pressed
 * eye stands on, so each eye is a gem set in a face of its own — cut at its mouth into a skull and a jaw (a
 * V of two planes from the seam's corners, MOUTH_CUT of the head's height open at its front: the cut IS the
 * mouth); and a six-sided crystal for every link of every leg, tangent to the link's round cone and holding
 * the skin it owns, its ends cut to low points. Each stone rides one bone (skinIndex/skinWeight). The stones'
 * solids (the head's before its cut) are userData.solids: the skin inside them is never seen (cullCovered).
 * What no stone holds (a tail, an arm, a fin; a snake's trunk) keeps its uncut skin. Pure; null when no
 * stone fits.
 */
export function crystalStones(p: Phenotype, skin: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const pos = skin.getAttribute('position').array as Float32Array;
  const nAll = pos.length / 3;
  const nV = (skin.userData.tubeFrom?.vertex as number | undefined) ?? nAll;
  const own = skinOwners(p, pos, nAll);
  const P: number[] = [], N: number[] = [], ao: number[] = [], bone: number[] = [];
  const solids: Plane[][] = [];
  const add = (F: number[], at: number, shadeOf: (plane: number) => number = () => 1) => {
    for (const f of F) {
      ao.push(shadeOf(f));
      bone.push(at);
    }
  };
  // ---- the trunk
  const trunkIdx = p.nodes.map((n, i) => (n.kind === 'spine' && (n.segment ?? 0) === 0 ? i : -1)).filter((i) => i >= 0);
  {
    const F: number[] = [];
    const planes = trunkStone(p, pos, nV, own, P, N, F);
    if (planes) {
      solids.push(planes);
      add(F, trunkIdx[Math.floor(trunkIdx.length / 2)]);
    }
  }
  // ---- the head: its spine past the trunk and everything grown from it
  const kids = new Map<number, number[]>();
  for (const [a, b] of p.edges) {
    if (!kids.has(a)) kids.set(a, []);
    kids.get(a)!.push(b);
  }
  // (its spine and the organs set in it — eyes, mouth, ears, gills: not a leg grown from it, as a spider's
  // legs are from its head, nor a horn, whose shards stand on the skull and hide its root)
  const hs = p.nodes.map((n, i) => (n.kind === 'spine' && (n.segment ?? 0) >= 1 ? i : -1)).filter((i) => i >= 0);
  const head = new Set<number>(hs);
  for (const s of hs) for (const k of kids.get(s) ?? []) if (p.nodes[k].kind === 'terminal' && FACE_PARTS.has(p.nodes[k].part?.kind ?? 'leg')) head.add(k);
  // (a neck and head too long or bent to be one stone keep their skin, as a snake's trunk does)
  const hr = Math.max(0, ...hs.map((i) => p.nodes[i].radius));
  let fits = hs.length > 0;
  if (fits) {
    const ends = [...hs].sort((i, j) => p.nodes[i].pos[2] - p.nodes[j].pos[2]);
    const a = p.nodes[ends[0]].pos, b = p.nodes[ends[ends.length - 1]].pos;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L = Math.hypot(ab[0], ab[1], ab[2]);
    fits = L <= GEM_SPAN * 2 * hr;
    for (const i of hs) {
      const ap = [p.nodes[i].pos[0] - a[0], p.nodes[i].pos[1] - a[1], p.nodes[i].pos[2] - a[2]];
      const t = L > 1e-9 ? (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (L * L) : 0;
      if (Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t) > GEM_BEND * hr) fits = false;
    }
  }
  const hv: number[] = [];
  if (fits) for (let v = 0; v < nAll; v++) if (head.has(own[v])) hv.push(v);
  if (hv.length >= 8) {
    const c = new THREE.Vector3();
    let yLo = Infinity, yHi = -Infinity;
    for (const v of hv) {
      c.add(new THREE.Vector3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
      yLo = Math.min(yLo, pos[v * 3 + 1]);
      yHi = Math.max(yHi, pos[v * 3 + 1]);
    }
    c.divideScalar(hv.length);
    c.x = 0;
    const ds = mirroredCuts(p.genomeRef.seed, HEAD_CUTS / 2, HEAD_LONG, 0x7e1);
    const h = ds.map((d) => reach(pos, hv, d, c, GEM_PAD));
    for (let i = 0; i < h.length; i += 2) h[i] = h[i + 1] = Math.max(h[i], h[i + 1]);
    // each eye a face of its own, through the plane its pressed eye stands EYE_PROUD over (eyeSeat)
    const eyes: { at: THREE.Vector3; r: number }[] = [];
    for (const i of head) {
      const e = p.nodes[i];
      if (e.terminal !== 'eye' || p.nodes[p.edges.find(([, b]) => b === i)?.[0] ?? -1]?.kind !== 'spine') continue;
      const r = Math.max(e.radius, 0.06);
      const fl = eyeSeat(p, i, e.quat, r).flat;
      if (!fl) continue;
      const n = new THREE.Vector3(...fl.n);
      const at = new THREE.Vector3(...fl.at);
      ds.push(n);
      h.push(n.dot(at.clone().sub(c)) + EYE_FACE * r);
      eyes.push({ at, r });
    }
    const whole = cutStone(ds, h, c, [], [], []);
    if (whole) {
      solids.push(whole);
      // the stone rides the bone the eyes hang from: the head's foremost spine node
      const at = hs.reduce((m, i) => (p.nodes[i].pos[2] > p.nodes[m].pos[2] ? i : m), hs[0]);
      // ---- the mouth: the stone cut in two along the seam a shut jaw traces (mouthLine runSeamBack) — a V
      // whose apex runs between the seam's corners, MOUTH_CUT of the head's height open at its front
      let cut = false;
      const mi = [...head].find((i) => p.nodes[i].terminal === 'mouth');
      const spec = mi === undefined ? null : mouthSpec(p, mi);
      if (spec && !spec.muzzled && (spec.variant === 'maw' || spec.variant === 'fanged' || spec.variant === 'herbivore')) {
        const up = runSeamBack(p, spec, buildMouthLine(p, spec, [], 17, 'hybrid'), 'hybrid').upper;
        // (its front, and the middle of its two corners)
        const Fr = up.length >= 3 ? new THREE.Vector3(...up[up.length >> 1].p) : null;
        const C = up.length >= 3 ? new THREE.Vector3(...up[0].p).add(new THREE.Vector3(...up[up.length - 1].p)).multiplyScalar(0.5) : null;
        const dz = Fr && C ? Fr.z - C.z : 0;
        if (Fr && C && dz > 1e-3) {
          let half = (MOUTH_CUT * (yHi - yLo)) / 2;
          // (its upper face keeps MOUTH_CLEAR of an eye's radius under the eye at the eye's place)
          for (const e of eyes) {
            const t = (e.at.z - C.z) / dz;
            const room = e.at.y - MOUTH_CLEAR * e.r - (C.y + (Fr.y - C.y) * t + half * t);
            if (room < 0 && t > 0) half = Math.max(0, half + room / t);
          }
          if (half > 0.005) {
            const nu = new THREE.Vector3(0, -dz, Fr.y + half - C.y).normalize(); // the skull's underside, facing down
            const nl = new THREE.Vector3(0, dz, -(Fr.y - half - C.y)).normalize(); // the jaw's top, facing up
            const part = (n: THREE.Vector3, cy: number) => {
              const cc = new THREE.Vector3(0, cy, c.z);
              const Fp: number[] = [], Pp: number[] = [], Np: number[] = [];
              const planes = cutStone([...whole.map((pl) => pl.n), n], [...whole.map((pl) => pl.d - pl.n.dot(cc)), n.dot(C) - n.dot(cc)], cc, Pp, Np, Fp);
              return planes ? { Pp, Np, Fp, k: whole.length } : null;
            };
            const skull = part(nu, (C.y + yHi) / 2);
            const jaw = part(nl, (C.y + yLo) / 2);
            if (skull && jaw) {
              for (const s of [skull, jaw]) {
                P.push(...s.Pp);
                N.push(...s.Np);
                add(s.Fp, at, (f) => (f === s.k ? CUT_SHADE : 1));
              }
              cut = true;
            }
          }
        }
      }
      if (!cut) {
        const F: number[] = [];
        cutStone(ds, h, c, P, N, F);
        add(F, at);
      }
    }
  }
  // ---- the legs: a stone for every link of a leg, six-sided and pointed at both ends, tangent to the link's
  // round cone (the hull of its two joints' balls: a bent knee keeps its joint inside both) and holding the
  // skin it owns (the shoulder's or the hip's ball where it stands out of the gem)
  const isLeg = (i: number) => p.nodes[i].part?.kind === 'leg' && p.nodes[i].kind !== 'spine';
  const links = p.edges.filter(([a, b]) => isLeg(a) && isLeg(b));
  if (links.length) {
    const legs = legWeights(p, pos, nAll);
    const owned = links.map(() => [] as number[]);
    const trunkPlanes = solids.length && trunkIdx.length ? solids[0] : null;
    for (let v = 0; v < nAll; v++) {
      if (head.has(own[v]) || !(isLeg(own[v]) || legs[v] > 0)) continue;
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      if (trunkPlanes && trunkPlanes.every((pl) => pl.n.x * x + pl.n.y * y + pl.n.z * z <= pl.d)) continue;
      let best = Infinity, bk = -1;
      links.forEach(([ia, ib], k) => {
        const A = p.nodes[ia], B = p.nodes[ib];
        const ex = B.pos[0] - A.pos[0], ey = B.pos[1] - A.pos[1], ez = B.pos[2] - A.pos[2];
        const L2 = ex * ex + ey * ey + ez * ez;
        const t = Math.min(1, Math.max(0, L2 > 1e-12 ? ((x - A.pos[0]) * ex + (y - A.pos[1]) * ey + (z - A.pos[2]) * ez) / L2 : 0));
        const d = Math.hypot(A.pos[0] + ex * t - x, A.pos[1] + ey * t - y, A.pos[2] + ez * t - z) - (A.radius + (B.radius - A.radius) * t);
        if (d < best) {
          best = d;
          bk = k;
        }
      });
      if (bk >= 0) owned[bk].push(v);
    }
    links.forEach(([ia, ib], k) => {
      const A = new THREE.Vector3(...p.nodes[ia].pos), B = new THREE.Vector3(...p.nodes[ib].pos);
      const ra = p.nodes[ia].radius, rb = p.nodes[ib].radius;
      const u = B.clone().sub(A);
      const len = u.length();
      if (len < 1e-6) return;
      u.divideScalar(len);
      const c = A.clone().add(B).multiplyScalar(0.5);
      const e1 = new THREE.Vector3(0, 1, 0).cross(u);
      if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0).cross(u);
      e1.normalize();
      const e2 = new THREE.Vector3().crossVectors(u, e1);
      // (mirrored with its side: a left leg's faces turn as its right leg's do)
      const turn = 0.3 * (Math.sign(A.x) || 1);
      const tilt = Math.asin(Math.max(-0.9, Math.min(0.9, (ra - rb) / len))); // (sides tangent to the tapering cone)
      const ds: THREE.Vector3[] = [u.clone(), u.clone().negate()];
      for (let s = 0; s < LINK_SIDES; s++) {
        const a0 = turn + (s * 2 * Math.PI) / LINK_SIDES, a1 = a0 + Math.PI / LINK_SIDES;
        const r0 = e1.clone().multiplyScalar(Math.cos(a0)).addScaledVector(e2, Math.sin(a0));
        const r1 = e1.clone().multiplyScalar(Math.cos(a1)).addScaledVector(e2, Math.sin(a1));
        ds.push(r0.multiplyScalar(Math.cos(tilt)).addScaledVector(u, Math.sin(tilt)).normalize());
        ds.push(r1.clone().multiplyScalar(Math.cos(LINK_BEVEL)).addScaledVector(u, Math.sin(LINK_BEVEL)).normalize());
        ds.push(r1.multiplyScalar(Math.cos(LINK_BEVEL)).addScaledVector(u, -Math.sin(LINK_BEVEL)).normalize());
      }
      const h = ds.map((d) => Math.max(d.dot(A.clone().sub(c)) + ra, d.dot(B.clone().sub(c)) + rb, owned[k].length ? reach(pos, owned[k], d, c, 0) : -Infinity) + GEM_PAD);
      const F: number[] = [];
      const planes = cutStone(ds, h, c, P, N, F);
      if (!planes) return;
      solids.push(planes);
      add(F, ia);
    });
  }
  if (P.length === 0) return null;
  const g = stoneGeometry(P, N, ao, bone);
  g.userData.solids = solids;
  return g;
}

/** Drop the skin's triangles that its stones wholly enclose (every corner inside one stone): never seen —
 *  and inside the head's they would fill its mouth's cut. (In place: the skin's index.) */
export function cullCovered(skin: THREE.BufferGeometry, solids: readonly Plane[][]): void {
  const pos = skin.getAttribute('position');
  const idx = skin.getIndex();
  if (!idx || solids.length === 0) return;
  const inside = new Uint8Array(pos.count);
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    inside[v] = solids.some((pl) => pl.every((q) => q.n.x * x + q.n.y * y + q.n.z * z <= q.d)) ? 1 : 0;
  }
  const keep: number[] = [];
  for (let t = 0; t + 2 < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    if (!(inside[a] && inside[b] && inside[c])) keep.push(a, b, c);
  }
  skin.setIndex(keep);
}
