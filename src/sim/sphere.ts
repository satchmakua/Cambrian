/**
 * Moving over a sphere: the planet's geometry, pure and headless (no three.js, no browser), so the
 * simulation and its Node tests use it as it is.
 *
 * A place is a unit vector p, out from the planet's centre through the ground, and a way to face is a
 * unit tangent f (f · p = 0). Nothing here is a latitude or a longitude: near a pole is like anywhere
 * else, and no heading spins there. (An angle measured from north means nothing at the pole itself and
 * swings wildly near it: the usual way a walker on a planet gets dragged round in circles.)
 *
 * A step of length d over a sphere of radius R turns p and f together, in the plane they span, by d / R:
 * the body goes along a great circle, and its heading comes with it (parallel transport, for free).
 * Cambrian's frame holds on the ground: p is up, f is forward, and p × f is +X, the way a growing heading
 * turns the valley's creatures (from +Z toward +X).
 *
 * The planet's grid is a cube-sphere: six square faces, each pushed out onto the ball. Spaced by equal
 * angles (the tangent of each face coordinate), its cells stay within √2 of one another in area; spaced
 * evenly across the cube, they would shrink five-fold toward its corners.
 */

export type Vec3 = [number, number, number];

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** a at unit length (the zero vector stays zero) */
export function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

/** v laid flat on the ground at p (its part along p taken out), at unit length: zero if v points along p. */
export function tangent(p: Vec3, v: Vec3): Vec3 {
  const k = dot(v, p);
  return normalize([v[0] - p[0] * k, v[1] - p[1] * k, v[2] - p[2] * k]);
}

/** Some heading at p, for when there is none to keep. */
export function anyTangent(p: Vec3): Vec3 {
  return tangent(p, Math.abs(p[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
}

/**
 * Walk `angle` radians (a distance over the radius) straight ahead: the place reached, and the heading
 * there. Exact for any angle: the turn is a rotation in the plane of p and f, so after 2π the walker is
 * home again, facing the way it set out.
 */
export function step(p: Vec3, f: Vec3, angle: number): { p: Vec3; f: Vec3 } {
  const c = Math.cos(angle), s = Math.sin(angle);
  return {
    p: [p[0] * c + f[0] * s, p[1] * c + f[1] * s, p[2] * c + f[2] * s],
    f: [f[0] * c - p[0] * s, f[1] * c - p[1] * s, f[2] * c - p[2] * s],
  };
}

/** The heading turned `angle` radians about the up: a positive angle turns it toward p × f (+X). */
export function turn(p: Vec3, f: Vec3, angle: number): Vec3 {
  const r = cross(p, f);
  const c = Math.cos(angle), s = Math.sin(angle);
  return [f[0] * c + r[0] * s, f[1] * c + r[1] * s, f[2] * c + r[2] * s];
}

/** The heading at p that leads to q along a great circle (zero when q is p, or straight through the
 *  planet from it). */
export const toward = (p: Vec3, q: Vec3): Vec3 => tangent(p, q);

/** The angle between two places, seen from the centre (their distance over the ground is R times it).
 *  Taken by its sine and its cosine both, so it is as exact for neighbours as for opposites. */
export function arc(p: Vec3, q: Vec3): number {
  const c = cross(p, q);
  return Math.atan2(Math.hypot(c[0], c[1], c[2]), dot(p, q));
}

/** v turned `angle` radians about the unit axis k (right-handed: Rodrigues' formula). */
export function rotate(v: Vec3, k: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  const kv = cross(k, v), d = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d];
}

/**
 * Slide from p `angle` radians along the ground the way `dir` points (a tangent at p), carrying the
 * tangent `v` along unturned (parallel transport): for a heading that is not the way of travel, such as a
 * camera's, panned sideways over the planet. Sliding the way v points is a `step`.
 */
export function slide(p: Vec3, dir: Vec3, angle: number, v: Vec3): { p: Vec3; v: Vec3 } {
  const k = normalize(cross(p, dir));
  if (k[0] === 0 && k[1] === 0 && k[2] === 0) return { p, v };
  return { p: rotate(p, k, angle), v: rotate(v, k, angle) };
}

/** A place and a heading put back to unit length and at right angles: rounding drifts them, a little
 *  each step. (A heading that has fallen along the up is replaced by some other.) */
export function settle(p: Vec3, f: Vec3): { p: Vec3; f: Vec3 } {
  const q = normalize(p);
  const g = tangent(q, f);
  return { p: q, f: g[0] === 0 && g[1] === 0 && g[2] === 0 ? anyTangent(q) : g };
}

/** A place anywhere on the sphere, every part of it as likely as any other (`rng` ∈ [0, 1)). */
export function randomPlace(rng: () => number): Vec3 {
  const y = 2 * rng() - 1;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = rng() * Math.PI * 2;
  return [r * Math.cos(a), y, r * Math.sin(a)];
}

/** A heading at p, any way round. */
export function randomHeading(p: Vec3, rng: () => number): Vec3 {
  return turn(p, anyTangent(p), rng() * Math.PI * 2);
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** The i-th of n places spread evenly over the sphere (the Fibonacci lattice): for sampling it whole. */
export function fibonacci(i: number, n: number): Vec3 {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * GOLDEN;
  return [r * Math.cos(a), y, r * Math.sin(a)];
}

// --- the cube-sphere ----------------------------------------------------------------------------------

/** The cube's six faces (+X, −X, +Y, −Y, +Z, −Z): each its outward axis n and two axes across it, with
 *  u × v = n, so a grid laid u-then-v winds counter-clockwise seen from outside. */
const FACES: readonly { n: Vec3; u: Vec3; v: Vec3 }[] = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
export const FACE_COUNT = FACES.length;

/** The place at (s, t) ∈ [−1, 1]² on a face, out on the unit sphere: equal steps in s are equal angles
 *  (a little past ±1 runs on over the seam, onto the next face's ground). */
export function cubeToSphere(face: number, s: number, t: number): Vec3 {
  const F = FACES[face];
  const a = Math.tan((s * Math.PI) / 4), b = Math.tan((t * Math.PI) / 4);
  return normalize([F.n[0] + a * F.u[0] + b * F.v[0], F.n[1] + a * F.u[1] + b * F.v[1], F.n[2] + a * F.u[2] + b * F.v[2]]);
}

/** …and back: the face a place lies on, and where on it. */
export function sphereToCube(p: Vec3): { face: number; s: number; t: number } {
  const ax = Math.abs(p[0]), ay = Math.abs(p[1]), az = Math.abs(p[2]);
  const face = ax >= ay && ax >= az ? (p[0] >= 0 ? 0 : 1) : ay >= az ? (p[1] >= 0 ? 2 : 3) : p[2] >= 0 ? 4 : 5;
  const F = FACES[face];
  const n = dot(p, F.n);
  return { face, s: (Math.atan(dot(p, F.u) / n) * 4) / Math.PI, t: (Math.atan(dot(p, F.v) / n) * 4) / Math.PI };
}
