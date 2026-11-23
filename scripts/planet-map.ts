/**
 * A baked planet as a map, headless: its numbers, and a shaded picture of the whole globe (equirectangular,
 * north up) — what grows where in the scene's own colours (sim/palette.ts), lit from the north-west, the
 * sea's shelf and deeps, lakes, rivers (bright where a swimmer can use them), and with --plates the plates'
 * edges; with --relief-colours, a height ramp instead of the biomes.
 *
 *   npx vite-node scripts/planet-map.ts -- --seed 7 --radius 300 --relief 30 --land 0.6 \
 *     [--continents 0.45] [--rugged 0.5] [--temperature 0] [--wetness 0] [--shelf 0.25] [--plates] [--relief-colours] \
 *     [--lon 0 --lat 0 --span 360] [--width 1600] [--out planet.png]
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { RIVER, SEA, SWIM_FLOW } from '../src/sim/planetBake';
import { cellCentre } from '../src/sim/cubeGrid';
import { biomeOn, makePlanetGround } from '../src/sim/planetGround';
import { planetMap } from '../src/world/planet/planetMap';

const argv = process.argv.slice(2);
const arg = (k: string, d: number) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const out = (() => {
  const i = argv.indexOf('--out');
  return i >= 0 ? argv[i + 1] : 'planet.png';
})();
const spec = { seed: arg('seed', 7), radius: arg('radius', 300), relief: arg('relief', 30), land: arg('land', 0.6), continents: arg('continents', 0.45), rugged: arg('rugged', 0.5), temperature: arg('temperature', 0), wetness: arg('wetness', 0), shelf: arg('shelf', 0.25) };

const t0 = performance.now();
const ground = makePlanetGround(spec);
const b = ground.bake;
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
// what grows where: each biome's share of the land
{
  const share = new Map<string, number>();
  let dry = 0;
  for (let k = 0; k < g.count; k++) {
    const bm = biomeOn(ground, cellCentre(g.N, k));
    if (bm === 'deep' || bm === 'shallow') continue;
    share.set(bm, (share.get(bm) ?? 0) + g.area[k]);
    dry += g.area[k];
  }
  console.log('land: ' + [...share.entries()].sort((a, c) => c[1] - a[1]).map(([bm, a]) => `${bm} ${((100 * a) / dry).toFixed(0)}%`).join(', '));
  const qs = (f: Float32Array) => {
    const v: number[] = [];
    for (let k = 0; k < g.count; k++) if (kind[k] !== SEA) v.push(f[k]);
    v.sort((a, c) => a - c);
    return [0.05, 0.25, 0.5, 0.75, 0.95].map((x) => v[Math.floor(v.length * x)].toFixed(0)).join(' / ');
  };
  console.log(`on land, warmth °C ${qs(b.T)} · rain mm ${qs(b.P)} (5th / 25th / 50th / 75th / 95th)`);
}

// the picture (world/planet/planetMap.ts: the planet designer's own map), RGBA to RGB
const Wd = arg('width', 1600), Ht = Math.round(Wd / 2);
const field = (() => {
  const i = argv.indexOf('--field');
  return i >= 0 ? argv[i + 1] : '';
})();
const rgba = planetMap(ground, Wd, { plates: argv.includes('--plates'), relief: argv.includes('--relief-colours'), field: field === 'rain' || field === 'warmth' ? field : '', lon: arg('lon', 0), lat: arg('lat', 0), span: arg('span', 360) });
const px = new Uint8Array(Wd * Ht * 3);
for (let i = 0; i < Wd * Ht; i++) {
  px[i * 3] = rgba[i * 4];
  px[i * 3 + 1] = rgba[i * 4 + 1];
  px[i * 3 + 2] = rgba[i * 4 + 2];
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
