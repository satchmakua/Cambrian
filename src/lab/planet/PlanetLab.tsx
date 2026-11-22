/**
 * The planet lab (dev: /?lab=planet): a living planet under a globe camera. A world made by the simulation
 * itself (createPlanet): its ground and sea, its trees and bushes, and the valley's starter cast set down in
 * its homeland, living as the valley's do — eating, sleeping, courting, hunting, breeding and dying — and
 * spreading out over the rest of it, under a sun that goes round once a day. Stepped on the page, and not
 * saved: the worker and the saves are later steps (ROADMAP.md, "The planet, in a branch").
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { setRadialUp } from '../../viewer/creatureMaterial';
import { StudioEnvironment } from '../../viewer/StudioEnvironment';
import { createPlanet, DAY_LENGTH, dayNumber, dayPhase, speciesById, stepWorld, STEP, yearNumber, YEAR_DAYS, type World } from '../../sim/world';
import { populateCast } from '../../sim/cast';
import { CAPACITIES } from '../../sim/model';
import type { PlanetSurface } from '../../sim/planetSurface';
import { airRadius, atmosphereMaterial } from './atmosphere';
import { Bushes } from './Bushes';
import { CAMERA, GlobeCamera, LOOK } from './GlobeCamera';
import { CAST, LabCast } from './LabCast';
import { START_DAYS, useLab } from './labStore';
import { cellsFor, groundGeometry, groundMaterial, seaGeometry } from './planetMesh';
import { Trees } from './Trees';

const UP = new THREE.Vector3(0, 1, 0);
const AT = new THREE.Vector3();
const SUN = new THREE.Vector3();
const TURN = new THREE.Quaternion();
const TURNED = new THREE.Euler();

/** frames drawn a second, for the HUD */
const FRAME = { fps: 0 };
/** the valley's crowding: 165 animals on its 200 bu square */
const GROUND_EACH = (200 * 200) / 165;

export default function PlanetLab() {
  const radius = useLab((s) => s.radius);
  const relief = useLab((s) => s.relief);
  const land = useLab((s) => s.land);
  const cap = useLab((s) => s.cap);
  const seed = useLab((s) => s.seed);
  // a new world for each planet: its ground, and the valley's starter cast set down in its homeland
  const world = useMemo(() => {
    const w = createPlanet({ seed, radius, relief, land }, cap);
    populateCast(w, 'standard');
    // (?days=: run on before it is shown)
    for (let i = 0; i < (START_DAYS * DAY_LENGTH) / STEP; i++) stepWorld(w);
    return w;
  }, [seed, radius, relief, land, cap]);
  const S = world.surface as PlanetSurface;
  // (every coat countershaded against the planet's up, not the world's +Y: see setRadialUp)
  useEffect(() => {
    setRadialUp(true);
    return () => setRadialUp(false);
  }, []);
  // (a new planet: nobody to follow on it yet)
  useEffect(() => useLab.getState().set({ follow: null }), [world]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __planetLab: unknown }).__planetLab = {
      radius,
      relief,
      land,
      cap,
      get time() {
        return world.time;
      },
      get alive() {
        return world.creatures.filter((c) => c.alive).length;
      },
      get kinds() {
        return world.species.filter((s) => s.alive > 0).length;
      },
      get births() {
        return world.tally.births;
      },
      camera: CAMERA,
      cast: CAST,
      frame: FRAME,
    };
  }, [world, radius, relief, land, cap]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#020306' }}>
      <Canvas dpr={[1, 1.75]} camera={{ fov: 45, near: 0.1, far: 20000, position: [0, 0, radius * 3] }} gl={{ preserveDrawingBuffer: import.meta.env.DEV }}>
        <Scene world={world} S={S} />
      </Canvas>
      <Hud world={world} />
    </div>
  );
}

/** Steps the world on the page at the chosen speed (a frame's debt beyond a few dozen steps is dropped:
 *  better a slower clock than a frozen page). */
function Stepper({ world }: { world: World }) {
  const owed = useRef(0);
  useFrame((_, dt) => {
    owed.current += Math.min(dt, 0.1) * useLab.getState().speed;
    let n = 0;
    while (owed.current >= STEP && n < 24) {
      stepWorld(world);
      owed.current -= STEP;
      n++;
    }
    if (n === 24) owed.current = 0;
  });
  return null;
}

function Scene({ world, S }: { world: World; S: PlanetSurface }) {
  const g = S.ground;
  const R = g.radius;
  const groundGeo = useMemo(() => groundGeometry(g, cellsFor(R)), [g, R]);
  useEffect(() => () => groundGeo.dispose(), [groundGeo]);
  const sea = useMemo(() => seaGeometry(R), [R]);
  useEffect(() => () => sea.dispose(), [sea]);
  const groundMat = useMemo(() => groundMaterial(g.relief), [g.relief]);
  const seaMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0, transparent: true, opacity: 0.86, depthWrite: false }), []);
  const air = useMemo(() => atmosphereMaterial(), []);
  const airGeo = useMemo(() => new THREE.SphereGeometry(1, 128, 64), []);
  useEffect(
    () => () => {
      groundMat.dispose();
      seaMat.dispose();
      air.dispose();
      airGeo.dispose();
    },
    [groundMat, seaMat, air, airGeo],
  );
  const scene = useThree((st) => st.scene);
  const fog = useMemo(() => new THREE.FogExp2(0x000000, 0), []);
  useEffect(() => {
    scene.fog = fog;
    scene.background = new THREE.Color(0x020306);
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, fog]);
  const sun = useRef<THREE.DirectionalLight>(null);
  const Ra = airRadius(R);
  useFrame(({ camera }) => {
    // the sun where the simulation has it (its night is the creatures' night)
    const s = S.sunAt(world.time);
    SUN.set(s[0], s[1], s[2]);
    sun.current?.position.copy(SUN).multiplyScalar(1000);
    // the studio light (the valley's environment map), turned so its overhead lies up the planet's up where
    // the camera looks: a map lights by world direction, and unturned its sky would light the flanks of
    // every body away from the north pole. Dimmed with the day there, and drawn back from orbit, where the
    // sun alone should light the globe and leave its night side dark.
    const T = LOOK.T;
    TURN.setFromUnitVectors(UP, AT.set(T[0], T[1], T[2])).invert();
    TURNED.setFromQuaternion(TURN, 'XYZ');
    // (three samples the map turned by the opposite of each angle: see its WebGLMaterials)
    scene.environmentRotation.set(-TURNED.x, -TURNED.y, -TURNED.z, 'XYZ');
    const dayT = THREE.MathUtils.smoothstep(AT.dot(SUN), -0.12, 0.25);
    scene.environmentIntensity = (0.18 + 0.62 * dayT) * (1 - 0.85 * LOOK.orbit);
    const u = air.uniforms;
    u.uCam.value.copy(camera.position);
    u.uSun.value.copy(SUN);
    u.uR.value = R;
    u.uRa.value = Ra;
    // in the air, a haze in the sky's colour (dark on the night side), the thicker the deeper in it the
    // camera is: from orbit, none
    const c = camera.position, r = c.length();
    const inAir = 1 - THREE.MathUtils.smoothstep(r, R + (Ra - R) * 0.35, Ra);
    const day = THREE.MathUtils.smoothstep(c.dot(SUN) / r, -0.12, 0.25);
    fog.color.setRGB(0.3 * day, 0.4 * day, 0.5 * day);
    fog.density = 0.0055 * inAir;
  });
  return (
    <>
      <StudioEnvironment />
      <directionalLight ref={sun} intensity={2.6} />
      <ambientLight intensity={0.04} />
      <mesh geometry={groundGeo} material={groundMat} />
      <mesh geometry={sea} material={seaMat} renderOrder={1} />
      <mesh geometry={airGeo} material={air} scale={Ra} renderOrder={2} frustumCulled={false} />
      <Stars radius={R * 9} depth={R * 2} count={3000} factor={5} saturation={0} fade speed={0} />
      <Trees ground={g} />
      <Bushes world={world} ground={g} />
      <LabCast world={world} R={R} />
      <GlobeCamera key={`${world.seed}:${R}:${g.relief}:${g.land}:${world.cap}`} ground={g} world={world} home={S.home} />
      <Stepper world={world} />
      <FrameCounter />
    </>
  );
}

function FrameCounter() {
  const acc = useRef({ t: 0, n: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.t += dt;
    a.n++;
    if (a.t >= 0.5) {
      FRAME.fps = a.n / a.t;
      a.t = 0;
      a.n = 0;
    }
  });
  return null;
}

// --- the HUD -----------------------------------------------------------------------------------------

/** the sizes liked best (2026-11-21: 250–400 bu) */
const PRESETS = [250, 300, 350, 400];
const SPEEDS = [0, 1, 4, 16];
const VERBS: Record<string, string> = {
  wander: 'wandering',
  sleep: 'asleep',
  flee: 'fleeing',
  graze: 'grazing',
  filter: 'filter-feeding',
  forage: 'eating fruit',
  scavenge: 'scavenging',
  eat: 'eating',
  hunt: 'hunting',
  mate: 'courting',
};

const PANEL: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  width: 330,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(8, 12, 14, 0.74)',
  color: '#d8e0dc',
  font: '12px/1.45 system-ui, sans-serif',
  userSelect: 'none',
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ margin: '6px 0' }}>
      <div style={{ opacity: 0.75, marginBottom: 2 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

/** A slider that changes the planet when it is let go (each change makes a new planet: dragged, it would
 *  make one at every step of the drag). */
function Slider({ value, min, max, step, onCommit }: { value: number; min: number; max: number; step: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && onCommit(v);
  return <input type="range" min={min} max={max} step={step} value={v} style={{ flex: 1 }} onChange={(e) => setV(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />;
}

function button(on: boolean): React.CSSProperties {
  return { padding: '2px 8px', borderRadius: 4, border: '1px solid #4a5a55', background: on ? '#3d6b5c' : '#18211f', color: '#e4ece8', cursor: 'pointer', font: 'inherit' };
}

/** the time of day where the homeland is, as a clock (its noon a quarter through the day) */
function clockOf(t: number): string {
  const h = (dayPhase(t) * 24 + 6) % 24;
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
}

function Hud({ world }: { world: World }) {
  const { radius, relief, land, cap, speed, follow, set } = useLab();
  const read = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      const el = read.current;
      if (!el) return;
      const t = world.time;
      const live = world.creatures.filter((c) => c.alive);
      const kinds = world.species.filter((s) => s.alive > 0).length;
      const f = follow === null ? undefined : live.find((c) => c.id === follow);
      el.textContent = [
        `year ${yearNumber(t)}, day ${((dayNumber(t) - 1) % YEAR_DAYS) + 1} · ${clockOf(t)} in the homeland`,
        `${live.length} alive, ${kinds} kinds · ${world.tally.births} born · ${world.tally.kills + world.tally.starvation + world.tally.oldAge} dead`,
        f ? `following ${speciesById(world, f.species)?.name ?? '?'}: ${VERBS[f.action] ?? f.action}${f.alt > 0.45 ? ', aloft' : ''}` : 'click an animal to follow it',
        `camera   ${CAMERA.alt.toFixed(1)} bu up · horizon ${CAMERA.horizon.toFixed(0)} bu, ${CAMERA.dip.toFixed(1)}° down`,
        `drawn    ${CAST.bodies} whole, ${CAST.markers} as markers, ${FRAME.fps.toFixed(0)} fps`,
      ].join('\n');
    }, 250);
    return () => window.clearInterval(id);
  }, [world, follow]);
  const landArea = 4 * Math.PI * radius * radius * land;
  return (
    <div style={PANEL}>
      <div style={{ fontWeight: 600 }}>
        Planet lab <span style={{ opacity: 0.6, fontWeight: 400 }}>· a living planet</span>
      </div>
      <Row label="time">
        {SPEEDS.map((s) => (
          <button key={s} style={button(speed === s)} onClick={() => set({ speed: s })}>
            {s === 0 ? 'stop' : `${s}×`}
          </button>
        ))}
      </Row>
      <pre ref={read} style={{ margin: '6px 0', font: '11px/1.45 ui-monospace, monospace', whiteSpace: 'pre-wrap', color: '#bfe3d4' }} />
      <Row label={`radius ${radius} bu`}>
        {PRESETS.map((r) => (
          <button key={r} style={button(radius === r)} title={`${Math.round((4 * Math.PI * r * r * land) / GROUND_EACH).toLocaleString()} animals would be the valley's crowding`} onClick={() => set({ radius: r })}>
            {r}
          </button>
        ))}
        <Slider value={radius} min={40} max={600} step={5} onCommit={(r) => set({ radius: r })} />
      </Row>
      <Row label={`relief ${relief} bu (the valley's: about 14)`}>
        <Slider value={relief} min={0} max={40} step={1} onCommit={(r) => set({ relief: r })} />
      </Row>
      <Row label={`land ${Math.round(land * 100)}% of the surface`}>
        <Slider value={land} min={0.15} max={0.8} step={0.05} onCommit={(l) => set({ land: l })} />
      </Row>
      <Row label={`at most ${cap} animals (the valley's sizes)`}>
        {CAPACITIES.map((n) => (
          <button key={n} style={button(cap === n)} onClick={() => set({ cap: n })}>
            {n}
          </button>
        ))}
      </Row>
      <div style={{ opacity: 0.75 }}>
        {Math.round(landArea).toLocaleString()} bu² of land: {(landArea / 40000).toFixed(1)} valleys
        {follow !== null && (
          <>
            {' · '}
            <a href="#" style={{ color: '#9fd8c4' }} onClick={(e) => (e.preventDefault(), set({ follow: null }))}>
              stop following
            </a>
          </>
        )}
      </div>
      <div style={{ opacity: 0.6, marginTop: 6 }}>
        drag: spin the globe, or look round close up · right-drag: pan · wheel: zoom to the pointer · double-click: fly there · click an animal to follow it (Esc lets go) · F: the whole planet · 1–4: orbit, region, ground, low
      </div>
      <a href="/" style={{ display: 'inline-block', marginTop: 6, color: '#9fd8c4' }}>
        ← back to Cambrian
      </a>
    </div>
  );
}
