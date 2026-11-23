/**
 * The World screen's scene when the game's world is a planet: its ground, waters and sky (PlanetSky.tsx), its
 * trees and bushes, its living (PlanetCast.tsx: the creature looked at always whole), the globe camera
 * following the creature followed, the simulation stepped as the valley's is (in its worker: SimDriver.tsx),
 * a click on the globe placing a release or a carried creature, the documentary's director, the sound, and
 * the photo mode's stills.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { setRadialUp } from '../../viewer/creatureMaterial';
import type { World } from '../../sim/world';
import type { PlanetSurface } from '../../sim/planetSurface';
import { carry } from '../../sim/god';
import { applySea, setSea } from '../../sim/levers';
import { getWorld, useWorldUi } from '../worldStore';
import { SimDriver } from '../SimDriver';
import { SoundDriver, StillCapture } from '../WorldScene';
import { interest } from '../Director';
import { useStore } from '../../ui/store';
import { Bushes } from './Bushes';
import { CAMERA, GlobeCamera, pick, type CameraStart } from './GlobeCamera';
import { CAST, PlanetCast } from './PlanetCast';
import { PlanetSky } from './PlanetSky';
import { Trees } from './Trees';
import { GROUND_DRAWN } from './GroundChunks';

export function PlanetScene() {
  const [world, setWorld] = useState(() => getWorld());
  // (a new game or a loaded one swaps the world object: pick it up)
  useFrame(() => {
    const w = getWorld();
    if (w !== world) setWorld(w);
  });
  const S = world.surface as PlanetSurface;
  // (every coat countershaded against the planet's up, not the world's +Y: see setRadialUp)
  useEffect(() => {
    setRadialUp(true);
    return () => setRadialUp(false);
  }, []);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __planetScene?: unknown }).__planetScene = {
      camera: CAMERA,
      cast: CAST,
      ground: GROUND_DRAWN,
      radius: S.ground.radius,
      checksum: S.ground.bake.checksum,
      // (dev: the sea moved to `bu` at once, its lever set the way it went — for shots of a coast)
      seaTo: (bu: number) =>
        useWorldUi.getState().godAct((w) => {
          setSea(w, Math.sign(bu));
          w.levers.seaNow = bu;
          applySea(w, true);
          return true;
        }),
    };
  }, [S]);
  return (
    <>
      <SimDriver />
      <PlanetSky world={world} S={S} />
      <Trees ground={S.ground} world={world} tilt={S.tilt} />
      <Bushes world={world} ground={S.ground} />
      <Cast world={world} R={S.ground.radius} />
      <Camera key={`${world.seed}:${S.ground.bake.checksum}:${world.cap}`} world={world} S={S} />
      <GlobePicker world={world} R={S.ground.radius} />
      <PlanetDirector />
      <SoundDriver />
      <StillCapture />
    </>
  );
}

/** The cast, the game's way: the creature selected is drawn whole wherever it is, and a click picks one. */
function Cast({ world, R }: { world: World; R: number }) {
  const selected = useWorldUi((s) => s.selected);
  const onPick = useWorldUi((s) => s.pick);
  return <PlanetCast world={world} R={R} selected={selected} onPick={onPick} />;
}

/** (dev: ?view=orbit|region|ground|low opens on that view, and ?at=lon,lat (degrees) over that place, for
 *  inspection shots) */
const DEV_VIEW = (() => {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('view');
  return v === 'orbit' || v === 'region' || v === 'ground' || v === 'low' ? v : null;
})();
const DEV_NIGHT = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('at') === 'night';
const DEV_AT = ((): [number, number, number] | null => {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null;
  const m = new URLSearchParams(location.search).get('at')?.split(',').map(Number);
  if (!m || m.length !== 2 || !m.every(Number.isFinite)) return null;
  const lon = (m[0] * Math.PI) / 180, lat = (m[1] * Math.PI) / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)];
})();

/** The globe camera, the game's way: over the homeland at first, and kept on the creature followed (the
 *  creature panel's follow, a census row, the documentary). Its keys are its own unless a menu is up; Esc is
 *  the menu's. */
function Camera({ world, S }: { world: World; S: PlanetSurface }) {
  const selected = useWorldUi((s) => s.selected);
  const follow = useWorldUi((s) => s.follow);
  // (dev: ?at=night opens over the middle of the night side, for shots of it)
  const start = useMemo<CameraStart>(() => {
    const s = S.sunAt(world.time);
    return { view: DEV_VIEW ?? 'region', at: DEV_NIGHT ? [-s[0], -s[1], -s[2]] : DEV_AT };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <GlobeCamera ground={S.ground} world={world} home={S.home} follow={follow ? selected : null} keysOn={() => !useStore.getState().menuOpen} start={start} />;
}

/** While a release (or a creature carried in god mode) is being placed: a click on the globe (not a drag,
 *  which turns it) lets them go there. */
function GlobePicker({ world, R }: { world: World; R: number }) {
  const placing = useWorldUi((s) => s.placing);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!placing) return;
    const el = gl.domElement;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    };
    const onUp = (e: PointerEvent) => {
      const from = down;
      down = null;
      if (!from || e.button !== 0 || Math.hypot(e.clientX - from.x, e.clientY - from.y) > 5) return;
      const u = pick(camera, el, e.clientX, e.clientY, R);
      if (!u) return;
      const at = { x: u[0] * R, y: u[1] * R, z: u[2] * R };
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
  }, [placing, camera, gl, world, R]);
  return null;
}

/** The documentary on a planet: the valley's choice of subject (Director.tsx's `interest`), held a while and
 *  then cut from, with the globe camera following each one down. */
function PlanetDirector() {
  const hold = useRef(0);
  const recent = useRef<number[]>([]);
  const lastSpecies = useRef(-1);
  useFrame((_, dtRaw) => {
    const ui = useWorldUi.getState();
    if (!ui.documentary) return;
    const dt = Math.min(dtRaw, 0.1);
    const w = getWorld();
    const cur = ui.selected !== null ? w.creatures.find((c) => c.id === ui.selected && c.alive) : undefined;
    hold.current -= dt;
    const boring = cur ? interest(w, cur) < 3 : true;
    const moment = cur?.action === 'hunt' ? 24 : 14;
    if (cur && hold.current > 0 && !(boring && hold.current < moment - 6)) return;
    let best: World['creatures'][number] | null = null;
    let bs = -Infinity;
    for (const c of w.creatures) {
      if (!c.alive) continue;
      let s = interest(w, c) + Math.random() * 3;
      if (recent.current.includes(c.id)) s -= 8;
      if (c.species === lastSpecies.current) s -= 2;
      if (s > bs) {
        bs = s;
        best = c;
      }
    }
    if (!best) return;
    ui.select(best.id);
    if (!ui.follow) ui.setFollow(true);
    recent.current = [best.id, ...recent.current].slice(0, 6);
    lastSpecies.current = best.species;
    hold.current = best.action === 'hunt' ? 24 : 14;
  });
  return null;
}
