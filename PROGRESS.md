# PROGRESS — Cambrian

A build log of what shipped and the notable decisions behind it. **Keep it honest** —
this is the working memory between build sessions. The forward-looking plan and
acceptance tests live in [ROADMAP.md](ROADMAP.md); this is the backward-looking
"what got done and why" companion.

**Current phase:** Phase 1. M0 + M1 built and self-verified (incl. in-browser); awaiting
human test.

### State of the tree

| Component | File | Status |
|---|---|---|
| Seeded RNG | `src/engine/rng.ts` | ✅ mulberry32 + mix32, tested |
| Bounds / invariants | `src/engine/bounds.ts` | ✅ GENE_BOUNDS, R_MIN/NODE_MAX/DEPTH_MAX |
| Genome | `src/engine/genome.ts` | ✅ types + `defaultGenome` (demo critter) |
| Random genomes | `src/engine/random.ts` | ✅ bounds-driven `randomGenome(seed)`, coherent critters |
| Growth | `src/engine/grow.ts` | ✅ segment chain + appendages + symmetry + child recursion |
| Mesh data | `src/viewer/meshData.ts` | ✅ capsule-union skinning |
| Viewer | `src/viewer/CreatureViewer.tsx`, `CreatureMesh.tsx` | ✅ Stage + OrbitControls + turntable |
| UI / store | `src/ui/App.tsx`, `store.ts` | ✅ Zustand, HUD, "New random creature" |
| Test invariants | `tests/engine/invariants.ts` | ✅ shared phenotype + genome-bounds asserts |
| Mutation / breeder | — | ⬜ M2 |

---

## M1 — Random creatures · built 2026-06-27 (awaiting test)

Added `src/engine/random.ts`: a bounds-driven `randomGenome(seed)` that builds *coherent*
critters (a torso with a 1–3 leg-belt, sometimes a dorsal/side fin, a ~60% head segment
with eyes; 70/20/10 bilateral/radial/none symmetry) rather than the maximally-chaotic
genomes the fuzz test throws at `grow`. Every draw flows from the seed, so a seed
reproduces the whole creature. Wired the store's `newCreature()` + the "New random
creature" button to it (replacing M0's jitter-only re-roll).

Refactored the test invariants into `tests/engine/invariants.ts` (shared
`expectValidPhenotype` + new `expectGenomeWithinBounds`) and added
`tests/engine/random.test.ts`. One bug caught by the new bounds test and fixed: eye
`length` drew from `[0.12, 0.28)`, below the `GENE_BOUNDS.appendage.length` floor of `0.2`
— tightened to `[0.2, 0.3)`. (Good sign the bounds guard works.)

**Verified (2026-06-27):** `npm run typecheck` clean; `npm test` → **16/16 passing**
(determinism of `randomGenome`, every gene within `GENE_BOUNDS` across 2000 seeds, valid
phenotype across 2000 seeds, plus the M0 suite); `npm run build` → succeeds. **In-browser**
(via preview + `window.__cambrian`): default creature grew to 24 nodes/23 edges; clicking
"New random creature" produced distinct valid creatures (seeds `0xC0FFEE` → `1607188934`
→ `0x594fde73`, node counts 24→22, each a valid tree) with the HUD seed updating
reactively on a live WebGL canvas — the full button→store→regrow→render pipeline works.

_Tooling note:_ the headless preview can't screenshot the continuously-animating WebGL
canvas (rAF is throttled when the tab isn't foregrounded), and its autoPort handoff to
Vite mismatched (Vite picked its own free port). Verify visuals via `window.__cambrian`
state + `preview_eval`, or just open the dev URL directly.

## M0 — Walking skeleton · built 2026-06-27 (awaiting test)

Scaffolded the project in place from the existing `DESIGN.md`. Stood up the house R3F
stack (React 18.3 · three 0.169 · R3F 8.17 · drei 9.114 · Zustand 5 · Vite 5.4 ·
Vitest 2.1 · TS 5.6) and delivered a thin but real end-to-end slice:
`defaultGenome()` → `grow()` → capsule-union mesh, rendered on a slow turntable under
drei `<Stage>` with an orbit camera and a small HUD (seed, node/edge counts, re-roll).

**Key decisions (see ADR-0002):** the evolution engine is pure and dependency-free —
no three.js/React imports — with inlined vec/quat math, so it's node-testable and can
later evolve headlessly. `Math.random` is banned under `src/engine/` (enforced by a
test); all randomness is the seeded `mulberry32`. Meshing is capsule-union (robust for
any topology) rather than the stretch metaball skin. Dropped the draft's `seedrandom`
dependency in favor of inline mulberry32.

**Verified (2026-06-27):** `npm run typecheck` clean; `npm test` → **11/11 passing**
(grow-twice deep-equal determinism, the §4.4 invariants asserted across a 2000-genome
fuzz run, RNG determinism + order-sensitivity, and the Math.random-ban guard);
`npm run build` → succeeds (≈298 kB gzip, mostly three.js). Dev server boots and serves
Cambrian's own HTML (verified on :5174 — :5173 was held by another project at the time).
Headless handle `window.__cambrian` exposes node/edge/seed for behind-the-animation checks.

_Gotcha for the next session:_ the ban-guard test strips comments before scanning, so
doc comments may mention `Math.random` freely — only real code usage is forbidden.
