# Cambrian — Design

> Start with a randomly generated alien. Subject it to "evolution time." Watch its body
> mutate across generations into wildly different forms — steer a blob toward a rodent, a
> rodent toward a shark, a shark toward a tiger. Purely for fun and curiosity.

**Status:** Design draft · **Language:** TypeScript · **Stack target:** browser (WebGL, R3F)

Name: **Cambrian** — after the *Cambrian explosion* (~540 Mya), the geological blink in
which almost all major animal body plans first appeared: the best-known burst of "wildly
different forms." Alternates: *Mutagen, Speciate, Phylo, Driftwood*.

> **IP / licensing note.** Every dependency is permissively licensed (three.js, R3F, drei,
> Zustand — MIT; Rapier — Apache-2.0), so this is commercial-safe. *Spore* is a Maxis/EA
> trademark — it is **inspiration only**; use no Spore names, assets, or marks. Biomorphs
> and Karl Sims' work are cited as prior art, not copied.

---

## 1. Concept

A creature is *grown* from a **genome**, not drawn by hand. The genome is mutated to make
offspring; you (or a fitness rule) **select** which survive; survivors breed the next
generation. Run that loop and the body plan drifts — gradually, then in a sudden leap when
a structural mutation lands — so a lineage can walk from a small scurrying thing to a
finned giant to a striped quadruped. The whole product is one tight loop: **look at nine
mutant children → click the one trending toward what you want → it becomes the new parent →
repeat.** That is Dawkins' *Biomorphs*, in 3D, made steerable.

Two ideas make "wildly different forms" actually reachable, and they are the spine of the
whole design:

1. **A generative (developmental) genome, not a direct one.** The genome stores *growth
   rules* — segment counts, symmetry, limb recursion, proportions — not vertex positions.
   A one-gene change ("repeat this segment 3 more times," "recurse this limb one level
   deeper") restructures the whole body. Direct encodings can only nudge; generative
   encodings can leap.
2. **Selection you can steer.** You pick the mutants you like (or set pressures like
   *bigger / more limbs / aquatic*), so this is guided evolution, not aimless drift.

### Engineering pillars (the 1–3 things that make or break it)

- **Pillar 1 — Evolvability.** A genome where *most* mutations yield a viable, recognizably
  related creature, yet *some* produce dramatic leaps. This is a property of the encoding +
  the mutation operators + per-gene bounds, and it is the entire point. Get it wrong and
  the toy is either boring (everything looks the same) or garbage (everything explodes).
- **Pillar 2 — Robust phenotype → mesh.** Any evolved skeleton — long, branchy, asymmetric,
  pathological — must *always* skin to a valid, finite, watertight-enough mesh without
  NaNs or self-destruction. Solved by construction (capsule-union skinning + hard growth
  invariants), not by hoping.
- **Pillar 3 — Total determinism.** A genome reproduces its creature, and a (genome +
  mutation-stream seed) reproduces its entire lineage, **bit-for-bit**, on any machine.
  This is what makes creatures shareable as short strings and makes the engine testable.
  One centralized seeded RNG; `Math.random()` is *banned* in the engine.

---

## 2. Goals / Non-goals

**Goals (v1 must achieve)**

- `grow(genome) → phenotype` produces a huge morphological range from one compact encoding,
  and is a **pure, deterministic** function (same genome → identical skeleton, always).
- Mutation operators that do both fine-tuning (point) and dramatic restructuring
  (structural, duplication, macro), tunable by rate.
- **Breeder mode**: a grid of mutant offspring you choose from, generation after generation,
  to deliberately steer toward a target body type.
- **Directed pressures**: set a target vector (size, limb count, body length, aquatic↔terrestrial,
  predator↔prey cues) and auto-evolve K generations toward it, headless and fast.
- A visible **lineage / family tree** you can scrub, revisit, and branch from.
- **Shareable & reproducible**: a creature serializes to a short genome string; pasting it
  regrows the exact same beast. Headless engine can evolve 500 generations with no canvas.

**Non-goals (v1) — deliberately out, to keep the build on track**

- **Scientific accuracy.** Evolution as a toy, not a biology model. No real genetics, no
  Hardy-Weinberg, no populations-as-gene-pools.
- **An ecosystem / world.** No predators, prey, food, climate, or co-evolution. Creatures
  evolve against *you* or a scalar fitness, alone. (That's a different, huge project — see
  sibling *Omnia*.) This is the highest-risk scope creep; it stays out.
- **Internal anatomy / organs.** We evolve the external body plan only.
- **Evolved neural controllers / brains.** v1 animation is procedural. (Sims-style brains
  are a research rabbit hole.)
- **Physics-based fitness in v1.** Locomotion fitness is real and fun but slow and finicky;
  it's an explicit **stretch milestone (M6)**, lazy-loaded, not core.
- **Seamless metaball skin in v1.** Capsule-union skinning ships first; marching-cubes
  smooth skin is **stretch (M7)**.
- **Backend / accounts / cloud save.** Sharing is by copy-pasteable string + localStorage.

---

## 3. Tech stack

Matched to the **house R3F stack** (verified against `Brickyard/package.json`, the most-built
sibling) so Cambrian fits the ecosystem and the eventual shared editor shell. Versions
pinned and current as of **2026-06-27**.

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript 5.6** | Engine is pure logic (ideal for typed unit tests); viewer is WebGL. One language end to end. |
| Build/dev | **Vite 5.4** + `@vitejs/plugin-react` | House standard; instant HMR; trivial WASM/lazy-chunk support for the optional physics module. |
| Tests | **Vitest 2.1** | House standard; runs the headless engine tests with zero browser. |
| Evolution engine | **Pure TS module** (no deps) | Genome, grow, mutate, select, lineage. Zero rendering/physics deps → fully unit-testable, deterministic, fast. |
| RNG | **Inline `mulberry32`** (≈6 lines, no dep) | seedrandom is effectively unmaintained (npm frozen ~2019); a tiny audited PRNG we own removes a stale dependency and guarantees control over the only source of randomness. |
| 3D | **three.js 0.169** | Mature WebGL engine the user already uses; ships `MarchingCubes` and `GLTFExporter` addons for stretch goals. |
| Scene/React glue | **react-three-fiber 8.17** | Declarative R3F scene so UI and 3D share Zustand state cleanly. |
| 3D helpers | **drei 9.114** | `OrbitControls`, `Environment`, `Stage`, `Bounds` — frames any creature size automatically. |
| UI | **React 18.3** | Offspring gallery, pressure panel, lineage tree, seed box. |
| State | **Zustand 5** | Holds lineage + current generation; serializable; the engine stays pure and is *called by* the store. |
| Physics *(stretch, M6)* | **`@dimforge/rapier3d-deterministic-compat`** 0.19.x | The *deterministic* Rapier build *guarantees* identical cross-platform results — mandatory for reproducible fitness. `-compat` inlines the WASM (base64) so Vite bundles it with no config. Lazy-loaded; absent from the core bundle. |

> **Version posture.** This deliberately tracks the React 18 / R3F 8 house stack rather than
> React 19 / R3F 9, for consistency with the other R3F projects and the planned shared shell.
> Upgrade path is clean (R3F 9 + React 19) and noted as a future, not-v1 step.

**The architectural line that matters:** the **engine is headless**. Evolution runs with no
graphics at all — which is what makes it testable and what makes "evolve 500 generations
overnight" possible.

---

## 4. The genome & deterministic growth — get this exactly right

This is where the design earns its keep. Everything downstream (range, leaps, mesh safety,
sharing, tests) depends on these definitions being precise.

### 4.1 Coordinate system & units (fixed, non-negotiable)

- **Right-handed**, **+Y up**, **+Z forward** (the creature faces +Z), **+X to its right**.
- **Bilateral symmetry plane = the X = 0 plane (the YZ plane).** Paired appendages mirror
  across it. Radial symmetry arrays around the **+Z body axis**.
- **Units are abstract "body units" (bu)**, ~roughly decimeters. Baseline segment radius
  `≈ 0.5 bu`. The grown creature is always recentered and the camera auto-frames via drei
  `<Bounds>`, so absolute scale only matters for the optional physics step.
- Growth starts at the origin and extends the **spine** along +Z (optionally curving via
  per-segment pitch/yaw). Appendages branch off segments.

### 4.2 The PRNG and seed discipline (Pillar 3)

One PRNG, `mulberry32`, is the *only* source of randomness in the engine:

```ts
// engine/rng.ts — the ONLY randomness in the engine. Math.random() is banned here.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {            // → float in [0, 1)
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = ReturnType<typeof mulberry32>;

// Deterministic 32-bit mix for deriving child seeds from (parent, stream, op).
export function mix32(...xs: number[]): number {
  let h = 0x811c9dc5;
  for (const x of xs) { h = Math.imul(h ^ (x >>> 0), 0x01000193); }
  return h >>> 0;
}
```

**Seed flow (the invariant that makes lineages reproducible):**

- `grow(genome)` derives its RNG **only** from `genome.seed`. Grow is therefore a *pure
  function of the genome* — no hidden state, no clock, no `Math.random`.
- `mutate(parent, streamSeed, n)` produces the n-th offspring with a child genome whose
  `seed = mix32(parent.seed, streamSeed, n)` and whose operators draw from
  `mulberry32(mix32(streamSeed, parent.seed, n, OP_SALT))`. So a `(rootGenome, streamSeed)`
  pair regrows an entire lineage identically, anywhere.
- **Enforced**, not hoped: a Vitest test asserts `grow(g)` twice is deep-equal, and an
  ESLint `no-restricted-globals` rule + a grep test fail the build if `Math.random` appears
  under `src/engine/`.

### 4.3 Genome schema (versioned, bounded, serializable)

Refined from the draft: **every numeric gene carries hard `[min, max]` bounds**, because
bounded genes are *what keeps most mutations viable* (Pillar 1). Bounds live in one
`GENE_BOUNDS` table so they're tunable in one place.

```ts
export const GENOME_VERSION = 1;

export interface Genome {
  version: 1;
  seed: number;                       // uint32 — drives growth jitter deterministically
  symmetry: 'bilateral' | 'radial' | 'none';
  radialCount: number;                // 3..8, used only when symmetry === 'radial'
  body: SegmentGene;                  // root of the recursive body description
  palette: Palette;
}

export interface SegmentGene {
  size: [number, number, number];     // ellipsoid radii (bu), each 0.15..2.5 → proportions
  repeat: number;                     // 1..24 — how many times this segment chains (spine length!)
  taper: number;                      // 0.6..1.15 — per-link size multiplier along the chain
  curve: [number, number];            // [pitchPerLink, yawPerLink] radians, -0.5..0.5 → arcs/necks
  appendages: AppendageGene[];        // 0..8 limbs/fins on this segment
  child?: SegmentGene;                // next body section (e.g. head/tail) — recursion, depth ≤ 4
}

export interface AppendageGene {
  attachT: number;                    // 0..1 — position along the segment chain it sprouts from
  attachAzimuth: number;              // 0..2π — angle around the body axis
  segments: number;                   // 1..6 — limb length (its own recursion depth)
  length: number;                     // 0.2..2.0 (bu) per limb segment
  thickness: number;                  // 0.05..0.6 (bu)
  taper: number;                      // 0.5..1.0 — limb thinning toward the tip
  curl: [number, number];             // [pitchPerSeg, yawPerSeg] radians, -0.6..0.6 → bend/curl
  terminal: 'none' | 'foot' | 'fin' | 'claw' | 'eye';
  pair: boolean;                      // mirror across X=0 (bilateral) — ignored if symmetry==='none'
}

export interface Palette { hueA: number; hueB: number; sat: number; light: number; }
```

Why this spans blob → rodent → shark → tiger from one schema:

- `body.repeat` is "how many vertebrae" — 1–3 is a blob/torso, 12–24 is a serpent/centipede.
- `appendages.length` (count) + `segments` (limb length): few short paired limbs → rodent;
  many → insectoid; broad `fin` terminals + low repeat → shark.
- `size` ratios set silhouette: a long-Z, flat-Y segment is a tiger torso; equal radii is a blob.
- `symmetry: 'radial'` + `radialCount` makes starfish/anemone forms unreachable bilaterally.

### 4.4 `grow(genome) → Phenotype` (the developmental step, Pillar 2)

`grow` is an L-system-flavored interpreter: walk the segment chain honoring `repeat`,
`taper`, and `curve`; spawn appendages honoring `symmetry` and their own recursion; emit an
explicit skeleton of nodes (each a transform + radius) and edges.

```ts
export interface BodyNode {
  pos: [number, number, number];      // world position (bu)
  quat: [number, number, number, number]; // orientation (forward = local +Z)
  radius: number;                     // capsule radius at this node (bu), always ≥ R_MIN
  kind: 'spine' | 'limb' | 'terminal';
  terminal?: AppendageGene['terminal'];
}

export interface Phenotype {
  nodes: BodyNode[];
  edges: [number, number][];          // skeleton connectivity (a single tree)
  bounds: { min: [number,number,number]; max: [number,number,number] };
  genomeRef: Genome;                  // for inspection/animation
}
```

**Hard growth invariants `grow` must guarantee** (so meshing can never explode — Pillar 2):

| Invariant | Value | Enforced by |
|---|---|---|
| `R_MIN` (min radius) | `0.04 bu` | clamp every node radius |
| `NODE_MAX` (total nodes) | `512` | stop expansion when hit; bounds on repeat/recursion make this rare |
| `DEPTH_MAX` (segment recursion) | `4` | refuse deeper `child` chains |
| No NaN/Inf transforms | — | quaternions normalized; finite check in a dev assertion |
| Single connected tree | — | edges always reference an existing parent index |
| Pure & deterministic | — | RNG derived only from `genome.seed`; snapshot test |

A **fuzz test** grows ~10,000 random genomes and asserts every output satisfies the table —
that test is the real guarantee behind Pillar 2.

### 4.5 Mutation operators & default rates (Pillar 1)

`mutate(parent, streamSeed, n)` clones the genome, then applies operators drawn from the
derived RNG. Rates are **defaults in a tunable config**, chosen so a typical child reads as
"the parent, slightly changed," with occasional leaps:

| Operator | Default rate | Effect |
|---|---|---|
| **Point** | each numeric gene perturbed w.p. `0.30`, Gaussian σ = 8% of its range, **clamped to bounds** | fine-tuning — proportions, angles, thickness |
| **Structural** | `0.15` per offspring: pick one of {±1 `repeat`, add/remove appendage, change `terminal`, add/remove `child` segment, flip `symmetry`} | the leaps |
| **Duplication** | `0.08`: copy a segment-or-appendage subtree | extra limb pairs, longer bodies (duplication-then-divergence is a real evolutionary motif) |
| **Macro** | `0.02`: apply 3–5 structural ops at once | escape a plateau in directed/physics modes |

All bounded-clamped, so no operator can drive a gene out of its valid range → no invalid
phenotypes.

### 4.6 Sharing format (the genome string)

A creature's genome is serialized canonically and made copy-pasteable:

```
share(genome)  = "CAM1:" + base64url( deflate( JSON.stringify(canonicalize(genome)) ) )
load("CAM1:…")  = validate( JSON.parse( inflate( base64url⁻¹ ) ) )   // reject wrong version / bad bounds
```

A *randomly seeded* creature could be shared as just its seed, but an *evolved* one has a
mutated structure, so we serialize the whole (small) genome. `canonicalize` sorts keys so
the same creature always yields the same string. Load validates `version` and all
`GENE_BOUNDS`, rejecting corrupt input gracefully.

---

## 5. Architecture

**Pattern: headless core + ports-and-adapters.** The pure engine knows nothing about React,
three.js, or physics; the viewer and UI are adapters over it. This is what lets evolution
run in a Node test, and keeps Pillars 1 & 3 honest.

```
┌───────────────────────────────────────────────────────────────┐
│                          UI  (React)                          │
│  OffspringGallery · PressurePanel · LineageTree · SeedBox      │
└───────────────▲───────────────────────────────────┬───────────┘
                │ choose survivor / set pressures     │ display
┌───────────────┴─────────────────────────────────────▼─────────┐
│                   App State  (Zustand store)                  │
│   lineage tree · current generation · settings · selection     │
│   (serializable; calls pure engine fns, holds no logic)        │
└───────────────▲───────────────────────────────────┬───────────┘
                │ pure calls                          │ Phenotype
┌───────────────┴─────────────────────────────────────▼─────────┐
│              Evolution Engine  (pure TypeScript, no deps)     │
│   Genome ──grow()──▶ Phenotype     mutate() · select() ·      │
│   lineage · pressures.score() · mulberry32 RNG                 │
│        ▲ (optional) physics adapter ─ Rapier (lazy)            │
└───────────────────────────────────────────────────┬───────────┘
                                                     │ Phenotype
┌─────────────────────────────────────────────────────▼─────────┐
│              Viewer  (R3F / three.js)                         │
│   Phenotype → capsule-union skinned mesh → procedural anim     │
│   (stretch) → MarchingCubes skin   ·   GLTFExporter            │
└───────────────────────────────────────────────────────────────┘
```

**Suggested layout** (scaffold will refine):

```
src/
  engine/        # pure, headless, no three/react imports — the heart
    rng.ts  genome.ts  bounds.ts  grow.ts  mutate.ts  selection.ts  lineage.ts  share.ts
  viewer/        # R3F: meshFromPhenotype, animation, CreatureViewer
  ui/            # React components + Zustand store
  fitness/       # (M6, lazy) rapier locomotion adapter
tests/           # engine unit + determinism + fuzz tests (Vitest, no browser)
```

---

## 6. Core systems

### 6.1 Selection — two modes in v1 (physics is M6)

```ts
// Breeder (primary, Biomorphs-style): 3×3 mutant grid → pick one → new parent.
function breederOffspring(parent: Genome, streamSeed: number, count = 9): Genome[];

// Directed pressures: score offspring against a target vector, auto-select the best.
interface Pressure {                  // each component in [-1, 1], 0 = "don't care"
  size: number; limbCount: number; bodyLength: number;
  aquatic: number;                    // +1 fins/streamlined ↔ -1 legs/terrestrial
  predator: number;                   // +1 forward eyes + claws ↔ -1 prey cues
}
function scorePhenotype(p: Phenotype, target: Pressure): number; // cheap morphological metrics
function runGenerations(root: Genome, target: Pressure, k: number, streamSeed: number): LineageNode[];
```

Breeder mode is the feel-good core and ships in M2. Directed pressures (M4) reuse the same
`mutate` + a scalar `scorePhenotype` computed from cheap morphology metrics (node count,
bounds aspect ratio, limb count, terminal mix) — **no physics required**. Macro-mutation
(§4.5) is the plateau-escape valve.

### 6.2 Lineage & "evolution time"

```ts
interface LineageNode {
  id: string;
  genome: Genome;
  parentId?: string;
  generation: number;
  op?: string;              // the mutation that produced it (for the tree tooltip)
  thumbnail?: string;       // optional rendered preview (deferred; off during fast-forward)
}
```

Every creature records its parent + the operator that made it, so the UI renders a **family
tree** and can replay/branch any path. "Fast-forward" runs `runGenerations` **headless**
(engine is graphics-free, thumbnails off) then renders only the result — fast because no
canvas is touched per generation.

### 6.3 Mesh builder (capsule-union skinning — robust by construction)

Each skeleton edge becomes a **capsule** sized to its endpoint radii; spheres cap the nodes.
The union of capsules+spheres is the body. This handles *any* topology — long, branchy,
asymmetric — without ever self-destructing, which is exactly why it's v1 (Pillar 2). One
merged `BufferGeometry` per creature; bones optional for animation. Terminals (`fin`, `foot`,
`claw`, `eye`) swap in small primitive meshes at the tip.

> **Stretch (M7):** run three's `MarchingCubes` over a summed-metaball field of the nodes for
> one smooth Spore-ish surface. Prettier, heavier; gated behind the robust capsule path.

### 6.4 Animation (procedural)

A sinusoidal "muscle" drive along the spine and limbs, phase-offset by node index, so long
bodies undulate and limbed bodies appear to walk. Driven by the R3F clock, zero authored
data, degrades gracefully on weird morphologies. Same procedural-rig trick the sibling
projects use.

### 6.5 Persistence & export

- **Save/load:** Zustand store (lineage + settings) ⇄ `localStorage`; full session export to JSON.
- **Share:** the `CAM1:` genome string (§4.6) — copy a beast, paste to regrow it exactly.
- **Export (stretch):** three `GLTFExporter` bakes the current creature to `.glb` for use in
  other three.js projects (e.g. *Blue Souls*).

---

## 7. UX / interface

- **Center:** the current creature on a turntable, idle-animating, drei `<Stage>` + `<Bounds>`
  auto-framing whatever size it grew to; orbit camera.
- **The core loop (breeder):** a **3×3 offspring gallery** strip of mutant thumbnails. Click
  one → it becomes the parent, a new generation of nine appears. This single loop *is* the
  product; everything else supports it.
- **Pressure panel:** sliders/toggles for directed mode (size, limbs, body length,
  aquatic↔terrestrial, predator↔prey), a "generations to run" field, and a **Go** button that
  fast-forwards then shows the result + the path it took.
- **Lineage tree:** zoomable family tree; click any ancestor to revisit or branch a new line.
- **Seed box:** copy the current creature's `CAM1:` string; paste one to regrow someone
  else's beast.
- **Tone:** curious, naturalist — like filling in an alien field guide in real time.

---

## 8. Milestones

Top-down and independently runnable; scaffold turns these straight into `ROADMAP.md`.

- **M0 — Skeleton & it runs.** Vite + R3F app boots; a *fixed-seed* genome → `grow()` →
  capsule-union mesh on a turntable with orbit camera. Engine↔viewer wired end to end, one
  creature on screen. *Proves the whole pipeline.*
- **M1 — Random creatures + RNG discipline.** Full genome schema + `GENE_BOUNDS` + `mulberry32`;
  `grow()` with segment chains, appendages, bilateral symmetry; "New random creature" button
  showing its seed/string. Determinism + fuzz tests green. *Proves the encoding's range and
  Pillars 2–3.*
- **M2 — Mutate + breeder loop.** All four mutation operators + the 3×3 offspring gallery;
  click a child → it parents the next generation. **This alone is the complete, fun toy.**
  *Proves evolvability and steerability (Pillar 1).*
- **M3 — Lineage + sharing.** Family-tree view, snapshots, `CAM1:` import/export, regrow from
  string, localStorage session. *Proves reproducibility and shareability.*
- **M4 — Directed pressures.** `scorePhenotype` + pressure vector + auto-select +
  `runGenerations` headless fast-forward, then show result and path. *Proves "set a direction
  and run."*
- **M5 — Better bodies & motion.** Radial symmetry, terminals (fins/claws/feet/eyes),
  procedural undulation/walk, palette/materials. *Proves the aesthetic.*
- **M6 — (stretch) Physics fitness.** `@dimforge/rapier3d-deterministic-compat`, lazy-loaded;
  oscillating muscle drive; distance-traveled fitness; select the movers. A small Karl-Sims homage.
- **M7 — (stretch) Metaball skin.** `MarchingCubes` smooth surface over the node field;
  optional `.glb` export.

---

## 9. Risks / open questions

- **Most mutations are ugly.** Expected — selection is the point. Breeder mode hides it (you
  keep only the good ones); directed mode needs `scorePhenotype` decent enough not to wander
  into garbage. → Tune rates (§4.5) so leaps are occasional; ship the rates as config.
- **Topology → mesh robustness (Pillar 2).** Arbitrary skeletons must always skin. →
  Capsule-union is robust by construction + the §4.4 invariant table + a 10k-genome fuzz
  test that asserts a valid mesh every time. This is the single most important test in the repo.
- **Determinism drift (Pillar 3).** Any stray `Math.random`, `Date.now`, or unordered map
  iteration breaks reproducibility. → One central `mulberry32`; ESLint `no-restricted-globals`
  + grep test banning `Math.random` in `engine/`; snapshot test that a seed reproduces a
  lineage across runs.
- **Directed/physics search plateaus.** GA can get stuck in a local optimum. → Macro-mutation
  (§4.5) injects occasional large structural jumps to escape.
- **Headless fast-forward cost.** Many generations must be cheap. → Engine is graphics-free,
  `NODE_MAX` caps growth, thumbnails are off during fast-forward and rendered lazily after.
- **Scope creep toward an ecosystem.** The gravity well of this whole genre. → Explicit
  non-goal (§2); resist predators/food/world in v1. That's *Omnia*, not Cambrian.
- **Open: physics determinism in practice.** Rapier's deterministic build claims cross-platform
  reproducibility; verify empirically in M6 before relying on shared physics-evolved lineages.

---

## 10. References

- **Biomorphs — Dawkins, *The Blind Watchmaker* (1986)** — interactive cumulative selection of
  branching forms; the model for breeder mode.
- **Evolved Virtual Creatures — Karl Sims (1994)** — directed-graph genomes evolved in physics
  for locomotion; the model for the M6 fitness stretch.
- **L-systems (Lindenmayer)** — rule-based growth; inspiration for the genome→phenotype step.
- **three.js `MarchingCubes`** — `three/addons/objects/MarchingCubes.js`; the M7 smooth-skin
  algorithm. *(verified 2026-06-27)*
- **`@dimforge/rapier3d-deterministic-compat`** (Apache-2.0) — the *deterministic* Rapier build;
  guarantees cross-platform-identical physics, base64-inlined WASM for clean Vite bundling.
  *(verified 2026-06-27)*
- **mulberry32** — tiny fast deterministic 32-bit PRNG; replaces the unmaintained `seedrandom`.
  *(verified 2026-06-27)*
- **Spore — Creature Creator (Maxis, 2008)** — adjacent inspiration for the make-an-alien joy.
  Inspiration only; no Spore IP used.
- **Shared opportunity / reuse.** Cambrian (evolver), **Critterforge/Chimera** (manual
  parts builder), and **Brickyard** (LDraw sandbox) all want the same *R3F editor shell* —
  orbit camera, grid, auto-framing, scene management. Strong candidate to extract into a
  shared package on second use (the user's "extract on reuse" pattern). Build Cambrian's own
  thin shell for now; flag extraction when Critterforge starts.
