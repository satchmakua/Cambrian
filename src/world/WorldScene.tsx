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
import { stepWorld, STEP, dayPhase, isNight, climate, type World } from '../sim/world';
import { SOUND } from './audio';
import { heightAt } from '../sim/terrain';
import { TerrainMesh, Water, Bushes, Decor, updateSeasonLook } from './Landscape';
import { Grass } from './Flora';
import { Precipitation, WEATHER_LOOK, setPrecipDaylight, updateWeatherLook } from './Weather';
import { Director } from './Director';
import { Actor, Carcass, useSkinScheduler } from './Actors';
import { getWorld, useWorldUi, worldVersion, bumpVersion } from './worldStore';
import { StudioEnvironment } from '../viewer/StudioEnvironment';

const MAX_STEPS_PER_FRAME = 90;

function SimDriver() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const acc = useRef(0);
  const snapTimer = useRef(0);
  const lastShape = useRef('');
  useFrame((_, dtRaw) => {
    const { running, speed, refresh } = useWorldUi.getState();
    const w = getWorld();
    updateSeasonLook(w.time);
    updateWeatherLook(w, dtRaw);
    const dt = Math.min(dtRaw, 0.1);
    if (running) {
      acc.current += dt * speed;
      let n = 0;
      while (acc.current >= STEP && n < MAX_STEPS_PER_FRAME) {
        stepWorld(w);
        acc.current -= STEP;
        n++;
      }
      if (n === MAX_STEPS_PER_FRAME) acc.current = 0; // falling behind: drop the backlog
    }
    // re-render the actor list when births/deaths change the cast
    const shape = `${w.creatures.length}:${w.creatures[w.creatures.length - 1]?.id ?? 0}:${w.corpses.length}:${w.corpses[w.corpses.length - 1]?.id ?? 0}`;
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
        };
      }
    }
  });
  return null;
}

/** Sun, moon and sky from the time of day. */
function DayNight() {
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
        ref={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
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
      {night && overcast < 0.4 && <Stars radius={300} depth={60} count={2500} factor={5} fade speed={0.3} />}
    </>
  );
}

/** Follow the selected creature: glide the orbit target (and the camera with it). */
/** Keeps the audio listener on the camera and the ambience in step with the day and the season. */
function SoundDriver() {
  const camera = useThree((s) => s.camera);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!SOUND.running) return;
    const w = getWorld();
    camera.getWorldDirection(fwd);
    SOUND.tick({ x: camera.position.x, y: camera.position.y, z: camera.position.z, fx: fwd.x, fy: fwd.y, fz: fwd.z }, isNight(w.time), climate(w.time).cold, WEATHER_LOOK.snow ? 0 : WEATHER_LOOK.rain);
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
    if (!follow || selected === null || !controls) return;
    const c = getWorld().creatures.find((x) => x.id === selected);
    if (!c) return;
    // (a flier is followed up into the air)
    const goal = new THREE.Vector3(c.x, Math.max(heightAt(getWorld().terrain, c.x, c.z), -0.5) + c.traits.height * 0.5 + c.alt, c.z);
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

function Cast({ world }: { world: World }) {
  // re-read the cast whenever the version bumps (polled cheaply each frame)
  const [, setV] = useState(0);
  const seen = useRef(-1);
  useFrame(() => {
    const v = worldVersion();
    if (v !== seen.current) {
      seen.current = v;
      setV(v);
    }
  });
  useSkinScheduler();
  const selected = useWorldUi((s) => s.selected);
  const select = useWorldUi((s) => s.select);
  return (
    <>
      {world.creatures.map((c) => (
        <Actor key={c.id} c={c} world={world} onPick={select} selected={c.id === selected} />
      ))}
      {world.corpses.map((k) => (
        <Carcass key={k.id} k={k} world={world} />
      ))}
    </>
  );
}

let WORLD_IDS = 0;

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
      <Cast world={world} />
      <OrbitControls
        makeDefault
        target={[lake.lakeX, 0, lake.lakeZ + lake.lakeR * 0.9]}
        maxPolarAngle={Math.PI * 0.47}
        minDistance={4}
        maxDistance={220}
        enableDamping
      />
      <FollowCam />
      {import.meta.env.DEV && <DevLook />}
      <Director />
      <SoundDriver />
    </>
  );
}

/** Dev/headless: ?look=river (or ?look=x,z) points the camera at a spot for inspection shots. */
function DevLook() {
  const camera = useThree((st) => st.camera);
  const controls = useThree((st) => st.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const done = useRef(false);
  useFrame(() => {
    if (done.current || !controls) return;
    const q = new URLSearchParams(location.search).get('look');
    done.current = true;
    if (!q) return;
    const t = getWorld().terrain;
    let x = 0, z = 0;
    if (q === 'river') {
      // a point some way down the river's course
      const s = t.lakeR * 0.6 + 34;
      x = t.lakeX + Math.sin(t.riverA) * s;
      z = t.lakeZ + Math.cos(t.riverA) * s;
    } else [x, z] = q.split(',').map(Number);
    const y = Math.max(0, heightAt(t, x, z));
    controls.target.set(x, y, z);
    camera.position.set(x + 14, y + 12, z + 16);
    controls.update();
  });
  return null;
}

