/**
 * Documentary mode — an auto-director for the World camera.
 *
 * Every shot it scores what each creature is doing (a hunt with the prey in reach beats an escape
 * beats a courtship beats a bird on the wing beats a meal … beats wandering), adds a little chance
 * and a penalty for subjects it has just shown, and cuts to the best: the follow camera glides in,
 * the director drops the view to a low three-quarter angle and slowly orbits the subject. A shot
 * holds ~14 s (a hunt up to ~24 s, until it resolves), and cuts early if the subject dies or its
 * moment passes.
 */
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { AIRBORNE, type Creature, type World } from '../sim/world';
import { getWorld, useWorldUi } from './worldStore';

function interest(w: World, c: Creature): number {
  const near = (id: number, r: number) => {
    const o = w.creatures.find((x) => x.id === id && x.alive);
    return !!o && Math.hypot(o.x - c.x, o.z - c.z) < r;
  };
  switch (c.action) {
    case 'hunt':
      return near(c.target, 14) ? 16 : 9;
    case 'flee':
      return near(c.target, 12) ? 12 : 6;
    case 'mate':
      return 9;
    case 'eat':
      return 7;
    case 'scavenge':
      return 5;
    default:
      break;
  }
  if (c.alt > AIRBORNE) return 8;
  if (c.age < c.traits.maturity * 0.5 && c.parent !== null) return 5;
  if (c.action === 'forage' || c.action === 'graze' || c.action === 'filter') return 2.5;
  if (c.action === 'sleep') return 1.5;
  return 1;
}

export function Director() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const hold = useRef(0);
  const recent = useRef<number[]>([]);
  const lastSpecies = useRef(-1);
  const reframe = useRef(0);
  useFrame((_, dtRaw) => {
    const ui = useWorldUi.getState();
    if (!ui.documentary || !controls) return;
    const dt = Math.min(dtRaw, 0.1);
    const w = getWorld();
    const cur = ui.selected !== null ? w.creatures.find((c) => c.id === ui.selected && c.alive) : undefined;
    hold.current -= dt;
    const boring = cur ? interest(w, cur) < 3 : true;
    const moment = cur?.action === 'hunt' ? 24 : 14;
    if (!cur || hold.current <= 0 || (boring && hold.current < moment - 6)) {
      // cut: score everyone, favour variety
      let best: Creature | null = null;
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
      if (best) {
        ui.select(best.id);
        if (!ui.follow) ui.setFollow(true);
        recent.current = [best.id, ...recent.current].slice(0, 6);
        lastSpecies.current = best.species;
        hold.current = best.action === 'hunt' ? 24 : 14;
        reframe.current = 1.5;
      }
    }
    // the shot: ease down to a low three-quarter view, then a slow orbit around the subject
    const off = camera.position.clone().sub(controls.target);
    const dist = off.length();
    if (dist < 1e-3) return;
    const yaw = Math.atan2(off.x, off.z) + dt * 0.13;
    let elev = Math.asin(THREE.MathUtils.clamp(off.y / dist, -1, 1));
    if (reframe.current > 0) {
      reframe.current -= dt;
      elev += (0.36 - elev) * Math.min(1, dt * 2);
    }
    camera.position.set(
      controls.target.x + Math.sin(yaw) * Math.cos(elev) * dist,
      controls.target.y + Math.sin(elev) * dist,
      controls.target.z + Math.cos(yaw) * Math.cos(elev) * dist,
    );
    controls.update();
  });
  return null;
}
