/**
 * The flat valley as a surface (surface.ts): a square of ground 200 bu across, +X and +Z its two axes, a
 * heading the angle from +Z toward +X. Each operation is the arithmetic the simulation used to do inline,
 * kept operation for operation (in the same order, the same groupings), so a valley run through the port
 * is the same valley to the last bit; the searches that need the square's shape (its spatial hash, its
 * plant grid, its ring searches, the room bodies keep) moved here whole.
 */
import { biomeAt, heightAt, inBounds, makeTerrain, WATER_LEVEL, type Terrain } from './terrain';
import { nearestTree, standsOf } from './stands';
import { AIRBORNE, canStand, GRID_CELL, growthOf, isNight, SPATIAL, type Creature, type Plant, type World } from './model';
import type { Ground, Surface } from './surface';

/** A valley's ground, by its seed: its terrain, its surface, how many cells its fields run across (the
 *  valley's own viewer draws its grass by them), and its bushes: up to 170, thrown over the middle of the
 *  square. */
export function makeValley(seed: number): Ground {
  const terrain = makeTerrain(seed);
  const surface = valleySurface(terrain);
  return { terrain, surface, gridN: Math.ceil(terrain.size / GRID_CELL), bushes: { most: 170, tries: 8000, place: (rng) => surface.anywhere(rng, 0.94) } };
}

export function valleySurface(terrain: Terrain): Surface {
  const size = terrain.size;
  const gridN = Math.ceil(size / GRID_CELL);
  return {
    kind: 'valley',

    // --- where things are, and how far apart ---------------------------------------------------------
    dist: (a, b) => Math.hypot(b.x - a.x, b.z - a.z),
    toGoal: (c) => Math.hypot(c.tx - c.x, c.tz - c.z),
    inReach: (a, b, r) => Math.abs(b.x - a.x) < r && Math.abs(b.z - a.z) < r,
    ahead(c, turn, d, k = 1) {
      const a = c.heading + turn;
      return { x: c.x + Math.sin(a) * d * k, z: c.z + Math.cos(a) * d * k };
    },
    around: (p, b, d) => ({ x: p.x + Math.sin(b) * d, z: p.z + Math.cos(b) * d }),
    bearing: (from, to) => Math.atan2(to.x - from.x, to.z - from.z),
    mid: (a, b) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }),
    away(p, from, d) {
      const dx = p.x - from.x, dz = p.z - from.z;
      const n = Math.hypot(dx, dz) || 1;
      return { x: p.x + (dx / n) * d, z: p.z + (dz / n) * d };
    },
    cosAt(at, a, b) {
      const ax = a.x - at.x, az = a.z - at.z;
      const bx = b.x - at.x, bz = b.z - at.z;
      const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
      return (ax * bx + az * bz) / (la * lb);
    },
    offset: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }),
    pull: (p, to, k, s) => ({ x: p.x * (1 - k * s) + to.x * k * s, z: p.z * (1 - k * s) + to.z * k * s }),
    centroid(list, keep) {
      let hx = 0, hz = 0, n = 0;
      for (const o of list) {
        if (!keep(o)) continue;
        hx += o.x;
        hz += o.z;
        n++;
      }
      return n > 0 ? { x: hx / n, z: hz / n } : null;
    },
    keepInside(p, margin) {
      const half = size / 2 - margin;
      return { x: Math.max(-half, Math.min(half, p.x)), z: Math.max(-half, Math.min(half, p.z)) };
    },
    inBounds: (p, margin = 4) => inBounds(terrain, p.x, p.z, margin),
    anywhere: (rng, share) => ({ x: (rng() - 0.5) * size * share, z: (rng() - 0.5) * size * share }),
    // (on a ring round the valley's middle, most of the way out to its edge)
    edge: (b) => ({ x: Math.sin(b) * size * 0.42, z: Math.cos(b) * size * 0.42 }),
    offWater(p, d) {
      const dx = p.x - terrain.lakeX, dz = p.z - terrain.lakeZ;
      const n = Math.hypot(dx, dz) || 1;
      return { x: p.x + (dx / n) * d, z: p.z + (dz / n) * d };
    },
    // (the lake's south shore)
    fallback: () => ({ x: terrain.lakeX, z: terrain.lakeZ + terrain.lakeR * 1.3 }),
    nearestWhere(p, deep, max = 40) {
      for (let r = 3; r <= max; r *= 1.5) {
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const px = p.x + Math.sin(a) * r, pz = p.z + Math.cos(a) * r;
          if (!inBounds(terrain, px, pz, 4)) continue;
          const h = heightAt(terrain, px, pz);
          if (deep ? h < WATER_LEVEL - 0.6 : h > WATER_LEVEL + 0.4) return { x: px, z: pz };
        }
      }
      return null;
    },
    key: (p) => [Math.round(p.x * 1000), Math.round(p.z * 1000)],

    // --- the ground -------------------------------------------------------------------------------------
    height: (p) => heightAt(terrain, p.x, p.z),
    biome: (p) => biomeAt(terrain, p.x, p.z),
    groundOf: (c) => c.y,
    settle(c) {
      c.y = heightAt(terrain, c.x, c.z);
    },
    night: (_p, time) => isNight(time),

    // --- headings, goals and moves ----------------------------------------------------------------------
    turn(c, a) {
      c.heading += a;
    },
    turnToward(c, p, max) {
      const want = Math.atan2(p.x - c.x, p.z - c.z);
      let dh = want - c.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      c.heading += Math.max(-max, Math.min(max, dh));
    },
    faceLike(c, like, turn) {
      c.heading = like.heading + turn;
    },
    faceAnywhere(c, rng) {
      c.heading = rng() * Math.PI * 2;
    },
    tidy(c) {
      c.heading = Math.atan2(Math.sin(c.heading), Math.cos(c.heading));
    },
    moveTo(c, p) {
      c.x = p.x;
      c.z = p.z;
    },
    aim(c, p) {
      c.tx = p.x;
      c.tz = p.z;
    },
    goal: (c) => ({ x: c.tx, z: c.tz }),

    // --- a new body's own fields --------------------------------------------------------------------------
    // (the water line less ten: a body set down on the bed of the deep lake stands a little up off it)
    standing: (p, rng) => ({ x: p.x, z: p.z, y: Math.max(heightAt(terrain, p.x, p.z), WATER_LEVEL - 10), heading: rng() * Math.PI * 2 }),
    aimAt: (p) => ({ tx: p.x, tz: p.z }),
    remains: (c) => ({ x: c.x, z: c.z, y: c.y, heading: c.heading }),
    laid: (p) => ({ x: p.x, z: p.z, y: heightAt(terrain, p.x, p.z) }),

    // --- the living by place, and the fields ------------------------------------------------------------
    index(w) {
      w.buckets.clear();
      for (const c of w.creatures) {
        if (!c.alive) continue;
        const key = bucketKey(c.x, c.z);
        let b = w.buckets.get(key);
        if (!b) w.buckets.set(key, (b = []));
        b.push(c);
      }
    },
    nearby(w, p, r, out) {
      out.length = 0;
      const x = p.x, z = p.z;
      const i0 = Math.floor((x - r) / SPATIAL), i1 = Math.floor((x + r) / SPATIAL);
      const j0 = Math.floor((z - r) / SPATIAL), j1 = Math.floor((z + r) / SPATIAL);
      const r2 = r * r;
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const b = w.buckets.get((i + 1000) * 4096 + (j + 1000));
          if (!b) continue;
          for (const c of b) {
            const dx = c.x - x, dz = c.z - z;
            if (dx * dx + dz * dz <= r2) out.push(c);
          }
        }
      }
      return out;
    },
    cells: gridN * gridN,
    cellOf(p) {
      const i = Math.min(gridN - 1, Math.max(0, Math.floor((p.x + size / 2) / GRID_CELL)));
      const j = Math.min(gridN - 1, Math.max(0, Math.floor((p.z + size / 2) / GRID_CELL)));
      return j * gridN + i;
    },
    cellCenter(k) {
      const i = k % gridN, j = Math.floor(k / gridN);
      return { x: -size / 2 + (i + 0.5) * GRID_CELL, z: -size / 2 + (j + 0.5) * GRID_CELL };
    },
    fieldNear(field, p, r) {
      const N = gridN, cell = GRID_CELL, half = size / 2;
      const i0 = Math.max(0, Math.floor((p.x - r + half) / cell)), i1 = Math.min(N - 1, Math.floor((p.x + r + half) / cell));
      const j0 = Math.max(0, Math.floor((p.z - r + half) / cell)), j1 = Math.min(N - 1, Math.floor((p.z + r + half) / cell));
      let sum = 0;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) sum += field[j * N + i];
      return sum;
    },

    // --- plants, trees, and the room bodies keep --------------------------------------------------------
    nearestBush(plants, p, within) {
      const grid = plantGrid(plants);
      const x = p.x, z = p.z;
      let best: Plant | null = null;
      let bd = within;
      const i0 = Math.floor((x - within) / PLANT_CELL), i1 = Math.floor((x + within) / PLANT_CELL);
      const j0 = Math.floor((z - within) / PLANT_CELL), j1 = Math.floor((z + within) / PLANT_CELL);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const cell = grid.get((i + 1000) * 4096 + (j + 1000));
          if (!cell) continue;
          for (const q of cell) {
            const d = Math.hypot(q.x - x, q.z - z);
            // (a tie goes to the plant placed first, as a scan of the whole list in order gave it)
            if (d < bd || (d === bd && best && q.id < best.id)) {
              bd = d;
              best = q;
            }
          }
        }
      }
      return best;
    },
    plantsWithin: (plants) => plants,
    trees: () => standsOf(terrain).trees,
    nearestTree: (p, within) => nearestTree(terrain, p.x, p.z, within),
    keepRoom: (w, dt) => keepRoom(w, dt, terrain),
    footprintGap,
  };
}

function bucketKey(x: number, z: number): number {
  return (Math.floor(x / SPATIAL) + 1000) * 4096 + (Math.floor(z / SPATIAL) + 1000);
}

/** the plants by the square (they never move: a world's are placed once, and a load replaces the
 *  whole list), so a search for cover looks at the few near it — not all 170 for every hunter's prey
 *  and every fleeing animal, every step (a sixth of a year's fast-forward was that scan) */
const PLANT_CELL = 8;
const PLANT_GRIDS = new WeakMap<Plant[], Map<number, Plant[]>>();
function plantGrid(plants: Plant[]): Map<number, Plant[]> {
  let grid = PLANT_GRIDS.get(plants);
  if (!grid) {
    grid = new Map();
    for (const p of plants) {
      const k = (Math.floor(p.x / PLANT_CELL) + 1000) * 4096 + (Math.floor(p.z / PLANT_CELL) + 1000);
      let cell = grid.get(k);
      if (!cell) grid.set(k, (cell = []));
      cell.push(p);
    }
    PLANT_GRIDS.set(plants, grid);
  }
  return grid;
}

// --- room: bodies do not pass through each other ---------------------------------------------------

/** Two bodies on the ground ease apart once nearer than this share of their radii summed. A bite lands
 *  inside 0.9 of the sum and a mating inside all of it, and the pair engaged in either is let be
 *  anyway (see `engaged`): a long hunter's footprint must never hold its jaws off its prey. */
export const ROOM = 0.8;
/** The share of an overlap eased out each second: over a pass (every other step) the whole of it, up
 *  to ROOM_PUSH — the eye still sees a shuffle, as the actor eases toward where the sim puts it. (At
 *  four a second, grazers drifting into one another as they fed outran it and stood inside each other.) */
export const ROOM_RATE = 10;
/** A long body's footprint runs down its heading over this share of its length: its trunk, from the
 *  shoulders to the hips (a snout or a tail tip may still pass over a neighbour's). */
export const ROOM_SPAN = 0.7;
/** the closest points of the last `segmentGap` (on the first segment, then the second) */
export const ROOM_AT = new Float64Array(4);

/** The distance between segments p1 + s·d1 and p2 + t·d2 (s, t in 0..1); the closest points are
 *  left in ROOM_AT. */
export function segmentGap(p1x: number, p1z: number, d1x: number, d1z: number, p2x: number, p2z: number, d2x: number, d2z: number): number {
  const rx = p1x - p2x, rz = p1z - p2z;
  const A = d1x * d1x + d1z * d1z, E = d2x * d2x + d2z * d2z, F = d2x * rx + d2z * rz;
  let s = 0, t = 0;
  if (A <= 1e-9) {
    if (E > 1e-9) t = Math.min(1, Math.max(0, F / E));
  } else {
    const C = d1x * rx + d1z * rz;
    if (E <= 1e-9) {
      s = Math.min(1, Math.max(0, -C / A));
    } else {
      const B = d1x * d2x + d1z * d2z;
      const den = A * E - B * B;
      s = den > 1e-9 ? Math.min(1, Math.max(0, (B * F - C * E) / den)) : 0;
      t = (B * s + F) / E;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -C / A));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (B - C) / A));
      }
    }
  }
  ROOM_AT[0] = p1x + d1x * s;
  ROOM_AT[1] = p1z + d1z * s;
  ROOM_AT[2] = p2x + d2x * t;
  ROOM_AT[3] = p2z + d2z * t;
  return Math.hypot(ROOM_AT[0] - ROOM_AT[2], ROOM_AT[1] - ROOM_AT[3]);
}

/** A creature's footprint: its trunk, a segment out along its heading both ways by `half`, `r` round. */
export function footprintOf(c: Creature): { half: number; r: number } {
  const g = growthOf(c);
  const r = c.traits.radius * g;
  return { half: Math.max(0, c.traits.length * g * ROOM_SPAN * 0.5 - r), r };
}

/** How far apart two creatures' footprints are, less the room they keep (negative: they overlap by that much). */
function footprintGap(a: Creature, b: Creature): number {
  const fa = footprintOf(a), fb = footprintOf(b);
  const ax = Math.sin(a.heading) * fa.half, az = Math.cos(a.heading) * fa.half;
  const bx = Math.sin(b.heading) * fb.half, bz = Math.cos(b.heading) * fb.half;
  return segmentGap(a.x - ax, a.z - az, 2 * ax, 2 * az, b.x - bx, b.z - bz, 2 * bx, 2 * bz) - ROOM * (fa.r + fb.r);
}

/** A hunter at its prey's throat, or a pair courting: close is the point. */
export function engaged(a: Creature, b: Creature): boolean {
  return ((a.action === 'hunt' || a.action === 'mate') && a.target === b.id) || ((b.action === 'hunt' || b.action === 'mate') && b.target === a.id);
}

/** keepRoom's per-step scratch: each body on the ground, its trunk's half-vector, the room it keeps
 *  and its weight, and the box round it (grown as the valley fills, never shrunk) */
const RS = {
  c: [] as Creature[],
  hx: new Float64Array(64), hz: new Float64Array(64), r: new Float64Array(64), m: new Float64Array(64),
  x0: new Float64Array(64), x1: new Float64Array(64), z0: new Float64Array(64), z1: new Float64Array(64),
  keys: new Float64Array(64),
};
function roomScratch(n: number): void {
  if (RS.hx.length >= n) return;
  const len = Math.max(n, RS.hx.length * 2);
  for (const k of ['hx', 'hz', 'r', 'm', 'x0', 'x1', 'z0', 'z1', 'keys'] as const) RS[k] = new Float64Array(len);
}
/** the sort key's index field: a box's west edge in 1/64 bu, then its body's index below it (a numeric
 *  sort of plain numbers, several times faster than sorting indices through a comparator) */
const ROOM_IDX = 4096;
/** the pass runs every other step, over both steps' time */
export const ROOM_EVERY = 2;
/** the most a body is moved in one pass (bu) */
export const ROOM_PUSH = 0.5;

/**
 * May a body pushed to (x, z) stand there? Its ground is known where it stands (`y`, from its own
 * step): well clear of the waterline, a push of ROOM_PUSH can't carry it across where it may stand
 * (a bu of height to spare, against banks no steeper than one in one), and the terrain — fractal
 * noise and the river's course, the dearest thing in the pass — goes unsampled.
 */
function mayStand(w: World, c: Creature, terrain: Terrain, x: number, z: number): boolean {
  if (!inBounds(terrain, x, z)) return false;
  const t = c.traits;
  if (t.habitat === 'amphibious') return true;
  if (t.habitat === 'land' ? c.y > WATER_LEVEL + 0.5 : c.y < WATER_LEVEL - 1.3) return true;
  return canStand(w, t, { x, z });
}

/**
 * Bodies keep their room. Released on one spot, or drawn to one another by the herd, animals stood
 * inside each other: two crocodiles crossed like a pair of scissors, centipedes ran through
 * centipedes. Each pair on the ground whose footprints overlap is eased apart along the line between
 * their nearest points, the lighter giving way the more — a mouse steps round a bear, not the bear
 * round the mouse. Not aloft (a flock passes over and under), not a fish against a walker (the one
 * is under the water, the other wades above it), never where the one moved couldn't stand.
 *
 * The pairs are found by sweep and prune (each body's box, sorted by its west edge, against the boxes
 * that start before its east edge ends): a body meets only the few it could touch, so a valley of a
 * hundred and fifty costs about what thirty did.
 */
function keepRoom(w: World, dt: number, terrain: Terrain): void {
  if (w.stepCount % ROOM_EVERY) return;
  const k = Math.min(1, dt * ROOM_EVERY * ROOM_RATE);
  const cs = RS.c;
  cs.length = 0;
  for (const c of w.creatures) if (c.alive && c.alt <= AIRBORNE) cs.push(c);
  const n = Math.min(cs.length, ROOM_IDX);
  if (n < 2) return;
  roomScratch(n);
  const keys = RS.keys.subarray(0, n);
  for (let i = 0; i < n; i++) {
    const c = cs[i];
    const g = growthOf(c);
    const r = c.traits.radius * g;
    const half = Math.max(0, c.traits.length * g * ROOM_SPAN * 0.5 - r);
    const hx = Math.sin(c.heading) * half, hz = Math.cos(c.heading) * half;
    const R = ROOM * r;
    RS.hx[i] = hx;
    RS.hz[i] = hz;
    RS.r[i] = R;
    RS.m[i] = c.traits.mass * g * g * g;
    RS.x0[i] = c.x - Math.abs(hx) - R;
    RS.x1[i] = c.x + Math.abs(hx) + R;
    RS.z0[i] = c.z - Math.abs(hz) - R;
    RS.z1[i] = c.z + Math.abs(hz) + R;
    // (the valley is a few hundred bu across: shifted positive, its 1/64ths fit far inside 2^53 with the index under them)
    keys[i] = Math.floor((RS.x0[i] + 65536) * 64) * ROOM_IDX + i;
  }
  keys.sort();
  const x0 = RS.x0;
  for (let oi = 0; oi < n; oi++) {
    const i = keys[oi] % ROOM_IDX;
    const a = cs[i];
    for (let oj = oi + 1; oj < n; oj++) {
      const j = keys[oj] % ROOM_IDX;
      if (x0[j] > RS.x1[i]) break; // sorted by the west edge: none further on can reach
      if (RS.z0[j] > RS.z1[i] || RS.z1[j] < RS.z0[i]) continue;
      const b = cs[j];
      if ((a.traits.habitat === 'water') !== (b.traits.habitat === 'water')) continue;
      const room = RS.r[i] + RS.r[j];
      const d = segmentGap(a.x - RS.hx[i], a.z - RS.hz[i], 2 * RS.hx[i], 2 * RS.hz[i], b.x - RS.hx[j], b.z - RS.hz[j], 2 * RS.hx[j], 2 * RS.hz[j]);
      if (d >= room || engaged(a, b)) continue;
      let dx = ROOM_AT[0] - ROOM_AT[2], dz = ROOM_AT[1] - ROOM_AT[3];
      if (d < 1e-6) {
        // trunks crossing at a point (or one on top of the other): part them across a's heading, the
        // side picked by where b stands (by their ids if it stands dead on the line)
        const side = Math.sin(a.heading) * (b.z - a.z) - Math.cos(a.heading) * (b.x - a.x);
        const sgn = Math.abs(side) > 1e-6 ? Math.sign(side) : (a.id + b.id) % 2 ? 1 : -1;
        dx = Math.cos(a.heading) * sgn;
        dz = -Math.sin(a.heading) * sgn;
      } else {
        dx /= d;
        dz /= d;
      }
      // the lighter gives way: each moves by the other's share of their combined weight (a herd
      // released in a heap parts over a second or two, not in one leap)
      const ma = RS.m[i], mb = RS.m[j];
      const push = Math.min(ROOM_PUSH, (room - d) * k);
      const sa = (push * mb) / (ma + mb), sb = (push * ma) / (ma + mb);
      const ax = a.x + dx * sa, az = a.z + dz * sa;
      if (mayStand(w, a, terrain, ax, az)) {
        a.x = ax;
        a.z = az;
      }
      const bx = b.x - dx * sb, bz = b.z - dz * sb;
      if (mayStand(w, b, terrain, bx, bz)) {
        b.x = bx;
        b.z = bz;
      }
    }
  }
}
