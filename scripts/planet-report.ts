/**
 * A planet run on for days, headless, and how its life is doing: how many alive and of how many kinds,
 * born and died, how far they have spread from their homeland, and how fast it ran. Pure simulation — no
 * browser. The planet's counterpart of valley-report.ts.
 *
 *   npx vite-node scripts/planet-report.ts -- --seed 7 --radius 300 --relief 30 --land 0.6 --days 12
 */
import { createPlanet, release, stepWorld, DAY_LENGTH, STEP, MAX_POP } from '../src/sim/world';
import { genomeOfMorphotype } from '../src/engine/random';
import { starterCast } from '../src/sim/cast';
import { arc } from '../src/sim/sphere';
import type { PlanetSurface } from '../src/sim/planetSurface';

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const spec = { seed: Number(arg('seed', '7')), radius: Number(arg('radius', '300')), relief: Number(arg('relief', '30')), land: Number(arg('land', '0.6')) };
const days = Number(arg('days', '12'));
const cap = Number(arg('cap', String(MAX_POP)));

const t0 = Date.now();
const w = createPlanet(spec, cap);
starterCast('standard').forEach(([kind, n], i) => release(w, genomeOfMorphotype((w.seed * 97 + i * 13) >>> 0, kind), n, undefined, kind));
const S = w.surface as PlanetSurface;
const R = spec.radius;
console.log(`planet ${JSON.stringify(spec)} cap ${cap}: made in ${((Date.now() - t0) / 1000).toFixed(1)} s · ${w.plants.length} bushes · ${S.cells} field cells · homeland ${(S.homeArc * R).toFixed(0)} bu across its middle to its rim`);
console.log('day  alive kinds  births deaths  spread(bu: median, farthest)  s/day');
let births = 0, deaths = 0;
for (let d = 1; d <= days; d++) {
  const t = Date.now();
  for (let i = 0; i < DAY_LENGTH / STEP; i++) stepWorld(w);
  const live = w.creatures.filter((c) => c.alive);
  const far = live.map((c) => arc(S.home, [c.x, c.y, c.z]) * R).sort((a, b) => a - b);
  const kinds = w.species.filter((s) => s.alive > 0).length;
  const b = w.tally.births - births, dd = w.tally.kills + w.tally.starvation + w.tally.oldAge - deaths;
  births = w.tally.births;
  deaths = w.tally.kills + w.tally.starvation + w.tally.oldAge;
  console.log(`${String(d).padStart(3)}  ${String(live.length).padStart(5)} ${String(kinds).padStart(5)}  ${String(b).padStart(6)} ${String(dd).padStart(6)}  ${(far[far.length >> 1] ?? 0).toFixed(0).padStart(6)} ${(far[far.length - 1] ?? 0).toFixed(0).padStart(6)}  ${((Date.now() - t) / 1000).toFixed(1).padStart(10)}`);
}
console.log(`deaths: ${w.tally.kills} killed, ${w.tally.starvation} starved, ${w.tally.oldAge} of old age; stillborn ${w.tally.stillborn}`);
