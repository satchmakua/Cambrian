/**
 * The creatures in the world: one actor per live creature, one carcass per corpse.
 *
 * Each actor renders the creature's own grown body (CreatureMesh — the same mesh the breeder shows),
 * placed from the sim each frame. The sim steps at a fixed 20 Hz; actors ease toward the sim pose so
 * motion reads smooth at any frame rate and any time-warp. Bodies are scaled by growth (newborns are
 * small), lie low when asleep, swimmers ride just under the surface, and the dead roll onto their
 * side and sink into the ground as they rot.
 *
 * Mesh budget: a new genome first mounts as the cheap capsule kit and is upgraded to a welded smooth
 * skin by a scheduler that builds within a small time budget each frame, so a burst of births never
 * stalls the frame. The skin comes in three finenesses by distance (see "skins" below), and
 * same-genome creatures share each surface via the geometry cache.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import { CreatureMesh, shellKey, type Detail } from '../viewer/CreatureMesh';
import { hasGeometry, releaseGeometry, retainGeometry } from '../viewer/geometryCache';
import { bestBuilt, buildSkins, plainSkin, requestSkin, SKIN_KEY as KEY, skinOrder, type Skin, type SkinOrder } from './skinQueue';
import { createRig, LOOK_MAX, poseDead, poseRig, SLEEP_DROP } from '../viewer/rig';
import { getQuality } from '../ui/settings';
import { juvenileGenome, JUVENILE_UNTIL } from '../engine/juvenile';
import { JawContext, type JawControl } from '../viewer/mouths/jaw';
import { FlightContext, wingbeat, type FlightControl } from '../viewer/flight';
import { LidContext, type LidControl } from '../viewer/eyelids';
import { AIRBORNE, COURT_TIME, bodyOf, growthOf, type Corpse, type Creature, type World } from '../sim/world';
import { heightAt, WATER_LEVEL } from '../sim/terrain';
import { emoteFor, emoteMaterial, type Emote } from './emotes';
import { SOUND, voiceOf, type Call } from './audio';
import { useWorldUi } from './worldStore';
import { lodAt, type Lod } from './lod';

// --- skins: three finenesses, built in the background ------------------------------------------------
//
// A creature wears the skin its distance calls for: the DISTANT one (a coarse grid — under half the
// triangles) out past the detail bands, where it is a few dozen pixels long; the PLAIN one in between;
// the FINE one right under the camera (or when selected). Fifty animals in plain skins were half a
// million triangles — more than the valley's grass and trees together — however small they were drawn.
//
// No skin is ever built inside a render: an actor asks for the one it wants and goes on wearing what
// it has (the nearest fineness already built, or the capsule kit) until the scheduler, which builds
// within a small time budget each frame, says it is ready — the surface, the weights that bind it to
// the skeleton, and its carapace shell where it has one. Same-genome creatures share each surface
// through the geometry cache.
//
// And no skin is built twice: a body keeps what it has worn. The distant and the plain skin stay for
// as long as the creature is in the valley — it crosses the band between them every time the camera
// moves, and each crossing used to throw one away and, a moment later, build it again. The fine skin
// is several megabytes, so it is only kept a while after the camera moves off (long enough that
// circling an animal, or coming back to it, costs nothing).

/** how long a fine skin outlives the camera's interest in it */
const FINE_KEEP_MS = 20_000;

/** Build queued surfaces each frame (call from a useFrame): see skinQueue's `buildSkins`. */
export function useSkinScheduler(): void {
  useFrame(() => buildSkins());
}

/** Count this body as a user of a skin it has built (and of that skin's shell, if it has one), so
 *  neither is swept while the body may wear it again. Returns the cache keys actually retained. */
/** a mood bubble's largest size against the camera's distance from it (≈ a 14th of the view's height) */
const BUBBLE_NEAR = 0.06;
const BUBBLE_AT = new THREE.Vector3();

function hold(p: Phenotype, q: Skin): string[] {
  return [KEY[q], shellKey(q)].filter((k) => retainGeometry(p, k));
}

/** The skin to wear now, while the wanted one is built in the background (null: the capsule kit). */
function useSkin(p: Phenotype, want: Skin): Skin | null {
  const [state, setState] = useState<{ p: Phenotype; have: Skin | null }>(() => ({ p, have: bestBuilt(p, want) }));
  let have = state.have;
  if (state.p !== p) {
    // a different body (a youngster grown into its adult shape): what was being worn was the other
    // body's — start from what this one has built, never by building in this render
    have = bestBuilt(p, want);
    setState({ p, have });
  }
  useEffect(() => {
    const now = bestBuilt(p, want);
    // (keep what is worn while it is still there; else the nearest built)
    setState((s) => {
      const worn = s.p === p ? s.have : null;
      const next = now === want ? want : worn && hasGeometry(p, KEY[worn]) ? worn : now;
      return s.p === p && s.have === next ? s : { p, have: next };
    });
    if (now === want) return;
    return requestSkin(p, want, () => setState({ p, have: want }));
  }, [p, want]);

  // what this body has worn, it keeps (see "skins" above)
  const held = useRef(new Map<Skin, string[]>());
  useEffect(() => {
    const h = held.current;
    if (have && !h.has(have)) h.set(have, hold(p, have));
    const fine = h.get('high');
    if (fine && want !== 'high' && have !== 'high') {
      for (const k of fine) releaseGeometry(p, k, FINE_KEEP_MS);
      h.delete('high');
    }
  }, [p, have, want]);
  useEffect(
    () => () => {
      for (const keys of held.current.values()) for (const k of keys) releaseGeometry(p, k);
      held.current.clear();
    },
    [p],
  );
  return have;
}

const NEAR_FINE = 7; // bu from the camera: a creature this close wears its fine skin

/** Is this actor within `radius` of the camera? (polled, with hysteresis; re-renders on a change) */
function useNear(get: () => THREE.Vector3 | null, radius: number): boolean {
  const camera = useThree((s) => s.camera);
  const [near, setNear] = useState(false);
  const cur = useRef(false);
  const dwell = useRef(0);
  const timer = useRef(Math.random() * 0.3);
  useFrame((_, dt) => {
    timer.current -= dt;
    if (timer.current > 0) return;
    timer.current = 0.3;
    const p = get();
    if (!p) return;
    const d = camera.position.distanceTo(p);
    // (fine skins are a graphics option: off, nothing is ever near enough)
    const inside = getQuality().fineSkins && (cur.current ? d < radius * 1.25 : d < radius);
    // near means staying near: a camera sweeping past an animal is gone before its fine skin — the
    // dearest thing the valley builds — could be seen, so it is asked for on the second look
    dwell.current = inside ? dwell.current + 1 : 0;
    const next = inside && (cur.current || dwell.current >= 2);
    if (next !== cur.current) {
      cur.current = next;
      setNear(next);
    }
  });
  return near;
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

/** What a creature is paying attention to, if anything: the creature it hunts, flees, courts, or that
 *  just bit it (for a moment). Returns that creature's position (y at its mid-height). */
function lookTarget(w: World, c: Creature): { x: number; y: number; z: number } | null {
  let id = -1;
  if (c.action === 'hunt' || c.action === 'flee' || c.action === 'mate') id = c.target;
  else if (c.attacker >= 0 && w.time - c.attackedAt < 1.5) id = c.attacker;
  if (id < 0) return null;
  const o = w.creatures.find((x) => x.id === id && x.alive);
  return o ? { x: o.x, y: o.y + o.traits.height * 0.5 * growthOf(o), z: o.z } : null;
}

function angleLerp(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

// --- level of detail -------------------------------------------------------------------------------

const START = new THREE.Vector3();
const HERE = new THREE.Vector3();

/**
 * An actor's level of detail, polled from the camera distance. Re-renders only when it changes.
 * `start`: where the actor is as it mounts — it is judged from there at once (begun at mid-detail
 * whatever its distance, every far-off birth and death ordered a plain skin it threw away at its
 * first poll). `force`: the selected creature is drawn in full wherever it is (its true level is
 * still tracked underneath, so it is right the moment the selection moves on).
 */
function useLod(get: () => THREE.Vector3 | null, force: boolean, start: (v: THREE.Vector3) => THREE.Vector3): Lod {
  const camera = useThree((s) => s.camera);
  const [lod, setLod] = useState<Lod>(() => lodAt(camera.position.distanceTo(start(START)), getQuality().lod, null));
  const cur = useRef(lod);
  const timer = useRef(Math.random() * 0.3);
  useFrame((_, dt) => {
    timer.current -= dt;
    if (timer.current > 0) return;
    timer.current = 0.3;
    const p = get();
    if (!p) return;
    // (the bands scale with the creature-detail option)
    const next = lodAt(camera.position.distanceTo(p), getQuality().lod, cur.current);
    if (next.detail !== cur.current.detail || next.distant !== cur.current.distant) {
      cur.current = next;
      setLod(next);
    }
  });
  return force ? { detail: 'full', distant: lod.distant } : lod;
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
  // the young wear a youngster's proportions — a big head, big eyes, short legs — until they are well
  // on their way to grown (scaled-down adults at their mothers' heels read as miniatures, not young)
  const youngNow = () => c.age < c.traits.maturity * JUVENILE_UNTIL;
  const [young, setYoung] = useState(youngNow);
  const { traits } = bodyOf(c.genome);
  const { phenotype } = bodyOf(young ? juvenileGenome(c.genome) : c.genome);
  const place = rigOf(phenotype);
  const ref = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const bubble = useRef<THREE.Sprite>(null);
  const voice = useMemo(() => voiceOf(traits), [traits]);
  const heard = useRef({ action: c.action, bitten: c.attackedAt, last: -1e9, born: c.age < 2 });
  const shown = useRef<{ e: Emote | null; pop: number }>({ e: null, pop: 0 });
  const pose = useRef({ x: c.x, z: c.z, h: c.heading, sleep: 0, eat: 0, bob: Math.random() * 10, turn: 0, alt: c.alt, fly: 0, beat: Math.random() * 6, climb: 0, display: 0, stalk: 0, lookYaw: 0, lookPitch: 0 });
  const swimmer = traits.habitat === 'water' || traits.locomotion === 'swim' || traits.locomotion === 'drift';
  // each actor animates its own skeleton (bones can't be shared between skinned meshes)
  const rig = useMemo(() => createRig(phenotype), [phenotype]);
  const jaw = useMemo<JawControl>(() => ({ open: 0 }), []);
  const flight = useMemo<FlightControl | null>(() => (traits.winged ? { spread: 0, flap: 0 } : null), [traits.winged]);
  const lids = useMemo<LidControl>(() => ({ shut: 0 }), []);
  // (judged from the body's own eased position, which is right from the moment it mounts: the group
  // is only placed by this actor's first frame, and a poll that ran before it measured from the
  // world's origin — a newborn across the valley could order a fine skin, or one at the camera's
  // feet a distant one)
  const here = () => HERE.set(pose.current.x, c.y, pose.current.z);
  const lod = useLod(here, selected, (v) => v.set(c.x, c.y, c.z));
  const detail = lod.detail;
  const near = useNear(here, NEAR_FINE);
  // the skin its distance calls for: fine under the camera (and for the selected creature —
  // built in the background, not inside the click that selects it), distant past the detail bands
  const want: Skin = near || selected ? 'high' : lod.distant ? 'far' : 'low';
  const skin = useSkin(phenotype, want);
  // (a new body's meshes are new: their shadows are set again)
  useEffect(() => applyShadows(ref.current, detail), [detail, skin, phenotype]);
  // growing up: the adult body takes over once it has a skin built. It is asked of the scheduler; were
  // the bodies simply swapped, the render that swapped them would build the adult's skin itself — a
  // stall of tens of milliseconds every time a youngster came of age (and of far longer under the camera).
  // The order is for the plain or the distant skin, whichever the distance calls for NOW (it follows
  // the camera), never the fine one: that is ordered like any other body's, once the adult is worn.
  const distant = useRef(lod.distant);
  distant.current = lod.distant;
  const growUp = useRef<SkinOrder | null>(null);
  useEffect(
    () => () => {
      growUp.current?.cancel();
      growUp.current = null;
    },
    [],
  );

  useFrame((st, dt) => {
    const g = ref.current;
    if (!g) return;
    if (young && !youngNow()) (growUp.current ??= skinOrder(bodyOf(c.genome).phenotype, () => setYoung(false))).ask(plainSkin(distant.current));
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
    // courting: the pair circling each other put on a display
    const courting = c.action === 'mate' && c.courtT > 0 && c.courtT < COURT_TIME;
    P.display += ((courting ? 1 : 0) - P.display) * Math.min(1, dt * 3);
    // stalking: hunting, but not yet charging
    P.stalk += ((c.action === 'hunt' && c.chaseT <= 0 && c.alt <= AIRBORNE ? 1 : 0) - P.stalk) * Math.min(1, dt * 4);
    // attention: the head turns to what it is dealing with — a hunter fixes on its prey, prey watches
    // the predator (it glances back over its shoulder as it runs), a suitor faces its mate, and a
    // bitten animal rounds on its attacker. Otherwise it looks where it is going.
    const seen = lookTarget(world, c);
    let wantYaw = 0, wantPitch = 0;
    if (seen && c.alt <= AIRBORNE) {
      const dx = seen.x - P.x, dz = seen.z - P.z;
      const yaw = Math.atan2(Math.sin(Math.atan2(dx, dz) - P.h), Math.cos(Math.atan2(dx, dz) - P.h));
      // (what is behind it is looked at only as far as a neck turns; a runner glances, it can't stare)
      wantYaw = Math.max(-LOOK_MAX, Math.min(LOOK_MAX, yaw)) * (c.action === 'flee' ? 0.6 : 1);
      const dist = Math.max(0.5, Math.hypot(dx, dz));
      wantPitch = Math.max(-0.4, Math.min(0.4, -Math.atan2(seen.y - (c.y + c.traits.height * 0.7), dist)));
    }
    P.lookYaw += (wantYaw - P.lookYaw) * Math.min(1, dt * 5);
    P.lookPitch += (wantPitch - P.lookPitch) * Math.min(1, dt * 5);
    if (flight) {
      // (a displaying bird half-opens its wings and shivers them; the flight beat takes over aloft)
      flight.spread = Math.max(P.fly, 0.55 * P.display * (1 - P.fly));
      // beat hard climbing out, steadily cruising, and glide (wings held, a slow rock) coming down;
      // small fliers beat faster than big ones
      const power = P.climb > 0.4 ? 1 : P.climb < -0.6 ? 0.08 : 0.55;
      P.beat += dt * (9 / Math.pow(Math.max(0.3, s * traits.length * 0.35), 0.35)) * (0.4 + 0.6 * power);
      flight.flap = P.fly > 0.05 ? wingbeat(P.beat, power) : 0.3 * P.display * Math.sin(world.time * 14);
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
        idle: Math.max(0, 1 - vis / Math.max(0.3, traits.speed * 0.3)) * (1 - P.eat) * (1 - P.sleep) * (1 - P.fly) * (1 - P.display),
        display: P.display,
        stalk: P.stalk,
        look: [P.lookYaw, P.lookPitch],
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
    y -= P.sleep * rig.template.belly * s * SLEEP_DROP; // lie down on its belly to sleep
    y -= P.stalk * place.height * s * 0.12; // crouch to stalk
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
    // its calls: on the moments worth hearing, near the camera, at most one every ~1.5 s each
    if (SOUND.running && detail !== 'none') {
      const H = heard.current;
      let call: Call | null = null;
      if (c.attackedAt !== H.bitten && world.time - c.attackedAt < 0.3) call = 'hurt';
      else if (c.action !== H.action) call = c.action === 'flee' ? 'alarm' : c.action === 'hunt' ? 'hunt' : c.action === 'mate' ? 'court' : null;
      else if (H.born) call = 'young';
      H.bitten = c.attackedAt;
      H.action = c.action;
      H.born = false;
      if (call && world.time - H.last > 1.5) {
        H.last = world.time;
        SOUND.call(call, voice, { x: P.x, y: y + place.height * s * 0.6, z: P.z });
      }
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
        // (a world-sized tag was as big as a mouse once the camera came close, and hid the animal it
        // spoke for: near, it is held to a share of the camera's distance — a small tag over the head)
        const near = st.camera.position.distanceTo(BUBBLE_AT.set(P.x, y + place.height * s, P.z)) * BUBBLE_NEAR;
        const size = Math.min(0.7 + 0.18 * place.height * s, near) / s;
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
                {/* the creature you're watching up close gets the fine skin: at the herd's low resolution
                    a bird's thin shanks broke into jagged shards a cell or two across */}
                {/* (in the kit, a shelled body draws a shell only if one is built already: the scheduler
                    builds it with the skin — see lazyShell) */}
                <CreatureMesh phenotype={phenotype} skinMode={skin ? 'hybrid' : 'capsules'} quality={skin ?? plainSkin(lod.distant)} lazyShell={!skin} rig={rig} detail={detail} carved={false} fur={selected && detail === 'full'} />
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
  // the body gone limp, eyes shut (in its standing pose, knocked over, it read as a statue)
  const limp = useMemo(() => {
    const r = createRig(phenotype);
    poseDead(r);
    return r;
  }, [phenotype]);
  const lids = useMemo<LidControl>(() => ({ shut: 1, blink: false }), []);
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
  // (a carcass keeps the plain skin while the camera is anywhere near: a kill is watched up close)
  const lod = useLod(() => HERE.set(k.x, heightAt(world.terrain, k.x, k.z), k.z), false, (v) => v.set(k.x, heightAt(world.terrain, k.x, k.z), k.z));
  const skin = useSkin(phenotype, plainSkin(lod.distant));
  useEffect(() => applyShadows(ref.current, 'none'), [skin]);
  return (
    <group ref={ref}>
      <group position={[-rig.center[0], 0, -rig.center[2]]}>
        <LidContext.Provider value={lids}>
          <CreatureMesh phenotype={phenotype} skinMode={skin ? 'hybrid' : 'capsules'} quality={skin ?? plainSkin(lod.distant)} lazyShell={!skin} rig={limp} detail="none" carved={false} />
        </LidContext.Provider>
      </group>
    </group>
  );
}
