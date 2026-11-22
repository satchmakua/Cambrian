/**
 * A planet's terrain, baked once from its spec on the cube-sphere grid (cubeGrid.ts, about 2.5 bu a cell),
 * in passes:
 *
 * 1. Plates. Seeded plates grown over the grid by a random flood, each continental or oceanic and turning
 *    about a pole of its own. Where two push together a range rises (an island arc out at sea, a trench off
 *    a coast); where they pull apart, a rift. Plates simply, after Red Blob Games' planet generator: not a
 *    simulation of them.
 * 2. Noise on the sphere itself: the continents' swell bent by warped noise, so coasts wander off the
 *    plates' edges, and the sea let in until the share of land asked for stands above it.
 * 3. A first climate (planetClimate.ts): temperature by latitude and height, winds in their bands, rain
 *    carried on them and wrung out where they climb — the rain the rivers carve with.
 * 4. The land carved by its rivers: stream-power erosion (incision ∝ uplift against √drainage), taken to
 *    the balance the uplift and the rivers reach (Braun & Willett's implicit form, run to its steady state;
 *    Cordonnier et al. 2016). The plates set where the ground is pushed up; the rivers make that uplift
 *    into ridges and branching valleys. The flow is routed over hollows by Priority-Flood (Barnes 2014),
 *    and weighted by the rain.
 * 5. The valley's own hills laid over the land, and rifts let down: hollows. Those big and deep enough fill
 *    to their brims as lakes (Priority-Flood again); the rest are filled away, so every drop of rain on dry
 *    ground runs on to a lake or the sea.
 * 6. Rivers where the gathered rain passes a threshold: channels cut a cell wide (held unbroken where they
 *    run corner to corner), shallow while they are streams, deep enough to swim in once they are rivers.
 * 7. Water bodies: each sea and lake, the river a lake drains by, and which a swimmer can pass.
 * 8. The climate again, on the ground the rivers carved, for what grows where (planetGround.ts's biomes)
 *    and the rain the rivers carry.
 *
 * Every cell keeps its ground's height and its water's surface, which the simulation and the scene read
 * between the cells' middles alike (cubeGrid.ts's `sampleAt`). Pure, deterministic, and checksummed: the
 * same spec makes the same planet.
 */
import { mulberry32 } from '../engine/rng';
import { fbm, ridged } from './noise3';
import { makeGrid, type CubeGrid } from './cubeGrid';
import { climateOn } from './planetClimate';
import { randomPlace } from './sphere';

/** What a planet is made from. */
export interface PlanetSpec {
  seed: number;
  /** the sea's radius (bu) */
  radius: number;
  /** how high the highest ground stands above the sea (bu): the valley's reaches about 14 */
  relief: number;
  /** the share of the surface above the sea */
  land: number;
  /** a few great continents (0) … many smaller lands (1) */
  continents?: number;
  /** gentle (0) … rugged (1): how hard the plates push their ranges up, and how hilly the rest */
  rugged?: number;
  /** colder (−1: an ice world) … warmer (1: a hothouse): the ice caps and the snow line */
  temperature?: number;
  /** drier (−1: deserts) … wetter (1: forests): how much water the winds carry inland */
  wetness?: number;
}

export const SPEC_DEFAULTS = { continents: 0.45, rugged: 0.5, temperature: 0, wetness: 0 };

/** what a cell is */
export const LAND = 0, SEA = 1, LAKE = 2, RIVER = 3;

/** the grid's cells (bu across), as near as a whole number of them along a face's edge comes */
export const BAKE_CELL = 2.5;
/** a lake: at least this much water (bu²) and this deep (bu); smaller hollows are filled away */
const LAKE_AREA = 80;
const LAKE_DEPTH = 0.6;
/** rain gathered (bu², weighted) above which the ground is a channel's, cut by its river: above it, a
 *  hillside's slope is held at a channel head's */
const CHANNEL_HEAD = 60;
/** rain gathered (bu² of ground, weighted by its rain) where a stream begins, and where it is a river a
 *  swimmer can make its way along */
export const STREAM_FLOW = 900;
export const SWIM_FLOW = 3200;
/** a stream's depth (bu) — too shallow for a fish (the simulation's 0.3: model.ts's canStand) — and a
 *  river's, deep enough */
const STREAM_DEPTH = 0.22;
const RIVER_DEPTH = 0.65;
/** a channel's water stands this far (bu) below its banks */
const FREEBOARD = 0.2;
/** the sea's shelf: this far out (bu) it is shallow, then falls away to the deep */
const SHELF = 14;

export interface WaterBody {
  id: number;
  kind: 'sea' | 'lake';
  /** its surface (bu): the sea's is 0 */
  level: number;
  cells: number;
  /** bu² */
  area: number;
  /** a lake's way out: the cell its water leaves by, the body it runs on into, and whether the river
   *  between is one a swimmer can make (a sea's: −1, −1, false) */
  outlet: number;
  to: number;
  swim: boolean;
  /** the bodies a swimmer can reach from one another share this */
  reach: number;
}

export interface Bake {
  spec: PlanetSpec & typeof SPEC_DEFAULTS;
  grid: CubeGrid;
  /** each cell's ground (bu above the sea; under it, negative) */
  h: Float32Array;
  /** each cell's water surface (bu): the sea's 0, a lake's level, a channel's water. On dry ground beside
   *  water, that water's level (so a shore read between cells meets the waterline); elsewhere the sea's. */
  level: Float32Array;
  /** LAND, SEA, LAKE or RIVER */
  kind: Uint8Array;
  /** each wet cell's body (a channel's: the one it runs into); −1 on dry ground */
  body: Int32Array;
  bodies: WaterBody[];
  /** each cell's way down (−1: the sea's own) and the rain gathered through it (bu², weighted by rain) */
  recv: Int32Array;
  flow: Float32Array;
  /** rain (m a year: what the rivers gather) and damp (0 … 1: how lush the ground looks) */
  rain: Float32Array;
  moist: Float32Array;
  /** each cell's yearly mean temperature (°C), its rain (mm a year), and how steep its ground is (rise over
   *  run, to the dry ground round it) */
  T: Float32Array;
  P: Float32Array;
  slope: Float32Array;
  /** each cell's plate, each plate continental or not (for maps) */
  plate: Int16Array;
  continental: Uint8Array;
  checksum: string;
}

// --- a heap, for the floods and the distances ------------------------------------------------------

/** A min-heap of cells by a key (ties by the cell's index: the same order on every run). */
class Heap {
  k: Float64Array;
  v: Int32Array;
  n = 0;
  constructor(cap: number) {
    this.k = new Float64Array(Math.max(16, cap));
    this.v = new Int32Array(Math.max(16, cap));
  }
  push(key: number, val: number): void {
    if (this.n === this.k.length) {
      const k = new Float64Array(this.n * 2), v = new Int32Array(this.n * 2);
      k.set(this.k);
      v.set(this.v);
      this.k = k;
      this.v = v;
    }
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] < key || (this.k[p] === key && this.v[p] < val)) break;
      this.k[i] = this.k[p];
      this.v[i] = this.v[p];
      i = p;
    }
    this.k[i] = key;
    this.v[i] = val;
  }
  /** the least key's cell (its key was `k[0]` before the pop) */
  pop(): number {
    const top = this.v[0];
    const key = this.k[--this.n], val = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && (this.k[c + 1] < this.k[c] || (this.k[c + 1] === this.k[c] && this.v[c + 1] < this.v[c]))) c++;
      if (this.k[c] > key || (this.k[c] === key && this.v[c] > val)) break;
      this.k[i] = this.k[c];
      this.v[i] = this.v[c];
      i = c;
    }
    this.k[i] = key;
    this.v[i] = val;
    return top;
  }
}

/**
 * Distances over the ground (on the unit sphere) from a set of cells, out to `limit`, each cell taking the
 * `tag` of the source nearest it (Dijkstra's, many sources at once). Cells beyond the limit stay Infinity.
 */
function spread(g: CubeGrid, sources: number[], tags: number[] | null, limit: number): { d: Float64Array; tag: Float32Array } {
  const d = new Float64Array(g.count).fill(Infinity);
  const tag = new Float32Array(g.count);
  const heap = new Heap(sources.length * 4);
  sources.forEach((s, i) => {
    d[s] = 0;
    if (tags) tag[s] = tags[i];
    heap.push(0, s);
  });
  while (heap.n > 0) {
    const dk = heap.k[0];
    const c = heap.pop();
    if (dk > d[c]) continue;
    for (let e = 0; e < 8; e++) {
      const m = g.nbr[c * 8 + e];
      if (m < 0) continue;
      const nd = dk + g.gap[c * 8 + e];
      if (nd < d[m] && nd <= limit) {
        d[m] = nd;
        tag[m] = tag[c];
        heap.push(nd, m);
      }
    }
  }
  return { d, tag };
}

// --- the flow of water ------------------------------------------------------------------------------

/**
 * Priority-Flood (Barnes 2014): from the sea inward, lowest first, each cell reached raised to at least the
 * level of the one it was reached from (+ `eps`, so even a filled hollow tilts toward its way out). The
 * filled surface, and the order the cells were reached in: every cell after the one it drains to.
 */
function flood(g: CubeGrid, h: Float64Array, sea: Uint8Array, eps: number): { filled: Float64Array; order: Int32Array; m: number } {
  const n = g.count;
  const filled = new Float64Array(n);
  const closed = new Uint8Array(n);
  const order = new Int32Array(n);
  const heap = new Heap(n);
  let m = 0;
  for (let k = 0; k < n; k++) {
    if (!sea[k]) continue;
    closed[k] = 1;
    filled[k] = 0;
    // (only the sea's edge need be opened: its depths drain nothing)
    for (let e = 0; e < 8; e++) {
      const q = g.nbr[k * 8 + e];
      if (q >= 0 && !sea[q]) {
        heap.push(0, k);
        break;
      }
    }
  }
  while (heap.n > 0) {
    const c = heap.pop();
    order[m++] = c;
    for (let e = 0; e < 8; e++) {
      const q = g.nbr[c * 8 + e];
      if (q < 0 || closed[q]) continue;
      closed[q] = 1;
      filled[q] = Math.max(h[q], filled[c] + eps);
      heap.push(filled[q], q);
    }
  }
  return { filled, order, m };
}

/** a number in [0, 1) for a cell and a salt (a hash: the same every time) */
function hashUnit(k: number, salt: number): number {
  let x = Math.imul(k ^ salt, 0x9e3779b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * Each dry cell's way down: its steepest neighbour over the filled surface (one lower always exists). With
 * a `salt`, each slope is weighed by a little chance first (after Fairfield and Leymarie's Rho8): on an even
 * slope eight fixed ways to go make rivers run in parallel down the grid's lines.
 */
function receivers(g: CubeGrid, filled: Float64Array, sea: Uint8Array, recv: Int32Array, salt = -1): number {
  let changed = 0;
  for (let k = 0; k < g.count; k++) {
    if (sea[k]) {
      recv[k] = -1;
      continue;
    }
    let best = -1, slope = 0;
    for (let e = 0; e < 8; e++) {
      const q = g.nbr[k * 8 + e];
      if (q < 0) continue;
      let s = (filled[k] - filled[q]) / g.gap[k * 8 + e];
      if (salt >= 0 && s > 0) s *= 0.65 + 0.7 * hashUnit(k * 8 + e, salt);
      if (s > slope) {
        slope = s;
        best = q;
      }
    }
    if (best !== recv[k]) changed++;
    recv[k] = best;
  }
  return changed;
}

/** The rain gathered through each cell (bu², weighted by rain): its own, and all that runs down to it. */
function gather(g: CubeGrid, R: number, rain: Float32Array, recv: Int32Array, order: Int32Array, m: number, out: Float64Array): void {
  for (let k = 0; k < g.count; k++) out[k] = g.area[k] * R * R * rain[k];
  for (let i = m - 1; i >= 0; i--) {
    const c = order[i], r = recv[c];
    if (r >= 0) out[r] += out[c];
  }
}

const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/** FNV-1a over the cells' heights, waters and kinds (to the thousandth of a bu) */
function checksumOf(h: Float32Array, level: Float32Array, kind: Uint8Array): string {
  let x = 0x811c9dc5;
  const mix = (v: number) => {
    x ^= v & 0xff;
    x = Math.imul(x, 0x01000193);
    x ^= (v >>> 8) & 0xff;
    x = Math.imul(x, 0x01000193);
    x ^= (v >>> 16) & 0xff;
    x = Math.imul(x, 0x01000193);
    x ^= (v >>> 24) & 0xff;
    x = Math.imul(x, 0x01000193);
  };
  for (let k = 0; k < h.length; k++) {
    mix(Math.round(h[k] * 1000));
    mix(Math.round(level[k] * 1000));
    mix(kind[k]);
  }
  return (x >>> 0).toString(16).padStart(8, '0');
}

// --- the bake --------------------------------------------------------------------------------------

export function bakePlanet(given: PlanetSpec): Bake {
  const spec = { ...SPEC_DEFAULTS, ...given };
  const R = spec.radius;
  const N = Math.max(24, Math.min(320, Math.round(((Math.PI / 2) * R) / BAKE_CELL)));
  const g = makeGrid(N, spec.seed);
  const n = g.count;
  const pt = g.pt;
  const rng = mulberry32(spec.seed ^ 0x2545f491);
  const salt = () => (rng() * 0xffffffff) >>> 0;
  const sWarp = salt(), sCoast = salt(), sRange = salt(), sHill = salt(), sRain = salt(), sDamp = salt(), sFloor = salt();

  // --- 1. plates: a random flood from seeds, so their edges wander -------------------------------------
  const P = Math.round(7 + 33 * spec.continents);
  const plate = new Int16Array(n).fill(-1);
  const frontier = new Int32Array(n);
  let fl = 0;
  for (let q = 0; q < P; q++) {
    let k = Math.floor(rng() * n);
    while (plate[k] >= 0) k = Math.floor(rng() * n);
    plate[k] = q;
    frontier[fl++] = k;
  }
  while (fl > 0) {
    const r = Math.floor(rng() * fl);
    const c = frontier[r];
    frontier[r] = frontier[--fl];
    for (let e = 0; e < 8; e++) {
      const q = g.nbr[c * 8 + e];
      if (q >= 0 && plate[q] < 0) {
        plate[q] = plate[c];
        frontier[fl++] = q;
      }
    }
  }
  const pArea = new Float64Array(P);
  const touch: Set<number>[] = Array.from({ length: P }, () => new Set());
  for (let k = 0; k < n; k++) {
    pArea[plate[k]] += g.area[k];
    for (let e = 0; e < 8; e++) {
      const q = g.nbr[k * 8 + e];
      if (q >= 0 && plate[q] !== plate[k]) touch[plate[k]].add(plate[q]);
    }
  }
  // continental plates, each the next to one already (one great land) or anywhere (many), until they cover
  // a little more than the land: the coasts then lie on continental shelves
  const continental = new Uint8Array(P);
  const want = Math.min(0.97, spec.land + 0.06) * 4 * Math.PI;
  const clump = 1 - 0.85 * spec.continents;
  let got = 0;
  {
    const first = Math.floor(rng() * P);
    continental[first] = 1;
    got += pArea[first];
    while (got < want) {
      const near: number[] = [], far: number[] = [];
      for (let q = 0; q < P; q++) {
        if (continental[q]) continue;
        let by = false;
        for (const o of touch[q]) if (continental[o]) by = true;
        (by ? near : far).push(q);
      }
      if (!near.length && !far.length) break;
      const pool = near.length && (rng() < clump || !far.length) ? near : far;
      const q = pool[Math.floor(rng() * pool.length)];
      continental[q] = 1;
      got += pArea[q];
    }
  }
  // each turning about a pole of its own; how hard each cell on an edge is pushed into the plate beside
  const axis = new Float64Array(P * 3), spin = new Float64Array(P);
  for (let q = 0; q < P; q++) {
    const a = randomPlace(rng);
    axis.set(a, q * 3);
    spin[q] = (0.4 + 0.6 * rng()) * (rng() < 0.5 ? -1 : 1);
  }
  const rangeSrc: number[] = [], rangeStr: number[] = [];
  const arcSrc: number[] = [], arcStr: number[] = [];
  const riftSrc: number[] = [], riftStr: number[] = [];
  const straitSrc: number[] = [];
  const edgeSrc: number[] = [];
  // (which seams between two continental plates the sea gets into, in the upper half of `continents`: past
  // half the surface, land joins up into one by itself, and only seas along the plates' seams part it)
  const parting = smooth(0.5, 1, spec.continents);
  const strait = (a: number, b: number) => hashUnit(Math.min(a, b) * 4099 + Math.max(a, b), spec.seed ^ 0x51ca) < 0.9 * parting;
  for (let k = 0; k < n; k++) {
    const A = plate[k];
    const px = pt[k * 3], py = pt[k * 3 + 1], pz = pt[k * 3 + 2];
    let sum = 0, cnt = 0, B = -1, coastal = false;
    for (let e = 0; e < 8; e++) {
      const q = g.nbr[k * 8 + e];
      if (q < 0 || plate[q] === A) continue;
      const Bq = plate[q];
      if (continental[Bq] !== continental[A]) coastal = true;
      let dx = pt[q * 3] - px, dy = pt[q * 3 + 1] - py, dz = pt[q * 3 + 2] - pz;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      // (each plate's motion at the place: its spin about its pole, ω × p)
      const a = A * 3, b = Bq * 3;
      const vax = spin[A] * (axis[a + 1] * pz - axis[a + 2] * py), vay = spin[A] * (axis[a + 2] * px - axis[a] * pz), vaz = spin[A] * (axis[a] * py - axis[a + 1] * px);
      const vbx = spin[Bq] * (axis[b + 1] * pz - axis[b + 2] * py), vby = spin[Bq] * (axis[b + 2] * px - axis[b] * pz), vbz = spin[Bq] * (axis[b] * py - axis[b + 1] * px);
      sum += (vax - vbx) * dx + (vay - vby) * dy + (vaz - vbz) * dz;
      cnt++;
      if (B < 0) B = Bq;
    }
    if (coastal) edgeSrc.push(k);
    if (!cnt) continue;
    const c = sum / cnt, Ac = continental[A], Bc = continental[B];
    if (c > 0.12) {
      if (Ac) {
        rangeSrc.push(k);
        rangeStr.push(Bc ? c : 0.75 * c);
      } else if (!Bc && A < B) {
        arcSrc.push(k);
        arcStr.push(0.7 * c);
      }
    } else if (c < -0.12 && Ac && Bc) {
      riftSrc.push(k);
      riftStr.push(-c);
    }
    if (c <= 0.12 && Ac && Bc && strait(A, B)) straitSrc.push(k);
  }
  const W = Math.min(45, Math.max(15, 0.1 * R)) / R; // a range's half-width, on the unit sphere
  const toRange = spread(g, rangeSrc, rangeStr, 3 * W);
  const toArc = spread(g, arcSrc, arcStr, 1.5 * W);
  const toRift = spread(g, riftSrc, riftStr, 1.5 * W);
  const Ws = 0.065; // a strait's half-width, on the unit sphere
  const toStrait = spread(g, straitSrc, null, 2.5 * Ws);
  const toEdge = spread(g, edgeSrc, null, 140 / R);

  // --- 2. the first ground, and the sea let in --------------------------------------------------------
  const h0 = new Float64Array(n);
  const rangeOf = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const x = pt[k * 3], y = pt[k * 3 + 1], z = pt[k * 3 + 2];
    const sd = (continental[plate[k]] ? 1 : -1) * Math.min(toEdge.d[k] * R, 140);
    // (the coast's noise, bent by more noise so bays and capes wander instead of following its lattice)
    const wx = fbm(x * 1.7 + 5.3, y * 1.7, z * 1.7, sWarp, 2) - 0.5;
    const wy = fbm(x * 1.7, y * 1.7 + 2.1, z * 1.7, sWarp + 71, 2) - 0.5;
    const wz = fbm(x * 1.7, y * 1.7, z * 1.7 + 8.7, sWarp + 143, 2) - 0.5;
    const coast = fbm((x + 0.4 * wx) * 2.6, (y + 0.4 * wy) * 2.6, (z + 0.4 * wz) * 2.6, sCoast, 6) - 0.5;
    const range = toRange.d[k] < Infinity ? toRange.tag[k] * Math.exp(-((toRange.d[k] / W) ** 2)) : 0;
    const arc = toArc.d[k] < Infinity ? toArc.tag[k] * Math.exp(-((toArc.d[k] / (0.5 * W)) ** 2)) : 0;
    // (a strait open in stretches, land bridges between, and open all along only as many lands are asked for)
    const open = smooth(0.62 - 0.5 * parting, 0.86 - 0.5 * parting, fbm(x * 3.2, y * 3.2, z * 3.2, sCoast + 33, 2));
    const sea = toStrait.d[k] < Infinity ? Math.exp(-((toStrait.d[k] / Ws) ** 2)) * open : 0;
    rangeOf[k] = range;
    h0[k] = 0.6 * Math.tanh(sd / 35) + 0.85 * coast + 0.5 * range + 0.55 * arc * (0.6 + 0.8 * fbm(x * 9, y * 9, z * 9, sCoast + 9, 2)) - 1.1 * sea;
  }
  // the sea's level: where the share of land asked for (by area) stands above it
  const sea = new Uint8Array(n);
  {
    const idx = Array.from({ length: n }, (_, k) => k).sort((a, b) => h0[a] - h0[b] || a - b);
    let acc = 0;
    const under = (1 - spec.land) * 4 * Math.PI;
    let level = h0[idx[n - 1]];
    for (const k of idx) {
      acc += g.area[k];
      if (acc >= under) {
        level = h0[k];
        break;
      }
    }
    for (let k = 0; k < n; k++) {
      h0[k] -= level;
      sea[k] = h0[k] < 0 ? 1 : 0;
    }
    // (a pocket of low ground walled off from the open sea is dry ground, a hollow, not sea)
    const comp = new Int32Array(n).fill(-1);
    const stack: number[] = [];
    let c = 0;
    for (let k = 0; k < n; k++) {
      if (!sea[k] || comp[k] >= 0) continue;
      const cells: number[] = [];
      let a = 0;
      comp[k] = c;
      stack.push(k);
      while (stack.length) {
        const s = stack.pop()!;
        cells.push(s);
        a += g.area[s];
        for (let e = 0; e < 8; e++) {
          const q = g.nbr[s * 8 + e];
          if (q >= 0 && sea[q] && comp[q] < 0) {
            comp[q] = c;
            stack.push(q);
          }
        }
      }
      if (a < 0.004 * 4 * Math.PI) for (const s of cells) sea[s] = 0;
      c++;
    }
  }

  // --- 3. a first climate, on this first ground: the rain the rivers will carve with ---------------------
  const coastCells: number[] = [];
  for (let k = 0; k < n; k++) {
    for (let e = 0; e < 8; e++) {
      const q = g.nbr[k * 8 + e];
      if (q >= 0 && sea[q] !== sea[k]) {
        coastCells.push(k);
        break;
      }
    }
  }
  const toCoast = spread(g, coastCells, null, Infinity);
  // (the first ground's heights about as high as they will stand: its land's top hundredth at most of the
  // relief, for the winds to climb)
  const first = new Float32Array(n);
  {
    const landH: number[] = [];
    for (let k = 0; k < n; k++) if (!sea[k]) landH.push(h0[k]);
    landH.sort((a, b) => a - b);
    const top = Math.max(1e-6, landH.length ? landH[Math.floor(landH.length * 0.99)] : 1);
    for (let k = 0; k < n; k++) first[k] = sea[k] ? 0 : (Math.max(0, h0[k]) * spec.relief * 0.8) / top;
  }
  const weather = { radius: R, relief: spec.relief, temperature: spec.temperature, wetness: spec.wetness, salt: sRain };
  let climate = climateOn(g, first, sea, weather);
  const rain = new Float32Array(n);
  for (let k = 0; k < n; k++) rain[k] = climate.P[k] / 1000;

  // --- 4. the land carved by its rivers, to the balance of uplift and incision --------------------------
  // how hard the ground is pushed up: a little everywhere on land, much more along the ranges, broken by
  // ridged noise into peaks and passes
  const kr = R / 28;
  const uplift = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    if (sea[k]) continue;
    const x = pt[k * 3], y = pt[k * 3 + 1], z = pt[k * 3 + 2];
    const peaks = ridged(x * kr, y * kr, z * kr, sRange, 4);
    uplift[k] = 0.12 + 0.2 * smooth(-0.2, 0.3, h0[k]) + (0.6 + 1.2 * spec.rugged) * rangeOf[k] * (0.35 + 1.3 * peaks);
  }
  const h = new Float64Array(n);
  for (let k = 0; k < n; k++) h[k] = sea[k] ? 0 : Math.max(1e-3, h0[k]);
  const recv = new Int32Array(n).fill(-2);
  const flow = new Float64Array(n);
  for (let it = 0; it < 12; it++) {
    const { filled, order, m } = flood(g, h, sea, 1e-7);
    const changed = receivers(g, filled, sea, recv, (spec.seed + it * 7919) >>> 0);
    gather(g, R, rain, recv, order, m, flow);
    // (each cell stands above the one it drains to by its uplift over its river's power: steep where little
    // water gathers, gentle down the big rivers; in the order reached, every cell after its way down. Above
    // a channel's head the slope is held at the channel's: hillsides, not spires a cell wide)
    for (let i = 0; i < m; i++) {
      const c = order[i];
      if (sea[c]) continue;
      const r = recv[c];
      const base = sea[r] ? 0 : h[r];
      let gap = 0;
      for (let e = 0; e < 8; e++) if (g.nbr[c * 8 + e] === r) gap = g.gap[c * 8 + e];
      h[c] = base + (uplift[c] * gap * R) / Math.sqrt(Math.max(flow[c], CHANNEL_HEAD));
    }
    if (it > 2 && changed < n * 0.002) break;
  }
  // hillslopes creep: a few passes of each cell eased toward its neighbours' mean, the channels left as they
  // are cut (rounded hilltops and smooth slopes between them)
  {
    const next = new Float64Array(n);
    for (let pass = 0; pass < 3; pass++) {
      for (let k = 0; k < n; k++) {
        next[k] = h[k];
        if (sea[k] || flow[k] >= STREAM_FLOW * 0.4) continue;
        let s = 0, c = 0;
        for (let e = 0; e < 8; e++) {
          const q = g.nbr[k * 8 + e];
          if (q < 0) continue;
          s += sea[q] ? 0 : h[q];
          c++;
        }
        next[k] = Math.max(1e-3, h[k] + 0.5 * (s / c - h[k]));
      }
      h.set(next);
    }
  }
  // to the relief asked for: the highest ground (all but the last half-percent of it) at its height
  {
    const landH: number[] = [];
    for (let k = 0; k < n; k++) if (!sea[k]) landH.push(h[k]);
    landH.sort((a, b) => a - b);
    const top = landH.length ? landH[Math.floor(landH.length * 0.995)] : 1;
    const k0 = (spec.relief * 0.94) / Math.max(1e-9, top);
    for (let k = 0; k < n; k++) if (!sea[k]) h[k] = Math.min(spec.relief * 1.08, h[k] * k0);
  }

  // --- 5. hills and rifts; lakes in the hollows big enough, the rest filled ----------------------------
  const kh = R / 38;
  const hillAmp = spec.relief * (0.1 + 0.1 * spec.rugged);
  for (let k = 0; k < n; k++) {
    if (sea[k]) continue;
    const x = pt[k * 3], y = pt[k * 3 + 1], z = pt[k * 3 + 2];
    // (none on the coast, nor on the floors of the rivers' valleys: hills there only dam them into chains of
    // long lakes)
    const fade = smooth(0, 10, toCoast.d[k] * R) * (1 - smooth(STREAM_FLOW * 0.3, STREAM_FLOW * 2, flow[k]));
    const hills = (fbm(x * kh, y * kh, z * kh, sHill, 3) - 0.5) * 2 * hillAmp * fade;
    const rift = toRift.d[k] < Infinity ? toRift.tag[k] * Math.exp(-((toRift.d[k] / (0.5 * W)) ** 2)) * spec.relief * 0.3 * fade : 0;
    h[k] = Math.max(0.05, h[k] + hills - rift);
  }
  const kind = new Uint8Array(n);
  const level = new Float32Array(n);
  for (let k = 0; k < n; k++) kind[k] = sea[k] ? SEA : LAND;
  {
    const { filled } = flood(g, h, sea, 0);
    const seen = new Uint8Array(n);
    const stack: number[] = [];
    for (let k = 0; k < n; k++) {
      if (sea[k] || seen[k] || filled[k] <= h[k] + 1e-6) continue;
      const cells: number[] = [];
      let a = 0, deep = 0;
      seen[k] = 1;
      stack.push(k);
      while (stack.length) {
        const s = stack.pop()!;
        cells.push(s);
        a += g.area[s] * R * R;
        deep = Math.max(deep, filled[s] - h[s]);
        for (let e = 0; e < 8; e++) {
          const q = g.nbr[s * 8 + e];
          if (q >= 0 && !sea[q] && !seen[q] && filled[q] > h[q] + 1e-6) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
      const lake = a >= LAKE_AREA && deep >= LAKE_DEPTH;
      for (const s of cells) {
        if (lake) {
          kind[s] = LAKE;
          level[s] = filled[s];
        } else h[s] = filled[s];
      }
    }
  }

  // --- 8 (first: the rivers carry its rain). The climate again, on the ground the rivers carved --------------
  climate = climateOn(g, h, sea, weather);
  for (let k = 0; k < n; k++) rain[k] = climate.P[k] / 1000;

  // --- 6. the rivers: the rain gathered at last, and the channels it cuts -------------------------------
  const wet = new Uint8Array(n);
  for (let k = 0; k < n; k++) wet[k] = kind[k] === SEA || kind[k] === LAKE ? 1 : 0;
  // (lakes route their water on: as hollows, filled flat and tilted toward their way out)
  {
    const { filled, order, m } = flood(g, h, sea, 1e-7);
    receivers(g, filled, sea, recv);
    gather(g, R, rain, recv, order, m, flow);
    for (let i = 0; i < m; i++) {
      const c = order[i];
      if (kind[c] !== LAND || flow[c] < STREAM_FLOW) continue;
      kind[c] = RIVER;
      const r = recv[c];
      const down = kind[r] === SEA ? 0 : kind[r] === LAKE || kind[r] === RIVER ? level[r] : h[r];
      const swim = flow[c] >= SWIM_FLOW;
      const depth = swim ? RIVER_DEPTH + 0.35 * Math.min(1, (Math.sqrt(flow[c]) - Math.sqrt(SWIM_FLOW)) / 120) : STREAM_DEPTH * (0.6 + 0.4 * Math.min(1, (flow[c] - STREAM_FLOW) / (SWIM_FLOW - STREAM_FLOW)));
      // (its water no higher than its banks less a little, and never below the water it runs into)
      level[c] = Math.max(h[c] - FREEBOARD, down);
      h[c] = Math.min(h[c], level[c] - depth);
    }
    // a channel that runs corner to corner is joined across the side between, so it reads unbroken
    for (let c = 0; c < n; c++) {
      if (kind[c] !== RIVER) continue;
      const r = recv[c];
      if (r < 0) continue;
      let diag = -1;
      for (let e = 4; e < 8; e++) if (g.nbr[c * 8 + e] === r) diag = e;
      if (diag < 0) continue;
      // the two cells beside both: neighbours of c that are neighbours of r
      let bridge = -1;
      for (let e = 0; e < 4; e++) {
        const q = g.nbr[c * 8 + e];
        if (q < 0 || kind[q] !== LAND) continue;
        let adj = false;
        for (let f = 0; f < 8; f++) if (g.nbr[r * 8 + f] === q) adj = true;
        if (adj && (bridge < 0 || h[q] < h[bridge])) bridge = q;
      }
      if (bridge < 0) continue;
      kind[bridge] = RIVER;
      const lr = kind[r] === SEA ? 0 : level[r];
      level[bridge] = Math.max(lr, Math.min(level[c], h[bridge] - FREEBOARD));
      h[bridge] = Math.min(h[bridge], level[bridge] - (level[c] - h[c]));
      recv[bridge] = r;
      flow[bridge] = flow[c];
    }
  }

  // --- 7. the bodies of water, and which a swimmer can pass between --------------------------------------
  const body = new Int32Array(n).fill(-1);
  const bodies: WaterBody[] = [];
  {
    const stack: number[] = [];
    for (let k = 0; k < n; k++) {
      if ((kind[k] !== SEA && kind[k] !== LAKE) || body[k] >= 0) continue;
      const id = bodies.length, kk = kind[k];
      let cells = 0, a = 0;
      body[k] = id;
      stack.push(k);
      while (stack.length) {
        const s = stack.pop()!;
        cells++;
        a += g.area[s] * R * R;
        for (let e = 0; e < 8; e++) {
          const q = g.nbr[s * 8 + e];
          if (q >= 0 && kind[q] === kk && body[q] < 0) {
            body[q] = id;
            stack.push(q);
          }
        }
      }
      bodies.push({ id, kind: kk === SEA ? 'sea' : 'lake', level: kk === SEA ? 0 : level[k], cells, area: a, outlet: -1, to: -1, swim: false, reach: id });
    }
    // a lake's way out: down from any of its cells until off it; on down until another body
    const lakeCell = new Int32Array(bodies.length).fill(-1);
    for (let k = 0; k < n; k++) if (kind[k] === LAKE && lakeCell[body[k]] < 0) lakeCell[body[k]] = k;
    for (const b of bodies) {
      if (b.kind !== 'lake') continue;
      let c = lakeCell[b.id], guard = 0;
      while (c >= 0 && body[c] === b.id && guard++ < n) c = recv[c];
      b.outlet = c;
      let d = c;
      guard = 0;
      while (d >= 0 && body[d] < 0 && guard++ < n) d = recv[d];
      b.to = d >= 0 ? body[d] : -1;
      b.swim = c >= 0 && b.to >= 0 && flow[c] >= SWIM_FLOW;
    }
    // (joined by the rivers a swimmer can make, a lake shares the reach of the water it runs into)
    const root = (i: number): number => (bodies[i].reach === i ? i : (bodies[i].reach = root(bodies[i].reach)));
    for (const b of bodies) if (b.swim) {
      const a = root(b.id), c = root(b.to);
      if (a !== c) bodies[Math.max(a, c)].reach = Math.min(a, c);
    }
    for (const b of bodies) b.reach = root(b.id);
    // a channel belongs to the body it runs into
    for (let k = 0; k < n; k++) {
      if (kind[k] !== RIVER) continue;
      let d = k, guard = 0;
      while (d >= 0 && kind[d] === RIVER && guard++ < n) d = recv[d];
      body[k] = d >= 0 ? body[d] : -1;
    }
  }

  // --- the water's surface on dry ground beside it, damp, and the sea's floor ---------------------------
  for (let k = 0; k < n; k++) {
    if (kind[k] !== LAND) continue;
    let L = 0;
    for (let e = 0; e < 8; e++) {
      const q = g.nbr[k * 8 + e];
      if (q >= 0 && kind[q] !== LAND && kind[q] !== SEA && level[q] <= h[k] && level[q] > L) L = level[q];
    }
    level[k] = L;
  }
  const freshCells: number[] = [];
  for (let k = 0; k < n; k++) if (kind[k] === LAKE || kind[k] === RIVER) freshCells.push(k);
  const toFresh = spread(g, freshCells, null, 30 / R);
  const moist = new Float32Array(n);
  const km = R / 30;
  for (let k = 0; k < n; k++) {
    const x = pt[k * 3], y = pt[k * 3 + 1], z = pt[k * 3 + 2];
    const near = toFresh.d[k] < Infinity ? Math.exp(-(toFresh.d[k] * R) / 7) : 0;
    moist[k] = Math.min(1, Math.max(0, 0.16 + 0.36 * Math.min(1.2, rain[k]) + 0.62 * (fbm(x * km, y * km, z * km, sDamp, 3) - 0.5) + 0.2 * near));
    if (kind[k] !== SEA) continue;
    // the sea's floor: a shelf along every coast, then down to the deep (a little broken by noise)
    const off = toCoast.d[k] * R;
    const deep = Math.max(2, spec.relief * 0.55);
    const rough = 0.85 + 0.3 * fbm(x * 6, y * 6, z * 6, sFloor, 3);
    h[k] = -(0.3 + 0.9 * smooth(0, SHELF, off) + (deep - 1.2) * smooth(SHELF, SHELF + 45, off) * rough);
  }

  const hf = Float32Array.from(h);
  // (how steep the hillside is: the mean rise to the dry ground round it, not the drop into a channel cut
  // beside it, which made a cliff of every river bank)
  const slope = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    if (kind[k] === SEA) continue;
    let sum = 0, cnt = 0;
    for (let e = 0; e < 8; e++) {
      const q = g.nbr[k * 8 + e];
      if (q < 0 || kind[q] !== LAND) continue;
      sum += Math.abs(hf[k] - hf[q]) / (g.gap[k * 8 + e] * R);
      cnt++;
    }
    slope[k] = cnt ? sum / cnt : 0;
  }
  return {
    spec,
    grid: g,
    h: hf,
    level,
    kind,
    body,
    bodies,
    recv,
    flow: Float32Array.from(flow),
    rain,
    moist,
    T: climate.T,
    P: climate.P,
    slope,
    plate,
    continental,
    checksum: checksumOf(hf, level, kind),
  };
}
