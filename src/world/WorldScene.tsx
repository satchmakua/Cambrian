/**
 * The World's 3D scene: steps the simulation from the render loop and draws it.
 *
 * The sim runs on a fixed 20 Hz clock (deterministic); `SimDriver` accumulates real time × the
 * time-warp and steps that many fixed ticks per frame (capped so a slow frame can't spiral). The
 * sun and sky follow the sim's day/night cycle — dawn, a high noon, a warm dusk, a blue night with
 * stars and a moon-light — and the shadow camera tracks the view so shadows stay crisp anywhere.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sky, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { dayPhase, isNight, growthOf, dryNow, type World, climateOf, leverSnow } from '../sim/world';
import { SOUND } from './audio';
import { heightAt, inBounds, WATER_LEVEL, type Terrain } from '../sim/terrain';
import { PAN_KEYS, keysToAxes, panDelta } from './keyPan';
import { TerrainMesh, Water, Bushes, Decor, updateSeasonLook } from './Landscape';
import { Grass } from './Flora';
import { Nests } from './Nests';
import { Ambient } from './Ambient';
import { FOLIAGE_CUT } from './foliage';
import { Precipitation, WEATHER_LOOK, setPrecipDaylight, updateWeatherLook } from './Weather';
import { Director } from './Director';
import { Actor, Carcass, capsuled, useSkinScheduler } from './Actors';
import { getWorld, useWorldUi, worldVersion, bumpVersion, worldSceneLive, setHost } from './worldStore';
import { pageHost, workerHost, type SimHost } from './simHost';
import { carry } from '../sim/god';
import { StudioEnvironment } from '../viewer/StudioEnvironment';
import { getQuality, useQuality } from '../ui/settings';
import { useStore } from '../ui/store';

const MAX_STEPS_PER_FRAME = 90;

function SimDriver() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const snapTimer = useRef(0);
  const lastShape = useRef('');
  // the valley is stepped in a worker (the page draws from a mirror of its world), or — where no worker
  // can run, or a dev page asks with ?worker=0 — by the page, as it always was
  const host = useMemo(() => {
    const page = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('worker') === '0';
    return (page ? null : workerHost(getWorld, () => undefined)) ?? pageHost(getWorld);
  }, []);
  useEffect(() => {
    setHost(host);
    host.invalidate();
    if (import.meta.env.DEV) (window as unknown as { __simHost?: SimHost }).__simHost = host;
    return () => {
      setHost(null);
      host.dispose();
    };
  }, [host]);
  useFrame((_, dtRaw) => {
    const { running, speed, refresh } = useWorldUi.getState();
    const w = getWorld();
    updateSeasonLook(w.time, dryNow(w), leverSnow(w));
    updateWeatherLook(w, dtRaw);
    const dt = Math.min(dtRaw, 0.1);
    if (running) host.advance(dt * speed, MAX_STEPS_PER_FRAME);
    // re-render the actor list when births/deaths change the cast
    const shape = `${w.creatures.length}:${w.creatures[w.creatures.length - 1]?.id ?? 0}:${w.corpses.length}:${w.corpses[w.corpses.length - 1]?.id ?? 0}:${w.eggs.length}:${w.eggs[0]?.id ?? 0}`;
    if (shape !== lastShape.current) {
      lastShape.current = shape;
      bumpVersion();
    }
    snapTimer.current += dtRaw;
    if (snapTimer.current > 0.25) {
      snapTimer.current = 0;
      refresh();
      if (import.meta.env.DEV) {
        (window as unknown as { __worldScene?: unknown }).__worldScene = scene;
        (window as unknown as { __worldInfo?: unknown }).__worldInfo = {
          calls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          geometries: gl.info.memory.geometries,
          creatures: w.creatures.length,
          stepper: host.where,
          capsules: capsuled(),
        };
      }
    }
  });
  return null;
}

/** The sun's shadow map is redrawn once in this many frames (see DayNight). */
export const SHADOW_EVERY = 2;

/** Sun, moon and sky from the time of day. */
function DayNight() {
  const q = useQuality();
  const gl = useThree((s) => s.gl);
  // The sun's shadow map is redrawn every other frame. Drawing it means drawing every shadow caster
  // in the valley again from the sun — about half as many triangles as the picture itself — and
  // nearly all of them are trees and bushes whose shadows move with the sun, a hair a second. On
  // the frames between, the map and the matrix that reads it are both the last ones drawn, so the
  // shadows stay exactly where they were; a running animal's shadow is one frame behind it.
  const frame = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    frame.current = 0; // (a new light, a new map size: draw it on the very next frame)
    return () => {
      gl.shadowMap.autoUpdate = true;
      gl.shadowMap.needsUpdate = true;
    };
  }, [gl, q.shadows, q.shadowMap]);
  useFrame(() => {
    if (frame.current++ % SHADOW_EVERY === 0) gl.shadowMap.needsUpdate = true;
  });
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const scene = useThree((s) => s.scene);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const [sunPos, setSunPos] = useState<[number, number, number]>([100, 60, 40]);
  const [overcast, setOvercast] = useState(0);
  const tick = useRef(0);
  const fog = useMemo(() => new THREE.Fog(0x9fb4c8, 90, 260), []);
  useEffect(() => {
    scene.add(target);
    scene.fog = fog;
    return () => {
      scene.remove(target);
      scene.fog = null;
    };
  }, [scene, target, fog]);
  useFrame((_, dt) => {
    const w = getWorld();
    const p = dayPhase(w.time); // 0 dawn, .25 noon, .5 dusk, .75 midnight
    const ang = p * Math.PI * 2;
    const elev = Math.sin(ang); // >0 day
    const dir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(-0.2, elev), 0.35).normalize();
    const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.25);
    const cloud = WEATHER_LOOK.cloud;
    setPrecipDaylight(day * (1 - 0.4 * cloud));
    const focus = controls?.target ?? new THREE.Vector3();
    if (sun.current) {
      // by night the "sun" light is a dim blue moon from the opposite sky
      const lightDir = day > 0.02 ? dir : new THREE.Vector3(-dir.x, Math.abs(dir.y) + 0.4, -dir.z).normalize();
      sun.current.position.copy(focus).addScaledVector(lightDir, 120);
      target.position.copy(focus);
      sun.current.target = target;
      const warm = THREE.MathUtils.smoothstep(elev, 0.0, 0.35); // low sun is warm
      sun.current.color.setRGB(1, 0.72 + 0.26 * warm, 0.5 + 0.45 * warm).lerp(new THREE.Color(0x8ea8ff), 1 - day);
      // under cloud the sun is a dim diffuse glow (the sky and the fog carry the light)
      sun.current.intensity = (0.25 + 1.75 * day) * (1 - 0.68 * cloud);
    }
    if (hemi.current) hemi.current.intensity = (0.18 + 0.5 * day) * (1 + 0.15 * cloud);
    (scene as unknown as { environmentIntensity: number }).environmentIntensity = (0.18 + 0.62 * day) * (1 - 0.28 * cloud);
    fog.color.setRGB(0.04 + 0.58 * day, 0.06 + 0.64 * day, 0.11 + 0.68 * day);
    // overcast: a flat grey sky, and the far hills lost in the murk of a shower
    fog.color.lerp(new THREE.Color(0.06 + 0.42 * day, 0.07 + 0.45 * day, 0.09 + 0.48 * day), cloud * 0.8);
    fog.near = 90 - 50 * cloud;
    fog.far = 260 - 120 * WEATHER_LOOK.rain;
    scene.background = fog.color;
    tick.current += dt;
    if (tick.current > 0.2) {
      tick.current = 0;
      setSunPos([dir.x * 400, dir.y * 400, dir.z * 400]);
      setOvercast(Math.round(cloud * 20) / 20);
    }
  });
  const night = sunPos[1] < 0;
  return (
    <>
      <directionalLight
        key={q.shadowMap}
        ref={sun}
        castShadow={q.shadows}
        shadow-mapSize={[q.shadowMap || 512, q.shadowMap || 512]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={10}
        shadow-camera-far={300}
        shadow-bias={-0.0005}
      />
      <hemisphereLight ref={hemi} args={['#cfe0ff', '#3a3022', 0.6]} />
      <Sky distance={4500} sunPosition={sunPos} turbidity={6 + 14 * overcast} rayleigh={(night ? 0.2 : 1.6) * (1 - 0.75 * overcast)} mieCoefficient={0.006 + 0.02 * overcast} mieDirectionalG={0.85 - 0.3 * overcast} />
      {night && overcast < 0.4 && <Stars radius={300} depth={60} count={q.stars} factor={5} fade speed={0.3} />}
    </>
  );
}

/** Follow the selected creature: glide the orbit target (and the camera with it). */
/** Keeps the audio listener on the camera and the ambience in step with the day and the season. */
function SoundDriver() {
  const camera = useThree((s) => s.camera);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  // suspend the ambience (wind and rain beds) when the World is left — it played on in the breeder —
  // and resume it on return if the sound is still switched on
  useEffect(() => {
    worldSceneLive(true);
    return () => worldSceneLive(false);
  }, []);
  useFrame(() => {
    if (!SOUND.running) return;
    const w = getWorld();
    camera.getWorldDirection(fwd);
    SOUND.tick({ x: camera.position.x, y: camera.position.y, z: camera.position.z, fx: fwd.x, fy: fwd.y, fz: fwd.z }, isNight(w.time), climateOf(w).cold, WEATHER_LOOK.snow ? 0 : WEATHER_LOOK.rain);
  });
  return null;
}

function FollowCam() {
  const zoomFor = useRef<number | null>(null);
  const zoomLeft = useRef(0);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  useFrame((_, dt) => {
    const { follow, selected } = useWorldUi.getState();
    const c = follow && selected !== null && controls ? getWorld().creatures.find((x) => x.id === selected) : undefined;
    if (!c || !controls) {
      FOLIAGE_CUT.value.w = 0;
      return;
    }
    // (a flier is followed up into the air)
    const goal = new THREE.Vector3(c.x, Math.max(heightAt(getWorld().terrain, c.x, c.z), -0.5) + c.traits.height * 0.5 + c.alt, c.z);
    // keep a clear line of sight to it through any leaves in the way
    FOLIAGE_CUT.value.set(goal.x, goal.y, goal.z, 0.9 + 0.6 * Math.max(c.traits.length, c.traits.height) * growthOf(c));
    const delta = goal.sub(controls.target).multiplyScalar(Math.min(1, dt * 3));
    controls.target.add(delta);
    camera.position.add(delta);
    // glide in to a distance that frames this creature (the user can still orbit / zoom)
    if (zoomFor.current !== selected) {
      zoomFor.current = selected;
      zoomLeft.current = 2.5; // seconds of easing
    }
    if (zoomLeft.current > 0) {
      zoomLeft.current -= dt;
      const want = Math.min(40, Math.max(6, c.traits.length * 3.2));
      const off = camera.position.clone().sub(controls.target);
      const d = off.length();
      off.multiplyScalar((d + (want - d) * Math.min(1, dt * 2.5)) / Math.max(d, 1e-3));
      camera.position.copy(controls.target).add(off);
    }
    controls.update();
  });
  return null;
}

/**
 * WASD / the arrow keys pan the view over the ground (Shift hurries): the orbit target and the camera
 * slide together, the pivot riding the ground beneath it, held inside the world. Taking the camera
 * back ends following and the documentary.
 */
// --- the camera: framing the valley, saved views, a still -------------------------------------------

/** the views saved with Shift+1…4, kept in the browser between visits */
const VIEWS_KEY = 'cambrian.views';
type View = { pos: [number, number, number]; target: [number, number, number] };
function savedViews(): (View | null)[] {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? [0, 1, 2, 3].map((i) => (v[i] && Array.isArray(v[i].pos) && Array.isArray(v[i].target) ? (v[i] as View) : null)) : [null, null, null, null];
  } catch {
    return [null, null, null, null];
  }
}
function keepViews(v: (View | null)[]): void {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(v));
  } catch {
    /* not kept: they last until the page closes */
  }
}

/** The still the photo mode saves: the scene drawn once more, read straight off the canvas (null until the
 *  valley is up). */
let CAPTURE: (() => string) | null = null;
export function captureStill(): string | null {
  return CAPTURE ? CAPTURE() : null;
}

/**
 * F (or Home) flies the camera out to frame the whole valley; Shift+1…4 saves the view, and 1…4 flies back
 * to it. A flight eases in and out over most of a second; the documentary and following let go of the
 * camera for it.
 */
function CameraKeys() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const flight = useRef<{ from: View; to: View; t: number } | null>(null);
  useEffect(() => {
    CAPTURE = () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/png');
    };
    return () => {
      CAPTURE = null;
    };
  }, [gl, scene, camera]);
  useEffect(() => {
    const here = (): View | null => (controls ? { pos: camera.position.toArray() as View['pos'], target: controls.target.toArray() as View['target'] } : null);
    const fly = (to: View) => {
      const from = here();
      if (!from) return;
      const ui = useWorldUi.getState();
      if (ui.documentary) ui.setDocumentary(false);
      if (ui.follow) ui.setFollow(false);
      flight.current = { from, to, t: 0 };
    };
    const key = (e: KeyboardEvent) => {
      if (useStore.getState().menuOpen || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.code === 'KeyF' || e.code === 'Home') {
        const terrain = getWorld().terrain;
        const s = terrain.size;
        fly({ pos: [0, s * 0.62, s * 0.72], target: [0, 0, s * 0.04] });
      } else if (/^Digit[1-4]$/.test(e.code)) {
        const i = Number(e.code.slice(5)) - 1;
        const views = savedViews();
        if (e.shiftKey) {
          const v = here();
          if (!v) return;
          views[i] = v;
          keepViews(views);
          useWorldUi.getState().notify(`View ${i + 1} saved: press ${i + 1} to come back to it`);
        } else if (views[i]) fly(views[i]!);
        else useWorldUi.getState().notify(`No view ${i + 1} yet: Shift+${i + 1} saves the one you have`);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [camera, controls]);
  useFrame((_, dt) => {
    const f = flight.current;
    if (!f || !controls) return;
    f.t = Math.min(1, f.t + dt / 0.85);
    const k = f.t * f.t * (3 - 2 * f.t);
    camera.position.set(...(f.from.pos.map((a, i) => a + (f.to.pos[i] - a) * k) as [number, number, number]));
    controls.target.set(...(f.from.target.map((a, i) => a + (f.to.target[i] - a) * k) as [number, number, number]));
    controls.update();
    if (f.t >= 1) flight.current = null;
  });
  return null;
}

function KeyPan() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const held = useRef(new Set<string>());
  const view = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      // (under the game menu the keys are the menu's: nothing is held, and the arrows scroll its lists)
      if (useStore.getState().menuOpen) return held.current.clear();
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') held.current.add(e.code);
      if (!PAN_KEYS.has(e.code)) return;
      held.current.add(e.code);
      e.preventDefault(); // (the arrows would scroll the page)
    };
    const up = (e: KeyboardEvent) => held.current.delete(e.code);
    const drop = () => held.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', drop);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', drop);
    };
  }, []);
  useFrame((_, dt) => {
    if (!controls || held.current.size === 0) return;
    const axes = keysToAxes(held.current);
    if (!axes.fwd && !axes.right) return;
    const ui = useWorldUi.getState();
    if (ui.documentary) ui.setDocumentary(false);
    if (ui.follow) ui.setFollow(false);
    camera.getWorldDirection(view);
    const t = controls.target;
    const [dx, dz] = panDelta(axes, view.x, view.z, camera.position.distanceTo(t), Math.min(dt, 0.1));
    const terrain = getWorld().terrain;
    const half = terrain.size * 0.48;
    const nx = Math.min(half, Math.max(-half, t.x + dx));
    const nz = Math.min(half, Math.max(-half, t.z + dz));
    const ground = Math.max(heightAt(terrain, nx, nz), WATER_LEVEL);
    const dy = (ground - t.y) * Math.min(1, dt * 4);
    camera.position.x += nx - t.x;
    camera.position.z += nz - t.z;
    camera.position.y += dy;
    t.set(nx, t.y + dy, nz);
    controls.update();
  });
  return null;
}

/** Beyond this distance from the camera (bu, × the creature-detail option's scale) a creature is drawn
 *  as a marker — a small shape in its own colours — not as a body: a valley can then hold more animals
 *  than can be drawn whole. (The one selected is always drawn whole.) */
const MARKER_AT = 80;
/** …and never more than this many bodies at once, the nearest: each body is posed and drawn every frame,
 *  and in a valley of six hundred, from the usual view, five hundred stood within the line (eight frames a
 *  second on a laptop's best graphics card; at most 140 of them whole, 26) */
const WHOLE_MAX = 90;
/** how often (s) who is near enough is judged again, and how far past the line a body is kept (×) */
const MARKER_JUDGE = 0.4;
const MARKER_KEEP = 1.15;
const NEAR_AT = new THREE.Vector3();

/** Which living creatures are near enough to the camera to be drawn whole (`was`: those drawn whole
 *  now, kept until MARKER_KEEP past the line, so a body at the edge does not flicker). */
function nearSet(world: World, cam: THREE.Vector3, k: number, was: Set<number>, selected: number | null): Set<number> {
  const r = MARKER_AT * k;
  const within: { id: number; d: number }[] = [];
  for (const c of world.creatures) {
    if (!c.alive) continue;
    const d = cam.distanceTo(NEAR_AT.set(c.x, c.y + c.alt, c.z));
    // (one drawn whole now is judged a little nearer than it is: it holds its body past the line)
    const held = was.has(c.id) ? d / MARKER_KEEP : d;
    if (c.id === selected || held < r) within.push({ id: c.id, d: c.id === selected ? -1 : held });
  }
  if (within.length > WHOLE_MAX) within.sort((a, b) => a.d - b.d || a.id - b.id).length = WHOLE_MAX;
  return new Set(within.map((x) => x.id));
}

function Cast({ world }: { world: World }) {
  const camera = useThree((s) => s.camera);
  const selected = useWorldUi((s) => s.selected);
  // who is drawn whole: judged when the cast changes, and every MARKER_JUDGE s as the camera moves
  const near = useRef<Set<number>>(null!);
  if (near.current === null) near.current = nearSet(world, camera.position, getQuality().lod, new Set(), selected);
  const [, setV] = useState(0);
  const seen = useRef(-1);
  const judged = useRef(0);
  useFrame((_, dt) => {
    const v = worldVersion();
    judged.current -= dt;
    if (v === seen.current && judged.current > 0) return;
    judged.current = MARKER_JUDGE;
    const next = nearSet(world, camera.position, getQuality().lod, near.current, useWorldUi.getState().selected);
    const same = next.size === near.current.size && [...next].every((id) => near.current.has(id));
    near.current = next;
    if (v !== seen.current || !same) {
      seen.current = v;
      setV((x) => x + 1);
    }
  });
  useSkinScheduler();
  // (a creature clicked is picked by hand: its panel opens, even if it had been closed)
  const pick = useWorldUi((s) => s.pick);
  return (
    <>
      {world.creatures.map((c) =>
        near.current.has(c.id) || c.id === selected ? <Actor key={c.id} c={c} world={world} onPick={pick} selected={c.id === selected} /> : null,
      )}
      <Markers world={world} near={near} />
      <Nests world={world} />
      {world.corpses.map((k) => (
        <Carcass key={k.id} k={k} world={world} />
      ))}
    </>
  );
}

/** the most markers drawn at once (above the largest valley's capacity) */
const MARKER_MAX = 1024;
const MARKER_O = new THREE.Object3D();
const MARKER_C = new THREE.Color();

/** Every living creature not drawn whole, as one instanced shape each: a low, long body in its own
 *  colours, its size, on the ground or in the air where it is, facing the way it faces. */
function Markers({ world, near }: { world: World; near: { current: Set<number> } }) {
  const ref = useRef<THREE.InstancedMesh>(null);
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
      // (sized by its bulk, not its reach: a squid's sprawled arms or a fish's fins made a marker the size
      // of a boat)
      const size = 0.85 * Math.cbrt(c.traits.mass) * (0.4 + 0.6 * growthOf(c));
      const ground = heightAt(world.terrain, c.x, c.z);
      // (a swimmer rides under the surface; anything else stands on the ground, and a flier is up where it
      // flies)
      const swims = c.traits.habitat === 'water' && ground < WATER_LEVEL;
      MARKER_O.position.set(c.x, swims ? WATER_LEVEL - size * 0.6 : Math.max(ground, WATER_LEVEL) + c.alt + size * 0.4, c.z);
      MARKER_O.rotation.set(0, c.heading, 0);
      MARKER_O.scale.setScalar(size);
      MARKER_O.updateMatrix();
      m.setMatrixAt(n, MARKER_O.matrix);
      // (its own colours, muted toward a coat's: at a distance a body is not a lamp)
      const p = c.genome.palette;
      m.setColorAt(n, MARKER_C.setHSL(p.hueA, Math.min(1, p.sat) * 0.6, Math.min(0.55, Math.max(0.2, p.light * 0.8))));
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  // (never culled as one: the instances spread over the whole valley, beyond the template's bounds)
  return <instancedMesh ref={ref} args={[geo, mat, MARKER_MAX]} frustumCulled={false} castShadow={false} />;
}

let WORLD_IDS = 0;

/** Where a ray from the camera first meets the ground (or the lake's surface): marched, then halved
 *  down to the crossing. Null when it meets none inside the valley. */
function groundHit(t: Terrain, ray: THREE.Ray): { x: number; z: number } | null {
  const o = ray.origin, d = ray.direction;
  const above = (s: number) => o.y + d.y * s - Math.max(heightAt(t, o.x + d.x * s, o.z + d.z * s), WATER_LEVEL);
  let prev = 0;
  for (let s = 0.5; s < 900; s += 0.75) {
    if (above(s) <= 0) {
      let lo = prev, hi = s;
      for (let i = 0; i < 20; i++) {
        const m = (lo + hi) / 2;
        if (above(m) > 0) lo = m;
        else hi = m;
      }
      const x = o.x + d.x * hi, z = o.z + d.z * hi;
      return inBounds(t, x, z, 4) ? { x, z } : null;
    }
    prev = s;
  }
  return null;
}

/** While a release is being placed: a click on the ground (not a drag, which turns the view) lets the
 *  animals go there. */
function GroundPicker({ world }: { world: World }) {
  const placing = useWorldUi((s) => s.placing);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!placing) return;
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    };
    const onUp = (e: PointerEvent) => {
      const from = down;
      down = null;
      if (!from || e.button !== 0 || Math.hypot(e.clientX - from.x, e.clientY - from.y) > 5) return;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const at = groundHit(world.terrain, ray.ray);
      if (!at) return;
      const ui = useWorldUi.getState();
      if (placing.kind === 'release') ui.releaseGenome(placing.genome, placing.count, at, placing.root);
      else {
        // (carried: set down at the click, and the placing is done)
        const c = world.creatures.find((x) => x.id === placing.id);
        if (c) ui.godAct((w) => carry(w, c, at));
        ui.setPlacing(null);
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
    };
  }, [placing, camera, gl, world]);
  return null;
}

export function WorldScene() {
  const [world, setWorld] = useState(() => getWorld());
  // a reset swaps the world object — pick it up
  useFrame(() => {
    const w = getWorld();
    if (w !== world) setWorld(w);
  });
  // every world object gets its own landscape (a loaded world may share the old one's seed)
  const wid = useMemo(() => ++WORLD_IDS, [world]);
  const lake = world.terrain;
  return (
    <>
      <SimDriver />
      <DayNight />
      <StudioEnvironment />
      <TerrainMesh key={`t${wid}`} world={world} />
      <Water terrain={world.terrain} />
      <Bushes key={`b${wid}`} world={world} />
      <Decor key={`d${wid}`} terrain={world.terrain} world={world} />
      <Grass key={`g${wid}`} world={world} />
      <Precipitation />
      <Ambient />
      <Cast world={world} />
      <GroundPicker world={world} />
      {/* (a wheel notch zooms nearly twice as far as the default, and a drag pans further: across a
          valley 220 units wide the defaults crawled; the damping settles sooner, so a zoom ends crisply) */}
      <OrbitControls
        makeDefault
        target={[lake.lakeX, 0, lake.lakeZ + lake.lakeR * 0.9]}
        maxPolarAngle={Math.PI * 0.47}
        minDistance={1.2}
        maxDistance={220}
        enableDamping
        dampingFactor={0.08}
        zoomSpeed={1.8}
        panSpeed={1.4}
        zoomToCursor
      />
      <FollowCam />
      <CameraKeys />
      <KeyPan />
      {import.meta.env.DEV && <DevLook />}
      <Director />
      <SoundDriver />
    </>
  );
}

/** Dev/headless: ?look=river (or ?look=x,z) points the camera at a spot for inspection shots. */
function DevLook() {
  const camera = useThree((st) => st.camera);
  const gl = useThree((st) => st.gl);
  const scene = useThree((st) => st.scene);
  const controls = useThree((st) => st.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const done = useRef(false);
  // (dev: what the last frame cost to draw — a measuring stick for the graphics options)
  useEffect(() => {
    // …and where the triangles are: every visible mesh, grouped by kind and size
    (window as unknown as { __cambrianBreakdown?: () => unknown }).__cambrianBreakdown = () => {
      const groups = new Map<string, { meshes: number; triangles: number; shadow: number }>();
      scene.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.geometry) return;
        const g = m.geometry;
        const per = (g.index ? g.index.count : g.getAttribute('position')?.count ?? 0) / 3;
        const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
        const kind = (m as THREE.InstancedMesh).isInstancedMesh ? `instanced(${Math.round(per)} tris × n)` : (m as THREE.SkinnedMesh).isSkinnedMesh ? 'skinned' : per > 20000 ? `mesh(${Math.round(per / 1000)}k)` : 'mesh';
        const e = groups.get(kind) ?? { meshes: 0, triangles: 0, shadow: 0 };
        e.meshes += 1;
        e.triangles += per * inst;
        if (m.castShadow) e.shadow += per * inst;
        groups.set(kind, e);
      });
      return [...groups.entries()].sort((a, b) => b[1].triangles - a[1].triangles).slice(0, 14).map(([k, v]) => `${k}: ${v.meshes} meshes, ${Math.round(v.triangles / 1000)}k tris (${Math.round(v.shadow / 1000)}k cast shadows)`);
    };
    // …and what each top-level part of the scene costs to DRAW (every pass): hide it, render, compare
    (window as unknown as { __cambrianCost?: () => unknown }).__cambrianCost = () => {
      const draw = () => {
        gl.render(scene, camera);
        return { tris: gl.info.render.triangles, calls: gl.info.render.calls };
      };
      const base = draw();
      const rows: { what: string; tris: number; calls: number }[] = [];
      const actors = { tris: 0, calls: 0, n: 0 };
      for (const child of scene.children) {
        if (!child.visible) continue;
        child.visible = false;
        const t = draw();
        child.visible = true;
        const saved = { tris: base.tris - t.tris, calls: base.calls - t.calls };
        if (saved.tris <= 0 && saved.calls <= 0) continue;
        let first: THREE.Mesh | null = null;
        child.traverse((o) => {
          if (!first && (o as THREE.Mesh).isMesh) first = o as THREE.Mesh;
        });
        const f = first as THREE.Mesh | null;
        const skinned = !!f && (child as THREE.Group).isGroup;
        if (skinned) {
          // (creatures and carcasses: summed)
          actors.tris += saved.tris;
          actors.calls += saved.calls;
          actors.n++;
          continue;
        }
        const g = f?.geometry;
        const per = g ? Math.round((g.index ? g.index.count : g.getAttribute('position')?.count ?? 0) / 3) : 0;
        const inst = f && (f as THREE.InstancedMesh).isInstancedMesh ? (f as THREE.InstancedMesh).count : 1;
        const mat = f ? (Array.isArray(f.material) ? f.material[0] : f.material) : null;
        rows.push({ what: `${child.type} ${per} tris × ${inst}${mat ? ` [${mat.type}${mat.transparent ? ' transparent' : ''}${mat.side === THREE.DoubleSide ? ' double-sided' : ''}]` : ''}`, ...saved });
      }
      rows.push({ what: `${actors.n} groups (creatures, carcasses, nests…)`, tris: actors.tris, calls: actors.calls });
      return { base, rows: rows.sort((a, b) => b.tris - a.tris).slice(0, 16).map((r) => `${String(Math.round(r.tris / 1000)).padStart(5)}k tris ${String(r.calls).padStart(4)} calls  ${r.what}`) };
    };
    // …and what a frame costs to draw END TO END, the graphics card included: `n` frames drawn in a
    // row, each waited out (gl.finish), in ms a frame. (The frame loop's own pace says little on a slow
    // or a software renderer, where the browser decides when a frame may start.)
    (window as unknown as { __cambrianFrameMs?: (n?: number) => unknown }).__cambrianFrameMs = (n = 3) => {
      const ctx = gl.getContext();
      gl.render(scene, camera);
      ctx.finish();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        gl.render(scene, camera);
        ctx.finish();
      }
      return { ms: (performance.now() - t0) / n, triangles: gl.info.render.triangles, calls: gl.info.render.calls };
    };
    (window as unknown as { __cambrianRender?: () => unknown }).__cambrianRender = () => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      points: gl.info.render.points,
      lines: gl.info.render.lines,
      programs: gl.info.programs?.length ?? 0,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      pixels: gl.domElement.width * gl.domElement.height,
    });
  }, [gl, scene, camera]);
  useFrame(() => {
    if (done.current || !controls) return;
    const q = new URLSearchParams(location.search).get('look');
    done.current = true;
    if (!q) return;
    const t = getWorld().terrain;
    let x = 0, z = 0;
    const w0 = getWorld();
    const egg = w0.eggs.find((e) => !e.water);
    const corpse = w0.corpses.find((k) => k.meat > 0);
    if (q === 'nest' && egg) {
      x = egg.x;
      z = egg.z;
    } else if (q === 'carcass' && corpse) {
      x = corpse.x;
      z = corpse.z;
    } else if (q === 'river') {
      // a point some way down the river's course
      const s = t.lakeR * 0.6 + 34;
      x = t.lakeX + Math.sin(t.riverA) * s;
      z = t.lakeZ + Math.cos(t.riverA) * s;
    } else {
      // (look=nest before any land clutch, look=carcass before any death, or a malformed look: leave
      // the camera alone)
      const [px, pz] = q === 'nest' || q === 'carcass' ? [NaN, NaN] : q.split(',').map(Number);
      if (!Number.isFinite(px) || !Number.isFinite(pz)) return;
      x = px;
      z = pz;
    }
    const y = Math.max(0, heightAt(t, x, z));
    controls.target.set(x, y, z);
    const k = q === 'nest' ? 0.3 : q === 'carcass' ? 0.55 : 1;
    camera.position.set(x + 14 * k, y + 12 * k, z + 16 * k);
    controls.update();
  });
  return null;
}

