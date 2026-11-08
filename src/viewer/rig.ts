/**
 * The animation rig — a bone per grown skeleton node, the smooth skin bound to it, and a procedural
 * gait that drives it from what the creature is doing (speed, sleeping, eating).
 *
 * WHY. The welded smooth surface is one static mesh; a creature that only slides around the World is
 * a statue on a conveyor. The grown skeleton is already a perfect bone tree (a parent per node), so:
 *
 *   - BONES: one THREE.Bone per node, parented like the growth edges, rest rotation identity, rest
 *     offset = node − parent. Rotating a node's bone swings everything grown beyond it.
 *   - SKINNING: each skin vertex is weighted to the bones of its nearest skeleton segments by the same
 *     round-cone distance the surface was meshed from (a segment a→b rides bone a; an anisotropic
 *     node's ellipsoid rides its own bone). Near a joint two segments are equally near, so the skin
 *     blends smoothly across it — no hard creases.
 *   - FEATURES (eyes, mouths, horns, shells, wings, …) are parented to their node's bone, so a head
 *     turn carries the face with it.
 *   - GAIT: one phase clock advanced by distance travelled (stride ∝ leg length, so feet don't skate
 *     much) and per-leg offsets from a single rule — offset = ½·((pair + side) mod 2) — which gives a
 *     biped's alternation, a quadruped's diagonal trot, and a hexapod's/spider's alternating tripods;
 *     at a run a four-legged column walker re-phases into a rotary gallop, its back flexing.
 *     Column legs swing fore-aft at the hip and lift at the knee; arched arthropod legs sweep about
 *     the vertical and lift by rolling. Trunks undulate (strongly for sprawlers, as a travelling wave
 *     for legless slitherers and swimmers), tails sway, heads bob, look down to eat, and the whole
 *     body folds down to sleep.
 */
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import { buildFieldPrims, isHybridNode, roundConeDist } from './bodyField';

export type Role = 'spine' | 'leg' | 'arm' | 'tail' | 'wing' | 'fin' | 'tentacle' | 'other';

export interface LegChain {
  nodes: number[]; // hip → foot
  side: number; // +1 right (x > 0), −1 left
  pair: number; // 0 = front-most pair
  fore: boolean; // a quadruped's foreleg (its own fold: elbow behind the shoulder)
  arched: boolean; // arthropod arch (knee above hip)
  offset: number; // gait phase offset (0..1) — the walk and the trot
  gallop: number; // …and at a run (a quadruped's gallop: the forelegs together, then the hind)
  length: number; // hip→foot reach (bu)
  /** the index in the trunk chain of the node this leg's hip hangs from (−1: not the trunk) */
  trunkAt: number;
  /** an arched (sprawled) leg sweeps about the vertical at its hip, so its foot's fore-aft travel is
   *  levered by the foot's SIDEWAYS offset from the hip (a leg fanned forward or back moves its foot
   *  less per radian) */
  reachH: number;
  /** asleep: the fold of the leg's last joint (the ankle, or a two-link leg's knee) that sets its foot
   *  on the floor beside the lying body */
  sleepLast: number;
  /** feeding: the hip, knee and ankle pitches that keep the foot planted while the chest dips */
  graze: [number, number, number];
}

export interface RigTemplate {
  parent: Int32Array;
  roles: Role[];
  trunk: number[]; // segment-0 spine nodes, back → front
  neck: number[]; // spine nodes beyond the trunk (neck + head), back → front
  tails: number[][]; // tail chains, root → tip
  legs: LegChain[];
  arms: number[][];
  others: number[][]; // fins / tentacles / antennae chains that sway
  stride: number; // bu per gait cycle at the full run swing (a walk steps shorter: see gaitAmplitude)
  sprawl: number; // 0 upright mammal … 1 sprawling / arthropod (spine sway amplitude)
  legless: boolean;
  /** four column legs: it can break into a gallop at a run */
  gallops: boolean;
  /** how far the trunk's underside stands off the ground (bu): a sleeper lowers itself this far
   *  to lie on its belly */
  belly: number;
  /** feeding: the first neck joint's pitch, and the trunk's forward dip (rad), that bring the mouth
   *  down to the grass */
  graze: number;
  grazeDip: number;
}

const TEMPLATES = new WeakMap<Phenotype, RigTemplate>();

/** a sleeper lowers itself by this fraction of its belly's clearance */
export const SLEEP_DROP = 0.95;
// the lying fold at the hip and the knee: a quadruped's forelegs reach forward along the ground (the
// sphinx); every other leg folds up beside the belly, thigh forward and shin folded back along it
const LIE_HIP = { fore: -1.25, hind: -0.95 };
const LIE_KNEE = { fore: 0.25, hind: 1.55 };

/**
 * Planar forward kinematics for a pose made only of pitches about the body's X axis (every pose the
 * rig strikes while standing still — feeding, lying down — is). Each node's bone carries `pitch[i]`;
 * a node's position is its parent's plus the rest offset rotated by the parent's accumulated pitch,
 * exactly as the bone hierarchy composes it. Parents always precede children (a node is grown off an
 * existing one), so one pass in index order suffices. Returns (y, z) per node.
 */
function planarFK(p: Phenotype, parent: Int32Array, pitch: Float64Array): { y: Float64Array; z: Float64Array } {
  const n = p.nodes.length;
  const y = new Float64Array(n), z = new Float64Array(n), cum = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const par = parent[i];
    cum[i] = (par >= 0 ? cum[par] : 0) + pitch[i];
    if (par < 0) {
      y[i] = p.nodes[i].pos[1];
      z[i] = p.nodes[i].pos[2];
      continue;
    }
    const a = cum[par];
    const dy = p.nodes[i].pos[1] - p.nodes[par].pos[1], dz = p.nodes[i].pos[2] - p.nodes[par].pos[2];
    // a positive pitch about +X carries forward (+z) points down (−y)
    y[i] = y[par] + dy * Math.cos(a) - dz * Math.sin(a);
    z[i] = z[par] + dy * Math.sin(a) + dz * Math.cos(a);
  }
  return { y, z };
}

/** the most a head turns from straight ahead to look at something (rad, over the whole neck) */
export const LOOK_MAX = 1.1;

/** the second and later neck joints' share of a feeding head's curl (the face turns down to the grass) */
const GRAZE_CURL = 0.12;
/** the most a feeder's chest dips (rad) — past this a body reads as kneeling, not grazing */
const GRAZE_DIP_MAX = 0.42;

/**
 * How a feeder reaches the ground. Feeding used to pitch the first neck joint by one fixed 0.55 rad:
 * a rodent's mouth reached the grass; a long-legged deer's hung a whole head-length above it, grazing
 * the air. Now the template solves it: the neck bends at its root (and curls down its length), and
 * where that is not enough the chest dips — the forelegs flex to let it, so every foot stays planted.
 * Returns the neck root's pitch and the trunk's dip; sets each leg's feeding fold. An ape (it has
 * arms) eats from its hands and keeps the old glance down; a legless body has no ground to reach.
 * (The searches walk only the chains that move — the mouth's ancestry, then each leg — so a new body
 * costs a millisecond or two, not a frame.)
 */
function solveGraze(p: Phenotype, parent: Int32Array, trunk: number[], neck: number[], legs: LegChain[], arms: number[][]): { neck: number; dip: number } {
  const DEF = { neck: 0.55, dip: 0 };
  const mouth = p.nodes.findIndex((n) => n.terminal === 'mouth');
  if (neck.length === 0 || legs.length === 0 || trunk.length === 0 || arms.length > 0 || mouth < 0) return DEF;
  const ground = Math.min(...legs.map((l) => p.nodes[l.nodes[l.nodes.length - 1]].pos[1] - p.nodes[l.nodes[l.nodes.length - 1]].radius));
  const n = p.nodes.length;
  const nT = trunk.length;
  const trunkIdx = new Map(trunk.map((i, k) => [i, k]));
  const neckIdx = new Map(neck.map((i, k) => [i, k]));
  const pitchOf = (i: number, dip: number, a: number): number => {
    const t = trunkIdx.get(i);
    if (t !== undefined) return t >= 1 && nT > 1 ? dip / (nT - 1) : 0;
    const k = neckIdx.get(i);
    if (k !== undefined) return k === 0 ? a : GRAZE_CURL;
    return 0;
  };
  // the mouth's ancestry, root first: the only chain its height depends on
  const path: number[] = [];
  for (let i = mouth; i >= 0; i = parent[i]) path.unshift(i);
  const mouthY = (dip: number, a: number): number => {
    let y = p.nodes[path[0]].pos[1];
    let cum = pitchOf(path[0], dip, a);
    for (let j = 1; j < path.length; j++) {
      const i = path[j], par = path[j - 1];
      const dy = p.nodes[i].pos[1] - p.nodes[par].pos[1], dz = p.nodes[i].pos[2] - p.nodes[par].pos[2];
      y += dy * Math.cos(cum) - dz * Math.sin(cum);
      cum += pitchOf(i, dip, a);
    }
    return y;
  };
  // the mouth at the grass (just above it: its node sits inside the lips)
  const target = ground + p.nodes[mouth].radius * 0.5 + 0.03;
  let best = DEF;
  let cost = Infinity;
  // (the miss is weighed against the shoulder height, so a mouse and a moose trade a dip alike; a
  // low-slung head may even lift a touch)
  const tall = Math.max(0.1, Math.max(...legs.map((l) => p.nodes[l.nodes[0]].pos[1])) - ground);
  for (let dip = 0; dip <= (nT > 1 ? GRAZE_DIP_MAX : 0) + 1e-9; dip += 0.03) {
    for (let a = -0.3; a <= 1.5 + 1e-9; a += 0.025) {
      const c = Math.abs(mouthY(dip, a) - target) / tall + dip * 0.25 + Math.abs(a - 0.55) * 0.02;
      if (c < cost) {
        cost = c;
        best = { neck: a, dip };
      }
    }
  }
  // each leg keeps its foot where it stood: undo the trunk's turn at its hip, then fold the leg to take
  // up the height its hip has lost (a search over the hip and knee; the ankle keeps the foot level)
  const base = new Float64Array(n);
  for (let i = 0; i < n; i++) base[i] = pitchOf(i, best.dip, best.neck);
  const fk = planarFK(p, parent, base);
  for (const l of legs) {
    l.graze = [0, 0, 0];
    const hip = l.nodes[0];
    let cumPar = 0;
    for (let i = parent[hip]; i >= 0; i = parent[i]) cumPar += base[i];
    if (l.arched || (Math.abs(cumPar) < 1e-6 && Math.abs(fk.y[hip] - p.nodes[hip].pos[1]) < 1e-3)) continue;
    const foot = l.nodes[l.nodes.length - 1];
    const rest = p.nodes[foot].pos;
    const chain = l.nodes;
    // the leg alone, from its (moved) hip: pitches [hip, knee, ankle], then rigid below
    const legFK = (h: number, k: number): { y: number; z: number; sink: number } => {
      let y = fk.y[hip], z = fk.z[hip];
      let sink = ground - (y - p.nodes[hip].radius);
      let cum = cumPar + (-cumPar + h);
      for (let j = 1; j < chain.length; j++) {
        const i = chain[j], par = chain[j - 1];
        const dy = p.nodes[i].pos[1] - p.nodes[par].pos[1], dz = p.nodes[i].pos[2] - p.nodes[par].pos[2];
        const ny = y + dy * Math.cos(cum) - dz * Math.sin(cum);
        z = z + dy * Math.sin(cum) + dz * Math.cos(cum);
        y = ny;
        sink = Math.max(sink, ground - (y - p.nodes[i].radius));
        cum += j === 1 ? k : j === 2 ? -(h + k) : 0;
      }
      return { y, z, sink };
    };
    let bestLeg: [number, number, number] = [-cumPar, 0, 0];
    let legCost = Infinity;
    for (let h = -0.9; h <= 0.9 + 1e-9; h += 0.03) {
      for (let k = -1.4; k <= 1.4 + 1e-9; k += 0.035) {
        const f = legFK(h, k);
        // the foot back on its spot, and nothing of the leg below the floor
        const c = Math.abs(f.y - rest[1]) + 0.5 * Math.abs(f.z - rest[2]) + 3 * Math.max(0, f.sink) + 0.02 * (Math.abs(h) + Math.abs(k));
        if (c < legCost) {
          legCost = c;
          bestLeg = [-cumPar + h, k, -(h + k)];
        }
      }
    }
    l.graze = bestLeg;
  }
  return best;
}

/** the default fold of a leg's last joint when it lies down (before the floor is consulted) */
function lieLastDefault(l: LegChain): number {
  if (l.nodes.length >= 4) return l.fore ? -0.3 : -0.95;
  return l.fore ? LIE_KNEE.fore : LIE_KNEE.hind;
}

/**
 * The fold of a leg's last joint that rests a lying animal's foot on the floor. The rig's joints all
 * pitch about the body's X axis (bones rest unrotated), so the lie pose is a planar fold in (y, z):
 * fold the hip (and the knee, on a longer leg), then pick the last joint's angle that brings the
 * lowest link down to the floor without driving it through (`floor` is the ground in the rest frame,
 * raised by the drop). One fold for every leg read fine on a cat and drove a deer's long cannon
 * bones half their length into the ground.
 */
function solveSleepFold(p: Phenotype, l: LegChain, floor: number, belly: number): number {
  const def = lieLastDefault(l);
  if (l.arched || l.nodes.length < 3 || belly <= 0) return def;
  const pts = l.nodes.map((i) => [p.nodes[i].pos[1], p.nodes[i].pos[2]]);
  const rad = l.nodes.map((i) => p.nodes[i].radius);
  // positive pitch carries the foot BACK: (y, z) → (y cos − z sin, y sin + z cos) about the pivot
  const fold = (q: number[][], pivot: number, a: number) => {
    const [py, pz] = q[pivot];
    const c = Math.cos(a), sn = Math.sin(a);
    for (let k = pivot + 1; k < q.length; k++) {
      const dy = q[k][0] - py, dz = q[k][1] - pz;
      q[k] = [py + dy * c - dz * sn, pz + dy * sn + dz * c];
    }
  };
  fold(pts, 0, l.fore ? LIE_HIP.fore : LIE_HIP.hind);
  const last = pts.length >= 4 ? 2 : 1; // the joint being solved
  if (last === 2) fold(pts, 1, l.fore ? LIE_KNEE.fore : LIE_KNEE.hind);
  // the angle (within ±1.4 rad of the default) whose lowest link sits closest to the floor without
  // sinking more than a whisker through it; failing that, the one that sinks least
  let best = def;
  let bestErr = Infinity;
  let fallback = def;
  let fallbackClear = -Infinity;
  for (let a = def - 1.4; a <= def + 1.4; a += 0.05) {
    const q = pts.map((v) => [v[0], v[1]]);
    fold(q, last, a);
    let clear = Infinity;
    for (let k = last; k < q.length; k++) clear = Math.min(clear, q[k][0] - rad[k] - floor);
    if (clear >= -0.04 * belly && Math.abs(clear) + 0.02 * Math.abs(a - def) < bestErr) {
      bestErr = Math.abs(clear) + 0.02 * Math.abs(a - def);
      best = a;
    }
    if (clear > fallbackClear) {
      fallbackClear = clear;
      fallback = a;
    }
  }
  return bestErr < Infinity ? best : fallback;
}

export function rigTemplate(p: Phenotype): RigTemplate {
  const hit = TEMPLATES.get(p);
  if (hit) return hit;
  const n = p.nodes.length;
  const parent = new Int32Array(n).fill(-1);
  for (const [a, b] of p.edges) parent[b] = a;
  const roles: Role[] = p.nodes.map((nd) => {
    if (nd.kind === 'spine') return 'spine';
    const k = nd.part?.kind;
    if (k === 'leg') return 'leg';
    if (k === 'arm') return 'arm';
    if (k === 'tail') return 'tail';
    if (k === 'wing') return 'wing';
    if (k === 'fin') return 'fin';
    if (k === 'tentacle') return 'tentacle';
    return 'other';
  });
  const trunk: number[] = [];
  const neck: number[] = [];
  p.nodes.forEach((nd, i) => {
    if (nd.kind !== 'spine') return;
    if ((nd.segment ?? 0) === 0) trunk.push(i);
    else neck.push(i);
  });
  trunk.sort((a, b) => p.nodes[a].pos[2] - p.nodes[b].pos[2]);
  const trunkIndex = new Map(trunk.map((i, k) => [i, k]));
  neck.sort((a, b) => (p.nodes[a].segment ?? 0) - (p.nodes[b].segment ?? 0) || p.nodes[a].pos[2] - p.nodes[b].pos[2]);

  // limb chains: walk each terminal back to its first non-same-role ancestor
  const chainOf = (tip: number): number[] => {
    const chain = [tip];
    let c = parent[tip];
    while (c >= 0 && roles[c] === roles[tip] && p.nodes[c].kind !== 'spine') {
      chain.unshift(c);
      c = parent[c];
    }
    return chain;
  };
  const legs: LegChain[] = [];
  const tails: number[][] = [];
  const arms: number[][] = [];
  const others: number[][] = [];
  p.nodes.forEach((nd, i) => {
    if (nd.kind !== 'terminal') return;
    const r = roles[i];
    if (r === 'leg') {
      const chain = chainOf(i);
      const hip = p.nodes[chain[0]];
      const foot = p.nodes[i];
      legs.push({
        nodes: chain,
        side: hip.pos[0] >= 0 ? 1 : -1,
        pair: 0,
        fore: false,
        arched: chain.length >= 3 && p.nodes[chain[1]].pos[1] > hip.pos[1] + 1e-3,
        offset: 0,
        gallop: 0,
        length: Math.hypot(foot.pos[0] - hip.pos[0], foot.pos[1] - hip.pos[1], foot.pos[2] - hip.pos[2]),
        reachH: Math.max(Math.abs(foot.pos[0] - hip.pos[0]), 0.4 * Math.hypot(foot.pos[0] - hip.pos[0], foot.pos[2] - hip.pos[2])),
        trunkAt: -1,
        sleepLast: 0,
        graze: [0, 0, 0],
      });
    } else if (r === 'tail') tails.push(chainOf(i));
    else if (r === 'arm') arms.push(chainOf(i));
    else if (r === 'fin' || r === 'tentacle' || (r === 'other' && nd.part?.kind === 'antenna')) others.push(chainOf(i));
  });
  for (const l of legs) l.trunkAt = trunkIndex.get(parent[l.nodes[0]]) ?? -1;
  // pairs front → back by hip z; the trot/tripod rule sets each leg's phase
  const zs = [...new Set(legs.map((l) => Math.round(p.nodes[l.nodes[0]].pos[2] * 20) / 20))].sort((a, b) => b - a);
  for (const l of legs) {
    const z = Math.round(p.nodes[l.nodes[0]].pos[2] * 20) / 20;
    l.pair = zs.indexOf(z);
    l.fore = zs.length === 2 && l.pair === 0;
    l.offset = 0.5 * ((l.pair + (l.side > 0 ? 1 : 0)) % 2);
    // a rotary gallop: the two forelegs strike a beat apart, the hind pair half a cycle later
    l.gallop = zs.length === 2 && legs.length === 4 ? (l.pair === 0 ? 0 : 0.5) + (l.side > 0 ? 0.09 : 0) : l.offset;
  }
  // the belly's clearance: the trunk's underside above the lowest foot
  let belly = 0;
  if (legs.length) {
    let under = Infinity;
    for (const i of trunk) under = Math.min(under, p.nodes[i].pos[1] - p.nodes[i].radius * (p.nodes[i].scale?.[1] ?? 1));
    const ground = Math.min(...legs.map((l) => p.nodes[l.nodes[l.nodes.length - 1]].pos[1] - p.nodes[l.nodes[l.nodes.length - 1]].radius));
    belly = Number.isFinite(under) ? Math.max(0, under - ground) : 0;
    for (const l of legs) l.sleepLast = solveSleepFold(p, l, ground + belly * SLEEP_DROP, belly);
  }
  const meanLeg = legs.length ? legs.reduce((t, l) => t + l.length, 0) / legs.length : 0;
  const archedFrac = legs.length ? legs.filter((l) => l.arched).length / legs.length : 0;
  const tmpl: RigTemplate = {
    parent,
    roles,
    trunk,
    neck,
    tails,
    legs,
    arms,
    others,
    stride: legs.length ? Math.max(0.6, meanLeg * 1.6) : Math.max(0.8, trunk.length * 0.5),
    sprawl: legs.length >= 6 ? 1 : archedFrac > 0.5 ? 0.9 : 0.25,
    legless: legs.length === 0,
    gallops: legs.length === 4 && zs.length === 2 && archedFrac === 0,
    belly,
    graze: 0,
    grazeDip: 0,
  };
  const g = solveGraze(p, parent, trunk, neck, legs, arms);
  tmpl.graze = g.neck;
  tmpl.grazeDip = g.dip;
  TEMPLATES.set(p, tmpl);
  return tmpl;
}

// --- instance: bones + skeleton ------------------------------------------------------------------

export interface RigInstance {
  template: RigTemplate;
  bones: THREE.Bone[];
  root: THREE.Bone; // a synthetic root at the origin (holds every parentless node)
  skeleton: THREE.Skeleton;
  rest: THREE.Vector3[]; // bone rest positions (local)
  phase: number;
  t: number;
  /** the trunk's accumulated yaw at each trunk node, this pose (legs undo it — see poseRig) */
  trunkYaw: number[];
  /** the tail's wag phase (accumulated, so its frequency can ramp without the tail jumping) */
  wag: number;
}

export function createRig(p: Phenotype): RigInstance {
  const template = rigTemplate(p);
  const root = new THREE.Bone();
  root.name = 'root';
  const bones = p.nodes.map((_, i) => {
    const b = new THREE.Bone();
    b.name = `n${i}`;
    return b;
  });
  const rest: THREE.Vector3[] = [];
  p.nodes.forEach((nd, i) => {
    const par = template.parent[i];
    const pp = par >= 0 ? p.nodes[par].pos : [0, 0, 0];
    bones[i].position.set(nd.pos[0] - pp[0], nd.pos[1] - pp[1], nd.pos[2] - pp[2]);
    rest.push(bones[i].position.clone());
    (par >= 0 ? bones[par] : root).add(bones[i]);
  });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([root, ...bones]);
  return { template, bones, root, skeleton, rest, phase: 0, t: 0, wag: 0, trunkYaw: [] };
}

// --- skin weights --------------------------------------------------------------------------------

const SKINNED = new WeakSet<THREE.BufferGeometry>();

/**
 * Add skinIndex/skinWeight to a smooth-skin geometry (once). Bone indices are skeleton indices:
 * 0 = the synthetic root, node i = i + 1. A vertex rides the bones of its nearest skeleton
 * segments, weighted by exp(−(d − d_min)/σ) on the true round-cone distance, top 4 kept.
 */
export function ensureSkinWeights(geo: THREE.BufferGeometry, p: Phenotype): void {
  if (SKINNED.has(geo)) return;
  const template = rigTemplate(p);
  const prims = buildFieldPrims(p, 'hybrid');
  // the bone each field primitive rides: rebuild the same edge list buildFieldPrims used
  let edges = p.edges.filter(([a, b]) => isHybridNode(p.nodes[a]) && isHybridNode(p.nodes[b]));
  if (edges.length === 0) edges = p.edges;
  const segBone = edges.map(([a]) => a + 1);
  const shaped: number[] = [];
  const included = new Set<number>();
  for (const [a, b] of edges) {
    included.add(a);
    included.add(b);
  }
  for (const i of included) if (p.nodes[i].scale) shaped.push(i);
  void template;

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nV = pos.count;
  const skinIndex = new Uint16Array(nV * 4);
  const skinWeight = new Float32Array(nV * 4);
  const nc = Math.min(prims.nc, edges.length);
  const dist = new Float64Array(nc + shaped.length);
  const acc = new Map<number, number>();
  for (let v = 0; v < nV; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    let dmin = Infinity;
    for (let m = 0; m < nc; m++) {
      const d = roundConeDist(x, y, z, prims.ax[m], prims.ay[m], prims.az[m], prims.bx[m], prims.by[m], prims.bz[m], prims.ra[m], prims.rb[m]);
      dist[m] = d;
      if (d < dmin) dmin = d;
    }
    for (let s = 0; s < shaped.length; s++) {
      const nd = p.nodes[shaped[s]];
      const sc = nd.scale!;
      // a conservative ellipsoid distance (as the field does it)
      const q = new THREE.Vector3(x - nd.pos[0], y - nd.pos[1], z - nd.pos[2]).applyQuaternion(
        new THREE.Quaternion(nd.quat[0], nd.quat[1], nd.quat[2], nd.quat[3]).invert(),
      );
      const rx = nd.radius * sc[0], ry = nd.radius * sc[1], rz = nd.radius * sc[2];
      const d = (Math.hypot(q.x / rx, q.y / ry, q.z / rz) - 1) * Math.min(rx, ry, rz);
      dist[nc + s] = d;
      if (d < dmin) dmin = d;
    }
    acc.clear();
    for (let m = 0; m < nc + shaped.length; m++) {
      const bone = m < nc ? segBone[m] : shaped[m - nc] + 1;
      const r = m < nc ? Math.max(prims.ra[m], prims.rb[m]) : p.nodes[shaped[m - nc]].radius;
      const sigma = 0.05 + 0.22 * r;
      const dd = dist[m] - dmin;
      if (dd > sigma * 4) continue;
      const w = Math.exp(-dd / sigma);
      acc.set(bone, (acc.get(bone) ?? 0) + w);
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (top.length === 0) top.push([1, 1]); // no segment at all (a one-node blob): ride node 0's bone
    let sum = 0;
    for (const [, w] of top) sum += w;
    for (let k = 0; k < 4; k++) {
      const e = top[k];
      skinIndex[v * 4 + k] = e ? e[0] : 0;
      skinWeight[v * 4 + k] = e ? e[1] / (sum || 1) : 0;
    }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  SKINNED.add(geo);
}

// --- the procedural pose -------------------------------------------------------------------------

export interface PoseInput {
  dt: number;
  speed: number; // ground speed (bu/s) in body units (already divided by growth scale)
  cruise: number; // the creature's cruise speed (for amplitude normalization)
  sleep: number; // 0 awake … 1 fully asleep
  eat: number; // 0 … 1 head-down feeding
  swim: boolean; // in water as a swimmer
  turn: number; // signed turn rate (rad/s) — the spine leans into turns
  fly?: number; // 0 on its feet … 1 airborne: legs tucked, stride suspended, neck stretched, tail streamed
  /** 0 … 1 standing idle (the breeder's hero view): it breathes, shifts its weight and glances about */
  idle?: number;
  /** 0 … 1 a courtship display: head held high and bobbing, tail raised and wagging fast */
  display?: number;
  /** 0 … 1 stalking: crouched, head low and level, the tail held still */
  stalk?: number;
  /** where it is looking, relative to straight ahead (rad): yaw (+ toward the body's +X) and pitch
   *  (+ down) — a hunter fixes on its prey, prey on the predator, a suitor on its mate. Shared down the
   *  neck so the head turns smoothly; clamped to what a neck can do. */
  look?: [number, number];
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();

function setRot(b: THREE.Bone, ax: number, ay: number, az: number): void {
  // compose pitch (X), yaw (Y), roll (Z) onto the identity rest
  b.quaternion.setFromAxisAngle(Y, ay);
  if (ax) b.quaternion.multiply(q1.setFromAxisAngle(X, ax));
  if (az) b.quaternion.multiply(q2.setFromAxisAngle(Z, az));
}

/** A leg's fore-aft stroke through the gait cycle, −1 … 1. The stance half (cos(ph) > 0) runs a
 *  straight line from −1 to 1; the swing half eases back from 1 to −1. */
export function strokeOf(ph: number): number {
  const t = ((((ph + Math.PI / 2) / (Math.PI * 2)) % 1) + 1) % 1; // 0 … ½ stance, ½ … 1 swing
  return t < 0.5 ? -1 + 4 * t : Math.cos(((t - 0.5) / 0.5) * Math.PI);
}

function smooth01(x: number): number {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

/** the hip swing at a full run (rad) — the template's stride is measured for it */
const GAIT_AMP_MAX = 0.42;

/** The hip's fore-aft swing for a speed: short steps at a walk, the full reach at a run. */
export function gaitAmplitude(speed: number, cruise: number): number {
  const f = Math.min(1, Math.max(0, speed / Math.max(cruise, 1e-3) / 1.3));
  return 0.16 + (GAIT_AMP_MAX - 0.16) * f;
}

/**
 * A carcass's pose: the body gone limp. The legs hang half-flexed (a dead animal's legs neither stand
 * nor fold neatly), the neck sags, the trunk bends a little along its length and the tail curls. A
 * body toppled over in its standing pose read as a statue knocked off its plinth, not a dead animal.
 */
export function poseDead(r: RigInstance): void {
  const T = r.template;
  for (const b of r.bones) b.quaternion.identity();
  const nT = T.trunk.length;
  for (let k = 1; k < nT; k++) setRot(r.bones[T.trunk[k]], 0, 0.07, 0);
  T.neck.forEach((i, k) => setRot(r.bones[i], k === 0 ? 0.45 : 0.15, 0.12, 0));
  for (const L of T.legs) {
    const fold = L.fore ? [0.2, 0.35, -0.25] : [0.3, 0.55, -0.35];
    L.nodes.slice(0, 3).forEach((i, j) => setRot(r.bones[i], fold[j] * (L.arched ? 0.4 : 1), 0, 0));
  }
  for (const chain of T.tails) chain.forEach((i) => setRot(r.bones[i], 0.08, 0.18, 0));
}

export function poseRig(r: RigInstance, inp: PoseInput): void {
  const T = r.template;
  r.t += inp.dt;
  const fly = inp.fly ?? 0;
  const grounded = 1 - fly;
  // airborne, the legs don't stride (the airspeed would spin the gait clock) — they fold up
  const moving = Math.min(1, inp.speed / Math.max(0.2, inp.cruise * 0.35)) * grounded;
  // Stride with speed: a walk takes short steps, a run reaches out (at the full ±0.42 rad a walking cat
  // swung its legs like a galloping one). The step's length follows the swing, so the planted foot
  // still keeps pace with the ground instead of skating.
  const amp = gaitAmplitude(inp.speed, inp.cruise);
  // at a run a quadruped breaks from the trot into a gallop (the legs re-phase, the back flexes)
  const gal = T.gallops ? smooth01((inp.speed / Math.max(inp.cruise, 1e-3) - 1.05) / 0.4) * grounded : 0;
  const stride = T.stride * (Math.sin(amp) / Math.sin(GAIT_AMP_MAX));
  r.phase = (r.phase + (inp.speed * grounded * inp.dt) / stride) % 1;
  const P = r.phase * Math.PI * 2;
  const awake = 1 - inp.sleep;
  const show = (inp.display ?? 0) * awake;
  const stalk = (inp.stalk ?? 0) * awake;
  const strut = show * Math.sin(r.t * 5.2); // the display's rhythm
  // (a frequency that changes multiplied by absolute time jumps the phase: integrate it instead)
  r.wag = (r.wag + inp.dt * (1.3 + 4 * show)) % (Math.PI * 2);

  for (const b of r.bones) b.quaternion.identity();

  // trunk: lateral undulation (sprawlers sway, slitherers/swimmers send a wave down the body)
  const nT = T.trunk.length;
  const wave = T.legless || inp.swim;
  // the trunk's accumulated yaw at each of its nodes: the legs undo it at their hips, so a swaying
  // sprawler's planted feet hold the ground while the body wiggles between them
  if (r.trunkYaw.length !== nT) r.trunkYaw = new Array(nT).fill(0);
  r.trunkYaw[0] = 0;
  for (let k = 1; k < nT; k++) {
    const u = k / Math.max(1, nT - 1);
    let yaw = 0;
    // a slitherer throws big S-curves down its whole length; a swimmer's wave grows toward the tail
    if (T.legless && !inp.swim) yaw = 0.42 * moving * Math.sin(P - k * 0.95);
    else if (wave) yaw = 0.24 * moving * Math.sin(P - k * 1.1) * (0.35 + 0.65 * (1 - u));
    else yaw = 0.05 * T.sprawl * moving * Math.sin(P - k * 0.8);
    yaw -= inp.turn * 0.06 * awake; // lean into turns
    // galloping, the back coils as the legs gather under the body and stretches as they reach out
    const flex = k === Math.max(1, Math.floor(nT / 2)) ? 0.2 * gal * moving * Math.sin(P + 0.6) : 0;
    // feeding, a long-legged grazer tips its chest down toward the grass (spread over the trunk's
    // joints, so the back curves rather than kinking at one; the legs fold to keep their feet planted)
    const dip = (T.grazeDip * inp.eat * awake) / Math.max(1, nT - 1);
    setRot(r.bones[T.trunk[k]], flex * awake + dip, yaw * awake, 0);
    r.trunkYaw[k] = r.trunkYaw[k - 1] + yaw * awake;
  }
  // idle: a slow look around (two incommensurate waves, so the glances never settle into a loop),
  // a breath that lifts the chest, and a lazy weight shift
  const idle = (inp.idle ?? 0) * awake;
  const glance = idle * (0.32 * Math.sin(r.t * 0.42) + 0.16 * Math.sin(r.t * 1.07 + 1.3));
  const nod = idle * 0.07 * Math.sin(r.t * 0.61 + 0.4);
  if (idle > 0 && nT > 0) {
    const chest = r.bones[T.trunk[nT - 1]];
    const breath = 1 + idle * 0.014 * Math.sin(r.t * 1.6);
    chest.scale.set(breath, breath, 1);
    if (nT > 1) {
      const sway = idle * 0.025 * Math.sin(r.t * 0.33);
      r.bones[T.trunk[1]].quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Z, sway));
    }
  } else if (nT > 0) r.bones[T.trunk[nT - 1]].scale.set(1, 1, 1);
  // neck & head: bob with the stride, drop to eat, droop to sleep
  for (let k = 0; k < T.neck.length; k++) {
    const first = k === 0;
    const bob = (T.legless ? 0 : 0.05) * moving * Math.sin(P * 2);
    // in flight the neck stretches out level ahead of the body
    // courting, the head is held high and bobs to the display's beat
    // stalking, the head drops level with the shoulders and the eyes fix ahead (the next link lifts
    // the head back to level)
    const pitch = (first ? T.graze * inp.eat + 0.35 * inp.sleep - 0.12 * fly - 0.32 * show + 0.35 * stalk : GRAZE_CURL * inp.eat - 0.08 * show - 0.25 * stalk) + bob * (1 - stalk) + 0.1 * strut;
    // the glance is shared down the neck so the head turns smoothly rather than at one joint
    const nN = Math.max(1, T.neck.length);
    const lookYaw = inp.look ? Math.max(-LOOK_MAX, Math.min(LOOK_MAX, inp.look[0])) / nN : 0;
    const lookPitch = inp.look ? Math.max(-0.5, Math.min(0.5, inp.look[1])) / nN : 0;
    const look = (first ? -inp.turn * 0.12 : 0) + glance / nN + lookYaw;
    setRot(r.bones[T.neck[k]], pitch + (first ? nod : 0) + lookPitch * awake, look * awake, 0);
  }
  // legs
  for (const L of T.legs) {
    const ph = P + (L.offset + (L.gallop - L.offset) * gal) * Math.PI * 2;
    // the stroke, −1 … 1: a STEADY stance (the planted foot slides back at a constant rate, keeping
    // pace with the ground — on a sine it sped up and slowed down under the body, and skated) and a
    // quicker eased swing forward through the air
    const s = strokeOf(ph);
    const c = Math.cos(ph);
    const hip = r.bones[L.nodes[0]];
    // Convention: a positive hip angle carries the foot BACKWARD (the stance stroke, while it is
    // planted and the body passes over it); the angle falls while the foot swings forward through the
    // air, i.e. while cos(ph) < 0 — that is when the leg lifts.
    const swingPhase = Math.max(0, -c);
    if (L.arched) {
      // sweep fore-aft about the vertical (yaw ×side so both flanks agree on "backward"), and lift on
      // the forward stroke by rolling the leg up about the body axis (+Z roll raises the +X side)
      // (sized like a column leg's swing: the foot travels half a stride while it is down)
      const sweepAmp = moving > 0 ? Math.min(0.6, Math.asin(Math.min(0.95, stride / (4 * Math.max(L.reachH, 1e-3))))) : 0.32;
      const sweep = sweepAmp * moving * s * L.side;
      const lift = 0.3 * moving * swingPhase;
      const fold = 0.45 * inp.sleep; // feet draw up under a resting body
      const unsway = L.trunkAt >= 0 ? -r.trunkYaw[L.trunkAt] : 0;
      setRot(hip, 0, sweep * awake + unsway, L.side * (lift * awake + fold));
    } else {
      // swing fore-aft at the hip; flex the knee (shin back and up) through the swing phase. In flight
      // the legs trail back along the belly with the feet folded up under the tail.
      // each leg's swing is sized so its foot travels exactly half a stride while it is down: a long
      // leg sweeps a smaller angle than a short one for the same step (one angle for every leg slid
      // the long ones' feet forward and dragged the short ones')
      const reach = Math.min(0.95, stride / (4 * Math.max(L.length, 1e-3)));
      const legAmp = moving > 0 ? Math.asin(reach) : amp;
      const swing = legAmp * moving * s * awake * (1 - 0.35 * stalk);
      // ASLEEP the animal lies on its belly (the body is lowered by `belly`): a quadruped's forelegs
      // reach forward along the ground (the sphinx), every other leg folds up tight beside the belly —
      // thigh forward, shin folded back along it, foot tucked. (Standing with the head dropped and the
      // feet lifted off the floor, a sleeper looked like it was about to fall over.)
      const lie = inp.sleep;
      const hipLie = L.fore ? LIE_HIP.fore : LIE_HIP.hind;
      // (the last joint's fold is solved against the floor: the ankle, or a two-link leg's knee)
      const kneeLie = L.nodes.length >= 4 ? (L.fore ? LIE_KNEE.fore : LIE_KNEE.hind) : L.sleepLast;
      const ankleLie = L.nodes.length >= 4 ? L.sleepLast : 0;
      // a stalker creeps on flexed legs (hip forward, knee folded): the body rides low; a feeder
      // folds its legs (as solved) to let its chest dip with its feet planted
      const eat = inp.eat * awake;
      const unsway = L.trunkAt >= 0 ? -r.trunkYaw[L.trunkAt] : 0;
      setRot(hip, swing + hipLie * lie + 0.95 * fly - 0.28 * stalk + L.graze[0] * eat, unsway, 0);
      if (L.nodes.length > 1) {
        const knee = r.bones[L.nodes[1]];
        setRot(knee, 0.6 * moving * swingPhase * awake + kneeLie * lie + 0.7 * fly + 0.5 * stalk + L.graze[1] * eat, 0, 0);
      }
      if (L.nodes.length > 2) {
        const ankle = r.bones[L.nodes[2]];
        setRot(ankle, -0.35 * moving * swingPhase * awake + ankleLie * lie + L.graze[2] * eat, 0, 0);
      }
    }
  }
  // arms swing opposite the legs
  r.template.arms.forEach((chain) => {
    const side = r.bones[chain[0]].position.x >= 0 ? 1 : -1;
    setRot(r.bones[chain[0]], -0.3 * moving * Math.sin(P + (side > 0 ? 0 : Math.PI)) * awake, 0, 0);
  });
  // tails sway (a slow wag; a swimmer's tail drives the stroke)
  for (const chain of T.tails) {
    for (let j = 0; j < chain.length; j++) {
      const amp = ((inp.swim || T.legless ? 0.28 * (0.4 + moving) : 0.08 + 0.1 * moving) * (1 - 0.7 * fly) + 0.22 * show) * (1 - 0.8 * stalk);
      const yaw = amp * Math.sin((inp.swim ? P : r.wag + P * 0.5) - j * 0.8);
      // a displaying tail is raised (−pitch lifts it), each link a little more — a flag, not a droop
      setRot(r.bones[chain[j]], -0.08 * inp.sleep - 0.1 * fly - 0.32 * show, yaw * awake, 0);
    }
  }
  // fins, tentacles and antennae drift
  for (const chain of T.others) {
    for (let j = 0; j < chain.length; j++) {
      const a = 0.12 * Math.sin(r.t * 1.7 + j * 0.9 + chain[0]);
      setRot(r.bones[chain[j]], a * awake, a * 0.5 * awake, 0);
    }
  }
}
