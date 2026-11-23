import { describe, expect, it } from 'vitest';
import { genomeOfMorphotype } from '../../src/engine/random';
import { createPlanet, killCreature, release, stepWorld, DAY_LENGTH, STEP, type World } from '../../src/sim/world';
import { loadWorld, saveWorld } from '../../src/sim/persist';
import type { PlanetSurface } from '../../src/sim/planetSurface';
import { arc, type Vec3 } from '../../src/sim/sphere';
import type { Place } from '../../src/sim/surface';

const SPEC = { seed: 19, radius: 160, relief: 22, land: 0.6 };
const unit = (p: Place): Vec3 => {
  const l = Math.hypot(p.x, p.y ?? 0, p.z);
  return [p.x / l, (p.y ?? 0) / l, p.z / l];
};
const runDays = (w: World, days: number) => {
  for (let i = 0; i < (days * DAY_LENGTH) / STEP; i++) stepWorld(w);
};

/** A place on land, half the planet away from the homeland, where a rodent may stand. */
function farLand(w: World): Place {
  const S = w.surface as PlanetSurface;
  const R = S.ground.radius;
  let best: Place | null = null, bd = -1;
  for (let i = 0; i < 4000; i++) {
    const p = S.cellCenter(Math.floor((i * 7919) % S.cells));
    const a = arc(unit(p), S.home);
    if (a > bd && S.height(p) > S.level(p) + 1 && a < Math.PI * 0.8) {
      bd = a;
      best = p;
    }
  }
  expect(best).not.toBe(null);
  expect(bd * R).toBeGreaterThan(150);
  return best!;
}

describe('immigration on a planet', () => {
  it('a stock lost from the world comes back where it last lived, not at the homeland', () => {
    const w = createPlanet(SPEC, 165);
    const S = w.surface as PlanetSurface;
    const R = S.ground.radius;
    const far = farLand(w);
    const herd = release(w, genomeOfMorphotype(41, 'rodent'), 8, far, 'rodent');
    expect(herd.length).toBe(8);
    const sp = w.species.find((s) => s.id === herd[0].species)!;
    // a dawn: the species' seed bank, and where it lives, are taken
    runDays(w, 1);
    expect(sp.range).toBeDefined();
    expect(arc(unit(sp.range!), unit(far)) * R).toBeLessThan(30);
    // all of them lost…
    for (const c of w.creatures) if (c.species === sp.id && c.alive) killCreature(w, c, true);
    // …and back, in a few dawns, round about where they were (the homeland is far off)
    runDays(w, 6);
    const back = w.creatures.filter((c) => c.alive && c.species === sp.id);
    expect(back.length).toBeGreaterThan(0);
    for (const c of back) {
      expect(arc(unit(c), unit(far)) * R).toBeLessThan(140);
      expect(arc(unit(c), S.home) * R).toBeGreaterThan(arc(unit(far), S.home) * R - 140);
    }
    expect(w.events.some((e) => e.text.includes('wandered in'))).toBe(true);
  });

  it('keeps where each species lives in its save, and carries on from it bit-for-bit', () => {
    const w = createPlanet(SPEC, 165);
    release(w, genomeOfMorphotype(43, 'ungulate'), 6, farLand(w), 'ungulate');
    runDays(w, 1);
    const saved = saveWorld(w);
    expect(JSON.parse(saved).species[0].range).toBeDefined();
    const b = loadWorld(saved);
    expect(saveWorld(b)).toBe(saved);
    runDays(w, 0.5);
    runDays(b, 0.5);
    expect(saveWorld(b)).toBe(saveWorld(w));
  });
});
