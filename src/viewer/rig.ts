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
 *     biped's alternation, a quadruped's diagonal trot, and a hexapod's/spider's alternating tripods.
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
  arched: boolean; // arthropod arch (knee above hip)
  offset: number; // gait phase offset (0..1)
  length: number; // hip→foot reach (bu)
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
  stride: number; // bu per gait cycle
  sprawl: number; // 0 upright mammal … 1 sprawling / arthropod (spine sway amplitude)
  legless: boolean;
}

const TEMPLATES = new WeakMap<Phenotype, RigTemplate>();

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
        arched: chain.length >= 3 && p.nodes[chain[1]].pos[1] > hip.pos[1] + 1e-3,
        offset: 0,
        length: Math.hypot(foot.pos[0] - hip.pos[0], foot.pos[1] - hip.pos[1], foot.pos[2] - hip.pos[2]),
      });
    } else if (r === 'tail') tails.push(chainOf(i));
    else if (r === 'arm') arms.push(chainOf(i));
    else if (r === 'fin' || r === 'tentacle' || (r === 'other' && nd.part?.kind === 'antenna')) others.push(chainOf(i));
  });
  // pairs front → back by hip z; the trot/tripod rule sets each leg's phase
  const zs = [...new Set(legs.map((l) => Math.round(p.nodes[l.nodes[0]].pos[2] * 20) / 20))].sort((a, b) => b - a);
  for (const l of legs) {
    const z = Math.round(p.nodes[l.nodes[0]].pos[2] * 20) / 20;
    l.pair = zs.indexOf(z);
    l.offset = 0.5 * ((l.pair + (l.side > 0 ? 1 : 0)) % 2);
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
  };
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
  return { template, bones, root, skeleton, rest, phase: 0, t: 0 };
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

export function poseRig(r: RigInstance, inp: PoseInput): void {
  const T = r.template;
  r.t += inp.dt;
  const fly = inp.fly ?? 0;
  const grounded = 1 - fly;
  // airborne, the legs don't stride (the airspeed would spin the gait clock) — they fold up
  const moving = Math.min(1, inp.speed / Math.max(0.2, inp.cruise * 0.35)) * grounded;
  r.phase = (r.phase + (inp.speed * grounded * inp.dt) / T.stride) % 1;
  const P = r.phase * Math.PI * 2;
  const awake = 1 - inp.sleep;
  const show = (inp.display ?? 0) * awake;
  const stalk = (inp.stalk ?? 0) * awake;
  const strut = show * Math.sin(r.t * 5.2); // the display's rhythm

  for (const b of r.bones) b.quaternion.identity();

  // trunk: lateral undulation (sprawlers sway, slitherers/swimmers send a wave down the body)
  const nT = T.trunk.length;
  const wave = T.legless || inp.swim;
  for (let k = 1; k < nT; k++) {
    const u = k / Math.max(1, nT - 1);
    let yaw = 0;
    // a slitherer throws big S-curves down its whole length; a swimmer's wave grows toward the tail
    if (T.legless && !inp.swim) yaw = 0.42 * moving * Math.sin(P - k * 0.95);
    else if (wave) yaw = 0.24 * moving * Math.sin(P - k * 1.1) * (0.35 + 0.65 * (1 - u));
    else yaw = 0.05 * T.sprawl * moving * Math.sin(P - k * 0.8);
    yaw -= inp.turn * 0.06 * awake; // lean into turns
    setRot(r.bones[T.trunk[k]], 0, yaw * awake, 0);
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
    const pitch = (first ? 0.55 * inp.eat + 0.35 * inp.sleep - 0.12 * fly - 0.32 * show + 0.35 * stalk : 0.12 * inp.eat - 0.08 * show - 0.25 * stalk) + bob * (1 - stalk) + 0.1 * strut;
    // the glance is shared down the neck so the head turns smoothly rather than at one joint
    const look = (first ? -inp.turn * 0.12 : 0) + glance / Math.max(1, T.neck.length);
    setRot(r.bones[T.neck[k]], pitch + (first ? nod : 0), look * awake, 0);
  }
  // legs
  for (const L of T.legs) {
    const ph = P + L.offset * Math.PI * 2;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const hip = r.bones[L.nodes[0]];
    // Convention: a positive hip angle carries the foot BACKWARD (the stance stroke, while it is
    // planted and the body passes over it); the angle falls while the foot swings forward through the
    // air, i.e. while cos(ph) < 0 — that is when the leg lifts.
    const swingPhase = Math.max(0, -c);
    if (L.arched) {
      // sweep fore-aft about the vertical (yaw ×side so both flanks agree on "backward"), and lift on
      // the forward stroke by rolling the leg up about the body axis (+Z roll raises the +X side)
      const sweep = 0.32 * moving * s * L.side;
      const lift = 0.3 * moving * swingPhase;
      const fold = 0.45 * inp.sleep; // feet draw up under a resting body
      setRot(hip, 0, sweep * awake, L.side * (lift * awake + fold));
    } else {
      // swing fore-aft at the hip; flex the knee (shin back and up) through the swing phase. In flight
      // the legs trail back along the belly with the feet folded up under the tail.
      const swing = 0.42 * moving * s * awake * (1 - 0.35 * stalk);
      const tuck = inp.sleep * 0.9;
      // a stalker creeps on flexed legs (hip forward, knee folded): the body rides low
      setRot(hip, swing - tuck * 0.5 + 0.95 * fly - 0.28 * stalk, 0, 0);
      if (L.nodes.length > 1) {
        const knee = r.bones[L.nodes[1]];
        setRot(knee, 0.6 * moving * swingPhase * awake + tuck * 1.1 + 0.7 * fly + 0.5 * stalk, 0, 0);
      }
      if (L.nodes.length > 2) {
        const ankle = r.bones[L.nodes[2]];
        setRot(ankle, -0.35 * moving * swingPhase * awake - tuck * 0.5, 0, 0);
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
      const yaw = amp * Math.sin((inp.swim ? P : r.t * (1.3 + 4 * show) + P * 0.5) - j * 0.8);
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
