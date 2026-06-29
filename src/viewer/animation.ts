/**
 * Procedural creature motion (DESIGN §6.4, M5) — pure math, no three.js.
 *
 * A topology-free deformation of the skeleton node positions: a traveling sine wave
 * along the body (undulation — strong for serpents, gentle for legged bodies) plus a
 * phased leg gait (nodes below the body lift and swing). Kept here, separate from the
 * React/three render code, so it's unit-testable headlessly. CreatureMesh calls
 * `buildRig` once per creature and `computeAnim` each frame.
 */
import type { MeshData } from './meshData';

export interface Rig {
  n: number;
  base: Float32Array; // 3*n base node positions
  anim: Float32Array; // 3*n reused scratch for the animated positions
  tailNorm: Float32Array; // 0 at head-most z … 1 at tail-most (tail sways more)
  k: number; // wavenumber of the undulation
  omega: number; // angular speed (rad/s)
  waveAmp: number; // lateral amplitude
  centerZ: number;
  legThreshY: number; // nodes below this count as legs
  legLift: number;
  legSwing: number;
}

export function buildRig(data: MeshData): Rig {
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

  const legCount = data.features.filter((f) => f.type === 'foot' || f.type === 'claw').length;
  const cy = data.center[1];
  const height = data.size[1];

  return {
    n,
    base,
    anim: new Float32Array(n * 3),
    tailNorm,
    k: (Math.PI * 2 * 1.2) / lengthZ,
    omega: 2.2,
    // legged creatures undulate less (they walk); legless ones slither more
    waveAmp: legCount >= 4 ? Math.min(0.3, 0.05 * lengthZ) : Math.min(0.6, 0.09 * lengthZ),
    centerZ: data.center[2],
    legThreshY: cy - 0.18 * height,
    legLift: 0.13,
    legSwing: 0.1,
  };
}

/** Fill `rig.anim` with the node positions at time `t` (seconds) and return it. */
export function computeAnim(rig: Rig, t: number): Float32Array {
  const { n, base, anim, tailNorm, k, omega, waveAmp, centerZ, legThreshY, legLift, legSwing } = rig;
  for (let i = 0; i < n; i++) {
    const x = base[i * 3];
    const y = base[i * 3 + 1];
    const z = base[i * 3 + 2];
    const lateral = waveAmp * (0.3 + 0.7 * tailNorm[i]) * Math.sin(omega * t - k * z);
    let ny = y;
    let nz = z;
    if (y < legThreshY) {
      const phase = (x >= 0 ? 0 : Math.PI) + (z >= centerZ ? 0 : Math.PI); // diagonal gait
      const s = Math.sin(omega * t + phase);
      ny += legLift * Math.max(0, s);
      nz += legSwing * s;
    }
    anim[i * 3] = x + lateral;
    anim[i * 3 + 1] = ny;
    anim[i * 3 + 2] = nz;
  }
  return anim;
}
