/**
 * The valley's fields — grass on the meadows and in the woods, algae in the lake, fruit on the bushes —
 * regrowing each step under the season, the weather and the year's drought; and the history it samples.
 */
import { climateOf, DROUGHT_FRUIT, DROUGHT_GRASS, DROUGHT_HOLD, DROUGHT_WITHER, dryNow, FRUIT_REGROW, GRASS_REGROW, skyNow, type World } from './model';

export function growFields(w: World, dt: number): void {
  const { grass, grassCap, algae, algaeCap } = w;
  const cl = climateOf(w);
  // (a planet's seasons and showers are its places' own: see planetSeasons.ts)
  const local = w.surface.seasonsNow?.(w);
  // a shower brings the grass on (snow doesn't); a wetter or drier valley (the rain lever) the more or less
  const sky = skyNow(w);
  const wet = (1 + (sky.snow ? 0 : 0.8 * sky.rain)) * w.levers.rain;
  // …and a dry year holds the grass and the fruit back (the fewer showers do the rest)
  const dry = dryNow(w);
  const parched = 1 - DROUGHT_GRASS * dry;
  const barren = 1 - DROUGHT_FRUIT * dry;
  // (and what a meadow can hold falls: the standing grass above it withers away over a day or so — it
  // was the cover that mattered, not the regrowth: a meadow near full fed a herd through any slow year)
  const hold = 1 - DROUGHT_HOLD * dry;
  for (let k = 0; k < grass.length; k++) {
    const K = grassCap[k] * hold;
    if (K > 0) {
      const b = grass[k];
      if (local) grass[k] = b > K ? b - (b - K) * Math.min(1, DROUGHT_WITHER * dt) : Math.min(K, b + (GRASS_REGROW * b * (1 - b / K) + 0.0004 * K) * local.grass[k] * (1 + (local.snowing[k] ? 0 : 0.8 * local.rain[k])) * w.levers.rain * parched * dt);
      else grass[k] = b > K ? b - (b - K) * Math.min(1, DROUGHT_WITHER * dt) : Math.min(K, b + (GRASS_REGROW * b * (1 - b / K) + 0.0004 * K) * cl.grass * wet * parched * dt);
    }
    // (a lake is richer than a meadow: at three times the grass's rate it fed some fifteen big fish, and
    // a line so few, always hungry, seldom fed well enough to court, died out every few years)
    const A = algaeCap[k];
    if (A > 0) {
      const a = algae[k];
      algae[k] = Math.min(A, a + (GRASS_REGROW * 7 * a * (1 - a / A) + 0.004 * A) * dt);
    }
  }
  const plants = w.plants;
  for (let i = 0; i < plants.length; i++) {
    const p = plants[i];
    p.fruit = Math.min(p.max, p.fruit + FRUIT_REGROW * (local ? local.plantFruit[i] : cl.fruit) * barren * dt);
  }
}

export function sampleHistory(w: World): void {
  const pops: Record<number, number> = {};
  for (const c of w.creatures) if (c.alive) pops[c.species] = (pops[c.species] ?? 0) + 1;
  let g = 0;
  for (let k = 0; k < w.grass.length; k++) g += w.grass[k];
  w.history.push({ t: w.time, pops, grass: g });
  if (w.history.length > 720) w.history.splice(0, w.history.length - 720);
}
