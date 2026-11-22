/**
 * A baked planet as a map, headless: its numbers, and a shaded picture of the whole globe (equirectangular,
 * north up) — the relief lit from the north-west, the sea's shelf and deeps, lakes, rivers (bright where a
 * swimmer can use them), and with --plates the plates' edges.
 *
 *   npx vite-node scripts/planet-map.ts -- --seed 7 --radius 300 --relief 30 --land 0.6 \
 *     [--continents 0.45] [--rugged 0.5] [--plates] [--width 1600] [--out planet.png]
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { bakePlanet, LAKE, RIVER, SEA, SWIM_FLOW } from '../src/sim/planetBake';
import { apronOf, cellIndex, sampleAt } from '../src/sim/cubeGrid';
import type { Vec3 } from '../src/sim/sphere';

const argv = process.argv.slice(2);
const arg = (k: string, d: number) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const out = (() => {
  const i = argv.indexOf('--out');
  return i >= 0 ? argv[i + 1] : 'planet.png';
})();
const spec = { seed: arg('seed', 7), radius: arg('radius', 300), relief: arg('relief', 30), land: arg('land', 0.6), continents: arg('continents', 0.45), rugged: arg('rugged', 0.5) };

const t0 = performance.now();
const b = bakePlanet(spec);
const ms = performance.now() - t0;
const { grid: g, h, level, kind } = b;
const R = spec.radius;

// the numbers
let landA = 0, all = 0, lakes = 0, rivers = 0, swim = 0;
for (let k = 0; k < g.count; k++) {
  all += g.area[k];
  if (kind[k] !== SEA) landA += g.area[k];
  if (kind[k] === RIVER) {
    rivers++;
    if (b.flow[k] >= SWIM_FLOW) swim++;
  }
}
const lakeBodies = b.bodies.filter((x) => x.kind === 'lake');
lakes = lakeBodies.length;
const reaches = new Set(b.bodies.map((x) => x.reach)).size;
const cell = (Math.PI / 2 / g.N) * R;
console.log(`planet ${JSON.stringify(spec)}: baked in ${(ms / 1000).toFixed(2)} s · ${g.count.toLocaleString()} cells of ${cell.toFixed(2)} bu · checksum ${b.checksum}`);
console.log(`land ${((100 * landA) / all).toFixed(1)}% (asked ${(spec.land * 100).toFixed(0)}%) · ${b.bodies.filter((x) => x.kind === 'sea').length} seas · ${lakes} lakes (${lakeBodies.filter((x) => x.swim).length} with a river a swimmer can take to the next water) · ${reaches} reaches`);
console.log(`river cells ${rivers} (${swim} a swimmer can use) · ${b.continental.reduce((a, c) => a + c, 0)} of ${b.continental.length} plates continental`);
const biggest = [...lakeBodies].sort((a, c) => c.area - a.area).slice(0, 5);
console.log(`biggest lakes (bu²): ${biggest.map((x) => `${Math.round(x.area)} at ${x.level.toFixed(1)} bu`).join(', ')}`);
let hiK = 0;
for (let k = 0; k < g.count; k++) if (h[k] > h[hiK]) hiK = k;
console.log(`highest ground ${h[hiK].toFixed(1)} bu`);

// the picture
const Wd = arg('width', 1600), Ht = Math.round(Wd / 2);
const aH = apronOf(g.N, h), aL = apronOf(g.N, level);
const px = new Uint8Array(Wd * Ht * 3);
// (--lon and --lat in degrees, --span the degrees across: a closer look, two wide by one high)
const span = (arg('span', 360) * Math.PI) / 180, lon0 = (arg('lon', 0) * Math.PI) / 180, lat0 = (arg('lat', 0) * Math.PI) / 180;
const dir = (x: number, y: number): Vec3 => {
  const lon = lon0 + (x / Wd - 0.5) * span, lat = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, lat0 - (y / Ht - 0.5) * span * 0.5));
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)];
};
const ramp = (t: number): [number, number, number] => {
  const stops: [number, [number, number, number]][] = [
    [0, [112, 150, 78]],
    [0.18, [96, 140, 60]],
    [0.4, [150, 146, 92]],
    [0.62, [128, 112, 96]],
    [0.82, [150, 146, 140]],
    [1, [236, 236, 232]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [c, cc] = stops[i];
      const u = (t - a) / (c - a);
      return [ca[0] + (cc[0] - ca[0]) * u, ca[1] + (cc[1] - ca[1]) * u, ca[2] + (cc[2] - ca[2]) * u];
    }
  }
  return stops[stops.length - 1][1];
};
const hs = new Float32Array(Wd * Ht);
for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) hs[y * Wd + x] = sampleAt(aH, dir(x + 0.5, y + 0.5));
const showPlates = argv.includes('--plates');
for (let y = 0; y < Ht; y++) {
  for (let x = 0; x < Wd; x++) {
    const p = dir(x + 0.5, y + 0.5);
    const hh = hs[y * Wd + x], L = sampleAt(aL, p);
    const k = cellIndex(g.N, p);
    let c: [number, number, number];
    // (the light from the north-west, on the slope across a pixel each way; a pixel is this many bu across)
    const across = ((span * R) / Wd) * Math.max(0.05, Math.abs(p[0] * p[0] + p[2] * p[2]) ** 0.5);
    const dx = (hs[y * Wd + ((x + 1) % Wd)] - hs[y * Wd + ((x + Wd - 1) % Wd)]) / (2 * across);
    const dy = (hs[Math.min(Ht - 1, y + 1) * Wd + x] - hs[Math.max(0, y - 1) * Wd + x]) / (2 * ((span * 0.5 * R) / Ht));
    const shade = Math.max(0.35, Math.min(1.25, 0.85 + 0.9 * (-dx * 0.7 + dy * 0.7)));
    if (kind[k] === RIVER) c = b.flow[k] >= SWIM_FLOW ? [60, 120, 200] : [90, 150, 205];
    else if (L - hh > 0 || kind[k] === SEA || kind[k] === LAKE) {
      const depth = L - hh;
      const lake = kind[k] === LAKE;
      const t = Math.min(1, Math.max(0, depth / (lake ? 6 : spec.relief * 0.55)));
      c = lake ? [46 + 20 * (1 - t), 104 + 30 * (1 - t), 150 + 30 * (1 - t)] : depth < 1.25 ? [70, 130, 160] : [22 + 30 * (1 - t), 48 + 40 * (1 - t), 92 + 50 * (1 - t)];
    } else {
      const r = ramp(Math.min(1, Math.max(0, hh / spec.relief)));
      const damp = b.moist[k] > 0.58 ? 0.8 : 1;
      c = [r[0] * shade * damp, r[1] * shade, r[2] * shade * damp];
      if (Math.abs(p[1]) > 0.9) c = [228, 232, 234];
    }
    if (showPlates) {
      const k2 = cellIndex(g.N, dir(x + 1.5, y + 0.5)), k3 = cellIndex(g.N, dir(x + 0.5, y + 1.5));
      if (b.plate[k2] !== b.plate[k] || b.plate[k3] !== b.plate[k]) c = b.continental[b.plate[k]] ? [200, 40, 40] : [255, 160, 40];
    }
    const o = (y * Wd + x) * 3;
    px[o] = Math.max(0, Math.min(255, c[0]));
    px[o + 1] = Math.max(0, Math.min(255, c[1]));
    px[o + 2] = Math.max(0, Math.min(255, c[2]));
  }
}

// a PNG, written by hand (zlib's deflate is all it needs)
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf: Buffer) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const raw = Buffer.alloc((Wd * 3 + 1) * Ht);
for (let y = 0; y < Ht; y++) {
  raw[y * (Wd * 3 + 1)] = 0;
  Buffer.from(px.buffer, y * Wd * 3, Wd * 3).copy(raw, y * (Wd * 3 + 1) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(Wd, 0);
ihdr.writeUInt32BE(Ht, 4);
ihdr[8] = 8;
ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`map: ${out}`);
