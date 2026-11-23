/**
 * The planet lab (dev: /?lab=planet): a living planet under a globe camera. A world made by the simulation
 * itself (createPlanet): its ground and sea, its trees and bushes, and the valley's starter cast set down in
 * its homeland, living as the valley's do — eating, sleeping, courting, hunting, breeding and dying — and
 * spreading out over the rest of it, under a sun that goes round once a day. Stepped on the page, and not
 * saved: the worker and the saves are later steps (ROADMAP.md, "The planet, in a branch").
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { setRadialUp } from '../../viewer/creatureMaterial';
import { createPlanet, DAY_LENGTH, dayNumber, dayPhase, speciesById, stepWorld, STEP, yearNumber, yearPhase, YEAR_DAYS, type World } from '../../sim/world';
import { populateCast } from '../../sim/cast';
import type { PlanetSurface } from '../../sim/planetSurface';
import { Bushes } from '../../world/planet/Bushes';
import { CAMERA, GlobeCamera } from '../../world/planet/GlobeCamera';
import { CAST, PlanetCast } from '../../world/planet/PlanetCast';
import { PlanetSky } from '../../world/planet/PlanetSky';
import { PLANET_CAPS } from '../../sim/planetDesign';
import { START_AT, START_DAYS, START_FOLLOW, START_JUMP, START_VIEW, useLab } from './labStore';
import { GROUND_DRAWN } from '../../world/planet/GroundChunks';
import { RIVER, SWIM_FLOW } from '../../sim/planetBake';
import { biomeOn } from '../../sim/planetGround';
import { cellCentre } from '../../sim/cubeGrid';
import { Trees } from '../../world/planet/Trees';

/** frames drawn a second, for the HUD */
const FRAME = { fps: 0 };
/** how long each planet took to make (its terrain baked, its world laid out), for the HUD: its first making
 *  (in development React makes each world twice, the second time on the ground already baked) */
const MADE = new Map<string, number>();
const madeKey = (s: { seed: number; radius: number; relief: number; land: number; continents: number; rugged: number; temperature: number; wetness: number; tilt: number; shelf: number; cap: number }) =>
  [s.seed, s.radius, s.relief, s.land, s.continents, s.rugged, s.temperature, s.wetness, s.tilt, s.shelf, s.cap].join(':');
/** the valley's crowding: 165 animals on its 200 bu square */
const GROUND_EACH = (200 * 200) / 165;

export default function PlanetLab() {
  const radius = useLab((s) => s.radius);
  const relief = useLab((s) => s.relief);
  const land = useLab((s) => s.land);
  const continents = useLab((s) => s.continents);
  const rugged = useLab((s) => s.rugged);
  const temperature = useLab((s) => s.temperature);
  const wetness = useLab((s) => s.wetness);
  const tilt = useLab((s) => s.tilt);
  const shelf = useLab((s) => s.shelf);
  const cap = useLab((s) => s.cap);
  const seed = useLab((s) => s.seed);
  // a new world for each planet: its ground, and the valley's starter cast set down in its homeland
  const world = useMemo(() => {
    const t0 = performance.now();
    const w = createPlanet({ seed, radius, relief, land, continents, rugged, temperature, wetness, tilt, shelf }, cap);
    const key = madeKey({ seed, radius, relief, land, continents, rugged, temperature, wetness, tilt, shelf, cap });
    if (!MADE.has(key)) MADE.set(key, performance.now() - t0);
    populateCast(w, 'standard');
    // (?jump=: the clock moved on, unlived, to a season; ?days=: run on before it is shown)
    w.time += START_JUMP * DAY_LENGTH;
    for (let i = 0; i < (START_DAYS * DAY_LENGTH) / STEP; i++) stepWorld(w);
    return w;
  }, [seed, radius, relief, land, continents, rugged, temperature, wetness, tilt, shelf, cap]);
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
      ground: GROUND_DRAWN,
      madeMs: MADE.get(madeKey(useLab.getState())),
      checksum: S.ground.bake.checksum,
    };
  }, [world, S, radius, relief, land, cap]);
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
  return (
    <>
      <PlanetSky world={world} S={S} />
      <Trees ground={g} world={world} tilt={S.tilt} />
      <Bushes world={world} ground={g} />
      <LabCast world={world} R={g.radius} />
      <LabCamera world={world} S={S} />
      <Stepper world={world} />
      <FrameCounter />
    </>
  );
}

/** The cast, the lab's way: a click follows the animal clicked. */
function LabCast({ world, R }: { world: World; R: number }) {
  const follow = useLab((st) => st.follow);
  return <PlanetCast world={world} R={R} selected={follow} onPick={(id) => useLab.getState().set({ follow: id })} />;
}

/** The camera, the lab's way: following the lab's animal, opening where the URL says, Esc letting go. */
function LabCamera({ world, S }: { world: World; S: PlanetSurface }) {
  const g = S.ground;
  const follow = useLab((st) => st.follow);
  const start = useMemo(() => ({ view: START_VIEW, at: START_AT, follow: START_FOLLOW ? (id: number) => useLab.getState().set({ follow: id }) : undefined }), []);
  return <GlobeCamera key={`${world.seed}:${g.radius}:${g.relief}:${g.land}:${g.continents}:${g.rugged}:${g.temperature}:${g.wetness}:${g.shelf}:${S.tilt}:${world.cap}`} ground={g} world={world} home={S.home} follow={follow} onLetGo={() => useLab.getState().set({ follow: null })} start={start} />;
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

const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];
/** the season in each hemisphere (the south's half a year on from the north's) */
function seasonsOf(t: number): string {
  const q = Math.floor(yearPhase(t) * 4) % 4;
  return `${SEASON_NAMES[q]} in the north, ${SEASON_NAMES[(q + 2) % 4]} in the south`;
}

/** the time of day where the homeland is, as a clock (its noon a quarter through the day) */
function clockOf(t: number): string {
  const h = (dayPhase(t) * 24 + 6) % 24;
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
}

function Hud({ world }: { world: World }) {
  const { radius, relief, land, continents, rugged, temperature, wetness, tilt, shelf, cap, seed, speed, follow, set } = useLab();
  const madeIn = MADE.get(madeKey({ seed, radius, relief, land, continents, rugged, temperature, wetness, tilt, shelf, cap })) ?? 0;
  // what grows where: each kind of ground's share of the land
  const lands = useMemo(() => {
    const g = (world.surface as PlanetSurface).ground;
    const N = g.bake.grid.N, share = new Map<string, number>();
    let all = 0;
    for (let k = 0; k < g.bake.grid.count; k += 3) {
      const b = biomeOn(g, cellCentre(N, k));
      if (b === 'deep' || b === 'shallow') continue;
      share.set(b, (share.get(b) ?? 0) + 1);
      all++;
    }
    return [...share.entries()].sort((a, c) => c[1] - a[1]).map(([b, c]) => `${b} ${Math.round((100 * c) / Math.max(1, all))}%`).join(' · ');
  }, [world]);
  const bake = (world.surface as PlanetSurface).ground.bake;
  const waters = useMemo(() => {
    const lakes = bake.bodies.filter((b) => b.kind === 'lake');
    let river = 0, swim = 0;
    for (let k = 0; k < bake.kind.length; k++) {
      if (bake.kind[k] !== RIVER) continue;
      river++;
      if (bake.flow[k] >= SWIM_FLOW) swim++;
    }
    const cell = ((Math.PI / 2) * radius) / bake.grid.N;
    return { lakes: lakes.length, joined: lakes.filter((l) => l.swim).length, river: Math.round(river * cell), swim: Math.round(swim * cell) };
  }, [bake, radius]);
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
        `year ${yearNumber(t)}, day ${((dayNumber(t) - 1) % YEAR_DAYS) + 1} · ${clockOf(t)} in the homeland · ${seasonsOf(t)}`,
        `${live.length} alive, ${kinds} kinds · ${world.tally.births} born · ${world.tally.kills + world.tally.starvation + world.tally.oldAge} dead`,
        f ? `following ${speciesById(world, f.species)?.name ?? '?'}: ${VERBS[f.action] ?? f.action}${f.alt > 0.45 ? ', aloft' : ''}` : 'click an animal to follow it',
        `camera   ${CAMERA.alt.toFixed(1)} bu up · horizon ${CAMERA.horizon.toFixed(0)} bu, ${CAMERA.dip.toFixed(1)}° down`,
        `drawn    ${CAST.bodies} whole, ${CAST.markers} as markers, ${FRAME.fps.toFixed(0)} fps`,
        `ground   ${GROUND_DRAWN.chunks} chunks of 384, ${Math.round(GROUND_DRAWN.cells / 1000)}k cells (all at the finest: 393k)`,
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
      <Row label={`continents ${continents.toFixed(2)} (a few great lands … many smaller)`}>
        <Slider value={continents} min={0} max={1} step={0.05} onCommit={(c) => set({ continents: c })} />
      </Row>
      <Row label={`rugged ${rugged.toFixed(2)} (gentle … mountainous)`}>
        <Slider value={rugged} min={0} max={1} step={0.05} onCommit={(r) => set({ rugged: r })} />
      </Row>
      <Row label={`temperature ${temperature >= 0 ? '+' : ''}${(temperature * 12).toFixed(0)}° (an ice world … a hothouse)`}>
        <Slider value={temperature} min={-1} max={1} step={0.05} onCommit={(t) => set({ temperature: t })} />
      </Row>
      <Row label={`wetness ${wetness >= 0 ? '+' : ''}${wetness.toFixed(2)} (deserts … forests)`}>
        <Slider value={wetness} min={-1} max={1} step={0.05} onCommit={(t) => set({ wetness: t })} />
      </Row>
      <Row label={`tilt ${tilt.toFixed(2)} (no seasons … the Earth's 0.5 … harsh)`}>
        <Slider value={tilt} min={0} max={1} step={0.05} onCommit={(t) => set({ tilt: t })} />
      </Row>
      <Row label={`shallow seas ${shelf.toFixed(2)} (coasts that drop to the deep … wide shelves: ${Math.round(4 + 40 * shelf)} bu)`}>
        <Slider value={shelf} min={0} max={1} step={0.05} onCommit={(t) => set({ shelf: t })} />
      </Row>
      <div style={{ opacity: 0.75, marginBottom: 4 }}>{lands}</div>
      <div style={{ opacity: 0.75, marginBottom: 4 }}>
        {waters.lakes} lakes ({waters.joined} joined to the next water by a river a fish can swim) · about {waters.river.toLocaleString()} bu of streams and rivers, {waters.swim.toLocaleString()} of them swimmable · made in {(madeIn / 1000).toFixed(1)} s
      </div>
      <Row label={`at most ${cap} animals (the valley's sizes, and twice its largest)`}>
        {PLANET_CAPS.map((n) => (
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
