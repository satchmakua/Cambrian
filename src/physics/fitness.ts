/**
 * Physics fitness (DESIGN §6.2, ROADMAP M6, stretch) — evolve creatures that *move*.
 *
 * A Karl-Sims-flavoured loop: build the skeleton as a jointed ragdoll in Rapier (a rigid body
 * per node, a spherical joint per edge), drive it with an oscillating "muscle" torque, drop it
 * on a floor, and measure how far its centre of mass travels. Selection keeps the movers.
 *
 * Rapier (`@dimforge/rapier3d-deterministic-compat`, the cross-platform deterministic build) is
 * **lazy-loaded** — the dynamic `import()` keeps the multi-MB WASM out of the main bundle until
 * physics is actually run. The simulation is deterministic (fixed timestep, deterministic build,
 * seed-derived muscle phases), so a run replays exactly from (genome, streamSeed). This whole
 * module is an adapter — the pure engine never imports it.
 */
import type { Phenotype } from '../engine/grow';
import type { Genome } from '../engine/genome';
import { grow } from '../engine/grow';
import { mix32 } from '../engine/rng';
import { breederOffspring } from '../engine/selection';

type Rapier = typeof import('@dimforge/rapier3d-deterministic-compat');

let rapierPromise: Promise<Rapier> | null = null;
/** Lazily load + init Rapier (memoized). The dynamic import code-splits the WASM out of the bundle. */
export function loadRapier(): Promise<Rapier> {
  if (!rapierPromise) {
    rapierPromise = import('@dimforge/rapier3d-deterministic-compat').then(async (R) => {
      await R.init();
      return R;
    });
  }
  return rapierPromise;
}

export interface FitnessOptions {
  steps?: number; // simulation steps (default 240 = 4s @ 60 Hz)
  driveHz?: number; // muscle oscillation frequency
  driveAmp?: number; // muscle torque-impulse amplitude
}

// collision groups (membership<<16 | filter): creature parts collide with the GROUND only, never
// each other — the capsule-union heavily overlaps, so self-collision would explode the sim.
const G_GROUND = 0x0001_0002;
const G_CREATURE = 0x0002_0001;

/** Drop the creature, drive its muscles, and return how far its centre of mass travels (bu). */
export async function simulateDistance(p: Phenotype, opts: FitnessOptions = {}): Promise<number> {
  const R = await loadRapier();
  const steps = opts.steps ?? 240;
  const hz = opts.driveHz ?? 1.1;
  const amp = opts.driveAmp ?? 10; // torque per unit mass (N·m/kg); applied as a τ·dt impulse
  const dt = 1 / 60;

  const world = new R.World(new R.Vector3(0, -9.81, 0));
  world.timestep = dt;

  // ground plane
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(R.ColliderDesc.cuboid(120, 0.5, 120).setFriction(1).setCollisionGroups(G_GROUND), ground);

  // lift the creature so its lowest point starts just above the floor; record the start COM (xz)
  let minY = Infinity;
  let comX0 = 0;
  let comZ0 = 0;
  for (const n of p.nodes) {
    minY = Math.min(minY, n.pos[1] - n.radius);
    comX0 += n.pos[0];
    comZ0 += n.pos[2];
  }
  comX0 /= p.nodes.length;
  comZ0 /= p.nodes.length;
  const lift = 0.2 - minY;

  const bodies = p.nodes.map((n) => {
    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(n.pos[0], n.pos[1] + lift, n.pos[2])
        .setLinearDamping(0.1)
        .setAngularDamping(0.4),
    );
    world.createCollider(
      R.ColliderDesc.ball(Math.max(n.radius, 0.05)).setDensity(1).setFriction(0.9).setCollisionGroups(G_CREATURE),
      body,
    );
    return body;
  });

  // spherical joints at each shared node; a per-edge muscle phase makes a travelling drive wave
  const muscles: { body: (typeof bodies)[number]; ax: number; az: number; phase: number }[] = [];
  p.edges.forEach(([ia, ib], k) => {
    const a = bodies[ia];
    const b = bodies[ib];
    const pa = p.nodes[ia].pos;
    const pb = p.nodes[ib].pos;
    const mx = (pa[0] + pb[0]) / 2;
    const my = (pa[1] + pb[1]) / 2;
    const mz = (pa[2] + pb[2]) / 2;
    const jd = R.JointData.spherical(
      { x: mx - pa[0], y: my - pa[1], z: mz - pa[2] },
      { x: mx - pb[0], y: my - pb[1], z: mz - pb[2] },
    );
    world.createImpulseJoint(jd, a, b, true);
    muscles.push({ body: b, ax: Math.cos(k * 1.3), az: Math.sin(k * 0.7), phase: (k * 1.9) % (Math.PI * 2) });
  });

  const omega = 2 * Math.PI * hz;
  for (let s = 0; s < steps; s++) {
    const t = s * dt;
    for (const m of muscles) {
      // a physical muscle torque τ (∝ the limb's own mass) applied over the step as a τ·dt impulse
      const torque = amp * m.body.mass() * dt * Math.sin(omega * t + m.phase);
      m.body.applyTorqueImpulse({ x: torque * m.ax, y: 0, z: torque * m.az }, true);
    }
    world.step();
  }

  let sx = 0;
  let sz = 0;
  let finite = true;
  for (const body of bodies) {
    const tr = body.translation();
    if (!Number.isFinite(tr.x) || !Number.isFinite(tr.z)) finite = false;
    sx += tr.x;
    sz += tr.z;
  }
  sx /= bodies.length;
  sz /= bodies.length;
  world.free(); // release the WASM-side world + bodies + joints

  if (!finite) return 0; // a blown-up sim earns nothing
  return Math.hypot(sx - comX0, sz - comZ0);
}

export interface PhysicsRunOptions extends FitnessOptions {
  litter?: number;
  lockSymmetry?: boolean;
}

/**
 * Fast-forward `generations` of locomotion selection from `root` (greedy + elitism, so the
 * distance never regresses). Returns the chosen path and each step's best distance. Async because
 * the physics is async; deterministic from (root, streamSeed).
 */
export async function runPhysicsGenerations(
  root: Genome,
  generations: number,
  streamSeed: number,
  opts: PhysicsRunOptions = {},
): Promise<{ path: Genome[]; distances: number[] }> {
  const litter = opts.litter ?? 6;
  const lock = opts.lockSymmetry ?? false;
  const path: Genome[] = [root];

  let current = root;
  let currentD = await simulateDistance(grow(current), opts);
  const distances: number[] = [currentD];

  for (let g = 1; g <= generations; g++) {
    let best = current;
    let bestD = currentD;
    for (const child of breederOffspring(current, mix32(streamSeed, g), litter, undefined, lock)) {
      const d = await simulateDistance(grow(child), opts);
      if (d > bestD) {
        best = child;
        bestD = d;
      }
    }
    current = best;
    currentD = bestD;
    path.push(current);
    distances.push(bestD);
  }
  return { path, distances };
}
