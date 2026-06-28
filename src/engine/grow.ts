/**
 * Development: grow(genome) → Phenotype (DESIGN §4.4).
 *
 * An L-system-flavored interpreter that walks the segment chain (honoring repeat,
 * taper, curve), spawns appendages (honoring symmetry + their own recursion), and
 * emits an explicit skeleton of nodes + edges. It is a *pure, deterministic*
 * function of the genome (Pillar 3) and guarantees the §4.4 invariants so any
 * skeleton always meshes without exploding (Pillar 2).
 *
 * The engine stays dependency-free — these few lines of vec/quat math keep three.js
 * out of the headless core so it runs in a plain Node test.
 */
import { mulberry32 } from './rng';
import { R_MIN, NODE_MAX, DEPTH_MAX } from './bounds';
import type { Genome, SegmentGene, AppendageGene, Terminal, Vec3 } from './genome';

export type Quat = [number, number, number, number]; // [x, y, z, w]

export interface BodyNode {
  pos: Vec3;
  quat: Quat; // orientation; the node's local forward is +Z
  radius: number; // always ≥ R_MIN
  kind: 'spine' | 'limb' | 'terminal';
  terminal?: Terminal;
}

export interface Phenotype {
  nodes: BodyNode[];
  edges: [number, number][]; // a single connected tree: edges.length === nodes.length - 1
  bounds: { min: Vec3; max: Vec3 };
  genomeRef: Genome;
}

export function grow(genome: Genome): Phenotype {
  const rng = mulberry32(genome.seed);
  const nodes: BodyNode[] = [];
  const edges: [number, number][] = [];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  function addNode(pos: Vec3, quat: Quat, radius: number, kind: BodyNode['kind'], terminal?: Terminal): number {
    const r = Math.max(R_MIN, radius);
    nodes.push({ pos, quat, radius: r, kind, terminal });
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], pos[a] - r);
      max[a] = Math.max(max[a], pos[a] + r);
    }
    return nodes.length - 1;
  }
  const atCap = () => nodes.length >= NODE_MAX;

  growSegment(genome.body, [0, 0, 0], [0, 0, 0, 1], 0, -1);

  if (nodes.length === 0) addNode([0, 0, 0], [0, 0, 0, 1], R_MIN, 'spine'); // never empty

  return { nodes, edges, bounds: { min, max }, genomeRef: genome };

  // --- recursive growth -------------------------------------------------------

  function growSegment(seg: SegmentGene, startPos: Vec3, startQuat: Quat, depth: number, parentIdx: number): void {
    const avgSize = (seg.size[0] + seg.size[1] + seg.size[2]) / 3;
    const spine: number[] = [];
    let pos = startPos;
    let quat = startQuat;
    let prev = parentIdx;

    for (let i = 0; i < seg.repeat; i++) {
      if (atCap()) break;
      const t = Math.pow(seg.taper, i);
      const idx = addNode(pos, quat, avgSize * t, 'spine');
      if (prev >= 0) edges.push([prev, idx]);
      spine.push(idx);
      prev = idx;

      // advance along local forward (+Z), bending by the per-link curve
      quat = qMul(quat, qFromEuler(seg.curve[0], seg.curve[1]));
      const fwd = qRotate([0, 0, 1], quat);
      const step = seg.size[2] * 2 * t;
      pos = [pos[0] + fwd[0] * step, pos[1] + fwd[1] * step, pos[2] + fwd[2] * step];
    }

    for (const app of seg.appendages) {
      if (atCap()) break;
      const ai = clampInt(Math.round(app.attachT * (spine.length - 1)), 0, spine.length - 1);
      growAppendage(app, spine[ai]);
    }

    if (seg.child && depth + 1 < DEPTH_MAX && !atCap()) {
      growSegment(seg.child, pos, quat, depth + 1, prev);
    }
  }

  function growAppendage(app: AppendageGene, attachIdx: number): void {
    const base = nodes[attachIdx];
    const jitter = (rng() - 0.5) * 0.15; // seed perturbs limb angle deterministically
    const az = app.attachAzimuth + jitter;

    // outward directions in the body cross-section, with a slight backward/down tilt
    const dirs: Vec3[] = [];
    if (genome.symmetry === 'radial') {
      for (let k = 0; k < genome.radialCount; k++) {
        const a = az + (k * Math.PI * 2) / genome.radialCount;
        dirs.push(norm([Math.cos(a), Math.sin(a), -0.15]));
      }
    } else {
      dirs.push(norm([Math.cos(az), Math.sin(az), -0.15]));
      if (app.pair && genome.symmetry === 'bilateral') {
        dirs.push(norm([-Math.cos(az), Math.sin(az), -0.15])); // mirror across X=0
      }
    }
    for (const dir of dirs) growLimb(app, base, dir);
  }

  function growLimb(app: AppendageGene, base: BodyNode, dir0: Vec3): void {
    let quat = qFromTo([0, 0, 1], dir0);
    let dir = dir0;
    let pos: Vec3 = [base.pos[0] + dir[0] * base.radius, base.pos[1] + dir[1] * base.radius, base.pos[2] + dir[2] * base.radius];
    let prev = nodes.indexOf(base);

    for (let j = 0; j < app.segments; j++) {
      if (atCap()) break;
      const last = j === app.segments - 1;
      const r = app.thickness * Math.pow(app.taper, j);
      const idx = addNode(pos, quat, r, last ? 'terminal' : 'limb', last ? app.terminal : undefined);
      edges.push([prev, idx]);
      prev = idx;

      quat = qMul(quat, qFromEuler(app.curl[0], app.curl[1]));
      dir = qRotate([0, 0, 1], quat);
      pos = [pos[0] + dir[0] * app.length, pos[1] + dir[1] * app.length, pos[2] + dir[2] * app.length];
    }
  }
}

// --- tiny vec/quat helpers (kept inline to keep the engine dependency-free) ----

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function qMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
function qFromAxisAngle(axis: Vec3, angle: number): Quat {
  const h = angle / 2;
  const s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}
/** Compose a local rotation: pitch about local X, then yaw about local Y. */
function qFromEuler(pitch: number, yaw: number): Quat {
  return qMul(qFromAxisAngle([1, 0, 0], pitch), qFromAxisAngle([0, 1, 0], yaw));
}
function qRotate(v: Vec3, q: Quat): Vec3 {
  const [x, y, z, w] = q;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}
/** Shortest-arc quaternion rotating unit vector `a` onto unit vector `b`. */
function qFromTo(a: Vec3, b: Vec3): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) {
    // 180°: rotate about any axis perpendicular to a
    let axis: Vec3 = [a[1], -a[0], 0];
    if (Math.hypot(axis[0], axis[1], axis[2]) < 1e-6) axis = [0, a[2], -a[1]];
    return qFromAxisAngle(norm(axis), Math.PI);
  }
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const q: Quat = [c[0], c[1], c[2], 1 + d];
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
