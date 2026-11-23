/**
 * A planet's ground as a flat map — equirectangular, north up: what grows where in the scene's own colours
 * (sim/palette.ts), lit from the north-west, the sea's shelf and deeps, the lakes, and the rivers (bright where
 * a swimmer can use them). Or, asked, the plates' edges over it, a height ramp in place of the biomes, or one
 * field of the climate alone (rain, warmth).
 *
 * Pure (no three.js, no page): the planet designer's preview is drawn with it in a worker, and the headless
 * map script (scripts/planet-map.ts) with it in Node. It returns RGBA, as a canvas's ImageData holds it.
 */
import { LAKE, RIVER, SEA, SWIM_FLOW } from '../../sim/planetBake';
import { cellCentre, cellIndex, sampleAt } from '../../sim/cubeGrid';
import { biomeOn, type PlanetGround } from '../../sim/planetGround';
import { BIOME_COLOUR } from '../../sim/palette';
import type { Vec3 } from '../../sim/sphere';

export interface MapOptions {
  /** the plates' edges drawn over it (continental red, oceanic orange) */
  plates?: boolean;
  /** a height ramp in place of what grows where */
  relief?: boolean;
  /** one field of the climate alone, on a ramp, over land and sea */
  field?: 'rain' | 'warmth' | '';
  /** the middle of the map (degrees) and how many degrees it spans across (360: the whole planet) */
  lon?: number;
  lat?: number;
  span?: number;
}

const RAMP: [number, [number, number, number]][] = [
  [0, [112, 150, 78]],
  [0.18, [96, 140, 60]],
  [0.4, [150, 146, 92]],
  [0.62, [128, 112, 96]],
  [0.82, [150, 146, 140]],
  [1, [236, 236, 232]],
];

function ramp(t: number): [number, number, number] {
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const [a, ca] = RAMP[i - 1], [c, cc] = RAMP[i];
      const u = (t - a) / (c - a);
      return [ca[0] + (cc[0] - ca[0]) * u, ca[1] + (cc[1] - ca[1]) * u, ca[2] + (cc[2] - ca[2]) * u];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

/** The map, `width` pixels across and half as high, as RGBA. */
export function planetMap(ground: PlanetGround, width: number, o: MapOptions = {}): Uint8ClampedArray {
  const b = ground.bake;
  const { grid: g, kind } = b;
  const R = ground.radius;
  const Wd = Math.max(2, Math.round(width)), Ht = Math.max(1, Math.round(Wd / 2));
  const span = ((o.span ?? 360) * Math.PI) / 180, lon0 = ((o.lon ?? 0) * Math.PI) / 180, lat0 = ((o.lat ?? 0) * Math.PI) / 180;
  const dir = (x: number, y: number): Vec3 => {
    const lon = lon0 + (x / Wd - 0.5) * span, lat = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, lat0 - (y / Ht - 0.5) * span * 0.5));
    return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)];
  };
  const hs = new Float32Array(Wd * Ht);
  for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) hs[y * Wd + x] = sampleAt(ground.aH, dir(x + 0.5, y + 0.5));
  const px = new Uint8ClampedArray(Wd * Ht * 4);
  for (let y = 0; y < Ht; y++) {
    for (let x = 0; x < Wd; x++) {
      const p = dir(x + 0.5, y + 0.5);
      const hh = hs[y * Wd + x], L = sampleAt(ground.aL, p);
      const k = cellIndex(g.N, p);
      let c: [number, number, number];
      // (the light from the north-west, on the slope across a pixel each way; a pixel is this many bu across)
      const across = ((span * R) / Wd) * Math.max(0.05, Math.abs(p[0] * p[0] + p[2] * p[2]) ** 0.5);
      const dx = (hs[y * Wd + ((x + 1) % Wd)] - hs[y * Wd + ((x + Wd - 1) % Wd)]) / (2 * across);
      const dy = (hs[Math.min(Ht - 1, y + 1) * Wd + x] - hs[Math.max(0, y - 1) * Wd + x]) / (2 * ((span * 0.5 * R) / Ht));
      const shade = Math.max(0.35, Math.min(1.25, 0.85 + 0.9 * (-dx * 0.7 + dy * 0.7)));
      if (o.field) {
        const v = o.field === 'rain' ? Math.min(1, Math.log10(Math.max(10, sampleAt(ground.aP, p))) / 3.7) : Math.min(1, Math.max(0, (sampleAt(ground.aT, p) + 25) / 55));
        c = [255 * v, 255 * (1 - Math.abs(v - 0.5) * 2) * 0.9, 255 * (1 - v)];
        if (kind[k] === SEA) c = [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55];
      } else if (kind[k] === RIVER) c = b.flow[k] >= SWIM_FLOW ? [60, 120, 200] : [90, 150, 205];
      else if (L - hh > 0 || kind[k] === SEA || kind[k] === LAKE) {
        const depth = L - hh;
        const lake = kind[k] === LAKE;
        const t = Math.min(1, Math.max(0, depth / (lake ? 6 : ground.relief * 0.55)));
        c = lake ? [46 + 20 * (1 - t), 104 + 30 * (1 - t), 150 + 30 * (1 - t)] : depth < 1.25 ? [70, 130, 160] : [22 + 30 * (1 - t), 48 + 40 * (1 - t), 92 + 50 * (1 - t)];
      } else if (o.relief) {
        const r = ramp(Math.min(1, Math.max(0, hh / ground.relief)));
        c = [r[0] * shade, r[1] * shade, r[2] * shade];
      } else {
        const col = BIOME_COLOUR[biomeOn(ground, p)];
        c = [((col >> 16) & 255) * shade, ((col >> 8) & 255) * shade, (col & 255) * shade];
      }
      if (o.plates) {
        const k2 = cellIndex(g.N, dir(x + 1.5, y + 0.5)), k3 = cellIndex(g.N, dir(x + 0.5, y + 1.5));
        if (b.plate[k2] !== b.plate[k] || b.plate[k3] !== b.plate[k]) c = b.continental[b.plate[k]] ? [200, 40, 40] : [255, 160, 40];
      }
      const at = (y * Wd + x) * 4;
      px[at] = c[0];
      px[at + 1] = c[1];
      px[at + 2] = c[2];
      px[at + 3] = 255;
    }
  }
  return px;
}

/** What a planet is like, in numbers: each kind of ground's share of its land (largest first, by area),
 *  its lakes, how many of them a swimmer can leave by river, and the bu of streams and rivers. */
export interface PlanetFacts {
  land: number;
  grounds: { biome: string; share: number }[];
  lakes: number;
  joined: number;
  rivers: number;
  checksum: string;
}

export function planetFacts(ground: PlanetGround): PlanetFacts {
  const b = ground.bake, g = b.grid;
  const share = new Map<string, number>();
  let dry = 0, all = 0, land = 0, rivers = 0;
  for (let k = 0; k < g.count; k++) {
    all += g.area[k];
    if (b.kind[k] !== SEA) land += g.area[k];
    if (b.kind[k] === RIVER) rivers++;
    if (k % 3) continue;
    const bm = biomeOn(ground, cellCentre(g.N, k));
    if (bm === 'deep' || bm === 'shallow') continue;
    share.set(bm, (share.get(bm) ?? 0) + g.area[k]);
    dry += g.area[k];
  }
  const lakes = b.bodies.filter((x) => x.kind === 'lake');
  return {
    land: land / all,
    grounds: [...share.entries()].sort((a, c) => c[1] - a[1]).map(([biome, a]) => ({ biome, share: a / Math.max(1e-9, dry) })),
    lakes: lakes.length,
    joined: lakes.filter((l) => l.swim).length,
    rivers: Math.round(rivers * ((Math.PI / 2) * ground.radius) / g.N),
    checksum: b.checksum,
  };
}
