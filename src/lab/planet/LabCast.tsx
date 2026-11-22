/**
 * A planet's living drawn: the nearest (the valley's 90 at most, within its 80 bu) as their own grown bodies,
 * posed by the valley's rig from what each is doing (world/Actors.tsx: asleep, feeding, courting, stalking,
 * swimming, aloft), the rest as the valley's markers, and none that the planet hides behind its horizon.
 * The simulation steps at 20 Hz; each body eases toward where it has it, along the sphere.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { CreatureMesh } from '../../viewer/CreatureMesh';
import { createRig, poseRig, SLEEP_DROP } from '../../viewer/rig';
import { FlightContext, wingbeat, type FlightControl } from '../../viewer/flight';
import { LidContext, type LidControl } from '../../viewer/eyelids';
import { JawContext, type JawControl } from '../../viewer/mouths/jaw';
import { juvenileGenome, JUVENILE_UNTIL } from '../../engine/juvenile';
import { rigOf, useLod, useSkin, useSkinScheduler } from '../../world/Actors';
import { plainSkin, type Skin } from '../../world/skinQueue';
import { getQuality } from '../../ui/settings';
import { AIRBORNE, bodyOf, COURT_TIME, growthOf, type Creature, type World } from '../../sim/world';
import { WATER_LEVEL } from '../../sim/terrain';
import { cross, dot, normalize, tangent, type Vec3 } from '../../sim/sphere';
import { useLab } from './labStore';

/** how many are drawn whole and how many as markers, this moment (for the HUD) */
export const CAST = { bodies: 0, markers: 0 };

/** the valley's lines: bodies within 80 bu (× the creature-detail option), 90 at most, judged every 0.4 s,
 *  and kept 15% past the line (world/WorldScene.tsx) */
const MARKER_AT = 80;
const WHOLE_MAX = 90;
const JUDGE = 0.4;
const KEEP = 1.15;

const AT = new THREE.Vector3();
const BASIS = new THREE.Matrix4();
const TILT = new THREE.Quaternion();
const EULER = new THREE.Euler();
const VX = new THREE.Vector3();
const VY = new THREE.Vector3();
const VZ = new THREE.Vector3();

const unitOf = (c: { x: number; y: number; z: number }): Vec3 => normalize([c.x, c.y, c.z]);
const headOf = (c: Creature, at: Vec3): Vec3 => {
  const f = tangent(at, [c.fx ?? 1, c.fy ?? 0, c.fz ?? 0]);
  return f[0] || f[1] || f[2] ? f : tangent(at, [1, 0, 0]);
};

/** Turn `o` to stand up the planet's up at `p`, facing `f` (then pitched and banked, in its own frame). */
function faceOn(o: THREE.Object3D, p: Vec3, f: Vec3, pitch = 0, bank = 0): void {
  const x = cross(p, f);
  BASIS.makeBasis(VX.set(x[0], x[1], x[2]), VY.set(p[0], p[1], p[2]), VZ.set(f[0], f[1], f[2]));
  o.quaternion.setFromRotationMatrix(BASIS);
  if (pitch || bank) o.quaternion.multiply(TILT.setFromEuler(EULER.set(pitch, 0, bank, 'YXZ')));
}

/** Is `at` above the planet's horizon from the camera at `cam`? (the angle between them against the two
 *  horizons' angles; the ground's hills are not counted) */
export function inSight(R: number, at: THREE.Vector3, cam: THREE.Vector3): boolean {
  const ra = at.length(), rc = cam.length();
  const between = Math.acos(Math.max(-1, Math.min(1, at.dot(cam) / (ra * rc))));
  return between < Math.acos(Math.min(1, R / rc)) + Math.acos(Math.min(1, R / Math.max(R, ra + 1))) + 0.002;
}

/** Who is drawn whole: near enough, in sight, the nearest 90 (and the one followed, wherever it is). */
function nearSet(w: World, R: number, cam: THREE.Vector3, was: Set<number>, follow: number | null): Set<number> {
  const r = MARKER_AT * getQuality().lod;
  const within: { id: number; d: number }[] = [];
  for (const c of w.creatures) {
    if (!c.alive) continue;
    AT.set(c.x, c.y, c.z).multiplyScalar((R + Math.max(0, c.ground ?? 0) + c.alt) / R);
    const d = cam.distanceTo(AT);
    const held = was.has(c.id) ? d / KEEP : d;
    if (c.id === follow || (held < r && inSight(R, AT, cam))) within.push({ id: c.id, d: c.id === follow ? -1 : held });
  }
  if (within.length > WHOLE_MAX) within.sort((a, b) => a.d - b.d || a.id - b.id).length = WHOLE_MAX;
  return new Set(within.map((x) => x.id));
}

const youngOf = (c: Creature) => c.age < c.traits.maturity * JUVENILE_UNTIL;

export function LabCast({ world, R }: { world: World; R: number }) {
  const camera = useThree((st) => st.camera);
  const follow = useLab((st) => st.follow);
  const near = useRef<Set<number>>(new Set());
  const [, redraw] = useState(0);
  const judged = useRef(0);
  useEffect(() => {
    near.current = new Set();
    judged.current = 0;
  }, [world]);
  useSkinScheduler();
  useFrame((_, dt) => {
    judged.current -= dt;
    if (judged.current > 0) return;
    judged.current = JUDGE;
    near.current = nearSet(world, R, camera.position, near.current, useLab.getState().follow);
    CAST.bodies = near.current.size;
    // (re-drawn each judgement: the cast changes as they are born and die, and the young grow up)
    redraw((x) => x + 1);
  });
  return (
    <>
      {world.creatures.map((c) =>
        c.alive && near.current.has(c.id) ? <Body key={`${c.id}:${youngOf(c) ? 'y' : 'a'}`} c={c} world={world} R={R} selected={c.id === follow} /> : null,
      )}
      <Markers world={world} R={R} near={near} />
    </>
  );
}

/** One creature, drawn whole: the valley's actor, on a sphere. */
function Body({ c, world, R, selected }: { c: Creature; world: World; R: number; selected: boolean }) {
  const young = youngOf(c);
  const { traits } = bodyOf(c.genome);
  const { phenotype } = bodyOf(young ? juvenileGenome(c.genome) : c.genome);
  const place = rigOf(phenotype);
  const ref = useRef<THREE.Group>(null);
  const rig = useMemo(() => createRig(phenotype), [phenotype]);
  const jaw = useMemo<JawControl>(() => ({ open: 0 }), []);
  const lids = useMemo<LidControl>(() => ({ shut: 0 }), []);
  const flight = useMemo<FlightControl | null>(() => (traits.winged ? { spread: 0, flap: 0 } : null), [traits.winged]);
  const swimmer = traits.habitat === 'water' || traits.locomotion === 'swim' || traits.locomotion === 'drift';
  const P = useRef(null as unknown as { p: Vec3; f: Vec3; sleep: number; eat: number; alt: number; fly: number; beat: number; climb: number; display: number; stalk: number; turn: number; bob: number });
  if (P.current === null) {
    const p = unitOf(c);
    P.current = { p, f: headOf(c, p), sleep: 0, eat: 0, alt: c.alt, fly: 0, beat: (c.id * 0.618) % 6, climb: 0, display: 0, stalk: 0, turn: 0, bob: (c.id * 1.7) % 10 };
  }
  const here = (v: THREE.Vector3) => {
    const p = P.current.p;
    return v.set(p[0], p[1], p[2]).multiplyScalar(R + Math.max(0, c.ground ?? 0) + P.current.alt);
  };
  const scratch = useRef(new THREE.Vector3());
  const lod = useLod(() => here(scratch.current), selected, here);
  const want: Skin = selected ? 'high' : lod.distant ? 'far' : 'low';
  const skin = useSkin(phenotype, want);
  const pick = (e: ThreeEvent<MouseEvent>) => {
    // (the end of a drag over an animal is not a click on it)
    if (e.delta > 4) return;
    e.stopPropagation();
    useLab.getState().set({ follow: c.id });
  };
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || dt <= 0) return;
    const S = P.current;
    const k = Math.min(1, dt * 10);
    // ease along the sphere toward where the simulation has it, and toward the way it faces
    const to = unitOf(c);
    S.p = normalize([S.p[0] + (to[0] - S.p[0]) * k, S.p[1] + (to[1] - S.p[1]) * k, S.p[2] + (to[2] - S.p[2]) * k]);
    const was = S.f;
    const tf = headOf(c, S.p);
    const kf = Math.min(1, dt * 6);
    const f = tangent(S.p, [was[0] + (tf[0] - was[0]) * kf, was[1] + (tf[1] - was[1]) * kf, was[2] + (tf[2] - was[2]) * kf]);
    S.f = f[0] || f[1] || f[2] ? f : tf;
    const turnNow = Math.atan2(dot(cross(was, S.f), S.p), dot(was, S.f)) / dt;
    S.turn += (turnNow - S.turn) * Math.min(1, dt * 4);
    S.sleep += ((c.action === 'sleep' ? 1 : 0) - S.sleep) * Math.min(1, dt * 2);
    lids.shut = Math.min(1, S.sleep * 1.4);
    const feeding = c.action === 'graze' || c.action === 'eat' || c.action === 'forage' || c.action === 'filter';
    S.eat += ((feeding && c.speed < 0.6 ? 1 : 0) - S.eat) * Math.min(1, dt * 3);
    const s = growthOf(c);
    const prevAlt = S.alt;
    S.alt += (c.alt - S.alt) * k;
    const roosting = c.perch >= 0 && c.action === 'sleep';
    S.fly += ((!roosting && (c.alt > AIRBORNE || (c.fly && c.alt > 0.05)) ? 1 : 0) - S.fly) * Math.min(1, dt * 4);
    S.climb += ((S.alt - prevAlt) / dt - S.climb) * Math.min(1, dt * 3);
    S.display += ((c.action === 'mate' && c.courtT > 0 && c.courtT < COURT_TIME ? 1 : 0) - S.display) * Math.min(1, dt * 3);
    S.stalk += ((c.action === 'hunt' && c.chaseT <= 0 && c.alt <= AIRBORNE ? 1 : 0) - S.stalk) * Math.min(1, dt * 4);
    if (flight) {
      flight.spread = Math.max(S.fly, 0.55 * S.display * (1 - S.fly));
      const power = S.climb > 0.4 ? 1 : S.climb < -0.6 ? 0.08 : 0.55;
      S.beat += dt * (9 / Math.pow(Math.max(0.3, s * traits.length * 0.35), 0.35)) * (0.4 + 0.6 * power);
      flight.flap = S.fly > 0.05 ? wingbeat(S.beat, power) : 0.3 * S.display * Math.sin(world.time * 14);
    }
    poseRig(rig, {
      dt,
      speed: c.speed / s,
      cruise: traits.speed / s,
      sleep: S.sleep,
      eat: S.eat,
      swim: swimmer,
      turn: S.turn,
      fly: S.fly,
      idle: Math.max(0, 1 - c.speed / Math.max(0.3, traits.speed * 0.3)) * (1 - S.eat) * (1 - S.sleep) * (1 - S.fly) * (1 - S.display),
      display: S.display,
      stalk: S.stalk,
      look: [0, 0],
    });
    // how high: the valley's actor's own reckoning, from the ground under it, then out along the planet's up
    const ground = c.ground ?? 0;
    let y = ground + place.lift * s;
    if (swimmer && ground < WATER_LEVEL) {
      y = Math.max(ground + place.lift * s, WATER_LEVEL - place.height * s * 0.55);
      S.bob += dt * (1 + c.speed);
      y += Math.sin(S.bob) * 0.06 * s;
    } else if (ground < WATER_LEVEL) y = Math.max(y, WATER_LEVEL - place.height * s * 0.4);
    y -= S.sleep * rig.template.belly * s * SLEEP_DROP;
    y -= S.stalk * place.height * s * 0.12;
    if (S.alt > 0.01) y = Math.max(y, Math.max(ground, WATER_LEVEL) + place.lift * s * (1 - S.fly * 0.5)) + S.alt;
    g.position.set(S.p[0], S.p[1], S.p[2]).multiplyScalar(R + y);
    faceOn(g, S.p, S.f, -THREE.MathUtils.clamp(S.climb * 0.12, -0.35, 0.35) * S.fly, -THREE.MathUtils.clamp(S.turn * 0.45, -0.6, 0.6) * S.fly);
    g.scale.setScalar(s);
    const open = c.action === 'hunt' ? 1.35 : c.action === 'flee' ? 0.55 : S.eat > 0.4 ? 0.3 + 0.45 * Math.max(0, Math.sin(S.bob * 9)) : 0;
    S.bob += dt;
    jaw.open += (open - jaw.open) * Math.min(1, dt * 8);
  });
  return (
    <group ref={ref}>
      <group position={[-place.center[0], 0, -place.center[2]]}>
        <JawContext.Provider value={jaw}>
          <FlightContext.Provider value={flight}>
            <LidContext.Provider value={lids}>
              <CreatureMesh phenotype={phenotype} skinMode={skin ? 'hybrid' : 'capsules'} quality={skin ?? plainSkin(lod.distant)} lazyShell={!skin} rig={rig} detail={lod.detail} carved={false} fur={selected && lod.detail === 'full'} />
            </LidContext.Provider>
          </FlightContext.Provider>
        </JawContext.Provider>
      </group>
      {/* an invisible pick target, the only thing in the body that is raycast */}
      <mesh position={[0, -place.lift + place.height * 0.5, 0]} onClick={pick}>
        <boxGeometry args={[traits.radius * 2.2, place.height, traits.length * 0.9]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}

const MARKER_MAX = 2048;
const MARK = new THREE.Object3D();
const MARK_C = new THREE.Color();

/** Every living creature not drawn whole and in sight, as the valley's marker: a low, long shape in its own
 *  colours, its size, on the ground or in the air where it is, facing the way it faces. */
function Markers({ world, R, near }: { world: World; R: number; near: { current: Set<number> } }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((st) => st.camera);
  const geo = useMemo(() => new THREE.SphereGeometry(1, 10, 6).scale(0.5, 0.4, 0.95), []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial(), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    let n = 0;
    for (const c of world.creatures) {
      if (!c.alive || near.current.has(c.id) || n >= MARKER_MAX) continue;
      // (sized by its bulk, not its reach, as the valley's are)
      const size = 0.85 * Math.cbrt(c.traits.mass) * (0.4 + 0.6 * growthOf(c));
      const ground = c.ground ?? 0;
      const swims = c.traits.habitat === 'water' && ground < WATER_LEVEL;
      const p = unitOf(c);
      MARK.position.set(p[0], p[1], p[2]).multiplyScalar(R + (swims ? WATER_LEVEL - size * 0.6 : Math.max(ground, WATER_LEVEL) + c.alt + size * 0.4));
      if (!inSight(R, MARK.position, camera.position)) continue;
      faceOn(MARK, p, headOf(c, p));
      MARK.scale.setScalar(size);
      MARK.updateMatrix();
      m.setMatrixAt(n, MARK.matrix);
      const pal = c.genome.palette;
      m.setColorAt(n, MARK_C.setHSL(pal.hueA, Math.min(1, pal.sat) * 0.6, Math.min(0.55, Math.max(0.2, pal.light * 0.8))));
      n++;
    }
    m.count = n;
    CAST.markers = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  // (never culled as one: the instances spread over the whole planet, beyond the template's bounds)
  return <instancedMesh ref={ref} args={[geo, mat, MARKER_MAX]} frustumCulled={false} />;
}
