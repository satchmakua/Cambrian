/**
 * Noise in three dimensions, for a planet's ground: sampled on the unit vector (or a multiple of it), so
 * nothing stretches toward the poles and nothing breaks at the cube-sphere's seams. Value noise on an
 * integer lattice, hashed rather than tabled (no permutation to seed), and the fractal sums built on it.
 * Pure: the same arguments give the same number, everywhere.
 */

/** a lattice point's value (∈ [0, 1)) */
export function hash3(ix: number, iy: number, iz: number, salt: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(iz | 0, 0x1b873593) ^ salt;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** value noise (∈ [0, 1)), smoothly interpolated between the lattice's points */
export function vnoise(x: number, y: number, z: number, salt: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, iy, iz, salt), b = hash3(ix + 1, iy, iz, salt);
  const c = hash3(ix, iy + 1, iz, salt), d = hash3(ix + 1, iy + 1, iz, salt);
  const e = hash3(ix, iy, iz + 1, salt), f = hash3(ix + 1, iy, iz + 1, salt);
  const g = hash3(ix, iy + 1, iz + 1, salt), h = hash3(ix + 1, iy + 1, iz + 1, salt);
  const x00 = a + (b - a) * ux, x10 = c + (d - c) * ux, x01 = e + (f - e) * ux, x11 = g + (h - g) * ux;
  const y0 = x00 + (x10 - x00) * uy, y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}

/** fractal value noise (∈ [0, 1)): `octaves` layers, each about twice as fine and half as strong */
export function fbm(x: number, y: number, z: number, salt: number, octaves: number): number {
  let v = 0, amp = 0.5, f = 1, sum = 0;
  for (let i = 0; i < octaves; i++) {
    v += amp * vnoise(x * f, y * f, z * f, salt + i * 1013);
    sum += amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return v / sum;
}

/**
 * Ridged noise (∈ [0, 1]): each layer folded about its middle into sharp crests, and each finer layer
 * weighted by the one above it, so the detail gathers on the crests and the hollows between stay smooth
 * (Musgrave's ridged multifractal). Mountain ranges, where the plates push one into another.
 */
export function ridged(x: number, y: number, z: number, salt: number, octaves: number): number {
  let v = 0, amp = 0.5, f = 1, sum = 0, weight = 1;
  for (let i = 0; i < octaves; i++) {
    let r = 1 - Math.abs(2 * vnoise(x * f, y * f, z * f, salt + i * 2027) - 1);
    r *= r;
    r *= weight;
    weight = Math.min(1, r * 2);
    v += amp * r;
    sum += amp;
    f *= 2.07;
    amp *= 0.5;
  }
  return v / sum;
}
