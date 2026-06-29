# PROGRESS — Cambrian

A build log of what shipped and the notable decisions behind it. **Keep it honest** —
this is the working memory between build sessions. The forward-looking plan and
acceptance tests live in [ROADMAP.md](ROADMAP.md); this is the backward-looking
"what got done and why" companion.

**Current phase:** Phase 2. M0–M5 built and self-verified; awaiting acceptance test.
Creatures are steerable by hand (breeder) or by target (directed pressures), branchable,
shareable, and now **animated** (procedural undulation + gait).

### State of the tree

| Component | File | Status |
|---|---|---|
| Seeded RNG | `src/engine/rng.ts` | ✅ mulberry32 + mix32, tested |
| Bounds / invariants | `src/engine/bounds.ts` | ✅ GENE_BOUNDS, R_MIN/NODE_MAX/DEPTH_MAX |
| Genome | `src/engine/genome.ts` | ✅ types + `defaultGenome` (demo critter) |
| Random genomes | `src/engine/random.ts` | ✅ bounds-driven `randomGenome(seed)`, coherent critters |
| Growth | `src/engine/grow.ts` | ✅ segment chain + appendages + symmetry + child recursion |
| Mutation | `src/engine/mutate.ts` | ✅ point / structural / duplication / macro, all bounded |
| Selection (breeder) | `src/engine/selection.ts` | ✅ `breederOffspring(parent, streamSeed, n)` |
| Mesh data | `src/viewer/meshData.ts` | ✅ capsule-union skinning |
| Viewer | `src/viewer/CreatureViewer.tsx`, `CreatureMesh.tsx` | ✅ Stage + OrbitControls + turntable |
| Gallery | `src/viewer/OffspringGallery.tsx`, `OffspringThumb.tsx` | ✅ 3×3 demand-rendered thumbs |
| Sharing | `src/engine/share.ts` | ✅ `CAM1:` encode/decode/validate |
| Lineage | `src/engine/lineage.ts`, `src/viewer/LineageTree.tsx` | ✅ tree model + SVG view |
| Share bar | `src/viewer/ShareBar.tsx` | ✅ copy / paste-and-load |
| Directed pressures | `src/engine/pressures.ts`, `src/viewer/PressurePanel.tsx` | ✅ scorePhenotype + runGenerations + panel |
| Skin material | `src/viewer/creatureMaterial.ts` | ✅ countershading + pattern + fresnel rim |
| Procedural motion | `src/viewer/animation.ts` | ✅ undulation + gait (unit-tested) |
| UI / store | `src/ui/App.tsx`, `store.ts` | ✅ Zustand: lineage + current + litter + pressure, localStorage |
| Test invariants | `tests/engine/invariants.ts` | ✅ shared phenotype + genome-bounds asserts |
| Physics fitness (stretch) | — | ⬜ M6 |

---

## Divergence engine + prior-art research · 2026-06-28

Researched the relevant prior art and folded it into the design (no code yet):

- **Spore's tech** (Hecker's notes): metaball implicit-surface skin, parameterized **Rigblocks**,
  and **morphology-independent motion retargeting**. Mapped each to a Cambrian analog in
  MORPHOLOGY §6/§8/§14; added a note to borrow Spore's "author abstract gaits, retarget by limb
  role" idea for richer motion.
- **Games landscape:** Spore is still the creature-creator king ~17 yrs on; Species / Thrive /
  The Sapling / Framsticks go further on *evolution*; our truest relative is Picbreeder /
  EndlessForms (interactive CPPN/NEAT evolution of forms). Captured in §14.
- **Attractor basins → a real divergence engine (MORPHOLOGY §11).** Formalized the human's
  intuition with quality-diversity research: a computed **morphospace** with morphotypes as
  **attractor centroids**, a **coherence field** (familiar near centroids, uncanny in the
  valleys), **basin dynamics** (coherence pull / confluence / saltation), **niched litters**
  (9 offspring spread across morphospace, not 9 near-clones), a **MAP-Elites "Menagerie"**
  archive, and a **novelty** steer. This is the cure for premature convergence (collapse to one
  morphotype) the human flagged.

**Critical-review changes applied:** replaced the fixed `vibe` genome tag with a *computed*
morphospace position (so a creature reports its true current form); re-cut the roadmap (M8 was
overstuffed; added **M11 divergence engine** + **M14 Menagerie**; **elevated marching-cubes
smooth skin to M15** since the capsule-kit look is the #1 thing keeping it crude; M7 stretch is
now just glTF export). ROADMAP Phase 3 is now M8–M16.

## Perf fix + creature-grammar spec · 2026-06-28

Two things in response to feedback (creatures lag on click; too few distinct shapes):

- **Perf:** the ~10s white-screen on every click was the offspring gallery **remounting all 9
  WebGL canvases** each generation (their React key included the generation + seed, so React
  destroyed and rebuilt them → GL-context thrash past the browser's ~16 limit). Fixed with a
  **stable per-slot key** so the 9 canvases persist and just swap contents. (The proper
  10→1-context consolidation via drei `<View>` is scheduled as M8.)
- **Variety:** wrote **[MORPHOLOGY.md](MORPHOLOGY.md)** — a full spec for the variety system
  the toy needs. A **genome v2** "creature grammar": ~24 **morphotypes** (priors, split into a
  strong *familiar* and a strong *uncanny* cluster per the human's call), ~24 **trait axes**,
  a ~25-part **vocabulary** (wings, tails, horns, fins, pincers, frills, carapace, every eye
  style, every mouth style), and a **procedural covering/texture** system (in-shader patterns
  + bump for scales/fur/feathers/chitin/slime — no asset files, the human chose procedural).
  The key unlock is giving appendages a full **spherical aim** (azimuth + elevation + roll),
  which is why v1 looks same-y (parts can only fan sideways today). Build plan = ROADMAP
  Phase 3 (M8–M13), which takes priority over the M6/M7 stretch. Decisions locked: procedural
  textures, familiar+uncanny both strong, clean v2 (old `CAM1:` strings dropped).

## M5 — Procedural motion · built 2026-06-28 (awaiting test)

Creatures move now. New `src/viewer/animation.ts` (pure math, no three) deforms the skeleton
node positions each frame: a **traveling sine wave** along the body (undulation — amplitude
scales with length and drops for ≥4-legged bodies, so serpents slither and quadrupeds sway
gently) plus a **phased leg gait** (nodes below the body lift and swing on a diagonal phase).
`CreatureMesh` re-poses the capsules/spheres/features from the animated positions in
`useFrame`. Also: a distinct **claw** terminal (a dark talon cone vs. the foot's flat pad).
Radial variety and the other distinct terminals (eyes/mouth/feet/fins) landed in the earlier
look + generator passes, completing M5's scope.

Motion is a *viewer* concern — `grow()` stays static/deterministic. The animation math was
factored out so it's unit-testable headlessly (the preview throttles `requestAnimationFrame`,
so it can't show motion — same limit as screenshots).

**Verified (2026-06-28):** `npm run typecheck` clean; `npm test` → **39/39** (3 new: the pose
visibly changes over time; deterministic + bounded — never exceeds the rig's amplitudes, no
NaN — across 200 creatures × 4 times; serpents undulate more than the compact quadruped);
`npm run build` → succeeds; no console errors in-browser (base pose renders; motion plays in
a real foregrounded browser). Awaiting the human's visual read on the animation.

## M4 — Directed pressures · built 2026-06-28 (awaiting test)

"Set a direction and run." New `src/engine/pressures.ts`: a `Pressure` vector (size,
limbCount, bodyLength, aquatic, predator; each in [-1,1], 0 = don't care), `scorePhenotype`
(cheap morphological metrics — overall scale, limb tips, elongation, fin↔leg ratio,
claw/eye predator cues — each smoothed monotonic via `tanh`), and `runGenerations`, a
headless greedy hill-climb with **elitism** (the parent always competes, so the target score
never regresses) that's deterministic from (root, streamSeed). Store gains `pressure` +
`setPressure` + `runDirected(generations)`, which appends the chosen path to the lineage
tree. UI: `PressurePanel` (5 sliders + a generations field + Run) in the right rail.

**Verified (2026-06-28):** `npm run typecheck` clean; `npm test` → **36/36** (4 new: run
determinism, score never regresses, single-axis pressure provably moves its metric across a
dozen roots, aquatic trades legs→fins); `npm run build` → succeeds. **In-browser:** from the
default quadruped (z-length 3.4, 4 feet, 0 fins), 45 generations of "long + aquatic" →
z-length **29.2**, **0 feet / 6 fins**, and the full 45-step path recorded in the lineage
tree (1 → 46 nodes). No console errors.

## Compositional generator — fix archetype over-fit · 2026-06-28 (awaiting test)

Feedback: creatures looked more "creatury" but **over-fit to a few archetypes** — every
creature snapped to one of five rigid molds (quadruped / hexapod / fish / serpent / radial).
Rewrote `random.ts` to **compose body plans from independent traits** instead of picking one
mold: a body on a length/girth continuum (`repeat` 2–13 from a `lengthClass`, height ratio,
windiness), an independent **leg-pair count (0–3, weighted)**, **independent dorsal/pectoral
fins**, and an optional head + face — features sized to the body girth (legs reach the
ground, eyes scale to the head) and all clamped to `GENE_BOUNDS`. The familiar forms now
*emerge* as common cases; hybrids (a finned quadruped, a long 3-legged body, a two-legged
dragon) fill the space between. Radial creatures also vary more (dome height, arm
length/curl, an optional second ring of spikes/eyes).

**Verified (2026-06-28):** `npm run typecheck` clean; `npm test` → **32/32**; `npm run build`
→ succeeds. **Diversity sample (600 random genomes, headless):** symmetry 71% bilateral / 29%
radial; bilateral leg-pairs spread 0→88 / 1→87 / 2→179 / 3→71 (no collapse onto one mold);
51% carry fins; body length short 215 / mid 241 / long 144; node counts 6–49 across **38
distinct** sizes. Awaiting the human's visual read.

## Creature-look pass — face, skin, articulation · 2026-06-28 (awaiting test)

Feedback: creatures read as animal-ish but "still quite blobby" — needs a face, articulated
legs, texture/definition. A flat single-color capsule-union will always look blobby, so this
pass adds the art cues that make a smooth surface read as alive (grounded in creature-design
refs — eyes are the emotional anchor; countershading + rim give form):

- **A face (engine + viewer):** new `'mouth'` terminal (enum + share/mutate validators);
  `random` puts eyes **and** a mouth on heads/fish. The viewer renders **eyes** as a pale
  sclera + dark pupil (facing outward) + a bright highlight — the single biggest "alive"
  win — and the **mouth** as a dark horizontal slit.
- **Skin material (`creatureMaterial.ts`):** the body now shares a `MeshStandardMaterial`
  extended via `onBeforeCompile` — **countershading** (dark dorsal → light belly by world
  normal.y), a procedural **skin pattern** (plain / stripes / spots, per creature from the
  seed), and a **fresnel rim** so the silhouette glows. World-space effects are stable
  because the turntable now orbits the **camera**, not the creature (`CreatureViewer` uses
  `OrbitControls autoRotate`; world ≡ body space).
- **Body structure (`grow`):** legs now **thicken the spine node they attach to** → shoulders
  and haunches instead of a uniform tube.
- **Articulated legs (`random`):** 3 segments (thigh → shin → foot), a clearer knee bend, a
  thinning shin; **feet/claws** render as flattened pads, **fins** as thin blades.
- **Dev:** `preserveDrawingBuffer` in dev + the freeze hook for headless capture (the preview
  screenshot tool still can't grab the WebGL framebuffer, so verified by stats + feature
  tally + the human's eyes), and `window.__cambrian.terminals` reports the face/limb tally.

**Verified (2026-06-28):** `npm run typecheck` clean (added `vite/client` types for
`import.meta.env`); `npm test` → **32/32** (bounds guard caught an over-range knee curl —
fixed); `npm run build` → succeeds. **In-browser feature tally:** quadrupeds spawn with 2
eyes + 4 feet + a mouth, fish with 2 eyes + 3 fins + a mouth, radials with a clawed-arm
crown. Awaiting the human's visual read on whether it now reads as a creature.

## Morphology pass — recognizable body plans · 2026-06-28 (awaiting test)

Feedback: random creatures read as "wonky sticks / worms." Root causes: (1) `grow` strode
~2× the segment radius, so capsules became thin rods (a stick chain) instead of merging into
a body; (2) `randomGenome` produced uniform thin chains, not animal-like plans; (3) the demo
creature's "legs" actually pointed *up* (azimuth in the upper hemisphere). Reworked all three
(grounded in how Spore's metaball spine + procedural-creature systems get readable forms — see
README refs):

- **`grow.ts`:** body radius now comes from the cross-section (`size x,y`) while `size z`
  stretches it forward; the stride is bounded near the radius so capsules **overlap into a
  continuous mass**, plus a **fusiform bulge** (`BODY_BULGE`) fattens the middle. Result: a
  torso, not beads on a string.
- **`random.ts`:** rebuilt around **body-plan archetypes** — `quadruped`, `hexapod`, `fish`,
  `serpent`, and a `radial` crown — each with tuned proportions and limbs aimed sensibly
  (legs down, fins up/out, eyes on the head). Added a `mode: 'auto'|'bilateral'|'radial'`
  param to `randomGenome`.
- **Radial toggle + symmetry lock:** new `symmetryMode` in the store + a HUD segmented
  control (Auto / Bilateral / Radial). Forcing a mode spawns a creature of that symmetry and
  **locks it through mutation** (`lockSymmetry` skips the flip-symmetry operator), so a
  radial lineage stays radial. Persisted with the session.
- **Dev affordances:** enriched `window.__cambrian` (symmetry, bounds dims, max radius) and
  added `window.__cambrianFreeze(true)` to switch the viewer to on-demand rendering. (Note:
  the headless preview still can't screenshot the WebGL canvas, so this pass was verified by
  geometry stats + the human's eyes.)

**Verified (2026-06-28):** `npm run typecheck` clean; `npm test` → **32/32** (added a
forced-mode test: radial/bilateral honored and valid across 300 seeds each); `npm run build`
→ succeeds. **In-browser geometry stats:** bilateral z:width dropped from ≈3.3 → **≈2.2 avg**
(animal proportions); bodies are now chunky (max radius 0.47–0.93, up from ~0.37 threads);
radial creatures are fat discs/domes with arm crowns. Awaiting the human's visual read.

## M3 — Lineage + sharing · built 2026-06-27 (awaiting test)

Creatures became branchable and shareable. `src/engine/share.ts` gives the `CAM1:`
genome string: `"CAM1:" + base64url(JSON(canonicalize(genome)))`, with a thorough
`decodeGenome` validator that rejects junk / wrong version gracefully. `src/engine/lineage.ts`
holds the family-tree model (`LineageNode` + pure `childIdsOf` / `pathToRoot` / `layoutTree`
tidy layout). The Zustand store now owns a **lineage tree** (`nodes` + `currentId` +
id `counter`): `promote` adds a child under the current node, `selectNode` revisits an
ancestor (so the next promote **branches**), and everything is **persisted to localStorage**
so a session survives a reload. `LineageTree.tsx` renders the tree as lightweight SVG dots
(colored by palette) — deliberately *not* more WebGL canvases — and `ShareBar.tsx` does
copy / paste-and-load.

**Deviation from DESIGN §4.6:** dropped the `deflate` step from the share format to keep the
engine dependency-free (no pako / no async CompressionStream). Genomes are ~1–1.5 KB of
base64; revisit if that ever feels too long.

**Verified (2026-06-27):** `npm run typecheck` clean; `npm test` → **31/31 passing** —
incl. a 300-genome `CAM1:` round-trip (`decode(encode(g))` deep-equals `g` and grows
identically), junk/version rejection, and the lineage layout helpers. `npm run build` →
succeeds. **In-browser:** built a chain (Gen 0→1→2), then selected the root and promoted a
different offspring → the tree **branched** (root gained a 2nd child, node "3"); **reloaded
the page → the full 4-node tree and current position restored from localStorage**; copied a
creature's string, hit "New random creature" (seed changed, tree reset), pasted the saved
string + Load → **the exact original creature returned** (seed `635837315`). No console errors.

## M2 — Mutate + breeder loop · built 2026-06-27 (awaiting test)

The core toy. Added `src/engine/mutate.ts` — `mutate(parent, streamSeed, n)` deep-clones
the parent (no in-place mutation), derives a reproducible child seed via
`mix32(parent.seed, streamSeed, n)`, and applies the four operator classes from DESIGN
§4.5 with tunable `DEFAULT_RATES` (point 0.30 / structural 0.15 / duplication 0.08 / macro
0.02). Point mutations use a Box-Muller Gaussian (σ = 8% of each gene's range) and clamp to
`GENE_BOUNDS`; structural/duplication ops respect the appendage-count and chain-depth caps —
so every mutant is in-bounds and growable by construction. `src/engine/selection.ts` adds
`breederOffspring`. UI: `OffspringGallery` (3×3) of `OffspringThumb`s (small
`frameloop="demand"` canvases auto-framed by drei `<Bounds>`); the Zustand store now tracks
parent + generation + litter, with `promote` / `reroll` / `newCreature`.

**Verified (2026-06-27):** `npm run typecheck` clean; `npm test` → **22/22 passing** —
including mutation determinism, *parent-not-mutated*, **200 parents × 9 mutants all within
bounds & growable**, litter variety, and a **cumulative-selection** test (greedily picking
"more nodes" across 25 generations reliably grows the creature — steerability, proven
headlessly). `npm run build` → succeeds. **In-browser:** gallery shows 9 live thumbnails
(10 WebGL contexts total, no context-loss warnings); clicking a thumb promotes it — verified
the chain Gen 0→1→2→3 with the parent changing each time (`0xC0FFEE`/24n → `0x29e621cf`/28n
→ `0x29e6…`→ `0x9543…`/23n) and a fresh litter breeding; "new litter" re-breeds without
changing the parent. No console errors.

_Decision:_ each thumbnail is its own small WebGL canvas (10 contexts total). Fine at this
scale and simplest; if a future milestone pushes context count up, switch the gallery to
drei `<View>` (many views, one canvas). Also added `PORT` env support to `vite.config.ts`
so the preview/launch harness's port handoff works cleanly.

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
