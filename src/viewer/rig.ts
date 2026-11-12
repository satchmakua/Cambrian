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
import type { Vec3 } from '../engine/genome';
import { buildFieldPrims, roundConeDist } from './bodyField';

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
   *  on the floor beside the lying body — or, an arched leg, the roll at its hip that does */
  sleepLast: number;
  /** feeding: the hip, knee and ankle pitches that keep the foot planted while the chest dips */
  graze: [number, number, number];
}

export interface RigTemplate {
  parent: Int32Array;
  roles: Role[];
  trunk: number[]; // the trunk's spine nodes (through the last leg-bearing section), back → front
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
  /** …and, for a two-legged feeder, how far the whole body shifts (up, forward) as it tips, so that it
   *  see-saws about its hips instead of swinging them off their legs (see solveGraze) */
  grazeShift: [number, number];
  /** a two-legged feeder tips as ONE piece, about its rump (the shift then holds its hips in place):
   *  bent joint by joint like a grazer's, its back curled under and its folded wings stood off it */
  grazeRigid: boolean;
  /** a long legless body's resting line: at rest it lies in a loose S (see restBends) */
  rest: RestLine | null;
  /** how each arm (parallel to `arms`) folds as the body lies down, and how it feeds */
  armPose: ArmPose[];
}

/**
 * An arm's poses, measured in the sagittal plane (every joint pitches about the body's X axis).
 *  - Lying down, the body drops toward the floor: an arm long enough to reach it (an ape's, which
 *    stands on its knuckles) swings forward about the shoulder just far enough to rest its hand on
 *    the floor — hanging straight, it sank through the ground to the elbow.
 *  - Feeding, a hand that can reach the mouth carries the food up to it: the shoulder and elbow
 *    pitches that put the hand at the lips (null when the arm is too short — a theropod's — or it
 *    ends in a claw, not a hand).
 */
export interface ArmPose {
  shoulderH: number; // the shoulder's height over the ground, less the hand's radius (∞: no ground known)
  reach: number; // shoulder → hand
  psi0: number; // the arm's rest angle forward of straight down (rad)
  elbow: number; // the elbow's index in the chain
  feed: [number, number] | null;
}

/** The shoulder pitch (rad; negative swings the hand forward) that rests a hanging arm's hand on the
 *  floor once the body has dropped `drop` toward it; 0 while the hand still hangs clear. */
export function armLie(a: ArmPose, drop: number): number {
  if (!(a.reach > 1e-6) || !Number.isFinite(a.shoulderH)) return 0;
  const c = (a.shoulderH - drop) / a.reach;
  if (c >= Math.cos(a.psi0)) return 0;
  return -(Math.acos(Math.max(-1, c)) - a.psi0);
}

/**
 * Where a slitherer's body runs, for its resting S: the arc position (0 at the tail tip … 1 at the
 * last trunk node) of the midpoint of each trunk link and of each link of its main tail.
 */
export interface RestLine {
  trunkS: number[]; // link k = trunk[k] → trunk[k+1]
  tail: number[]; // the main tail chain, root → tip (empty: no tail)
  tailS: number[]; // link j = (j ? tail[j−1] : trunk[tailAt]) → tail[j]
  tailAt: number; // the trunk index the tail hangs from
  /** the bends' amplitude (rad of heading): full for a long thin body, none for a stubby one */
  amp: number;
  /** each animal lies its own way: the side its body swings to, and 1 (an S) … 1.5 (an S with a
   *  hook) waves of bend from tail to head */
  side: 1 | -1;
  waves: number;
}

/** how fast a feeder's hand goes to its mouth and back (rad/s: one bite every ~2.4 s) */
const FEED_RATE = 2.6;
/** a hand-feeder's nod to meet its hand (rad at the first neck joint) */
const FEED_NOD = 0.25;
/** …and how far past the arm's reach the mouth may be for the arm still to feed it (× its length) */
const FEED_STRETCH = 1.3;

/** the body wave's phase step per trunk joint (rad): a slitherer's, a swimmer's */
const SLITHER_K = 0.95;
const SWIM_K = 1.1;

/** the mean length of a chain's links */
function meanLink(p: Phenotype, chain: number[]): number {
  if (chain.length < 2) return 0;
  let L = 0;
  for (let k = 1; k < chain.length; k++) {
    const a = p.nodes[chain[k - 1]].pos;
    const b = p.nodes[chain[k]].pos;
    L += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  return L / (chain.length - 1);
}

/** the resting S's heading swing (rad): enough to read as an S, never turning the body back on itself */
export const REST_BEND = 0.85;

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
/** the most the first neck joint pitches to feed (rad): a neck carried high (a deer's, a dragon's,
 *  an ostrich's — raised 80° and more at rest) has that much to come down before it even points at
 *  the ground; at 1.5 such a neck only reached level, and its owner grazed the air */
const GRAZE_NECK_MAX = 2.0;
/** the most a feeder's chest dips (rad) — past this a body reads as kneeling, not grazing */
const GRAZE_DIP_MAX = 0.55;
/** …and a two-legged body's: a bird pecks by tipping its whole body forward over its legs, tail up —
 *  its chest stands high (and higher the more upright it stands), and no neck of its own reaches the
 *  ground from there. */
const GRAZE_DIP_BIPED = 1.0;

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
function solveGraze(p: Phenotype, parent: Int32Array, trunk: number[], neck: number[], legs: LegChain[], handFed: boolean): { neck: number; dip: number; shift: [number, number]; rigid: boolean } {
  const DEF = { neck: 0.55, dip: 0, shift: [0, 0] as [number, number], rigid: false };
  const mouth = p.nodes.findIndex((n) => n.terminal === 'mouth');
  // (a hand-feeder only nods to meet its hand — see ArmPose)
  if (handFed) return { neck: FEED_NOD, dip: 0, shift: [0, 0], rigid: false };
  if (neck.length === 0 || legs.length === 0 || trunk.length === 0 || mouth < 0) return DEF;
  const ground = Math.min(...legs.map((l) => p.nodes[l.nodes[l.nodes.length - 1]].pos[1] - p.nodes[l.nodes[l.nodes.length - 1]].radius));
  const n = p.nodes.length;
  const nT = trunk.length;
  const trunkIdx = new Map(trunk.map((i, k) => [i, k]));
  const neckIdx = new Map(neck.map((i, k) => [i, k]));
  // (a two-legged body tips as one piece, at its root; a grazer's back curves, joint by joint)
  const biped = legs.length <= 2;
  const pitchOf = (i: number, dip: number, a: number): number => {
    const t = trunkIdx.get(i);
    if (t !== undefined) return biped ? (t === 0 ? dip : 0) : t >= 1 && nT > 1 ? dip / (nT - 1) : 0;
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
  // A TWO-LEGGED feeder (a bird, a theropod) tips over its hips: tail up, head down, the body a
  // see-saw on its legs. The trunk's joints turn about themselves, which swings the hips forward and
  // down off the feet — so the whole body is shifted back by as much, and the hips stay where they
  // were. (Without it a bird could tip only as far as its legs could fold to follow: its mouth hung
  // half its own height above the ground it was pecking at.)
  const hipPath: number[] = [];
  if (biped) for (let i = legs[0].nodes[0]; i >= 0; i = parent[i]) hipPath.unshift(i);
  const shiftOf = (dip: number): [number, number] => {
    if (!biped || dip === 0) return [0, 0];
    let y = p.nodes[hipPath[0]].pos[1], z = p.nodes[hipPath[0]].pos[2];
    let cum = pitchOf(hipPath[0], dip, 0);
    for (let j = 1; j < hipPath.length; j++) {
      const i = hipPath[j], par = hipPath[j - 1];
      const dy = p.nodes[i].pos[1] - p.nodes[par].pos[1], dz = p.nodes[i].pos[2] - p.nodes[par].pos[2];
      const ny = y + dy * Math.cos(cum) - dz * Math.sin(cum);
      z = z + dy * Math.sin(cum) + dz * Math.cos(cum);
      y = ny;
      if (trunkIdx.has(i)) cum += pitchOf(i, dip, 0);
    }
    const hip = p.nodes[hipPath[hipPath.length - 1]].pos;
    return [hip[1] - y, hip[2] - z];
  };
  // the mouth at the grass (just above it: its node sits inside the lips)
  const target = ground + p.nodes[mouth].radius * 0.5 + 0.03;
  let best = DEF;
  let cost = Infinity;
  // (the miss is weighed against the shoulder height, so a mouse and a moose trade a dip alike; a
  // low-slung head may even lift a touch)
  const tall = Math.max(0.1, Math.max(...legs.map((l) => p.nodes[l.nodes[0]].pos[1])) - ground);
  const dipMax = biped ? GRAZE_DIP_BIPED : nT > 1 ? GRAZE_DIP_MAX : 0;
  for (let dip = 0; dip <= dipMax + 1e-9; dip += 0.03) {
    const shift = shiftOf(dip);
    for (let a = -0.3; a <= GRAZE_NECK_MAX + 1e-9; a += 0.025) {
      const c = Math.abs(mouthY(dip, a) + shift[0] - target) / tall + dip * 0.25 + Math.abs(a - 0.55) * 0.02;
      if (c < cost) {
        cost = c;
        best = { neck: a, dip, shift, rigid: biped };
      }
    }
  }
  // each leg keeps its foot where it stood: undo the trunk's turn at its hip, then fold the leg to take
  // up the height its hip has lost (a search over the hip and knee; the ankle keeps the foot level)
  const base = new Float64Array(n);
  for (let i = 0; i < n; i++) base[i] = pitchOf(i, best.dip, best.neck);
  const fk = planarFK(p, parent, base);
  for (let i = 0; i < n; i++) {
    fk.y[i] += best.shift[0];
    fk.z[i] += best.shift[1];
  }
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
 * An ARCHED leg (an arthropod's) lying down: the body drops `drop` onto the floor and the whole leg
 * swings up about its hip (a roll about the body axis, raising its side) just far enough to keep the
 * foot on the floor. A fixed roll left a resting insect's feet treading the air a third of its height
 * up, and would have driven a long-legged spider's through the ground.
 */
function solveArchedLie(p: Phenotype, l: LegChain, drop: number): number {
  const hip = p.nodes[l.nodes[0]].pos;
  const foot = p.nodes[l.nodes[l.nodes.length - 1]].pos;
  // the foot in the hip's (|x|, y) plane: rolling by θ turns (a, b) to (…, a sin θ + b cos θ); solve
  // a sin θ + b cos θ = b + drop
  const a = Math.abs(foot[0] - hip[0]);
  const b = foot[1] - hip[1];
  const R = Math.hypot(a, b);
  if (R < 1e-6 || drop <= 0) return 0;
  return Math.asin(Math.max(-1, Math.min(1, (b + drop) / R))) - Math.atan2(b, a);
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
  if (l.arched) return solveArchedLie(p, l, belly * SLEEP_DROP);
  const def = lieLastDefault(l);
  if (l.nodes.length < 3 || belly <= 0) return def;
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

/** Where the mouth is, in (y, z), once the head has nodded to meet a feeding hand (null: no mouth). */
function feedingMouth(p: Phenotype, parent: Int32Array, neck: number[]): [number, number] | null {
  const mouth = p.nodes.findIndex((n) => n.terminal === 'mouth');
  if (mouth < 0) return null;
  const pitch = new Float64Array(p.nodes.length);
  neck.forEach((i, k) => (pitch[i] = k === 0 ? FEED_NOD : GRAZE_CURL));
  const fk = planarFK(p, parent, pitch);
  return [fk.y[mouth], fk.z[mouth]];
}

function armPoseOf(p: Phenotype, chain: number[], legs: LegChain[], mouth: [number, number] | null): ArmPose {
  const S = p.nodes[chain[0]].pos;
  const hand = p.nodes[chain[chain.length - 1]];
  const H = hand.pos;
  const dy = H[1] - S[1];
  const dz = H[2] - S[2];
  const ground = legs.length ? Math.min(...legs.map((l) => p.nodes[l.nodes[l.nodes.length - 1]].pos[1] - p.nodes[l.nodes[l.nodes.length - 1]].radius)) : -Infinity;
  const elbow = Math.max(1, Math.min(chain.length - 2, Math.floor((chain.length - 1) / 2)));
  const pose: ArmPose = { shoulderH: S[1] - ground - hand.radius, reach: Math.hypot(dy, dz), psi0: Math.atan2(dz, -dy), elbow, feed: null };
  // feeding: two-link reach from the shoulder (upper arm to the elbow, forearm to the hand) to a point
  // just below and in front of the lips
  if (!mouth || hand.terminal !== 'hand' || chain.length < 3) return pose;
  const E = p.nodes[chain[elbow]].pos;
  const u = [E[1] - S[1], E[2] - S[2]];
  const v = [H[1] - E[1], H[2] - E[2]];
  const T = [mouth[0] - 0.6 * hand.radius - S[1], mouth[1] + 0.9 * hand.radius - S[2]];
  const L1 = Math.hypot(u[0], u[1]);
  const L2 = Math.hypot(v[0], v[1]);
  let D = Math.hypot(T[0], T[1]);
  // (a mouth far out of reach is no hand-feeder's; one a little out of reach is met as near as the
  // arm goes — the hand stops at the chin)
  if (L1 < 1e-6 || L2 < 1e-6 || D < 1e-6 || D > (L1 + L2) * FEED_STRETCH) return pose;
  const within = Math.min(Math.max(D, Math.abs(L1 - L2) * 1.02), (L1 + L2) * 0.98);
  T[0] *= within / D;
  T[1] *= within / D;
  D = within;
  // a pitch θ turns a (y, z) vector's polar angle atan2(z, y) by +θ; bend the elbow by b so the hand
  // is the right distance from the shoulder, then swing the whole arm by a onto the target
  const ang = (w: number[]) => Math.atan2(w[1], w[0]);
  const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
  const inner = Math.acos(Math.max(-1, Math.min(1, (D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2))));
  let best: [number, number] | null = null;
  let bestElbow = Infinity;
  for (const sgn of [1, -1]) {
    const b = wrap(ang(u) + sgn * inner - ang(v));
    const w = [u[0] + v[0] * Math.cos(b) - v[1] * Math.sin(b), u[1] + v[0] * Math.sin(b) + v[1] * Math.cos(b)];
    const a = wrap(ang(T) - ang(w));
    // the natural fold carries the elbow low (below the line from shoulder to hand)
    const elbowY = u[0] * Math.cos(a) - u[1] * Math.sin(a);
    if (elbowY < bestElbow) {
      bestElbow = elbowY;
      best = [a, b];
    }
  }
  pose.feed = best;
  return pose;
}

/**
 * A legless body's resting line (null when it is too short to lie in an S). The bends scale with the
 * body's slenderness: a snake thirty times longer than it is thick lies in a full S, a slug in none.
 */
function restLine(p: Phenotype, parent: Int32Array, trunk: number[], tails: number[][]): RestLine | null {
  const nT = trunk.length;
  if (nT < 4) return null;
  const dist = (a: number, b: number) => {
    const A = p.nodes[a].pos;
    const B = p.nodes[b].pos;
    return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
  };
  // the main tail: the longest chain hanging from the trunk's rear half
  let tail: number[] = [];
  let tailAt = 0;
  let tailLen = 0;
  for (const c of tails) {
    const at = trunk.indexOf(parent[c[0]]);
    if (at < 0 || at > nT / 2) continue;
    let L = dist(trunk[at], c[0]);
    for (let j = 1; j < c.length; j++) L += dist(c[j - 1], c[j]);
    if (L > tailLen) {
      tail = c;
      tailAt = at;
      tailLen = L;
    }
  }
  // arc positions along the line tail tip → trunk[tailAt] → … → trunk[nT − 1]
  const tailMid: number[] = []; // distance back from trunk[tailAt] to each tail link's midpoint
  let back = 0;
  for (let j = 0; j < tail.length; j++) {
    const d = dist(j ? tail[j - 1] : trunk[tailAt], tail[j]);
    tailMid.push(back + d / 2);
    back += d;
  }
  const trunkMid: number[] = []; // distance from trunk[tailAt] to each trunk link's midpoint
  let fwd = 0;
  for (let k = 0; k < nT - 1; k++) {
    const d = dist(trunk[k], trunk[k + 1]);
    trunkMid.push(k < tailAt ? 0 : fwd + d / 2);
    if (k >= tailAt) fwd += d;
  }
  const total = tailLen + fwd;
  if (total <= 0) return null;
  let girth = 0;
  for (const i of trunk) girth += 2 * p.nodes[i].radius * Math.max(p.nodes[i].scale?.[0] ?? 1, p.nodes[i].scale?.[1] ?? 1);
  girth /= nT;
  const slender = total / Math.max(girth, 1e-3);
  const amp = REST_BEND * smooth01((slender - 5) / 9);
  if (amp < 0.02) return null;
  // (each animal its own lie, from its seed: the same body always lies the same way)
  const h = (Math.imul(p.genomeRef.seed >>> 0, 2654435761) >>> 0) / 4294967296;
  return {
    trunkS: trunkMid.map((m) => (tailLen + m) / total),
    tail,
    tailS: tailMid.map((m) => (tailLen - m) / total),
    tailAt,
    amp,
    side: h < 0.5 ? 1 : -1,
    waves: 1 + 0.5 * ((h * 2) % 1),
  };
}

/** The resting S's heading at arc position s (0 tail tip … 1 head end), about the line's own axis. */
function restCurve(R: RestLine, amp: number, s: number): number {
  return R.side * amp * Math.cos(2 * Math.PI * R.waves * s - Math.PI * (R.waves - 1));
}

/**
 * The resting S as joint yaws (rad): `trunk[k]` for each trunk bone (bone 0 turns the whole body so
 * the S lies along the body's facing, the last bone sets the neck on the curve's end tangent), and
 * `tail[j]` for each bone of the main tail. The headings come from the curve sampled at each link's
 * midpoint; a joint's yaw is the change in heading across it.
 */
export function restBends(R: RestLine, amp: number, trunk: number[], tail: number[]): void {
  // the axis from tail tip to head end, so the S is centred on the way the body faces
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < 16; i++) {
    const t = restCurve(R, amp, (i + 0.5) / 16);
    sx += Math.sin(t);
    sz += Math.cos(t);
  }
  const axis = Math.atan2(sx, sz);
  const at = (s: number) => restCurve(R, amp, s) - axis;
  const nL = R.trunkS.length;
  // links behind the tail's root (a rump stub under the tail) ride along with it
  const rootHeading = at(R.trunkS[Math.min(R.tailAt, nL - 1)]);
  let prev = 0;
  for (let k = 0; k < nL; k++) {
    const want = k <= R.tailAt ? rootHeading : at(R.trunkS[k]);
    trunk[k] = want - prev;
    prev = want;
  }
  trunk[nL] = at(1) - prev;
  // the tail's first link turns with the trunk link it hangs from; each joint after bends to the curve
  let tprev = rootHeading;
  for (let j = 0; j < R.tail.length; j++) {
    if (j + 1 < R.tail.length) {
      const want = at(R.tailS[j + 1]);
      tail[j] = want - tprev;
      tprev = want;
    } else tail[j] = 0;
  }
}

const POSED = new WeakMap<Phenotype, Phenotype>();

/**
 * The phenotype lying in its resting S, for the views that draw a creature without a rig (the
 * litter's thumbnails, the bestiary): there a snake lay as straight as a stick. The rig's resting
 * bends are applied to the nodes themselves — positions and frames, down the tree — so its skin is
 * built along the curve at no extra cost. Every bend is a yaw, so the rotations compose by adding
 * angles. Returns the phenotype itself when it has no S to lie in. (Pure; cached per phenotype.)
 */
export function restPosed(p: Phenotype): Phenotype {
  const hit = POSED.get(p);
  if (hit) return hit;
  // (only a legless body lies in an S: a legged one skips the rig template altogether)
  if (p.nodes.some((n) => n.part?.kind === 'leg')) return p;
  const T = rigTemplate(p);
  const R = T.rest;
  if (!R) {
    POSED.set(p, p);
    return p;
  }
  const trunkYaw: number[] = [];
  const tailYaw: number[] = [];
  restBends(R, R.amp, trunkYaw, tailYaw);
  const yaw = new Float64Array(p.nodes.length);
  T.trunk.forEach((i, k) => (yaw[i] = trunkYaw[k] ?? 0));
  R.tail.forEach((i, j) => (yaw[i] = tailYaw[j] ?? 0));
  // parents before children: the tree's edges in breadth-first order from the roots
  const kids: number[][] = p.nodes.map(() => []);
  for (const [a, b] of p.edges) kids[a].push(b);
  const order: number[] = [];
  for (let i = 0; i < p.nodes.length; i++) if (T.parent[i] < 0) order.push(i);
  for (let h = 0; h < order.length; h++) order.push(...kids[order[h]]);
  const heading = new Float64Array(p.nodes.length); // each bone's world yaw (its own included)
  const nodes = p.nodes.map((n) => ({ ...n, pos: [...n.pos] as Vec3, quat: [...n.quat] as Quat4 }));
  for (const i of order) {
    const par = T.parent[i];
    const base = par >= 0 ? heading[par] : 0;
    heading[i] = base + yaw[i];
    if (par >= 0) {
      // the offset from the parent, turned by the parent's heading
      const o = p.nodes[i].pos;
      const q = p.nodes[par].pos;
      const dx = o[0] - q[0];
      const dz = o[2] - q[2];
      const c = Math.cos(base);
      const sn = Math.sin(base);
      const P = nodes[par].pos;
      nodes[i].pos = [P[0] + c * dx + sn * dz, P[1] + (o[1] - q[1]), P[2] - sn * dx + c * dz];
    }
    // the node's own frame turns halfway into its bend (a cross-section across the curve)
    const a = (base + 0.5 * yaw[i]) / 2;
    const ry: Quat4 = [0, Math.sin(a), 0, Math.cos(a)];
    nodes[i].quat = quatMul(ry, p.nodes[i].quat);
  }
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const n of nodes) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], n.pos[k] - n.radius);
      max[k] = Math.max(max[k], n.pos[k] + n.radius);
    }
  }
  const out: Phenotype = { nodes, edges: p.edges, bounds: { min, max }, genomeRef: p.genomeRef };
  POSED.set(p, out);
  return out;
}

type Quat4 = [number, number, number, number];
function quatMul(a: Quat4, b: Quat4): Quat4 {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
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
  // the TRUNK runs to the last section that carries legs: the trunk itself, or — an arthropod's —
  // the abdomen AND the thorax ahead of it (its legs hang from the thorax; were it counted as "neck",
  // a glance would swing all six legs round with the head)
  let legSeg = 0;
  p.nodes.forEach((_, i) => {
    const up = parent[i];
    if (roles[i] === 'leg' && up >= 0 && p.nodes[up].kind === 'spine') legSeg = Math.max(legSeg, p.nodes[up].segment ?? 0);
  });
  const trunk: number[] = [];
  const neck: number[] = [];
  p.nodes.forEach((nd, i) => {
    if (nd.kind !== 'spine') return;
    if ((nd.segment ?? 0) <= legSeg) trunk.push(i);
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
    // (a legless body's stride is its body wave's length: the wave then runs back along the body
    // exactly as fast as the body moves forward, so every part follows the head's path — at half the
    // trunk's length it ran a third as fast, and the body skated sideways over the ground)
    stride: legs.length ? Math.max(0.6, meanLeg * 1.6) : Math.max(0.8, ((2 * Math.PI) / SLITHER_K) * meanLink(p, trunk)),
    sprawl: legs.length >= 6 ? 1 : archedFrac > 0.5 ? 0.9 : 0.25,
    legless: legs.length === 0,
    gallops: legs.length === 4 && zs.length === 2 && archedFrac === 0,
    belly,
    graze: 0,
    grazeDip: 0,
    grazeShift: [0, 0],
    grazeRigid: false,
    rest: null,
    armPose: [],
  };

  // a hand that reaches the mouth feeds it; anything else — a theropod on its little arms — brings
  // its mouth down to the food
  tmpl.armPose = arms.map((chain) => armPoseOf(p, chain, legs, feedingMouth(p, parent, neck)));
  const g = solveGraze(p, parent, trunk, neck, legs, tmpl.armPose.some((a) => a.feed !== null));
  tmpl.graze = g.neck;
  tmpl.grazeDip = g.dip;
  tmpl.grazeShift = g.shift;
  tmpl.grazeRigid = g.rigid;
  if (tmpl.legless) tmpl.rest = restLine(p, parent, trunk, tails);
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
  /** scratch: this pose's resting-S joint yaws (trunk bones, main tail bones) */
  restT: number[];
  restTail: number[];
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
  return { template, bones, root, skeleton, rest, phase: 0, t: 0, wag: 0, trunkYaw: [], restT: [], restTail: [] };
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
  // The same primitives the hybrid skin was polygonized from: a vertex rides the bones of the
  // primitives it lies on, softly weighted by how close each is. (The edge list used to be rebuilt
  // here with a filter that missed the eyestalk tips, so on a stalk-eyed creature every primitive
  // after the first stalk was skinned to the wrong bone — the field now says which edge it came from.)
  const prims = buildFieldPrims(p, 'hybrid');
  const nc = prims.nc;
  const shaped: number[] = [];
  const included = new Set<number>();
  for (let m = 0; m < nc; m++) {
    included.add(prims.ia[m]);
    included.add(prims.ib[m]);
  }
  for (const i of included) if (p.nodes[i].scale) shaped.push(i);
  const n = nc + shaped.length;

  // per-primitive constants, once: its bone, its falloff, and a bounding sphere (centre + reach) whose
  // distance bounds the primitive's own from below — so a vertex only pays exact distances to the few
  // primitives that can matter (it used to pay every cone and allocate a Vector3, a Quaternion and a
  // Map per vertex)
  const bone = new Int32Array(n);
  const sig = new Float64Array(n);
  const cx = new Float64Array(n), cy = new Float64Array(n), cz = new Float64Array(n);
  const reach = new Float64Array(n);
  const minR = new Float64Array(n);
  const inv: THREE.Quaternion[] = [];
  for (let m = 0; m < nc; m++) {
    const r = Math.max(prims.ra[m], prims.rb[m]);
    bone[m] = prims.ia[m] + 1;
    sig[m] = 0.05 + 0.22 * r;
    cx[m] = prims.cx[m]; cy[m] = prims.cy[m]; cz[m] = prims.cz[m];
    reach[m] = prims.hl[m] + r;
  }
  for (let s = 0; s < shaped.length; s++) {
    const nd = p.nodes[shaped[s]];
    const sc = nd.scale!;
    const m = nc + s;
    bone[m] = shaped[s] + 1;
    sig[m] = 0.05 + 0.22 * nd.radius;
    cx[m] = nd.pos[0]; cy[m] = nd.pos[1]; cz[m] = nd.pos[2];
    reach[m] = nd.radius * Math.max(sc[0], sc[1], sc[2]);
    minR[m] = nd.radius * Math.min(sc[0], sc[1], sc[2]);
    inv.push(new THREE.Quaternion(nd.quat[0], nd.quat[1], nd.quat[2], nd.quat[3]).invert());
  }
  const q = new THREE.Vector3();
  const exact = (m: number, x: number, y: number, z: number): number => {
    if (m < nc) return roundConeDist(x, y, z, prims.ax[m], prims.ay[m], prims.az[m], prims.bx[m], prims.by[m], prims.bz[m], prims.ra[m], prims.rb[m]);
    const s = m - nc;
    const nd = p.nodes[shaped[s]];
    const sc = nd.scale!;
    q.set(x - nd.pos[0], y - nd.pos[1], z - nd.pos[2]).applyQuaternion(inv[s]);
    const rx = nd.radius * sc[0], ry = nd.radius * sc[1], rz = nd.radius * sc[2];
    return (Math.hypot(q.x / rx, q.y / ry, q.z / rz) - 1) * minR[m];
  };
  // a lower bound on primitive m's distance from its bounding sphere (an ellipsoid's distance is
  // scaled by its shortest semi-axis, so its bound is too)
  const lower = (m: number, d: number): number => (m < nc ? d - reach[m] : (d / reach[m] - 1) * minR[m]);

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nV = pos.count;
  const skinIndex = new Uint16Array(nV * 4);
  const skinWeight = new Float32Array(nV * 4);
  const lb = new Float64Array(n);
  const dist = new Float64Array(n);
  const acc = new Float64Array(p.nodes.length + 1); // per-bone weight (bones are node index + 1)
  const touched: number[] = [];
  const topB = [0, 0, 0, 0];
  const topW = [0, 0, 0, 0];
  for (let v = 0; v < nV; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    let first = 0;
    for (let m = 0; m < n; m++) {
      const dx = x - cx[m], dy = y - cy[m], dz = z - cz[m];
      lb[m] = lower(m, Math.sqrt(dx * dx + dy * dy + dz * dz));
      dist[m] = NaN;
      if (lb[m] < lb[first]) first = m;
    }
    // the nearest primitive: start from the likeliest, then only those whose bound can beat it
    let dmin = (dist[first] = exact(first, x, y, z));
    for (let m = 0; m < n; m++) {
      if (m === first || lb[m] >= dmin) continue;
      const d = (dist[m] = exact(m, x, y, z));
      if (d < dmin) dmin = d;
    }
    touched.length = 0;
    for (let m = 0; m < n; m++) {
      if (lb[m] - dmin > sig[m] * 4) continue; // can't contribute
      const d = Number.isNaN(dist[m]) ? exact(m, x, y, z) : dist[m];
      const dd = d - dmin;
      if (dd > sig[m] * 4) continue;
      const b = bone[m];
      if (acc[b] === 0) touched.push(b);
      acc[b] += Math.exp(-dd / sig[m]);
    }
    // the four heaviest bones
    let k = 0;
    for (const b of touched) {
      const w = acc[b];
      acc[b] = 0;
      let j = k < 4 ? k++ : 4;
      if (j === 4 && w <= topW[3]) continue;
      if (j === 4) j = 3;
      while (j > 0 && topW[j - 1] < w) {
        topB[j] = topB[j - 1];
        topW[j] = topW[j - 1];
        j--;
      }
      topB[j] = b;
      topW[j] = w;
    }
    if (k === 0) {
      // no primitive at all (a one-node blob): ride node 0's bone
      topB[0] = 1;
      topW[0] = 1;
      k = 1;
    }
    let sum = 0;
    for (let j = 0; j < k; j++) sum += topW[j];
    for (let j = 0; j < 4; j++) {
      skinIndex[v * 4 + j] = j < k ? topB[j] : 0;
      skinWeight[v * 4 + j] = j < k ? topW[j] / (sum || 1) : 0;
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

/** a dead arthropod's leg curl at the hip, knee and next joint (rad; + folds the leg down and in) */
const DEAD_CURL = [0.35, 0.75, 0.3];

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
    if (L.arched) {
      // an arthropod dies with its legs curled in beneath it (its flexors win): each joint folds down
      // and inward in the leg's own vertical plane — about Y × the leg's reach
      const reach = new THREE.Vector3();
      for (let j = 1; j < L.nodes.length; j++) reach.add(r.bones[L.nodes[j]].position);
      const axis = new THREE.Vector3(reach.z, 0, -reach.x).normalize();
      L.nodes.slice(0, 3).forEach((i, j) => r.bones[i].quaternion.setFromAxisAngle(axis, DEAD_CURL[j]));
      continue;
    }
    const fold = L.fore ? [0.2, 0.35, -0.25] : [0.3, 0.55, -0.35];
    L.nodes.slice(0, 3).forEach((i, j) => setRot(r.bones[i], fold[j], 0, 0));
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
  // At rest a slitherer lies in a loose S (stretched dead straight it read as a stick); the bends
  // fade as it sets off and its travelling wave takes over, and asleep it coils a little tighter.
  // (Not a swimmer: a fish hangs in the water straight.)
  const R = inp.swim ? null : T.rest;
  const restAmp = R ? R.amp * (1 - moving) * (1 + 0.25 * inp.sleep) * grounded : 0;
  if (R && restAmp > 1e-3) restBends(R, restAmp, r.restT, r.restTail);
  const restOn = R !== null && restAmp > 1e-3;
  if (restOn) setRot(r.bones[T.trunk[0]], 0, r.restT[0], 0);
  // the trunk's accumulated yaw at each of its nodes: the legs undo it at their hips, so a swaying
  // sprawler's planted feet hold the ground while the body wiggles between them
  if (r.trunkYaw.length !== nT) r.trunkYaw = new Array(nT).fill(0);
  r.trunkYaw[0] = restOn ? r.restT[0] : 0;
  // (a two-legged feeder see-saws about its hips: the body is carried back as it tips — see solveGraze)
  if (nT > 0) {
    const rootBone = r.bones[T.trunk[0]];
    const home = r.rest[T.trunk[0]];
    const tip = inp.eat * awake;
    rootBone.position.set(home.x, home.y + T.grazeShift[0] * tip, home.z + T.grazeShift[1] * tip);
    if (!restOn) setRot(rootBone, T.grazeRigid ? T.grazeDip * tip : 0, 0, 0);
  }
  for (let k = 1; k < nT; k++) {
    const u = k / Math.max(1, nT - 1);
    let yaw = 0;
    // a slitherer throws big S-curves down its whole length; a swimmer's wave grows toward the tail
    // (both waves run BACK along the body, head to tail — the push that drives it forward; run the
    // other way, a snake or a fish undulated like it was moonwalking)
    if (T.legless && !inp.swim) yaw = 0.42 * moving * Math.sin(P + k * SLITHER_K);
    else if (wave) yaw = 0.24 * moving * Math.sin(P + k * SWIM_K) * (0.35 + 0.65 * (1 - u));
    else yaw = 0.05 * T.sprawl * moving * Math.sin(P - k * 0.8);
    yaw -= inp.turn * 0.06 * awake; // lean into turns
    // galloping, the back coils as the legs gather under the body and stretches as they reach out
    const flex = k === Math.max(1, Math.floor(nT / 2)) ? 0.2 * gal * moving * Math.sin(P + 0.6) : 0;
    // feeding, a long-legged grazer tips its chest down toward the grass (spread over the trunk's
    // joints, so the back curves rather than kinking at one; the legs fold to keep their feet planted)
    const dip = T.grazeRigid ? 0 : (T.grazeDip * inp.eat * awake) / Math.max(1, nT - 1);
    const lie = restOn ? r.restT[k] : 0;
    setRot(r.bones[T.trunk[k]], flex * awake + dip, yaw * awake + lie, 0);
    r.trunkYaw[k] = r.trunkYaw[k - 1] + yaw * awake + lie;
  }
  // idle: a slow look around (two incommensurate waves, so the glances never settle into a loop),
  // a breath that lifts the chest, and a lazy weight shift
  const idle = (inp.idle ?? 0) * awake;
  const glance = idle * (0.32 * Math.sin(r.t * 0.42) + 0.16 * Math.sin(r.t * 1.07 + 1.3));
  const nod = idle * 0.07 * Math.sin(r.t * 0.61 + 0.4);
  // (asleep it breathes slower and deeper: the flank rises and falls while all else is still)
  const sleeping = inp.sleep * (1 - fly);
  if ((idle > 0 || sleeping > 0) && nT > 0) {
    const chest = r.bones[T.trunk[nT - 1]];
    const breath = 1 + idle * 0.014 * Math.sin(r.t * 1.6) + sleeping * 0.03 * Math.sin(r.t * 0.95);
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
      const fold = L.sleepLast * inp.sleep; // the leg swings up to keep its foot on the floor as the body lies down
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
  // arms swing opposite the legs; lying down, an arm that reaches the floor swings forward to rest
  // its hand on it; feeding, one hand at a time carries the food up to the mouth and goes back for more
  const drop = T.belly * SLEEP_DROP * inp.sleep;
  const feeding = inp.eat * awake * (1 - moving);
  const bite = (r.t * FEED_RATE) / (2 * Math.PI);
  const lift = feeding > 0 ? feeding * (0.5 - 0.5 * Math.cos(r.t * FEED_RATE)) : 0;
  r.template.arms.forEach((chain, n) => {
    const side = r.bones[chain[0]].position.x >= 0 ? 1 : -1;
    const A = T.armPose[n];
    const feed = lift > 0 && A.feed && (Math.floor(bite) + n) % 2 === 0 ? A.feed : null;
    setRot(r.bones[chain[0]], -0.3 * moving * Math.sin(P + (side > 0 ? 0 : Math.PI)) * awake + armLie(A, drop) + (feed ? feed[0] * lift : 0), 0, 0);
    if (feed) setRot(r.bones[chain[A.elbow]], feed[1] * lift, 0, 0);
  });
  // tails sway (a slow wag; a swimmer's tail drives the stroke). A resting slitherer's tail carries
  // on its S, lying still but for the tip's idle flick.
  for (const chain of T.tails) {
    const lying = restOn && chain === R!.tail;
    const still = lying ? restAmp / Math.max(R!.amp, 1e-3) : 0;
    for (let j = 0; j < chain.length; j++) {
      const amp = ((inp.swim || T.legless ? 0.28 * (0.4 + moving) : 0.08 + 0.1 * moving) * (1 - 0.7 * fly) + 0.22 * show) * (1 - 0.8 * stalk);
      const u = j / Math.max(1, chain.length - 1);
      const flick = lying ? 1 - Math.min(1, still) * (1 - 0.3 * u * u) : 1;
      // a swimmer's or a slitherer's tail carries the body wave on toward its tip; any other tail wags
      // on its own clock
      const waveK = inp.swim ? SWIM_K : SLITHER_K;
      const yaw = amp * flick * Math.sin(inp.swim || T.legless ? P - (j + 1) * waveK : r.wag + P * 0.5 - j * 0.8);
      // a displaying tail is raised (−pitch lifts it), each link a little more — a flag, not a droop
      setRot(r.bones[chain[j]], -0.08 * inp.sleep - 0.1 * fly - 0.32 * show, yaw * awake + (lying ? r.restTail[j] : 0), 0);
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
