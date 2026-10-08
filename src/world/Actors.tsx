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
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import { CreatureMesh, prebuildSkin, type Detail } from '../viewer/CreatureMesh';
import { createRig, poseRig } from '../viewer/rig';
import { JawContext, type JawControl } from '../viewer/mouths/jaw';
import { FlightContext, wingbeat, type FlightControl } from '../viewer/flight';
import { LidContext, type LidControl } from '../viewer/eyelids';
import { AIRBORNE, bodyOf, growthOf, type Corpse, type Creature, type World } from '../sim/world';
import { heightAt, WATER_LEVEL } from '../sim/terrain';
import { emoteFor, emoteMaterial, type Emote } from './emotes';
import { useWorldUi } from './worldStore';

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
    // a time budget per frame (always at least one build), so a burst of new genomes drains quickly
    // on a fast machine without ever stalling a frame for long on a slow one
    const t0 = performance.now();
    while (QUEUE.length && performance.now() - t0 < 6) {
      const p = QUEUE.shift()!;
      const ls = LISTENERS.get(p);
      if (!ls || ls.size === 0) {
        LISTENERS.delete(p);
        continue; // nobody waiting any more
      }
      prebuildSkin(p, 'hybrid', 'low', false);
      READY.add(p);
      LISTENERS.delete(p);
      for (const f of ls) f();
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

// --- level of detail -------------------------------------------------------------------------------

const LOD_FULL = 24; // bu from the camera: full detail inside this
const LOD_LITE = 62; // simplified features inside this; silhouette only beyond

/** Pick a detail level from the camera distance, with hysteresis so actors don't flicker at a band
 *  edge. Re-renders only when the level actually changes. */
function useDetail(get: () => THREE.Vector3 | null, force: boolean): Detail {
  const camera = useThree((s) => s.camera);
  const [detail, setDetail] = useState<Detail>('lite');
  const cur = useRef<Detail>('lite');
  const timer = useRef(Math.random() * 0.3);
  useFrame((_, dt) => {
    timer.current -= dt;
    if (timer.current > 0) return;
    timer.current = 0.3;
    const p = get();
    if (!p) return;
    const d = camera.position.distanceTo(p);
    const was = cur.current;
    let next: Detail = d < LOD_FULL ? 'full' : d < LOD_LITE ? 'lite' : 'none';
    // hysteresis: hold the finer level until 15% past its band edge
    if (was === 'full' && next !== 'full' && d < LOD_FULL * 1.15) next = 'full';
    if (was === 'lite' && next === 'none' && d < LOD_LITE * 1.15) next = 'lite';
    if (force) next = 'full';
    if (next !== was) {
      cur.current = next;
      setDetail(next);
    }
  });
  return force ? 'full' : detail;
}

/** Shadows are for near things: features cast only at full detail, bodies until the far band. */
function applyShadows(root: THREE.Object3D | null, detail: Detail): void {
  if (!root) return;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const body = (o as THREE.SkinnedMesh).isSkinnedMesh;
    m.castShadow = body ? detail !== 'none' : detail === 'full';
    // picking goes through the actor's hitbox, never through skinned/feature geometry (raycasting a
    // skinned mesh walks every vertex through its bones — far too dear on every pointer move)
    if (!(o.userData as { hitbox?: boolean }).hitbox) m.raycast = () => {};
  });
}

export function Actor({ c, world, onPick, selected }: { c: Creature; world: World; onPick: (id: number) => void; selected: boolean }) {
  const { phenotype, traits } = bodyOf(c.genome);
  const place = rigOf(phenotype);
  const mode = useSkinMode(phenotype);
  const ref = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const bubble = useRef<THREE.Sprite>(null);
  const shown = useRef<{ e: Emote | null; pop: number }>({ e: null, pop: 0 });
  const pose = useRef({ x: c.x, z: c.z, h: c.heading, sleep: 0, eat: 0, bob: Math.random() * 10, turn: 0, alt: c.alt, fly: 0, beat: Math.random() * 6, climb: 0 });
  const swimmer = traits.habitat === 'water' || traits.locomotion === 'swim' || traits.locomotion === 'drift';
  // each actor animates its own skeleton (bones can't be shared between skinned meshes)
  const rig = useMemo(() => createRig(phenotype), [phenotype]);
  const jaw = useMemo<JawControl>(() => ({ open: 0 }), []);
  const flight = useMemo<FlightControl | null>(() => (traits.winged ? { spread: 0, flap: 0 } : null), [traits.winged]);
  const lids = useMemo<LidControl>(() => ({ shut: 0 }), []);
  const detail = useDetail(() => ref.current?.position ?? null, selected);
  useEffect(() => applyShadows(ref.current, detail), [detail, mode]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = Math.min(1, dt * 10);
    const P = pose.current;
    const px = P.x, pz = P.z, ph = P.h;
    P.x += (c.x - P.x) * k;
    P.z += (c.z - P.z) * k;
    P.h = angleLerp(P.h, c.heading, Math.min(1, dt * 6));
    P.sleep += ((c.action === 'sleep' ? 1 : 0) - P.sleep) * Math.min(1, dt * 2);
    lids.shut = Math.min(1, P.sleep * 1.4); // eyes close as it settles to sleep
    const feeding = c.action === 'graze' || c.action === 'eat' || c.action === 'forage' || c.action === 'filter';
    P.eat += ((feeding && c.speed < 0.6 ? 1 : 0) - P.eat) * Math.min(1, dt * 3);
    const s = growthOf(c);
    // altitude: ease toward the sim's, and spread the wings while airborne
    const prevAlt = P.alt;
    P.alt += (c.alt - P.alt) * k;
    P.fly += ((c.alt > AIRBORNE || (c.fly && c.alt > 0.05) ? 1 : 0) - P.fly) * Math.min(1, dt * 4);
    if (dt > 0) P.climb += ((P.alt - prevAlt) / dt - P.climb) * Math.min(1, dt * 3);
    if (flight) {
      flight.spread = P.fly;
      // beat hard climbing out, steadily cruising, and glide (wings held, a slow rock) coming down;
      // small fliers beat faster than big ones
      const power = P.climb > 0.4 ? 1 : P.climb < -0.6 ? 0.08 : 0.55;
      P.beat += dt * (9 / Math.pow(Math.max(0.3, s * traits.length * 0.35), 0.35)) * (0.4 + 0.6 * power);
      flight.flap = wingbeat(P.beat, power);
    }
    // drive the gait from the speed the body actually shows on screen (in its own body units)
    if (dt > 0) {
      const vis = Math.hypot(P.x - px, P.z - pz) / dt;
      const turn = Math.atan2(Math.sin(P.h - ph), Math.cos(P.h - ph)) / dt;
      P.turn += (turn - P.turn) * Math.min(1, dt * 4);
      poseRig(rig, {
        dt,
        speed: vis / s,
        cruise: traits.speed / s,
        sleep: P.sleep,
        eat: P.eat,
        swim: swimmer,
        turn: P.turn,
        fly: P.fly,
        // standing about: breathe and glance around
        idle: Math.max(0, 1 - vis / Math.max(0.3, traits.speed * 0.3)) * (1 - P.eat) * (1 - P.sleep) * (1 - P.fly),
      });
    }
    const ground = heightAt(world.terrain, P.x, P.z);
    let y = ground + place.lift * s;
    if (swimmer && ground < WATER_LEVEL) {
      // ride just under the surface (never below the lakebed)
      y = Math.max(ground + place.lift * s, WATER_LEVEL - place.height * s * 0.55);
      P.bob += dt * (1 + c.speed);
      y += Math.sin(P.bob) * 0.06 * s;
    } else if (ground < WATER_LEVEL) {
      // a walker out of its depth floats, back above the surface, paddling
      y = Math.max(y, WATER_LEVEL - place.height * s * 0.4);
    }
    y -= P.sleep * place.height * s * 0.28; // settle low to sleep
    // aloft: ride above the ground or the water, nose up into a climb, bank into turns
    if (P.alt > 0.01) y = Math.max(y, Math.max(ground, WATER_LEVEL) + place.lift * s * (1 - P.fly * 0.5)) + P.alt;
    g.position.set(P.x, y, P.z);
    const pitch = -THREE.MathUtils.clamp(P.climb * 0.12, -0.35, 0.35) * P.fly;
    const bank = -THREE.MathUtils.clamp(P.turn * 0.45, -0.6, 0.6) * P.fly;
    g.rotation.set(pitch, P.h, bank, 'YXZ');
    g.scale.setScalar(s);
    if (body.current) {
      body.current.rotation.x = P.sleep * 0.08; // head drops a touch
      // a bite is a lunge — the body thrusts forward and back while its jaws are on the prey — and a
      // bitten animal flinches (a quick shudder about its long axis)
      const lunge = world.time - c.bitAt < 0.25 ? Math.max(0, Math.sin(world.time * 13)) : 0;
      const hit = Math.max(0, 1 - (world.time - c.attackedAt) / 0.5);
      body.current.position.z = lunge * place.height * 0.22;
      body.current.rotation.z = hit * 0.12 * Math.sin(world.time * 47);
    }
    // the mood bubble: pops in when the mood changes, bobs above the head; near creatures only
    if (bubble.current) {
      const want = useWorldUi.getState().emotes && detail !== 'none' && c.alive ? emoteFor(c.action) : null;
      const sh = shown.current;
      if (want !== sh.e) {
        sh.e = want;
        sh.pop = 0;
        if (want) bubble.current.material = emoteMaterial(want);
      }
      bubble.current.visible = sh.e !== null;
      if (sh.e) {
        sh.pop = Math.min(1, sh.pop + dt * 5);
        const size = (0.7 + 0.18 * place.height * s) / s;
        const pop = sh.pop < 1 ? 1 + 0.25 * Math.sin(sh.pop * Math.PI) : 1;
        bubble.current.scale.setScalar(size * pop * THREE.MathUtils.smoothstep(sh.pop, 0, 0.4));
        bubble.current.position.set(0, place.height - place.lift + size * 0.75 + Math.sin(world.time * 2.2 + c.id) * 0.05 / s, 0);
      }
    }
    // the jaw: shut while walking or asleep, chewing while it feeds, agape on the hunt or in flight
    const want =
      c.action === 'hunt' ? 1.35 :
      c.action === 'flee' ? 0.55 :
      P.eat > 0.4 ? 0.3 + 0.45 * Math.max(0, Math.sin(P.bob * 9)) :
      0.0;
    P.bob += dt;
    jaw.open += (want - jaw.open) * Math.min(1, dt * 8);
    if (ring.current) {
      ring.current.visible = selected;
      ring.current.position.y = ground - y + 0.06;
    }
  });

  return (
    <group ref={ref}>
      <group ref={body}>
        <group position={[-place.center[0], 0, -place.center[2]]}>
          <JawContext.Provider value={jaw}>
            <FlightContext.Provider value={flight}>
              <LidContext.Provider value={lids}>
                <CreatureMesh phenotype={phenotype} skinMode={mode} quality="low" rig={rig} detail={detail} carved={false} />
              </LidContext.Provider>
            </FlightContext.Provider>
          </JawContext.Provider>
        </group>
      </group>
      {/* an invisible pick target — the only thing in the actor that is raycast */}
      <mesh
        position={[0, -place.lift + place.height * 0.5, 0]}
        userData={{ hitbox: true }}
        onClick={(e) => {
          e.stopPropagation();
          onPick(c.id);
        }}
      >
        <boxGeometry args={[traits.radius * 2.2, place.height, traits.length * 0.9]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <sprite ref={bubble} visible={false} renderOrder={5} />
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
  const mode = useSkinMode(phenotype);
  useEffect(() => applyShadows(ref.current, 'none'), [mode]);
  return (
    <group ref={ref}>
      <group position={[-rig.center[0], 0, -rig.center[2]]}>
        <CreatureMesh phenotype={phenotype} skinMode={mode} quality="low" detail="none" carved={false} />
      </group>
    </group>
  );
}
