/**
 * Quills: an urchin's spines, each one smooth cone from a little swollen base on the body out to a
 * sharp point, all of a body's quills in one mesh.
 *
 * A quill is a short spine — at most two links, ending in a claw — whose style gene is at or past
 * grow's QUILL_STYLE (a sea star's arm, a radial body's curling arm, is never one). Grown as any part — a
 * chain of skinned links ending in a claw — a coat of fifty of them was fifty beaded rods, each
 * capped with a dark disc: a naval mine, a pincushion stuck with nails. So a quill's links are kept
 * out of the skin (bodyField) and the capsule kit (meshData), its claw is not drawn, and the whole
 * spine is this cone instead, root to tip.
 *
 * Built in the body frame (the trunk's rest frame), so it rides the trunk: an urchin's spines are
 * stiff, and it moves as one.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isQuill, type Phenotype } from '../engine/grow';

export interface Quill {
  /** where it leaves the body (its first link's node) and where its point is (its last) */
  root: [number, number, number];
  tip: [number, number, number];
  /** its radius at the root */
  r: number;
}

/** the share of a quill's length its swollen base runs along, and how much wider it is there */
const BASE = 0.12;
const SWELL = 1.25;
/** a quill's base is sunk this far into the body (×its radius), so it grows out of the skin */
const SINK = 1.2;

/** the most links a quill has */
const QUILL_LINKS = 2;

/** Every quill's chain of nodes, root first. */
function quillChains(p: Phenotype): number[][] {
  const parent = new Int32Array(p.nodes.length).fill(-1);
  for (const [a, b] of p.edges) parent[b] = a;
  const out: number[][] = [];
  p.nodes.forEach((n, i) => {
    if (n.kind !== 'terminal' || n.terminal !== 'claw' || !isQuill(n.part)) return;
    // walk back to the quill's first link: the last node whose parent is not a quill
    const chain = [i];
    while (parent[chain[0]] >= 0 && isQuill(p.nodes[parent[chain[0]]].part)) chain.unshift(parent[chain[0]]);
    if (chain.length < 2 || chain.length > QUILL_LINKS) return;
    out.push(chain);
  });
  return out;
}

const QUILL_NODES = new WeakMap<Phenotype, Set<number>>();
/** The nodes of a body's quills (kept out of its skin and its capsule kit: the quill draws itself). */
export function quillNodes(p: Phenotype): Set<number> {
  let set = QUILL_NODES.get(p);
  if (!set) {
    set = new Set(quillChains(p).flat());
    QUILL_NODES.set(p, set);
  }
  return set;
}

/** Every quill of a body: its root, its point and its girth. */
export function quillsOf(p: Phenotype): Quill[] {
  return quillChains(p).map((c) => {
    const a = p.nodes[c[0]];
    const n = p.nodes[c[c.length - 1]];
    return { root: [...a.pos] as [number, number, number], tip: [...n.pos] as [number, number, number], r: Math.max(a.radius, 0.012) };
  });
}

/** how far a quill pales from its root to its point (the tip colour's share), and how much each quill's
 *  own shade wanders */
export const QUILL_PALE = 0.55;
const QUILL_JITTER = 0.16;

/** All of a body's quills as one mesh, in the body frame; null if it has none. Given a root and a tip
 *  colour, each quill is vertex-coloured from one to the other — darkest at the root, paling to the
 *  point, each its own shade (one flat colour for every spine read as a cushion of nails). */
export function quillGeometry(p: Phenotype, radial = 8, root?: THREE.Color, tip?: THREE.Color): THREE.BufferGeometry | null {
  const qs = quillsOf(p);
  if (!qs.length) return null;
  const up = new THREE.Vector3(0, 1, 0);
  const parts: THREE.BufferGeometry[] = [];
  for (const q of qs) {
    const a = new THREE.Vector3(...q.root);
    const b = new THREE.Vector3(...q.tip);
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-4) continue;
    dir.divideScalar(len);
    const start = a.clone().addScaledVector(dir, -SINK * q.r);
    const full = len + SINK * q.r;
    // a lathe: from the sunk root, swelling a little over the base, then tapering straight to the point
    const prof = [
      new THREE.Vector2(q.r * 0.9, 0),
      new THREE.Vector2(q.r * SWELL, full * BASE),
      new THREE.Vector2(q.r * 0.82, full * BASE * 2.2),
      new THREE.Vector2(q.r * 0.05, full),
    ];
    const g = new THREE.LatheGeometry(prof, radial);
    if (root && tip) {
      const pos = g.getAttribute('position');
      const col = new Float32Array(pos.count * 3);
      const k = parts.length;
      const own = 1 - QUILL_JITTER / 2 + QUILL_JITTER * (((k * 2654435761) >>> 0) % 1000) / 1000;
      for (let v = 0; v < pos.count; v++) {
        const t = Math.max(0, Math.min(1, pos.getY(v) / full));
        const w = QUILL_PALE * t * t;
        col[v * 3] = (root.r + (tip.r - root.r) * w) * own;
        col[v * 3 + 1] = (root.g + (tip.g - root.g) * w) * own;
        col[v * 3 + 2] = (root.b + (tip.b - root.b) * w) * own;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    g.applyMatrix4(new THREE.Matrix4().compose(start, new THREE.Quaternion().setFromUnitVectors(up, dir), new THREE.Vector3(1, 1, 1)));
    g.deleteAttribute('uv');
    parts.push(g); // (the lathe's own smooth normals, carried through the transform)
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false) ?? parts[0];
  for (const g of parts) if (g !== merged) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}
