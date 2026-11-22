/**
 * A planet as a surface (surface.ts): a ball of ground, its places points on the sphere of its sea (`radius`
 * out from its middle), a creature's heading a tangent there (fx, fy, fz), and nothing a latitude or a
 * longitude. Moves go along great circles with the heading carried (sphere.ts). A bearing round a place is
 * an angle from a way of reference there: north, or near the poles toward +X (bearings round one place are
 * only ever compared with others round it). The living are indexed in a 3D hash; the fields are the
 * equiangular cube-sphere's cells, about the valley's 4 bu each; and its sun goes round it once a day.
 *
 * Life starts in a homeland: a cap of the planet the size the valley would be for its numbers, mostly land
 * with water in it, where founders are set down and immigrants walk in at its rim. Nothing keeps them in
 * it: over the generations they spread out over the rest of the world.
 */
import { anyTangent, arc, cross, cubeToSphere, dot, fibonacci, normalize, randomHeading, randomPlace, rotate, settle, slide, sphereToCube, step, tangent, toward, turn, type Vec3 } from './sphere';
import { biomeOn, foodOn, heightOn, levelOn, makePlanetGround, planetStands, tempOn, type PlanetGround, type PlanetSpec } from './planetGround';
import { AIRBORNE, canStand, dayPhase, GRID_CELL, growthOf, MAX_POP, type Creature, type Plant, type World } from './model';
import { makeTerrain, WORLD_SIZE } from './terrain';
import { engaged, footprintOf, ROOM, ROOM_AT, ROOM_EVERY, ROOM_PUSH, ROOM_RATE, segmentGap } from './valley';
import type { Ground, Place, Surface } from './surface';

/** A planet's surface: the port, and what its viewer and its tests want of it besides. */
export interface PlanetSurface extends Surface {
  readonly kind: 'planet';
  readonly ground: PlanetGround;
  /** the homeland's middle (a unit vector) and how far it reaches (radians) */
  readonly home: Vec3;
  readonly homeArc: number;
  /** the way the sunlight comes from at a time (a unit vector): over the homeland at noon */
  sunAt(time: number): Vec3;
}

/** the valley's ground (bu²): a homeland is this much for every MAX_POP of the planet's numbers */
const VALLEY_AREA = WORLD_SIZE * WORLD_SIZE;
/** the living's 3D hash: its cells (bu), and the reach (bu) past which a search looks at everyone instead */
const CELL = 16;
const SCAN = 40;
/** bushes by the cube of 8 bu (for the nearest bush), and of 24 (for those within a creature's sight) */
const BUSH_CELL = 8;
const PATCH_CELL = 24;

const NORTH: Vec3 = [0, 1, 0];
const EAST: Vec3 = [1, 0, 0];

/** The way of reference at a unit vector: north, or (within a hair of a pole) toward +X. */
function refAt(u: Vec3): Vec3 {
  return Math.abs(u[1]) < 0.999 ? tangent(u, NORTH) : tangent(u, EAST);
}

/** The way `bearing` round a unit vector points (0: the way of reference; a quarter turn: u × it). */
function dirAt(u: Vec3, bearing: number): Vec3 {
  return turn(u, refAt(u), bearing);
}

const isZero = (v: Vec3) => v[0] === 0 && v[1] === 0 && v[2] === 0;

/** the grass a valley's land holds, on the mean (its meadows' 0.6 and its woods' 0.32, about half each),
 *  and its warmth (planetClimate.ts's VALLEY_CLIMATE) */
const VALLEY_GRASS = 0.48;
const VALLEY_WARMTH = 12;

/** The homeland: of the planet's well-spread places on land and away from the poles, the one whose cap of
 *  `reach` holds nearest three parts land to one of water, its land about as rich in grass and as warm as the
 *  valley's (a valley's worth of meadow, wood and lake, not a desert's edge, a tundra or a jungle). */
function homeOf(g: PlanetGround, reach: number): Vec3 {
  let best: Vec3 = [1, 0, 0], score = -Infinity;
  const n = 400;
  for (let i = 0; i < n; i++) {
    const c = fibonacci(i, n);
    if (Math.abs(c[1]) > 0.7 || heightOn(g, c) - levelOn(g, c) < 1) continue;
    let landN = 0, all = 0, grass = 0, warmth = 0;
    for (const f of [0.25, 0.5, 0.75, 1]) {
      for (let b = 0; b < 12; b++) {
        const q = step(c, dirAt(c, (b / 12) * Math.PI * 2), reach * f).p;
        if (heightOn(g, q) > levelOn(g, q)) {
          landN++;
          grass += foodOn(g, q).grass;
          warmth += tempOn(g, q);
        }
        all++;
      }
    }
    const m = Math.max(1, landN);
    const sc = -Math.abs(landN / all - 0.75) - 1.5 * Math.abs(grass / m - VALLEY_GRASS) - 0.03 * Math.abs(warmth / m - VALLEY_WARMTH);
    if (sc > score) {
      score = sc;
      best = c;
    }
  }
  return best;
}

/** A planet's ground for a world: its surface, its fields' cells, and where its bushes grow (over the whole
 *  planet, as thick as the valley's). (It carries its seed's valley terrain as well, unused: the World keeps
 *  one for the valley's viewer.) */
export function makePlanet(spec: PlanetSpec, cap: number = MAX_POP): Ground {
  const surface = planetSurface(spec, cap);
  const share = (4 * Math.PI * spec.radius * spec.radius) / VALLEY_AREA;
  return {
    terrain: makeTerrain(spec.seed),
    surface,
    gridN: Math.round(Math.sqrt(surface.cells / 6)),
    bushes: {
      most: Math.round(170 * share),
      tries: Math.round(8000 * share),
      place: (rng) => {
        const u = randomPlace(rng);
        return { x: u[0] * spec.radius, y: u[1] * spec.radius, z: u[2] * spec.radius };
      },
    },
    food: (p) => foodOn(surface.ground, unitOf(p)),
  };
}

function unitOf(p: Place): Vec3 {
  return normalize([p.x, p.y ?? 0, p.z]);
}

export function planetSurface(spec: PlanetSpec, cap: number = MAX_POP): PlanetSurface {
  const g = makePlanetGround(spec);
  const R = spec.radius;
  // field cells along a face's edge: about the valley's 4 bu each
  const N = Math.max(8, Math.round(((Math.PI / 2) * R) / GRID_CELL));
  const cellArc = Math.PI / 2 / N;
  // the homeland: the valley's ground for each MAX_POP of the planet's numbers, as a cap of the sphere
  const homeArc = Math.acos(Math.max(-1, 1 - (VALLEY_AREA * cap) / MAX_POP / (2 * Math.PI * R * R)));
  const home = homeOf(g, homeArc);
  const homeMeridian = normalize([home[0], 0, home[2]]);

  const unit = unitOf;
  const at = (u: Vec3): Place => ({ x: u[0] * R, y: u[1] * R, z: u[2] * R });
  const raw = (p: Place): Vec3 => [p.x, p.y ?? 0, p.z];
  const headOf = (c: Creature): Vec3 => {
    const f = tangent(unit(c), [c.fx ?? 1, c.fy ?? 0, c.fz ?? 0]);
    return isZero(f) ? anyTangent(unit(c)) : f;
  };
  const setHead = (c: Creature, f: Vec3) => {
    c.fx = f[0];
    c.fy = f[1];
    c.fz = f[2];
  };
  const dist = (a: Place, b: Place) => R * arc(raw(a), raw(b));
  /** the straight-line reach of an arc of `r` over the ground */
  const chord = (r: number) => 2 * R * Math.sin(Math.min(Math.PI, r / R) / 2);
  const sunAt = (time: number): Vec3 => rotate(homeMeridian, NORTH, -2 * Math.PI * (dayPhase(time) - 0.25));
  const height = (p: Place) => heightOn(g, unit(p));
  const level = (p: Place) => levelOn(g, unit(p));
  const around = (p: Place, bearing: number, d: number) => {
    const u = unit(p);
    return at(step(u, dirAt(u, bearing), d / R).p);
  };
  const nearestWhere = (p: Place, deep: boolean, max = 40): Place | null => {
    for (let r = 3; r <= max; r *= 1.5) {
      for (let i = 0; i < 16; i++) {
        const q = around(p, (i / 16) * Math.PI * 2, r);
        const h = height(q), L = level(q);
        if (deep ? h < L - 0.6 : h > L + 0.4) return q;
      }
    }
    return null;
  };
  const moveTo = (c: Creature, p: Place) => {
    const u0 = unit(c), u1 = unit(p);
    const a = arc(u0, u1);
    if (a > 1e-12) {
      const t = toward(u0, u1);
      // (the heading carried along the way it went, then laid flat at the place reached)
      const f = isZero(t) ? headOf(c) : slide(u0, t, a, headOf(c)).v;
      const g1 = tangent(u1, f);
      setHead(c, isZero(g1) ? anyTangent(u1) : g1);
    }
    c.x = u1[0] * R;
    c.y = u1[1] * R;
    c.z = u1[2] * R;
  };

  // --- the living's 3D hash, and the bushes' -------------------------------------------------------
  let members: Creature[] = [];
  const keyOf = (x: number, y: number, z: number, cell: number) =>
    ((Math.floor(x / cell) + 512) * 1024 + (Math.floor(y / cell) + 512)) * 1024 + (Math.floor(z / cell) + 512);
  /** visit each cell of a grid within `h` of p along all three axes */
  const cellsAround = (p: Place, h: number, cell: number, visit: (key: number) => void) => {
    const x = p.x, y = p.y ?? 0, z = p.z;
    const i0 = Math.floor((x - h) / cell), i1 = Math.floor((x + h) / cell);
    const j0 = Math.floor((y - h) / cell), j1 = Math.floor((y + h) / cell);
    const k0 = Math.floor((z - h) / cell), k1 = Math.floor((z + h) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) visit(((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512));
  };
  const BUSHES = new WeakMap<Plant[], { fine: Map<number, Plant[]>; coarse: Map<number, Plant[]> }>();
  const bushGrid = (plants: Plant[]) => {
    let grid = BUSHES.get(plants);
    if (!grid) {
      grid = { fine: new Map(), coarse: new Map() };
      for (const p of plants) {
        for (const [map, cell] of [[grid.fine, BUSH_CELL], [grid.coarse, PATCH_CELL]] as const) {
          const k = keyOf(p.x, p.y ?? 0, p.z, cell);
          let list = map.get(k);
          if (!list) map.set(k, (list = []));
          list.push(p);
        }
      }
      BUSHES.set(plants, grid);
    }
    return grid;
  };

  // --- the room bodies keep: the valley's footprints, laid in the first body's own tangent plane ------
  /** the gap between two footprints, the pair's closest points left in ROOM_AT (in a's plane: x along its
   *  right, z along its heading) — and that plane */
  const gapOf = (a: Creature, b: Creature) => {
    const u = unit(a), fa = headOf(a), ea = cross(fa, u);
    const fa2 = footprintOf(a), fb2 = footprintOf(b);
    const v: Vec3 = [b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z];
    const bx = dot(v, ea), bz = dot(v, fa);
    const fb = headOf(b);
    let hx = dot(fb, ea), hz = dot(fb, fa);
    const hl = Math.hypot(hx, hz) || 1;
    hx = (hx / hl) * fb2.half;
    hz = (hz / hl) * fb2.half;
    const d = segmentGap(0, -fa2.half, 0, 2 * fa2.half, bx - hx, bz - hz, 2 * hx, 2 * hz);
    return { d, room: ROOM * (fa2.r + fb2.r), u, fa, ea, bx };
  };
  const mayStand = (w: World, c: Creature, p: Place) => c.traits.habitat === 'amphibious' || canStand(w, c.traits, p);

  const surface: PlanetSurface = {
    kind: 'planet',
    ground: g,
    home,
    homeArc,
    sunAt,

    // --- where things are, and how far apart -------------------------------------------------------
    dist,
    toGoal: (c) => R * arc(raw(c), [c.tx, c.ty ?? 0, c.tz]),
    inReach: (a, b, r) => dist(a, b) < r,
    ahead(c, turnBy, d, k = 1) {
      const u = unit(c);
      const f = turnBy ? turn(u, headOf(c), turnBy) : headOf(c);
      return at(step(u, f, (d * k) / R).p);
    },
    around,
    bearing(from, to) {
      const u = unit(from);
      const t = toward(u, unit(to));
      const r0 = refAt(u);
      return Math.atan2(dot(cross(u, r0), t), dot(r0, t));
    },
    mid(a, b) {
      const s = normalize([a.x + b.x, (a.y ?? 0) + (b.y ?? 0), a.z + b.z]);
      return isZero(s) ? at(unit(a)) : at(s);
    },
    away(p, from, d) {
      const u = unit(p);
      const t = toward(u, unit(from));
      const way: Vec3 = isZero(t) ? anyTangent(u) : [-t[0], -t[1], -t[2]];
      return at(step(u, way, d / R).p);
    },
    cosAt(atP, a, b) {
      const u = unit(atP);
      const ta = toward(u, unit(a)), tb = toward(u, unit(b));
      return isZero(ta) || isZero(tb) ? 0 : dot(ta, tb);
    },
    offset(p, dx, dz) {
      const u = unit(p);
      const north = refAt(u), east = cross(u, north);
      const v: Vec3 = [east[0] * dx + north[0] * dz, east[1] * dx + north[1] * dz, east[2] * dx + north[2] * dz];
      const l = Math.hypot(v[0], v[1], v[2]);
      return l < 1e-12 ? at(u) : at(step(u, [v[0] / l, v[1] / l, v[2] / l], l / R).p);
    },
    pull(p, to, k, s) {
      const a = unit(p), b = unit(to);
      const m = normalize([a[0] * (1 - k * s) + b[0] * k * s, a[1] * (1 - k * s) + b[1] * k * s, a[2] * (1 - k * s) + b[2] * k * s]);
      return isZero(m) ? at(a) : at(m);
    },
    centroid(list, keep) {
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const o of list) {
        if (!keep(o)) continue;
        const u = unit(o);
        sx += u[0];
        sy += u[1];
        sz += u[2];
        n++;
      }
      if (n === 0) return null;
      const m = normalize([sx, sy, sz]);
      return isZero(m) ? null : at(m);
    },
    keepInside: (p) => p,
    inBounds: () => true,
    anywhere(rng, share) {
      // (uniform over the homeland's cap, or the share of it nearest its middle)
      const cosTop = Math.cos(homeArc * share);
      const c = 1 - rng() * (1 - cosTop);
      const b = rng() * Math.PI * 2;
      return at(step(home, dirAt(home, b), Math.acos(Math.max(-1, Math.min(1, c)))).p);
    },
    edge: (b) => around(at(home), b, homeArc * R * 0.95),
    offWater(p, d) {
      const shore = nearestWhere(p, false, 90) ?? at(home);
      const u = unit(p);
      const t = toward(u, unit(shore));
      return at(step(u, isZero(t) ? anyTangent(u) : t, d / R).p);
    },
    fallback: () => at(home),
    nearestWhere,
    key: (p) => [Math.round(p.x * 1000), Math.round((p.y ?? 0) * 1000), Math.round(p.z * 1000)],

    // --- the ground ----------------------------------------------------------------------------------
    height,
    level,
    biome: (p) => biomeOn(g, unit(p)),
    groundOf: (c) => c.ground ?? height(c),
    settle(c) {
      c.ground = height(c);
    },
    night: (p, time) => dot(unit(p), sunAt(time)) < -0.06,

    // --- headings, goals and moves -------------------------------------------------------------------
    turn(c, a) {
      setHead(c, turn(unit(c), headOf(c), a));
    },
    turnToward(c, p, max) {
      const u = unit(c), f = headOf(c);
      const t = toward(u, unit(p));
      if (isZero(t)) return;
      const dh = Math.atan2(dot(cross(u, f), t), dot(f, t));
      setHead(c, turn(u, f, Math.max(-max, Math.min(max, dh))));
    },
    faceLike(c, like, a) {
      const u = unit(c);
      const f = tangent(u, [like.fx ?? 1, like.fy ?? 0, like.fz ?? 0]);
      setHead(c, turn(u, isZero(f) ? anyTangent(u) : f, a));
    },
    faceAnywhere(c, rng) {
      setHead(c, randomHeading(unit(c), rng));
    },
    tidy(c) {
      const s = settle(raw(c), headOf(c));
      c.x = s.p[0] * R;
      c.y = s.p[1] * R;
      c.z = s.p[2] * R;
      setHead(c, s.f);
    },
    moveTo,
    aim(c, p) {
      c.tx = p.x;
      c.ty = p.y ?? 0;
      c.tz = p.z;
    },
    goal: (c) => ({ x: c.tx, y: c.ty ?? 0, z: c.tz }),

    // --- a new body's own fields ---------------------------------------------------------------------
    standing(p, rng) {
      const u = unit(p);
      const f = randomHeading(u, rng);
      return { x: u[0] * R, z: u[2] * R, y: u[1] * R, heading: 0, fx: f[0], fy: f[1], fz: f[2], ground: heightOn(g, u) };
    },
    aimAt: (p) => ({ tx: p.x, tz: p.z, ty: p.y ?? 0 }),
    remains: (c) => ({ x: c.x, z: c.z, y: c.y, heading: 0, fx: c.fx, fy: c.fy, fz: c.fz }),
    laid(p) {
      const u = unit(p);
      return { x: u[0] * R, z: u[2] * R, y: u[1] * R };
    },

    // --- the living by place, and the fields ---------------------------------------------------------
    index(w) {
      w.buckets.clear();
      members = [];
      for (const c of w.creatures) {
        if (!c.alive) continue;
        members.push(c);
        const k = keyOf(c.x, c.y, c.z, CELL);
        let b = w.buckets.get(k);
        if (!b) w.buckets.set(k, (b = []));
        b.push(c);
      }
    },
    nearby(w, p, r, out) {
      out.length = 0;
      const h = chord(r), h2 = h * h;
      const x = p.x, y = p.y ?? 0, z = p.z;
      const near = (c: Creature) => {
        const dx = c.x - x, dy = c.y - y, dz = c.z - z;
        if (dx * dx + dy * dy + dz * dz <= h2) out.push(c);
      };
      // (far reaches look over everyone: a box of cells that large holds more empty cells than bodies)
      if (h > SCAN) for (const c of members) near(c);
      else cellsAround(p, h, CELL, (k) => w.buckets.get(k)?.forEach(near));
      return out;
    },
    cells: 6 * N * N,
    cellOf(p) {
      const { face, s, t } = sphereToCube(unit(p));
      const i = Math.min(N - 1, Math.max(0, Math.floor(((s + 1) / 2) * N)));
      const j = Math.min(N - 1, Math.max(0, Math.floor(((t + 1) / 2) * N)));
      return face * N * N + j * N + i;
    },
    cellCenter(k) {
      const face = Math.floor(k / (N * N)), r = k - face * N * N;
      const j = Math.floor(r / N), i = r - j * N;
      return at(cubeToSphere(face, -1 + (2 * i + 1) / N, -1 + (2 * j + 1) / N));
    },
    fieldNear(field, p, r) {
      // (a square of cells round the place's own, run on over a seam onto the next face's)
      const { face, s, t } = sphereToCube(unit(p));
      const i0 = Math.floor(((s + 1) / 2) * N), j0 = Math.floor(((t + 1) / 2) * N);
      const reach = Math.ceil(r / (R * cellArc));
      const seen = new Set<number>();
      let sum = 0;
      for (let dj = -reach; dj <= reach; dj++) {
        for (let di = -reach; di <= reach; di++) {
          const k = surface.cellOf(at(cubeToSphere(face, -1 + (2 * (i0 + di) + 1) / N, -1 + (2 * (j0 + dj) + 1) / N)));
          if (seen.has(k)) continue;
          seen.add(k);
          sum += field[k];
        }
      }
      return sum;
    },

    // --- plants, trees, and the room bodies keep ----------------------------------------------------
    nearestBush(plants, p, within) {
      const { fine } = bushGrid(plants);
      let best: Plant | null = null, bd = within;
      cellsAround(p, chord(within), BUSH_CELL, (k) =>
        fine.get(k)?.forEach((q) => {
          const d = dist(p, q);
          if (d < bd || (d === bd && best && q.id < best.id)) {
            bd = d;
            best = q;
          }
        }),
      );
      return best;
    },
    plantsWithin(plants, p, r) {
      const h = chord(r);
      if (h > 60) return plants;
      const { coarse } = bushGrid(plants);
      const out: Plant[] = [];
      cellsAround(p, h, PATCH_CELL, (k) => coarse.get(k)?.forEach((q) => out.push(q)));
      // (in their own order: the order a scan of the whole list would meet them in)
      return out.sort((a, b) => a.id - b.id);
    },
    trees: () => planetStands(g).trees,
    nearestTree(p, within) {
      const trees = planetStands(g).trees;
      let best = -1, bd = within;
      for (let i = 0; i < trees.length; i++) {
        const d = dist(p, trees[i]);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    },
    keepRoom(w, dt) {
      if (w.stepCount % ROOM_EVERY) return;
      const k = Math.min(1, dt * ROOM_EVERY * ROOM_RATE);
      // the bodies on the ground, by the cube of 8 bu (each pair met from its first body's cell)
      const grid = new Map<number, Creature[]>();
      const ground: Creature[] = [];
      for (const c of w.creatures) {
        if (!c.alive || c.alt > AIRBORNE) continue;
        ground.push(c);
        const key = keyOf(c.x, c.y, c.z, 8);
        let list = grid.get(key);
        if (!list) grid.set(key, (list = []));
        list.push(c);
      }
      for (const a of ground) {
        cellsAround(a, 8, 8, (key) => {
          const list = grid.get(key);
          if (!list) return;
          for (const b of list) {
            if (b.id <= a.id || (a.traits.habitat === 'water') !== (b.traits.habitat === 'water')) continue;
            const { d, room, u, fa, ea, bx } = gapOf(a, b);
            if (d >= room || engaged(a, b)) continue;
            // apart along the line between their nearest points (in a's plane), or across a's heading
            let dx = ROOM_AT[0] - ROOM_AT[2], dz = ROOM_AT[1] - ROOM_AT[3];
            if (d < 1e-6) {
              dx = Math.abs(bx) > 1e-6 ? -Math.sign(bx) : (a.id + b.id) % 2 ? 1 : -1;
              dz = 0;
            } else {
              dx /= d;
              dz /= d;
            }
            const v: Vec3 = [ea[0] * dx + fa[0] * dz, ea[1] * dx + fa[1] * dz, ea[2] * dx + fa[2] * dz];
            const ga = growthOf(a), gb = growthOf(b);
            const ma = a.traits.mass * ga * ga * ga, mb = b.traits.mass * gb * gb * gb;
            const push = Math.min(ROOM_PUSH, (room - d) * k);
            const sa = (push * mb) / (ma + mb), sb = (push * ma) / (ma + mb);
            const toA = at(step(u, v, sa / R).p);
            if (mayStand(w, a, toA)) moveTo(a, toA);
            const ub = unit(b);
            const vb = tangent(ub, [-v[0], -v[1], -v[2]]);
            if (!isZero(vb)) {
              const toB = at(step(ub, vb, sb / R).p);
              if (mayStand(w, b, toB)) moveTo(b, toB);
            }
          }
        });
      }
    },
    footprintGap(a, b) {
      const { d, room } = gapOf(a, b);
      return d - room;
    },
  };
  return surface;
}
