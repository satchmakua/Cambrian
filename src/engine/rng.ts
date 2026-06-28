/**
 * The ONLY source of randomness in the engine.
 *
 * Hard rule (DESIGN §4.2, Pillar 3 — determinism): `Math.random()` is banned
 * anywhere under `src/engine/`. A seed reproduces a creature, and a
 * (genome + stream seed) reproduces an entire lineage, bit-for-bit, on any machine.
 * See tests/engine/no-math-random.test.ts for the guard that enforces this.
 */

/** mulberry32 — a tiny, fast, deterministic 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = ReturnType<typeof mulberry32>;

/**
 * Deterministic 32-bit mix (FNV-1a style) for deriving child seeds from
 * (parentSeed, streamSeed, offspringIndex, ...salts). Order-sensitive and stable.
 */
export function mix32(...xs: number[]): number {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h = Math.imul(h ^ (x >>> 0), 0x01000193);
  }
  return h >>> 0;
}

/** Uniform float in [min, max) from an Rng. */
export function range(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}
