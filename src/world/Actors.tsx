/**
 * The creatures in the world: one actor per live creature, one carcass per corpse.
 *
 * Each actor renders the creature's own grown body (CreatureMesh — the same mesh the breeder shows),
 * placed from the sim each frame. The sim steps at a fixed 20 Hz; actors ease toward the sim pose so
 * motion reads smooth at any frame rate and any time-warp. Bodies are scaled by growth (newborns are
 * small), lie low when asleep, swimmers ride just under the surface, and the dead roll onto their
 * side and sink into the ground as they rot.
 *
 * Mesh budget: a new genome first mounts as the cheap capsule kit and is upgraded to the welded smooth
 * skin by a scheduler that builds at most one surface per frame (the build is ~30–60 ms), so a burst
 * of births never stalls the frame. Same-genome creatures share their surface via the geometry cache.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import { CreatureMesh, prebuildSkin } from '../viewer/CreatureMesh';
import { bodyOf, growthOf, type Corpse, type Creature, type World } from '../sim/world';
import { heightAt, WATER_LEVEL } from '../sim/terrain';

// --- smooth-skin upgrade scheduler -----------------------------------------------------------------

const READY = new WeakSet<Phenotype>();
const QUEUE: Phenotype[] = [];
const LISTENERS = new Map<Phenotype, Set<() => void>>();

function requestSmooth(p: Phenotype, onReady: () => void): () => void {
  if (READY.has(p)) {
    onReady();
    return () => {};
  }
  let set = LISTENERS.get(p);
  if (!set) {
    LISTENERS.set(p, (set = new Set()));
    QUEUE.push(p);
  }
  set.add(onReady);
  return () => set!.delete(onReady);
}

/** Build at most one queued surface per frame (call from a useFrame). */
export function useSkinScheduler(): void {
  useFrame(() => {
    while (QUEUE.length) {
      const p = QUEUE.shift()!;
      const ls = LISTENERS.get(p);
      if (!ls || ls.size === 0) {
        LISTENERS.delete(p);
        continue; // nobody waiting any more
      }
      prebuildSkin(p, 'hybrid', 'low');
      READY.add(p);
      LISTENERS.delete(p);
      for (const f of ls) f();
      break;
    }
  });
}

function useSkinMode(p: Phenotype): 'capsules' | 'hybrid' {
  const [mode, setMode] = useState<'capsules' | 'hybrid'>(READY.has(p) ? 'hybrid' : 'capsules');
  useEffect(() => requestSmooth(p, () => setMode('hybrid')), [p]);
  return mode;
}

// --- placement -----------------------------------------------------------------------------------

interface Rig {
  center: [number, number, number];
  lift: number; // raise the body so its lowest point meets the ground
  height: number;
}
const RIGS = new WeakMap<Phenotype, Rig>();
function rigOf(p: Phenotype): Rig {
  let r = RIGS.get(p);
  if (!r) {
    const { min, max } = p.bounds;
    r = { center: [(min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2], lift: -min[1], height: max[1] - min[1] };
    RIGS.set(p, r);
  }
  return r;
}

function angleLerp(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

export function Actor({ c, world, onPick, selected }: { c: Creature; world: World; onPick: (id: number) => void; selected: boolean }) {
  const { phenotype, traits } = bodyOf(c.genome);
  const rig = rigOf(phenotype);
  const mode = useSkinMode(phenotype);
  const ref = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const pose = useRef({ x: c.x, z: c.z, h: c.heading, sleep: 0, bob: Math.random() * 10 });
  const swimmer = traits.habitat === 'water' || traits.locomotion === 'swim' || traits.locomotion === 'drift';

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = Math.min(1, dt * 10);
    const P = pose.current;
    P.x += (c.x - P.x) * k;
    P.z += (c.z - P.z) * k;
    P.h = angleLerp(P.h, c.heading, Math.min(1, dt * 6));
    P.sleep += ((c.action === 'sleep' ? 1 : 0) - P.sleep) * Math.min(1, dt * 2);
    const s = growthOf(c);
    const ground = heightAt(world.terrain, P.x, P.z);
    let y = ground + rig.lift * s;
    if (swimmer && ground < WATER_LEVEL) {
      // ride just under the surface (never below the lakebed)
      y = Math.max(ground + rig.lift * s, WATER_LEVEL - rig.height * s * 0.55);
      P.bob += dt * (1 + c.speed);
      y += Math.sin(P.bob) * 0.06 * s;
    }
    y -= P.sleep * rig.height * s * 0.28; // settle low to sleep
    g.position.set(P.x, y, P.z);
    g.rotation.set(0, P.h, 0);
    g.scale.setScalar(s);
    if (body.current) body.current.rotation.x = P.sleep * 0.08; // head drops a touch
    if (ring.current) {
      ring.current.visible = selected;
      ring.current.position.y = ground - y + 0.06;
    }
  });

  return (
    <group
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        onPick(c.id);
      }}
    >
      <group ref={body}>
        <group position={[-rig.center[0], 0, -rig.center[2]]}>
          <CreatureMesh phenotype={phenotype} skinMode={mode} quality="low" />
        </group>
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[traits.radius * 1.4, traits.radius * 1.4 + 0.18, 40]} />
        <meshBasicMaterial color="#7fd1b9" transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Carcass({ k, world }: { k: Corpse; world: World }) {
  const { phenotype } = bodyOf(k.genome);
  const rig = rigOf(phenotype);
  const ref = useRef<THREE.Group>(null);
  const side = useMemo(() => (k.id % 2 === 0 ? 1 : -1), [k.id]);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const ground = heightAt(world.terrain, k.x, k.z);
    const decay = 1 - Math.max(0, k.rot) / 120; // 0 fresh → 1 gone
    const eaten = 1 - k.meat / Math.max(1, k.maxMeat);
    g.position.set(k.x, Math.max(ground, WATER_LEVEL - 0.3) + rig.height * k.growth * 0.2 - decay * rig.height * k.growth * 0.6, k.z);
    g.rotation.set(0, k.heading, side * Math.PI * 0.46); // keeled over onto its side
    g.scale.setScalar(k.growth * (1 - 0.35 * eaten));
  });
  return (
    <group ref={ref}>
      <group position={[-rig.center[0], 0, -rig.center[2]]}>
        <CreatureMesh phenotype={phenotype} skinMode="capsules" />
      </group>
    </group>
  );
}
