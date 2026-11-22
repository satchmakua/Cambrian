/**
 * A planet's climate, worked out once over its grid (planetBake.ts asks for it twice: on its first ground,
 * for the rain its rivers carve with, and on the ground they carved, for what grows there). Yearly means:
 * the seasons, and the weather that comes and goes, are a later step.
 *
 * - Temperature by latitude (the sun's yearly warmth falling away toward the poles), cooled with height so
 *   the highest ground is some 21° colder than the shore, and broken a little by noise. Each cell's own:
 *   a valley's floor is warmer than the ridge above it.
 * - Winds in three bands a hemisphere, as the Earth's run: the trade winds blowing west and toward the
 *   equator, the westerlies east and poleward, the polar easterlies west again (Red Blob Games' wind
 *   patterns), each turned this way and that by noise so the belts don't come out as stripes. "East" is
 *   the one place the planet's axis shows, and it fades out at the poles. Where two bands meet the wind
 *   drops, and the air there drifts every way at once.
 * - Rain carried on them, over the ground's large shape — the ranges, not every ridge between two valleys —
 *   on a grid a quarter as fine (some 10 bu a cell at 300 bu), read back between its cells. Air takes up
 *   water over the sea, the more the warmer it is; downwind it rains a little everywhere (more in the wet
 *   belts at the equator and the middle latitudes, less in the dry ones between), much more where it
 *   climbs, and whatever it can no longer hold where it has cooled. What it drops on a range's windward
 *   side the lee never sees: rain shadows. Storms, which a mean wind alone leaves out, bring the sea's
 *   water ashore from every side as well, less of it the farther inland: dry hearts to continents.
 *
 * And what grows on it: a productivity for any climate (Lieth's Miami model: the lower of a curve in
 * temperature and one in rainfall, both saturating), measured against the valley's own meadow, so the
 * valley's numbers are where the planet's start from.
 *
 * Pure: the same ground and settings give the same climate.
 */
import { fbm } from './noise3';
import { apronOf, cellIndex, makeGrid, sampleAt, type CubeGrid } from './cubeGrid';

export interface ClimateSettings {
  /** the planet's radius (bu) */
  radius: number;
  relief: number;
  /** colder (−1: an ice world, 12° down) … warmer (1: a hothouse, 12° up) */
  temperature: number;
  /** drier (−1) … wetter (1): how much water the air takes up, and how much falls */
  wetness: number;
  salt: number;
}

export interface Climate {
  /** each cell's yearly mean temperature (°C) */
  T: Float32Array;
  /** each cell's rain (mm a year) */
  P: Float32Array;
  /** the wind at each cell (x, y, z in turn; a tangent, as long as it blows hard: 0 … 1) */
  wind: Float32Array;
}

/** The sun's yearly warmth at a latitude (radians) at sea level (°C), before noise: 26° at the equator,
 *  about 10 at 45°, freezing near 60, −20 at the poles. */
export function sunWarmth(lat: number): number {
  return -20 + 46 * Math.pow(Math.max(0, Math.cos(lat)), 1.25);
}

/** how much colder (°C) the ground is for each bu it stands above the sea: its highest ground some 21° below
 *  the shore, whatever the relief */
export const lapseOf = (relief: number) => 21 / Math.max(4, relief);

/** the wet belts and the dry: the equator's rains, the horse latitudes' drought, the middle latitudes'
 *  fronts, the polar dry (a multiplier on the rain that falls from the air going by) */
function belt(lat: number): number {
  const a = Math.abs(lat);
  return 0.85 * Math.exp(-((a / 0.26) ** 2)) + 0.6 * Math.exp(-(((a - 0.95) / 0.3) ** 2)) + 0.35;
}

/** how much water air holds at a temperature (a share of what it holds at 20°): more the warmer, if less
 *  steeply than the Clausius–Clapeyron relation's seven percent a degree (at that, the fronts that carry
 *  rain into cold lands not being modelled, every boreal forest came out a desert) */
const holds = (t: number) => Math.min(1.8, Math.exp(0.045 * (t - 20)));

/** how many times the air is passed on: enough to cross the widest land the rain reaches */
const PASSES = 120;
/** rain (mm a year) for a share of the air's water let fall each step */
const MM = 36000;
/** the share of the air's water let fall each step as it goes by (× its belt), and the share that climbing
 *  a bu wrings out */
const DRIZZLE = 0.022;
const CLIMB = 0.11;
/** the storms: how much of the sea's water they bring ashore each step at the coast, and how far inland
 *  that falls away (bu, to a third) */
const STORMS = 0.16;
const STORM_REACH = 150;

/** a place's warmth at sea level (°C): its latitude's, the planet's offset, and a little noise */
function warmthAt(x: number, y: number, z: number, s: ClimateSettings): number {
  const lat = Math.asin(Math.max(-1, Math.min(1, y)));
  return sunWarmth(lat) + 12 * s.temperature + (fbm(x * 3.1, y * 3.1, z * 3.1, s.salt, 3) - 0.5) * 6;
}

/** The wind at a place (a tangent, as long as it blows hard): its band's, turned by noise. */
function windAt(x: number, y: number, z: number, salt: number): [number, number, number] {
  const lat = Math.asin(Math.max(-1, Math.min(1, y)));
  const a = Math.abs(lat);
  // (east, north) in the band: west and equatorward in the trades, east and poleward in the westerlies…
  let u = -Math.sin(6 * a), v = 0.35 * Math.sign(lat) * u;
  const turnBy = (fbm(x * 2.3 + 11, y * 2.3, z * 2.3, salt + 5, 2) - 0.5) * 1.4;
  const cu = Math.cos(turnBy), su = Math.sin(turnBy);
  [u, v] = [u * cu - v * su, u * su + v * cu];
  const c = Math.hypot(x, z);
  if (c < 1e-4) return [0, 0, 0];
  // east (z, 0, −x)/c and north (−xy/c, c, −yz/c)
  return [u * (z / c) + v * ((-x * y) / c), v * c, u * (-x / c) + v * ((-y * z) / c)];
}

const GRIDS = new Map<number, CubeGrid>();
/** the air's grid (the same for every planet of its size) */
function airGrid(N: number): CubeGrid {
  let c = GRIDS.get(N);
  if (!c) GRIDS.set(N, (c = makeGrid(N, 0)));
  return c;
}

export function climateOn(g: CubeGrid, h: ArrayLike<number>, sea: Uint8Array, s: ClimateSettings): Climate {
  const n = g.count, pt = g.pt;
  const lapse = lapseOf(s.relief);
  const T = new Float32Array(n), P = new Float32Array(n), wind = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const x = pt[k * 3], y = pt[k * 3 + 1], z = pt[k * 3 + 2];
    T[k] = warmthAt(x, y, z, s) - lapse * Math.max(0, h[k]);
    const w = windAt(x, y, z, s.salt);
    wind[k * 3] = w[0];
    wind[k * 3 + 1] = w[1];
    wind[k * 3 + 2] = w[2];
  }

  // --- the air's grid, a quarter as fine: its ground's large shape, and which of it is sea ---------------
  const Nc = Math.max(6, Math.round(g.N / 4));
  const c = airGrid(Nc);
  const m = c.count;
  let hc = new Float32Array(m), next = new Float32Array(m);
  const wet = new Float32Array(m), area = new Float32Array(m);
  for (let k = 0; k < n; k++) {
    const j = cellIndex(Nc, [pt[k * 3], pt[k * 3 + 1], pt[k * 3 + 2]]);
    hc[j] += (sea[k] ? 0 : Math.max(0, h[k])) * g.area[k];
    wet[j] += sea[k] ? g.area[k] : 0;
    area[j] += g.area[k];
  }
  for (let j = 0; j < m; j++) hc[j] = area[j] > 0 ? hc[j] / area[j] : 0;
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 0; j < m; j++) {
      let sum = hc[j] * 2, w = 2;
      for (let e = 0; e < 8; e++) {
        const q = c.nbr[j * 8 + e];
        if (q >= 0) {
          sum += hc[q];
          w++;
        }
      }
      next[j] = sum / w;
    }
    [hc, next] = [next, hc];
  }
  const isSea = new Uint8Array(m);
  for (let j = 0; j < m; j++) isSea[j] = area[j] > 0 && wet[j] > area[j] * 0.5 ? 1 : 0;

  // each air cell's warmth, what its air can hold, its belt's rain, its wind, and where its air comes from
  // (the two neighbours most nearly upwind, weighed by how nearly), how hard it blows, and how far it climbs
  const most = new Float32Array(m), drop = new Float32Array(m), blow = new Float32Array(m);
  const from1 = new Int32Array(m), from2 = new Int32Array(m), w1 = new Float32Array(m);
  for (let j = 0; j < m; j++) {
    const x = c.pt[j * 3], y = c.pt[j * 3 + 1], z = c.pt[j * 3 + 2];
    const lat = Math.asin(Math.max(-1, Math.min(1, y)));
    most[j] = holds(warmthAt(x, y, z, s) - lapse * hc[j]);
    const fall = belt(lat) * (0.7 + 0.6 * fbm(x * 3.7, y * 3.7, z * 3.7, s.salt + 9, 2));
    const w = windAt(x, y, z, s.salt);
    const wl = Math.hypot(w[0], w[1], w[2]);
    blow[j] = Math.min(1, wl);
    let a = -1, b = -1, sa = 0, sb = 0;
    for (let e = 0; e < 8; e++) {
      const q = c.nbr[j * 8 + e];
      if (q < 0 || wl < 1e-6) continue;
      const gap = c.gap[j * 8 + e] || 1;
      const along = -((c.pt[q * 3] - x) * w[0] + (c.pt[q * 3 + 1] - y) * w[1] + (c.pt[q * 3 + 2] - z) * w[2]) / (gap * wl);
      if (along > sa) {
        [b, sb] = [a, sa];
        [a, sa] = [q, along];
      } else if (along > sb) [b, sb] = [q, along];
    }
    if (a < 0) [a, sa] = [j, 1];
    if (b < 0) [b, sb] = [a, 0];
    from1[j] = a;
    from2[j] = b;
    w1[j] = sa / (sa + sb || 1);
    const upwind = w1[j] * hc[a] + (1 - w1[j]) * hc[b];
    drop[j] = DRIZZLE * fall + (1 - Math.exp(-Math.max(0, hc[j] - upwind) * CLIMB)) * 0.5;
  }
  // how far inland each air cell lies, for the storms (a flood out from the sea, in bu)
  const storm = new Float32Array(m);
  {
    const d = new Float32Array(m).fill(Infinity), order: number[] = [];
    for (let j = 0; j < m; j++) if (isSea[j]) {
      d[j] = 0;
      order.push(j);
    }
    for (let i = 0; i < order.length; i++) {
      const at = order[i];
      for (let e = 0; e < 8; e++) {
        const q = c.nbr[at * 8 + e];
        if (q >= 0 && d[q] === Infinity) {
          d[q] = d[at] + c.gap[at * 8 + e] * s.radius;
          order.push(q);
        }
      }
    }
    // (more of them in the wet belts, fewer under the dry belts' high air)
    for (let j = 0; j < m; j++) {
      const lat = Math.asin(Math.max(-1, Math.min(1, c.pt[j * 3 + 1])));
      storm[j] = isSea[j] ? 0 : STORMS * belt(lat) * Math.exp(-d[j] / STORM_REACH);
    }
  }

  // --- the air passed on: downwind as hard as it blows, every way at once where it is calm -------------
  let q = new Float32Array(m).fill(0.4), q2 = new Float32Array(m);
  const takeUp = 0.3 * (1 + 0.5 * s.wetness);
  const rate = new Float32Array(m);
  for (let pass = 0; pass < PASSES; pass++) {
    for (let j = 0; j < m; j++) {
      let around = q[j], cnt = 1;
      for (let e = 0; e < 8; e++) {
        const nb = c.nbr[j * 8 + e];
        if (nb >= 0) {
          around += q[nb];
          cnt++;
        }
      }
      around /= cnt;
      const up = w1[j] * q[from1[j]] + (1 - w1[j]) * q[from2[j]];
      const k = 0.25 + 0.65 * blow[j];
      let air = k * up + (1 - k) * around;
      const hold = most[j];
      if (air < hold) air += (isSea[j] ? takeUp : storm[j]) * (hold - air);
      const r = air * drop[j] + (air > hold ? (air - hold) * 0.5 : 0);
      const fell = r < air ? r : air;
      q2[j] = air - fell;
      rate[j] = fell;
    }
    [q, q2] = [q2, q];
  }
  const wetter = Math.exp(0.9 * s.wetness);
  for (let j = 0; j < m; j++) rate[j] *= MM * wetter;
  const rained = apronOf(Nc, rate);
  for (let k = 0; k < n; k++) P[k] = Math.max(0, sampleAt(rained, [pt[k * 3], pt[k * 3 + 1], pt[k * 3 + 2]]));
  return { T, P, wind };
}

// --- what grows on it ------------------------------------------------------------------------------

/** Lieth's Miami model: a year's growth (g/m²) in a climate, the lower of what its warmth and its rain
 *  allow, each saturating toward 3000. */
export function npp(t: number, p: number): number {
  const byWarmth = 3000 / (1 + Math.exp(1.315 - 0.119 * t));
  const byRain = 3000 * (1 - Math.exp(-0.000664 * Math.max(0, p)));
  return Math.min(byWarmth, byRain);
}

/** the climate of the valley's own meadow, where the planet's food is measured from: 12°, 800 mm */
export const VALLEY_CLIMATE = { T: 12, P: 800 };
const VALLEY_NPP = npp(VALLEY_CLIMATE.T, VALLEY_CLIMATE.P);

/** How much grows in a climate, against the valley's meadow (1 there; a desert's a fifth, a rainforest's
 *  about twice), held under 2. */
export function lushness(t: number, p: number): number {
  return Math.min(2, npp(t, p) / VALLEY_NPP);
}

/** …and in its water: warmer seas and lakes richer, colder ones poorer (1 at the valley's 12°). */
export function waterLushness(t: number): number {
  const byWarmth = (x: number) => 3000 / (1 + Math.exp(1.315 - 0.119 * x));
  return Math.min(1.3, Math.max(0.3, byWarmth(t) / byWarmth(VALLEY_CLIMATE.T)));
}
