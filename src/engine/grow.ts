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
import { R_MIN, NODE_MAX, DEPTH_MAX, GENE_BOUNDS, clamp } from './bounds';
import type { Genome, SegmentGene, AppendageGene, Terminal, PartKind, Vec3 } from './genome';

export type Quat = [number, number, number, number]; // [x, y, z, w]

/** Fusiform bulge: how much fatter the middle of a body chain is than its ends. */
const BODY_BULGE = 0.35;

/** Minimum grown radius for an eye bulb (bu) — the face must always read (M19/M24). */
const EYE_R_MIN = 0.11;

export interface BodyNode {
  pos: Vec3;
  quat: Quat; // orientation; the node's local forward is +Z
  radius: number; // always ≥ R_MIN
  kind: 'spine' | 'limb' | 'terminal';
  terminal?: Terminal;
  part?: { kind: PartKind; style: number }; // which genome part grew this node (for render variants)
}

export interface Phenotype {
  nodes: BodyNode[];
  edges: [number, number][]; // a single connected tree: edges.length === nodes.length - 1
  bounds: { min: Vec3; max: Vec3 };
  genomeRef: Genome;
}

export function grow(genome: Genome): Phenotype {
  // M24: the bauplan pass pulls limbs onto a canonical layout + guarantees the face before building,
  // so every grown creature reads as a real body plan. The raw genome is kept as genomeRef (share/seed).
  const dev = developBauplan(genome);
  const rng = mulberry32(dev.seed);
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

  growSegment(dev.body, [0, 0, 0], [0, 0, 0, 1], 0, -1);

  if (nodes.length === 0) addNode([0, 0, 0], [0, 0, 0, 1], R_MIN, 'spine'); // never empty

  return { nodes, edges, bounds: { min, max }, genomeRef: genome };

  // --- recursive growth -------------------------------------------------------

  function growSegment(seg: SegmentGene, startPos: Vec3, startQuat: Quat, depth: number, parentIdx: number): void {
    // Body thickness is the cross-section (size x,y); size z stretches the segment
    // forward. The stride is kept near the radius so consecutive capsules overlap into
    // a continuous mass, and a fusiform profile makes the torso bulge in the middle —
    // so it reads as a body, not beads on a stick.
    const girth = (seg.size[0] + seg.size[1]) / 2;
    const elong = Math.min(1.4, Math.max(0.75, seg.size[2] / Math.max(girth, 0.001)));
    const spine: number[] = [];
    let pos = startPos;
    let quat = startQuat;
    let prev = parentIdx;

    for (let i = 0; i < seg.repeat; i++) {
      if (atCap()) break;
      const u = seg.repeat > 1 ? i / (seg.repeat - 1) : 0.5;
      const profile = 1 + BODY_BULGE * Math.sin(Math.PI * u);
      const radius = girth * Math.pow(seg.taper, i) * profile;
      const idx = addNode(pos, quat, radius, 'spine');
      if (prev >= 0) edges.push([prev, idx]);
      spine.push(idx);
      prev = idx;

      // advance along local forward (+Z), bending by the per-link curve. In bilateral mode the
      // lateral (yaw) bend is dropped so the spine stays on the X=0 plane — a winding S-curve would
      // make the static body asymmetric (the slither/undulation animation supplies the wind instead).
      const yaw = dev.symmetry === 'bilateral' ? 0 : seg.curve[1];
      quat = qMul(quat, qFromEuler(seg.curve[0], yaw));
      const fwd = qRotate([0, 0, 1], quat);
      const step = nodes[idx].radius * elong; // overlap-bounded stride → continuous body
      pos = [pos[0] + fwd[0] * step, pos[1] + fwd[1] * step, pos[2] + fwd[2] * step];
    }

    for (const app of seg.appendages) {
      if (atCap()) break;
      const ai = clampInt(Math.round(app.attachT * (spine.length - 1)), 0, spine.length - 1);
      // shoulder / haunch: legs thicken the spine node they attach to, giving the
      // body muscular structure instead of a uniform tube.
      if (app.kind === 'leg') {
        nodes[spine[ai]].radius = Math.min(nodes[spine[ai]].radius * 1.22, nodes[spine[ai]].radius + 0.35);
      }
      growAppendage(app, spine[ai]);
    }

    if (seg.child && depth + 1 < DEPTH_MAX && !atCap()) {
      growSegment(seg.child, pos, quat, depth + 1, prev);
    }
  }

  function growAppendage(app: AppendageGene, attachIdx: number): void {
    const base = nodes[attachIdx];
    const az = app.attachAzimuth + (rng() - 0.5) * 0.12; // seed perturbs the aim a touch
    const ce = Math.cos(app.attachElevation);
    const se = Math.sin(app.attachElevation);
    // spherical aim (MORPHOLOGY §3.1): az sweeps the cross-section, elevation tilts
    // toward the body axis (+forward / −back). This is what lets parts point anywhere.
    const aim = (a: number): Vec3 => norm([ce * Math.cos(a), ce * Math.sin(a), se]);

    if (dev.symmetry === 'radial') {
      for (let k = 0; k < dev.radialCount; k++) growLimb(app, base, aim(az + (k * Math.PI * 2) / dev.radialCount));
      return;
    }
    // bilateral / none: grow one limb…
    let d = aim(az);
    // a non-paired part on a bilateral body must stay on the midline plane (X=0): aim it in the
    // plane and drop the roll + lateral curl that would let a multi-segment part (a tail) wander off.
    if (dev.symmetry === 'bilateral' && !app.pair) {
      d = norm([0, d[1], d[2]]);
      app = { ...app, roll: 0, curl: [app.curl[0], 0] };
    }
    const nStart = nodes.length;
    const eStart = edges.length;
    growLimb(app, base, d);
    // …then a paired part is the *exact* reflection of that limb across X=0 (quaternions can't
    // mirror, so growing the other side from a flipped aim drifts — reflect the grown nodes instead).
    if (app.pair && dev.symmetry === 'bilateral') mirrorAcrossX(nStart, eStart, attachIdx);
  }

  /** Reflect the limb nodes/edges grown in [nStart,nEnd) across the X=0 plane (exact mirror). */
  function mirrorAcrossX(nStart: number, eStart: number, baseIdx: number): void {
    const nEnd = nodes.length;
    const eEnd = edges.length;
    const map = new Map<number, number>();
    map.set(baseIdx, baseIdx); // the shared attach node sits on X=0
    for (let i = nStart; i < nEnd; i++) {
      if (atCap()) break;
      const n = nodes[i];
      // mirror position across X=0; mirror orientation about the YZ plane: (x,y,z,w) → (x,−y,−z,w),
      // which flips the part's outward direction's X while keeping its forward/up read.
      const mi = addNode([-n.pos[0], n.pos[1], n.pos[2]], [n.quat[0], -n.quat[1], -n.quat[2], n.quat[3]], n.radius, n.kind, n.terminal);
      if (n.part) nodes[mi].part = n.part;
      map.set(i, mi);
    }
    for (let e = eStart; e < eEnd; e++) {
      const [a, b] = edges[e];
      const ma = map.get(a);
      const mb = map.get(b);
      if (ma !== undefined && mb !== undefined) edges.push([ma, mb]);
    }
  }

  function growLimb(app: AppendageGene, base: BodyNode, dir0: Vec3): void {
    // orient +Z → aim direction, then roll about that axis (orients flat parts)
    let quat = qMul(qFromAxisAngle(dir0, app.roll), qFromTo([0, 0, 1], dir0));
    let dir = dir0;
    // push the face features proud of the body so they aren't swallowed by the (bulged) head surface:
    // an eye half-buried at the surface reads as nothing, especially in capsule mode.
    const faceMargin = app.terminal === 'eye' ? 0.5 : app.terminal === 'mouth' ? 0.28 : 0;
    const startOut = base.radius * (1 + faceMargin);
    let pos: Vec3 = [base.pos[0] + dir[0] * startOut, base.pos[1] + dir[1] * startOut, base.pos[2] + dir[2] * startOut];
    let prev = nodes.indexOf(base);

    let pitch = app.curl[0];
    for (let j = 0; j < app.segments; j++) {
      if (atCap()) break;
      const last = j === app.segments - 1;
      let r = app.thickness * Math.pow(app.taper, j);
      // the eye is the emotional anchor — floor the grown bulb so even a tapered/stalked eye on a
      // small head always reads (M19/M24), regardless of how the gene tapered down its tip.
      if (last && app.terminal === 'eye') r = Math.max(r, EYE_R_MIN);
      const idx = addNode(pos, quat, r, last ? 'terminal' : 'limb', last ? app.terminal : undefined);
      nodes[idx].part = { kind: app.kind, style: app.style };
      edges.push([prev, idx]);
      prev = idx;

      quat = qMul(quat, qFromEuler(pitch, app.curl[1]));
      dir = qRotate([0, 0, 1], quat);
      pos = [pos[0] + dir[0] * app.length, pos[1] + dir[1] * app.length, pos[2] + dir[2] * app.length];
      // a real jointed leg: thigh → (knee folds the shin sharply back under the body) → (ankle swings
      // the foot forward) — a clear Z stance, not one gentle curved sweep. Other limbs keep their curl.
      if (app.kind === 'leg') {
        if (j === 0) pitch = -Math.abs(app.curl[0]) * 3.0 - 0.3; // knee — a hard ~90° backward fold (clear joint)
        else if (j === 1) pitch = Math.abs(app.curl[0]) * 2.0 + 0.2; // ankle — swing the foot forward
      }
    }
  }
}

// =============================================================================
// Bauplan pass (M24) — the structural attractor basin
// =============================================================================

/**
 * Canonical leg-pair `attachT` positions per pair-count — the bilateral limb attractor basins.
 * index = number of leg pairs (1=biped · 2=quadruped · 3=hexapod · 4=octopod · 5=decapod). Each leg
 * part is `pair:true`, so grow's exact X=0 mirror keeps the arrangement symmetric.
 */
export const LEG_SLOTS: readonly (readonly number[])[] = [
  [],
  [0.55],
  [0.2, 0.8],
  [0.18, 0.5, 0.82],
  [0.12, 0.37, 0.63, 0.88],
  [0.1, 0.3, 0.5, 0.7, 0.9],
];

/** Canonical attachT slots for `pairs` leg-pairs (≥6 spread evenly across the trunk). */
export function legSlots(pairs: number): readonly number[] {
  if (pairs <= 0) return [];
  if (pairs < LEG_SLOTS.length) return LEG_SLOTS[pairs];
  const out: number[] = [];
  for (let i = 0; i < pairs; i++) out.push(((i + 0.5) / pairs) * 0.8 + 0.1);
  return out;
}

/**
 * The bauplan pass: pure, deterministic structural normalization (M24). Pulls the legs onto the
 * canonical layout for their count (lerped by `coherence`) and guarantees a prominent face — so a
 * creature reads as a real body plan no matter how far mutation has wandered. Decorative parts and
 * proportions are left alone (that is the "coherent weird"). Operates on a clone — the input is pure.
 */
export function developBauplan(genome: Genome): Genome {
  const g = structuredClone(genome) as Genome;
  const coh = clamp(g.coherence ?? 1, [0, 1]);
  if (g.symmetry === 'radial') {
    ensureRadialFace(g);
  } else {
    normalizeLegs(g, coh);
    ensureBilateralFace(g);
  }
  return g;
}

const AP = GENE_BOUNDS.appendage;
const LEG_AZ_LO = 3.3;
const LEG_AZ_HI = 4.95;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Pull a leg's azimuth into the down-and-out band — folding any up-pointing aim down first, so a
 *  leg is never broken (pointing up); `coherence` then snaps it toward the canonical band. */
function pullLegAzimuth(az: number, coh: number): number {
  let a = az % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  if (a < Math.PI) a = Math.PI * 2 - a; // up → down
  const canon = a < LEG_AZ_LO ? LEG_AZ_LO : a > LEG_AZ_HI ? LEG_AZ_HI : a;
  return lerp(a, canon, coh);
}

function normalizeLegs(g: Genome, coh: number): void {
  const legs = g.body.appendages.filter((p) => p.kind === 'leg');
  const pairs = legs.length;
  if (pairs === 0) return;
  const slots = legSlots(pairs);
  legs.sort((x, y) => x.attachT - y.attachT); // front-to-back; assign slots in order
  legs.forEach((leg, i) => {
    leg.pair = true; // legs are always mirrored
    leg.attachT = clamp(lerp(leg.attachT, slots[i], coh), AP.attachT);
    leg.attachAzimuth = pullLegAzimuth(leg.attachAzimuth, coh);
    leg.attachElevation = lerp(leg.attachElevation, 0, coh); // legs don't tilt fore/aft
    leg.roll = lerp(leg.roll, 0, coh);
  });
}

/** The head = the front-most body section (the deepest `child`), or the trunk if there is none. */
function frontSegment(g: Genome): SegmentGene {
  let s = g.body;
  while (s.child) s = s.child;
  return s;
}

function ensureBilateralFace(g: Genome): void {
  const head = frontSegment(g);
  ensureFace(head.appendages, (head.size[0] + head.size[1]) / 2);
}

/** Guarantee a prominent eye-set + a mouth (M24/M19): synthesize them if mutation deleted them,
 *  and floor the sizes so they always read. The mouth is kept on the face front. */
function ensureFace(apps: AppendageGene[], girth: number): void {
  const eyes = apps.filter((p) => p.terminal === 'eye');
  if (eyes.length === 0) apps.push(faceEye(girth));
  else for (const e of eyes) e.thickness = clamp(Math.max(e.thickness, 0.16, girth * 0.45), AP.thickness);

  const mouths = apps.filter((p) => p.terminal === 'mouth');
  if (mouths.length === 0) apps.push(faceMouth(girth));
  else
    for (const m of mouths) {
      m.thickness = clamp(Math.max(m.thickness, 0.26, girth * 0.46), AP.thickness); // a big, clearly-read mouth
      m.attachElevation = clamp(Math.max(m.attachElevation, 0.4), AP.attachElevation);
    }
}

function ensureRadialFace(g: Genome): void {
  const apps = g.body.appendages;
  const girth = (g.body.size[0] + g.body.size[1]) / 2;
  if (!apps.some((p) => p.terminal === 'eye')) apps.push(radialEyeCrown(girth));
  if (!apps.some((p) => p.terminal === 'mouth')) apps.push(radialMaw(girth));
}

function faceEye(girth: number): AppendageGene {
  return facePart('eyestalk', 'eye', true, 0, 0.85, 0.95, 0.3, clamp(girth * 0.55, AP.length), clamp(Math.max(0.16, girth * 0.5), AP.thickness));
}
function faceMouth(girth: number): AppendageGene {
  return facePart('maw', 'mouth', false, 0.05, 0.92, 4.71, 0.65, clamp(girth * 0.5, AP.length), clamp(Math.max(0.2, girth * 0.42), AP.thickness));
}
function radialEyeCrown(girth: number): AppendageGene {
  // pair:false but grow arrays it radialCount× → a ring of eyes around the crown
  return facePart('eyestalk', 'eye', false, 0.85, 0.8, 0, 0.2, clamp(girth * 0.5, AP.length), clamp(Math.max(0.16, girth * 0.4), AP.thickness));
}
function radialMaw(girth: number): AppendageGene {
  // elevation ≈ +Z so grow's radial array collapses the copies onto the front centre (a central maw)
  return facePart('maw', 'mouth', false, 0.05, 0.7, 0, 1.35, clamp(girth * 0.45, AP.length), clamp(Math.max(0.2, girth * 0.4), AP.thickness));
}
function facePart(
  kind: PartKind, terminal: Terminal, pair: boolean, style: number,
  attachT: number, attachAzimuth: number, attachElevation: number, length: number, thickness: number,
): AppendageGene {
  return { kind, style, attachT, attachAzimuth, attachElevation, roll: 0, segments: 1, length, thickness, taper: 0.9, curl: [0, 0], terminal, pair };
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
