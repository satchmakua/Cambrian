/**
 * A planet's seasons and weather (its surface's `seasonsNow`): a pure function of the planet, the place and
 * the time, worked out for every field cell a couple of sim-seconds at a time.
 *
 * - The year turns in each hemisphere half a year apart: summer in the north is winter in the south. How
 *   far a place's year swings is the planet's tilt by its latitude — none at the equator, the valley's own
 *   at 45° on a planet tilted as the Earth is, harsher toward the poles; on a planet with no tilt, none.
 * - The grass and the fruit follow the valley's own year (its numbers, season by season) as far as the
 *   swing goes, and stop where the ground freezes hard. The cold and the heat come from the place's warmth
 *   now: its year's mean (planetClimate.ts), swung by its season.
 * - Weather: fronts, each a soft round of cloud a few dozen bu across, born on the wet belts (the equator's
 *   and the middle latitudes'), carried along their band by its wind (east in the westerlies, west in the
 *   trades), swelling and dying away over a few days. Where one passes it rains as much as the place's
 *   climate is wet, or snows where it is cold enough.
 *
 * The valley has none of this: one season and one sky over it all (model.ts's climateOf and skyNow).
 */
import { unitHash } from '../engine/rng';
import { DAY_LENGTH, levered, seasonal, YEAR_DAYS, type Plant, type World } from './model';
import { heightOn, levelOn, rainOn, tempOn, type PlanetGround } from './planetGround';
import { cubeToSphere, type Vec3 } from './sphere';
import type { Place, SeasonsNow } from './surface';

/** how often (sim-seconds) the seasons and the weather are worked out again: they move slowly (a front some
 *  3 bu in the time) */
export const SEASON_EVERY = 6;
/** how far (°C) the valley's year swings either side of its mean: its summers 25°, its winters −1 */
export const SWING = 13;
/** the valley's year, season by season (spring, summer, autumn, winter: model.ts's climate) */
const GRASS: readonly [number, number, number, number] = [1.45, 1.05, 0.78, 0.45];
const FRUIT: readonly [number, number, number, number] = [0.6, 1.3, 1.55, 0.3];
const GRASS_MEAN = (1.45 + 1.05 + 0.78 + 0.45) / 4;
const FRUIT_MEAN = (0.6 + 1.3 + 1.55 + 0.3) / 4;
/** a season's warmth, from its year's mean: a mild spring, a hot summer, a cool autumn, a cold winter */
const WARMTH: readonly [number, number, number, number] = [0.1, 1, -0.1, -1];

const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/** How far a place's year swings (the valley's year is 1): the tilt by the latitude (y is its sine), none
 *  at the equator, 1 at 45° on an Earth's tilt (0.5), more toward the poles. */
export function swingAt(tilt: number, y: number): number {
  return (tilt / 0.5) * (Math.min(1, Math.abs(y)) / Math.SQRT1_2);
}

/** The time it is in the year at a place: a southern place's year runs half a year behind a northern one's
 *  (as `seasonal` reads it). */
export function localTime(time: number, y: number): number {
  return y < 0 ? time + (DAY_LENGTH * YEAR_DAYS) / 2 : time;
}

/** A place's warmth now (°C): its year's mean, swung by its season. */
export function warmthNow(tMean: number, swing: number, time: number, y: number): number {
  return tMean + swing * SWING * seasonal(localTime(time, y), WARMTH);
}

/** the valley's cold (0 mild … 1 a hard frost) for a warmth: none at 16° and above, the valley's hard frost
 *  at −1° */
export const coldOf = (t: number) => Math.min(1.5, Math.max(0, (16 - t) / 17));

export interface Front {
  /** its middle (a unit vector), its reach (radians, to a third) and how strong it is now (0 … 1) */
  at: Vec3;
  reach: number;
  strength: number;
}

/** how far a front drifts along its band in a day (radians, at the band's strongest wind) */
const DRIFT = 0.35;

/** The weather's fronts at a time: each born, swelling, dying away and born again elsewhere, by a hash of
 *  (the planet's seed, the front, its life) — no state, so every replay sees the same skies. */
export function frontsAt(seed: number, radius: number, time: number): Front[] {
  const count = Math.max(8, Math.round(32 * (radius / 300) ** 2));
  const out: Front[] = [];
  for (let i = 0; i < count; i++) {
    const life = DAY_LENGTH * (2 + 3 * unitHash(seed, i, 0xa1));
    const t = time + unitHash(seed, i, 0xa2) * life;
    const e = Math.floor(t / life), f = t / life - e;
    const h = (salt: number) => unitHash(seed, i * 7919 + e, salt);
    // (born on a wet belt: the equator's, or a middle latitude's either side)
    const lat = h(0xa3) < 0.4 ? (h(0xa4) - 0.5) * 0.5 : (h(0xa5) < 0.5 ? -1 : 1) * (0.75 + 0.45 * h(0xa4));
    const u = -Math.sin(6 * Math.abs(lat));
    const lon = h(0xa6) * Math.PI * 2 + u * DRIFT * ((f * life) / DAY_LENGTH);
    const c = Math.cos(lat);
    out.push({ at: [c * Math.cos(lon), Math.sin(lat), -c * Math.sin(lon)], reach: (28 + 40 * h(0xa7)) / radius, strength: (0.55 + 0.45 * h(0xa8)) * Math.sin(Math.PI * f) });
  }
  return out;
}

/** The weather at the unit vector p: its cloud (0 … 1) and how hard it would rain there on a climate as wet
 *  as the valley's (the caller weighs it by the place's own). */
export function weatherOf(fronts: Front[], p: Vec3): { cloud: number; rain: number } {
  let sum = 0;
  for (const f of fronts) {
    const d = p[0] * f.at[0] + p[1] * f.at[1] + p[2] * f.at[2];
    const r2 = f.reach * f.reach;
    // (the chord's square, near the arc's for any front's reach)
    const c2 = 2 * (1 - d);
    if (c2 > 9 * r2) continue;
    sum += f.strength * Math.exp(-c2 / r2);
  }
  return { cloud: Math.min(1, 1.3 * sum), rain: Math.min(1, 1.1 * sum) };
}

/** A planet's seasons, over its fields' cells (`N` along each face's edge), for its surface. */
export function planetSeasons(g: PlanetGround, tilt: number, N: number, cellOf: (p: Place) => number) {
  const n = 6 * N * N;
  const unit = new Float32Array(n * 3), tMean = new Float32Array(n), wetness = new Float32Array(n), swing = new Float32Array(n), land = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const face = Math.floor(k / (N * N)), r = k - face * N * N;
    const j = Math.floor(r / N), i = r - j * N;
    const u = cubeToSphere(face, -1 + (2 * i + 1) / N, -1 + (2 * j + 1) / N);
    unit.set(u, k * 3);
    tMean[k] = tempOn(g, u);
    wetness[k] = Math.min(1.3, Math.max(0.1, rainOn(g, u) / 900));
    swing[k] = swingAt(tilt, u[1]);
    land[k] = heightOn(g, u) >= levelOn(g, u) ? 1 : 0;
  }
  const now: SeasonsNow = {
    at: -1,
    grass: new Float32Array(n),
    fruit: new Float32Array(n),
    cold: new Float32Array(n),
    heat: new Float32Array(n),
    cloud: new Float32Array(n),
    rain: new Float32Array(n),
    snowing: new Uint8Array(n),
    snow: new Float32Array(n),
    plantFruit: new Float32Array(0),
  };
  const PLANT_CELLS = new WeakMap<Plant[], Int32Array>();
  const p: Vec3 = [0, 0, 0];
  // (what they were last worked out for: the time, the levers, the bushes)
  let madeWarmth = NaN, madeEvents: unknown = null, madeEventCount = -1, madePlants = -1;
  return {
    now(w: World): SeasonsNow {
      const at = Math.floor(w.time / SEASON_EVERY) * SEASON_EVERY;
      const lv = w.levers;
      if (at === now.at && lv.warmth === madeWarmth && lv.events === madeEvents && lv.events.length === madeEventCount && w.plants.length === madePlants) return now;
      [madeWarmth, madeEvents, madeEventCount, madePlants] = [lv.warmth, lv.events, lv.events.length, w.plants.length];
      now.at = at;
      // (the levers move every place as they move the valley: a colder age, an ice age, an ash winter, as
      // they stand at the time these are worked out for)
      const L = levered(w, 1, 1, 0.5, at);
      const heatK = Math.max(0, 1 + 0.6 * lv.warmth);
      const kGrass = L.grass, kFruit = L.fruit, dCold = L.cold - 0.5;
      const fronts = frontsAt(g.seed, g.radius, at);
      // (each hemisphere's season is one for all its places: worked out once, each place swung by its own)
      const north = { grass: seasonal(at, GRASS) - GRASS_MEAN, fruit: seasonal(at, FRUIT) - FRUIT_MEAN, warmth: seasonal(at, WARMTH) };
      const lts = localTime(at, -1);
      const south = { grass: seasonal(lts, GRASS) - GRASS_MEAN, fruit: seasonal(lts, FRUIT) - FRUIT_MEAN, warmth: seasonal(lts, WARMTH) };
      for (let k = 0; k < n; k++) {
        const y = unit[k * 3 + 1];
        const a = swing[k];
        const hemi = y < 0 ? south : north;
        const t = tMean[k] + a * SWING * hemi.warmth;
        // (the valley's year, as far as this place swings, stopping where the ground freezes hard)
        now.grass[k] = (GRASS_MEAN + a * hemi.grass) * Math.max(0.05, smooth(-12, -2, t)) * kGrass;
        now.fruit[k] = Math.max(0, FRUIT_MEAN + a * hemi.fruit) * Math.max(0.05, smooth(-10, 0, t)) * kFruit;
        now.cold[k] = Math.min(1.5, Math.max(0, coldOf(t) + dCold));
        now.heat[k] = Math.min(1.6, Math.max(0, (t - 14) / 10)) * heatK;
        p[0] = unit[k * 3];
        p[1] = y;
        p[2] = unit[k * 3 + 2];
        const sky = weatherOf(fronts, p);
        now.cloud[k] = sky.cloud;
        now.rain[k] = Math.min(1, sky.rain * wetness[k]);
        now.snowing[k] = t < 0.5 ? 1 : 0;
        now.snow[k] = land[k] ? 0.9 * (1 - smooth(-5, 1, t)) : 0;
      }
      // each bush's fruit by its cell (the bushes never move)
      let cells = PLANT_CELLS.get(w.plants);
      if (!cells || cells.length !== w.plants.length) PLANT_CELLS.set(w.plants, (cells = Int32Array.from(w.plants, (b) => cellOf(b))));
      if (now.plantFruit.length !== cells.length) now.plantFruit = new Float32Array(cells.length);
      for (let i = 0; i < cells.length; i++) now.plantFruit[i] = now.fruit[cells[i]];
      return now;
    },
    fronts: (time: number) => frontsAt(g.seed, g.radius, time),
  };
}
