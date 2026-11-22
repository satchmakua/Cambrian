/**
 * A planet run on for days, headless, and how its life is doing: how many alive and of how many kinds,
 * born and died, how far they have spread from their homeland, how fast it ran — and by the ground they
 * live on, how many are alive there, born there and died there (a ground that only ever kills is a
 * balance to look at). Pure simulation — no browser. The planet's counterpart of valley-report.ts.
 *
 *   npx vite-node scripts/planet-report.ts -- --seed 7 --radius 300 --relief 30 --land 0.6 [--continents 0.45]
 *     [--rugged 0.5] [--temperature 0] [--wetness 0] --days 12 [--cap 600]
 */
import { createPlanet, release, stepWorld, DAY_LENGTH, STEP, MAX_POP } from '../src/sim/world';
import type { Biome } from '../src/sim/terrain';
import { genomeOfMorphotype } from '../src/engine/random';
import { starterCast } from '../src/sim/cast';
import { arc } from '../src/sim/sphere';
import type { PlanetSurface } from '../src/sim/planetSurface';

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const spec = { seed: Number(arg('seed', '7')), radius: Number(arg('radius', '300')), relief: Number(arg('relief', '30')), land: Number(arg('land', '0.6')), continents: Number(arg('continents', '0.45')), rugged: Number(arg('rugged', '0.5')), temperature: Number(arg('temperature', '0')), wetness: Number(arg('wetness', '0')) };
const days = Number(arg('days', '12'));
const cap = Number(arg('cap', String(MAX_POP)));

const t0 = Date.now();
const w = createPlanet(spec, cap);
starterCast('standard').forEach(([kind, n], i) => release(w, genomeOfMorphotype((w.seed * 97 + i * 13) >>> 0, kind), n, undefined, kind));
const S = w.surface as PlanetSurface;
const R = spec.radius;
console.log(`planet ${JSON.stringify(spec)} cap ${cap}: made in ${((Date.now() - t0) / 1000).toFixed(1)} s · ${w.plants.length} bushes · ${S.cells} field cells · homeland ${(S.homeArc * R).toFixed(0)} bu across its middle to its rim`);
{
  const b = S.ground.bake;
  const lakes = b.bodies.filter((x) => x.kind === 'lake');
  console.log(`terrain ${b.checksum}: ${lakes.length} lakes (${lakes.filter((x) => x.swim).length} joined on by a river a fish can swim), ${new Set(b.bodies.map((x) => x.reach)).size} waters a swimmer cannot pass between`);
}
// by the ground they live on: where each living one was last seen, and the births and deaths there
const lastSeen = new Map<number, Biome>();
const bornOn = new Map<Biome, number>(), diedOn = new Map<Biome, number>();
const census = (counting: boolean) => {
  const now = new Set<number>();
  for (const c of w.creatures) {
    if (!c.alive) continue;
    now.add(c.id);
    const b = S.biome(c);
    if (counting && !lastSeen.has(c.id)) bornOn.set(b, (bornOn.get(b) ?? 0) + 1);
    lastSeen.set(c.id, b);
  }
  for (const [id, b] of lastSeen) {
    if (now.has(id)) continue;
    diedOn.set(b, (diedOn.get(b) ?? 0) + 1);
    lastSeen.delete(id);
  }
};
census(false);
console.log('day  alive kinds  births deaths  spread(bu: median, farthest)  s/day');
let births = 0, deaths = 0;
for (let d = 1; d <= days; d++) {
  const t = Date.now();
  for (let i = 0; i < DAY_LENGTH / STEP; i++) {
    stepWorld(w);
    if (i % 200 === 199) census(true);
  }
  const live = w.creatures.filter((c) => c.alive);
  const far = live.map((c) => arc(S.home, [c.x, c.y, c.z]) * R).sort((a, b) => a - b);
  const kinds = w.species.filter((s) => s.alive > 0).length;
  const b = w.tally.births - births, dd = w.tally.kills + w.tally.starvation + w.tally.oldAge - deaths;
  births = w.tally.births;
  deaths = w.tally.kills + w.tally.starvation + w.tally.oldAge;
  console.log(`${String(d).padStart(3)}  ${String(live.length).padStart(5)} ${String(kinds).padStart(5)}  ${String(b).padStart(6)} ${String(dd).padStart(6)}  ${(far[far.length >> 1] ?? 0).toFixed(0).padStart(6)} ${(far[far.length - 1] ?? 0).toFixed(0).padStart(6)}  ${((Date.now() - t) / 1000).toFixed(1).padStart(10)}`);
}
console.log(`deaths: ${w.tally.kills} killed, ${w.tally.starvation} starved, ${w.tally.oldAge} of old age; stillborn ${w.tally.stillborn}`);
{
  census(true);
  const alive = new Map<Biome, number>();
  for (const b of lastSeen.values()) alive.set(b, (alive.get(b) ?? 0) + 1);
  const all = new Set<Biome>([...alive.keys(), ...bornOn.keys(), ...diedOn.keys()]);
  console.log('by ground (alive now, born there, died there):');
  console.log(
    [...all]
      .sort((a, b) => (alive.get(b) ?? 0) - (alive.get(a) ?? 0) || (bornOn.get(b) ?? 0) - (bornOn.get(a) ?? 0))
      .map((b) => `  ${b.padEnd(8)} ${String(alive.get(b) ?? 0).padStart(4)} ${String(bornOn.get(b) ?? 0).padStart(5)} ${String(diedOn.get(b) ?? 0).padStart(5)}`)
      .join('\n'),
  );
}
