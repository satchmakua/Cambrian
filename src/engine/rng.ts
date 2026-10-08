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

/** mulberry32 with its 32-bit state exposed (`rng.state.a`), so a running stream can be saved and
 *  resumed exactly — the World's RNG, which a saved world must carry to replay bit-for-bit. */
export type StatefulRng = Rng & { state: { a: number } };
export function mulberry32State(seed: number): StatefulRng {
  const state = { a: seed >>> 0 };
  const next = (): number => {
    state.a |= 0;
    state.a = (state.a + 0x6d2b79f5) | 0;
    let t = Math.imul(state.a ^ (state.a >>> 15), 1 | state.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(next, { state });
}

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

/** A well-mixed hash of 32-bit words as a uniform float in [0, 1). `mix32` alone is a bare FNV-1a
 *  over whole words — fine as a SEED (mulberry32 scrambles it), but its high bits barely move for
 *  small consecutive inputs, so read directly as a fraction it bunches (every creature's eyes came
 *  out of the same few swatches). The murmur3 finaliser avalanches it first. */
export function unitHash(...xs: number[]): number {
  let h = mix32(...xs);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Uniform float in [min, max) from an Rng. */
export function range(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}
