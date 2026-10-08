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
import { stepWorld, STEP, dayPhase, type World } from '../sim/world';
import { heightAt } from '../sim/terrain';
import { TerrainMesh, Water, Bushes, Decor } from './Landscape';
import { Actor, Carcass, useSkinScheduler } from './Actors';
import { getWorld, useWorldUi, worldVersion, bumpVersion } from './worldStore';
import { StudioEnvironment } from '../viewer/StudioEnvironment';

const MAX_STEPS_PER_FRAME = 90;

function SimDriver() {
  const acc = useRef(0);
  const snapTimer = useRef(0);
  const lastShape = useRef('');
  useFrame((_, dtRaw) => {
    const { running, speed, refresh } = useWorldUi.getState();
    const w = getWorld();
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
    const focus = controls?.target ?? new THREE.Vector3();
    if (sun.current) {
      // by night the "sun" light is a dim blue moon from the opposite sky
      const lightDir = day > 0.02 ? dir : new THREE.Vector3(-dir.x, Math.abs(dir.y) + 0.4, -dir.z).normalize();
      sun.current.position.copy(focus).addScaledVector(lightDir, 120);
      target.position.copy(focus);
      sun.current.target = target;
      const warm = THREE.MathUtils.smoothstep(elev, 0.0, 0.35); // low sun is warm
      sun.current.color.setRGB(1, 0.72 + 0.26 * warm, 0.5 + 0.45 * warm).lerp(new THREE.Color(0x8ea8ff), 1 - day);
      sun.current.intensity = 0.25 + 1.75 * day;
    }
    if (hemi.current) hemi.current.intensity = 0.18 + 0.5 * day;
    (scene as unknown as { environmentIntensity: number }).environmentIntensity = 0.18 + 0.62 * day;
    fog.color.setRGB(0.04 + 0.58 * day, 0.06 + 0.64 * day, 0.11 + 0.68 * day);
    scene.background = fog.color;
    tick.current += dt;
    if (tick.current > 0.2) {
      tick.current = 0;
      setSunPos([dir.x * 400, dir.y * 400, dir.z * 400]);
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
      <Sky distance={4500} sunPosition={sunPos} turbidity={6} rayleigh={night ? 0.2 : 1.6} mieCoefficient={0.006} mieDirectionalG={0.85} />
      {night && <Stars radius={300} depth={60} count={2500} factor={5} fade speed={0.3} />}
    </>
  );
}

/** Follow the selected creature: glide the orbit target (and the camera with it). */
function FollowCam() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  useFrame((_, dt) => {
    const { follow, selected } = useWorldUi.getState();
    if (!follow || selected === null || !controls) return;
    const c = getWorld().creatures.find((x) => x.id === selected);
    if (!c) return;
    const goal = new THREE.Vector3(c.x, heightAt(getWorld().terrain, c.x, c.z) + 1, c.z);
    const delta = goal.sub(controls.target).multiplyScalar(Math.min(1, dt * 3));
    controls.target.add(delta);
    camera.position.add(delta);
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

export function WorldScene() {
  const [world, setWorld] = useState(() => getWorld());
  // a reset swaps the world object — pick it up
  useFrame(() => {
    const w = getWorld();
    if (w !== world) setWorld(w);
  });
  const lake = world.terrain;
  return (
    <>
      <SimDriver />
      <DayNight />
      <StudioEnvironment />
      <TerrainMesh key={`t${world.seed}`} world={world} />
      <Water terrain={world.terrain} />
      <Bushes key={`b${world.seed}`} world={world} />
      <Decor key={`d${world.seed}`} terrain={world.terrain} />
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
    </>
  );
}
