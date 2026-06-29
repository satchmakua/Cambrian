/**
 * Procedural creature motion (DESIGN §6.4, MORPHOLOGY §8 — M13) — pure math, no three.js.
 *
 * A topology-free deformation of the skeleton node positions, chosen by the creature's own
 * morphology so each kind moves *in character*: a fish swims (caudal body wave + fin sway),
 * a crab scuttles (many-leg metachronal ripple), a bird flaps (wing beat + body bob), a
 * serpent slithers (strong lateral wave). One of eight **motion styles** is picked from leg/
 * fin/wing/tentacle counts + elongation + symmetry; each parameterizes a shared set of
 * additive oscillation terms applied per-node by **role** (spine / leg / wing / fin / tail /
 * tentacle). Kept separate from the React/three render so it stays unit-testable headlessly.
 * `grow()` stays static & deterministic — motion is purely a viewer concern.
 */
import type { MeshData } from './meshData';
import type { Phenotype } from '../engine/grow';

export type MotionStyle = 'walk' | 'swim' | 'slither' | 'scuttle' | 'flap' | 'drift' | 'ooze';

// per-node roles (drive which oscillation terms apply)
const SPINE = 0;
const LEG = 1;
const WING = 2;
const FIN = 3;
const TAIL = 4;
const TENT = 5;

// leg gait phasing
type Gait = 'diagonal' | 'metachronal' | 'together';

export interface Rig {
  n: number;
  base: Float32Array; // 3*n base node positions
  anim: Float32Array; // 3*n reused scratch for the animated positions
  role: Uint8Array; // per-node role
  tailNorm: Float32Array; // 0 at head-most z … 1 at tail-most (the wave grows toward the tail)
  limbNorm: Float32Array; // 0 at a limb's base … 1 at its tip (so tips swing most)
  style: MotionStyle;
  gait: Gait;
  centerX: number;
  centerZ: number;
  minZ: number;
  lengthZ: number;
  k: number; // wavenumber of the body wave
  omega: number; // angular speed (rad/s)
  // term amplitudes (any may be 0 for a given style)
  waveAmp: number; // lateral body wave (X)
  legLift: number; // leg vertical lift (Y)
  legSwing: number; // leg fore/aft swing (Z)
  bobAmp: number; // whole-body vertical bob (Y)
  flapAmp: number; // wing beat (Y)
  finAmp: number; // fin flutter (Y)
  tentAmp: number; // tentacle sway (X/Y)
  pulseAmp: number; // mantle / ooze pulse (Y)
  maxDisp: number; // upper bound on |anim − base| per axis (the sum of all term amplitudes)
}

export function buildRig(data: MeshData, phenotype?: Phenotype): Rig {
  const n = data.nodes.length;
  const base = new Float32Array(n * 3);
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = data.nodes[i].pos;
    base[i * 3] = p[0];
    base[i * 3 + 1] = p[1];
    base[i * 3 + 2] = p[2];
    if (p[2] < minZ) minZ = p[2];
    if (p[2] > maxZ) maxZ = p[2];
  }
  const lengthZ = Math.max(maxZ - minZ, 0.5);
  const tailNorm = new Float32Array(n);
  for (let i = 0; i < n; i++) tailNorm[i] = (base[i * 3 + 2] - minZ) / lengthZ;

  // per-node role + a normalized distance along each limb (tips swing most)
  const role = new Uint8Array(n);
  const limbNorm = new Float32Array(n);
  const radial = phenotype?.genomeRef.symmetry === 'radial';
  let legLimbs = 0;
  let finParts = 0;
  let hasWings = false;
  let hasTentacles = false;
  let trunkLen = 0; // spine-chain length — the size-invariant "how long is the body" signal

  if (phenotype) {
    for (let i = 0; i < n; i++) {
      const node = phenotype.nodes[i];
      const kind = node.part?.kind;
      const term = node.terminal;
      if (node.kind === 'spine') trunkLen++;
      if (kind === 'leg' || term === 'foot' || term === 'pincer') {
        role[i] = LEG;
        if (term && term !== 'none') legLimbs++;
      } else if (kind === 'wing') {
        role[i] = WING;
        hasWings = true;
      } else if (kind === 'fin' || term === 'fin') {
        role[i] = FIN;
        if (term && term !== 'none') finParts++;
      } else if (kind === 'tail') {
        role[i] = TAIL;
      } else if (kind === 'tentacle') {
        role[i] = TENT;
        hasTentacles = true;
      } else {
        role[i] = SPINE;
      }
    }
    // limbNorm: distance from the body along each limb chain, via the parent edges
    const depth = new Float32Array(n).fill(-1);
    const childOf = new Int32Array(n).fill(-1);
    for (const [a, b] of phenotype.edges) childOf[b] = a;
    for (let i = 0; i < n; i++) {
      if (role[i] === SPINE || role[i] === TAIL) {
        limbNorm[i] = 0;
        continue;
      }
      let d = 0;
      let j = i;
      while (j >= 0 && role[j] !== SPINE && role[j] !== TAIL && d < 16) {
        j = childOf[j];
        d++;
      }
      depth[i] = d;
    }
    // normalize per connected limb by the max depth seen
    let maxD = 1;
    for (let i = 0; i < n; i++) if (depth[i] > maxD) maxD = depth[i];
    for (let i = 0; i < n; i++) if (depth[i] >= 0) limbNorm[i] = Math.min(1, depth[i] / maxD);
  } else {
    // fallback (no phenotype): classify "leg" nodes by height, as the M5 rig did
    const cy = data.center[1];
    const h = data.size[1];
    const thresh = cy - 0.18 * h;
    for (let i = 0; i < n; i++) role[i] = base[i * 3 + 1] < thresh ? LEG : SPINE;
  }

  const elong = lengthZ / Math.max((data.size[0] + data.size[1]) / 2, 0.1);
  const height = Math.max(data.size[1], 0.3);
  const style = pickStyle({ radial, legLimbs, finParts, hasWings, hasTentacles, elong, trunkLen });

  const rig: Rig = {
    n,
    base,
    anim: new Float32Array(n * 3),
    role,
    tailNorm,
    limbNorm,
    style,
    gait: 'diagonal',
    centerX: data.center[0],
    centerZ: data.center[2],
    minZ,
    lengthZ,
    k: (Math.PI * 2 * 1.1) / lengthZ,
    omega: 2.2,
    waveAmp: 0,
    legLift: 0,
    legSwing: 0,
    bobAmp: 0,
    flapAmp: 0,
    finAmp: 0,
    tentAmp: 0,
    pulseAmp: 0,
    maxDisp: 0,
  };
  applyStyleParams(rig, { elong, height });
  rig.maxDisp =
    rig.waveAmp + rig.legLift + rig.legSwing + rig.bobAmp + rig.flapAmp + rig.finAmp + rig.tentAmp + rig.pulseAmp + 1e-6;
  return rig;
}

interface Cues {
  radial: boolean;
  legLimbs: number;
  finParts: number;
  hasWings: boolean;
  hasTentacles: boolean;
  elong: number;
  trunkLen: number;
}

function pickStyle(c: Cues): MotionStyle {
  if (c.radial || c.hasTentacles) return 'drift';
  if (c.hasWings) return 'flap';
  if (c.legLimbs >= 6) return 'scuttle';
  if (c.legLimbs === 0) {
    if (c.finParts > 0) return 'swim';
    // a long trunk (or a stretched bbox) slithers; a stubby legless blob just oozes
    if (c.trunkLen >= 8 || c.elong > 2.4) return 'slither';
    return 'ooze';
  }
  return 'walk';
}

function applyStyleParams(rig: Rig, m: { elong: number; height: number }): void {
  const L = rig.lengthZ;
  const H = m.height;
  switch (rig.style) {
    case 'slither':
      rig.omega = 2.4;
      rig.k = (Math.PI * 2 * 1.3) / L;
      rig.waveAmp = Math.min(0.6, 0.09 * L);
      break;
    case 'swim':
      rig.omega = 1.9;
      rig.k = (Math.PI * 2 * 1.1) / L;
      rig.waveAmp = Math.min(0.4, 0.07 * L); // caudal — biased toward the tail in computeAnim
      rig.finAmp = 0.08;
      rig.bobAmp = 0.02;
      break;
    case 'scuttle':
      rig.omega = 3.2; // quick
      rig.gait = 'metachronal';
      rig.waveAmp = Math.min(0.05, 0.015 * L);
      rig.legLift = 0.08;
      rig.legSwing = 0.12;
      break;
    case 'flap':
      rig.omega = 2.6;
      rig.flapAmp = Math.min(0.4, 0.55 * H);
      rig.bobAmp = Math.min(0.12, 0.18 * H);
      rig.waveAmp = Math.min(0.04, 0.012 * L);
      break;
    case 'drift':
      rig.omega = 1.4;
      rig.tentAmp = Math.min(0.28, 0.07 * L);
      rig.pulseAmp = Math.min(0.08, 0.05 * H);
      break;
    case 'ooze':
      rig.omega = 1.2;
      rig.waveAmp = Math.min(0.08, 0.03 * Math.max(L, H));
      rig.pulseAmp = Math.min(0.07, 0.06 * H);
      break;
    case 'walk':
    default: {
      rig.omega = 2.2;
      rig.k = (Math.PI * 2 * 1.0) / L;
      rig.gait = 'diagonal';
      rig.waveAmp = Math.min(0.18, 0.04 * L);
      rig.legLift = 0.13;
      rig.legSwing = 0.1;
      // compact bodies bound/scurry (a vertical bob); long ones glide
      rig.bobAmp = Math.min(0.06, 0.05 / Math.max(m.elong, 0.6));
      break;
    }
  }
}

/** Fill `rig.anim` with the node positions at time `t` (seconds) and return it. */
export function computeAnim(rig: Rig, t: number): Float32Array {
  const {
    n, base, anim, role, tailNorm, limbNorm, gait,
    centerX, centerZ, minZ, lengthZ,
    k, omega, waveAmp, legLift, legSwing, bobAmp, flapAmp, finAmp, tentAmp, pulseAmp,
  } = rig;
  const phase = omega * t;
  const bob = bobAmp * Math.sin(phase);
  const pulse = pulseAmp * Math.sin(phase * 0.8);

  for (let i = 0; i < n; i++) {
    const x = base[i * 3];
    const y = base[i * 3 + 1];
    const z = base[i * 3 + 2];
    const r = role[i];
    let dx = 0;
    let dy = 0;
    let dz = 0;

    // body wave (lateral) — spine, tail and fins ride it; tail end sways most
    if (waveAmp > 0 && r !== LEG && r !== WING) {
      // bias ≤ 1 so |dx| ≤ waveAmp (keeps the per-axis bound = maxDisp); the tail sways most
      const bias = r === TAIL ? 0.5 + 0.5 * tailNorm[i] : 0.3 + 0.7 * tailNorm[i];
      dx += waveAmp * bias * Math.sin(phase - k * z);
    }

    if (r === LEG && (legLift > 0 || legSwing > 0)) {
      let p: number;
      if (gait === 'metachronal') p = (x >= centerX ? 0 : Math.PI) + (Math.PI * 2 * (z - minZ)) / lengthZ;
      else if (gait === 'together') p = 0;
      else p = (x >= centerX ? 0 : Math.PI) + (z >= centerZ ? 0 : Math.PI); // diagonal
      const s = Math.sin(phase + p);
      const w = 0.35 + 0.65 * limbNorm[i]; // the foot swings more than the hip
      dy += legLift * Math.max(0, s) * w;
      dz += legSwing * s * w;
    } else if (r === WING && flapAmp > 0) {
      dy += flapAmp * Math.sin(phase) * (0.4 + 0.6 * limbNorm[i]); // wing-tips beat most
    } else if (r === FIN && finAmp > 0) {
      dy += finAmp * Math.sin(phase * 1.3 + z * 2.0) * (0.4 + 0.6 * limbNorm[i]);
    } else if (r === TENT && tentAmp > 0) {
      const tp = phase + limbNorm[i] * 3.0; // a wave travels down each tentacle
      dx += tentAmp * Math.sin(tp) * limbNorm[i];
      dy += tentAmp * 0.6 * Math.cos(tp) * limbNorm[i];
    }

    dy += bob + pulse;

    anim[i * 3] = x + dx;
    anim[i * 3 + 1] = y + dy;
    anim[i * 3 + 2] = z + dz;
  }
  return anim;
}
