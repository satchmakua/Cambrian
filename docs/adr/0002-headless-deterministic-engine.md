# 2. Headless deterministic engine + capsule-union skinning

- **Status:** Accepted
- **Date:** 2026-06-27

## Context

Cambrian's three engineering pillars (DESIGN §1) are *evolvability*, *robust
phenotype→mesh*, and *total determinism*. Two structural choices made at scaffold
time are load-bearing for all three and would be expensive to reverse later, so they
are recorded here.

## Decision

1. **The evolution engine (`src/engine/`) is pure and dependency-free.** No imports of
   three.js, React, or any rendering/physics library. It contains the genome, the
   seeded `mulberry32` RNG, `grow()`, and (later) mutation/selection/lineage. The few
   lines of vector/quaternion math it needs are inlined rather than pulled from
   three. This keeps the core node-testable, fast, and able to "evolve 500 generations
   headless." The viewer (`src/viewer/`) and UI (`src/ui/`) are adapters over it.

2. **`Math.random()` (and `Date.now`, `performance.now`) are banned under
   `src/engine/`.** All randomness flows from `mulberry32` seeded by the genome, so a
   genome reproduces a creature and a (genome + stream seed) reproduces a lineage
   bit-for-bit. A unit test (`tests/engine/no-math-random.test.ts`) enforces the ban.

3. **Meshing is capsule-union skinning**, not a smooth metaball/marching-cubes
   surface in v1. Every edge → a capsule, every node → a sphere. This is robust for
   *any* evolved topology by construction; the smooth skin is a gated stretch (M7).

## Consequences

- **Easy:** unit-testing morphology and evolution with zero browser; reproducible,
  shareable creatures; a clean seam to extract a shared R3F shell later.
- **Easy:** the 4000-genome fuzz test can assert the §4.4 invariants because `grow()`
  has no hidden non-determinism.
- **Hard / accepted:** the engine can't lean on three.js math helpers (we maintain a
  small inline set). Capsule-union looks like a model kit, not a seamless organism,
  until M7. Both are deliberate trade-offs in service of the pillars.
