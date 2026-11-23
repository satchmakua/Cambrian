/**
 * Steps the world from the render loop (a valley's and a planet's alike): the sim runs on a fixed 20 Hz
 * clock, in a worker where one can run (simHost.ts: the page draws from a mirror of its world) or on the
 * page, and real time × the time-warp is handed to whichever steps it, capped so a slow frame can't spiral.
 * It also keeps the HUD's snapshot fresh a few times a second, and tells the cast when births and deaths
 * have changed its shape. `look`: what the scene follows each frame of the world as it is (the valley's
 * seasons and weather).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { World } from '../sim/world';
import { getWorld, useWorldUi, bumpVersion, setHost } from './worldStore';
import { pageHost, workerHost, type SimHost } from './simHost';
import { capsuled } from './Actors';

const MAX_STEPS_PER_FRAME = 90;

export function SimDriver({ look }: { look?: (w: World, dt: number) => void }) {
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
    look?.(w, dtRaw);
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
