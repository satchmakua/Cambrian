# PROGRESS — Cambrian

A build log of what shipped and the notable decisions behind it. **Keep it honest** —
this is the working memory between build sessions. The forward-looking plan and
acceptance tests live in [ROADMAP.md](ROADMAP.md); this is the backward-looking
"what got done and why" companion.

**Current phase:** Phase 3 (the creature grammar). M0–M5 + **M8** (genome v2 + aim) + **M9**
(part vocabulary) + **M10** (morphotype library) + **M11** (divergence engine — morphospace,
coherence labels, niched litters) + **M12** (covering & texture — procedural patterns +
per-covering in-shader bump) + **M13** (motion styles — 8 gaits picked from morphology) + **M14**
(the Menagerie — MAP-Elites archive + browser + novelty steer) built. Next: **M15 — smooth skin**
(marching-cubes metaball surface over the node field, gated behind the capsule path).

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
| Directed pressures | `src/engine/pressures.ts`, `src/viewer/PressurePanel.tsx` | ✅ scorePhenotype + runGenerations + panel + novelty steer |
| Menagerie | `src/viewer/archive.ts`, `src/viewer/Menagerie.tsx` | ✅ MAP-Elites archive (limbs×elongation) + SVG browser, click-to-parent |
| Skin material | `src/viewer/creatureMaterial.ts` | ✅ countershading + 8 patterns + per-covering bump + sheen + fresnel rim |
| Covering | `src/engine/genome.ts` (`Covering`) | ✅ type/pattern/scale/contrast/sheen, per-morphotype, mutated, `CAM2:`-shared |
| Procedural motion | `src/viewer/animation.ts` | ✅ 8 motion styles (walk/swim/slither/scuttle/flap/drift/ooze) by morphology, role-based (unit-tested) |
| UI / store | `src/ui/App.tsx`, `store.ts` | ✅ Zustand: lineage + current + litter + pressure, localStorage |
| Test invariants | `tests/engine/invariants.ts` | ✅ shared phenotype + genome-bounds asserts |
| Physics fitness (stretch) | — | ⬜ M6 |

---

## M14 — The Menagerie · built 2026-06-29 (awaiting test)

The quality-diversity payoff (MORPHOLOGY §11.4–11.5): a **MAP-Elites archive** that turns a session
into a living field guide, + a **novelty steer**. New `src/viewer/archive.ts` (UI layer, not the
pure engine — but the binning/insert logic is pure & node-tested): a `GRID×GRID` (7×7) map over two
morphospace axes (limb count × elongation); `archiveAll(menagerie, genomes)` bins each creature and
keeps the **most-coherent** specimen per cell. The store folds the current creature + its 9-strong
divergent litter into the archive on every action (`batch`), so it fills fast and **persists**
across new-creature rolls (one accumulating field guide per session).

`Menagerie.tsx` browses it as a lightweight **SVG grid** (no new WebGL contexts — same call as the
lineage tree): each occupied cell is a swatch in its specimen's palette, titled with its
morphotype + coherence; the current creature's bin is outlined ("you are here"); click a cell →
`loadCell` roots a fresh lineage at that genome. It sits in a new bottom row beside the lineage.

The **novelty steer** (§11.5): `Pressure` gained a `novelty` axis; `scorePhenotype(p, t, refs)` adds
`novelty · tanh(min‖descriptor − ref‖ / 0.6)` and `runGenerations` threads `opts.refs`; the store
passes the archive's descriptors, so a directed run with Novelty up hunts morphospace regions the
menagerie hasn't covered. A "Novelty (familiar↔weird)" slider joins the pressure panel.

**Verified (2026-06-29):** `npm run typecheck` clean; `npm test` → **57/57** (5 new: the novelty
steer drives a lineage away from its reference form across a dozen roots, novelty degrades to 0
without refs; binKey stays in-grid over 500 rolls, the archive spreads across ≥8 cells, keeps the
max-coherence elite per bin, and re-inserting is idempotent). `npm run build` → succeeds.
**In-browser:** the Menagerie filled **3 → 25 / 49** over 20 rolls; clicking a cell loaded that
archived specimen as a new parent (generation → 0, seed drawn from the archive); the novelty slider
+ a 15-gen run advanced the lineage with no errors. (The multi-canvas page still defeats the preview
screenshot tool, so verified via the DOM + the handle, as in M5/M12.)

## M13 — Motion styles · built 2026-06-29 (awaiting test)

Creatures now move *in character* (MORPHOLOGY §8). `animation.ts` generalized from M5's single
"undulation + gait" into a **motion-style library**: `buildRig(data, phenotype)` reads the body
plan — leg/fin/wing/tentacle counts, trunk length, symmetry — and `pickStyle` chooses one of
**walk · swim · slither · scuttle · flap · drift · ooze**. Each style sets amplitudes on a shared
set of additive oscillation terms (lateral body wave, leg lift/swing, wing flap, fin flutter,
tentacle sway, whole-body bob/pulse), applied per node by **role** (spine / leg / wing / fin /
tail / tentacle — derived from each node's `part.kind`/`terminal`, with a `limbNorm` so tips swing
more than roots). So: a fish's caudal wave + fin sway, a crab's metachronal leg ripple (legs fire
in sequence along the body), a bird's wing-beat + body-bob, a serpent's strong lateral wave, a
cephalopod's tentacle drift + mantle pulse, a quadruped's diagonal trot (compact bodies bound).
Still pure viewer math — `grow()` stays static & deterministic.

Roles are size-invariant from the phenotype, and **trunk length** (spine-node count) — not the
bounding box — is the "is it long?" signal, so a *coiled* serpent still reads as slither (its bbox
isn't elongated). One bug fixed along the way: claw-terminal legs were double-counted, so a
4-legged felid mis-read as 6+ legs → scuttle; now legs count once. `CreatureMesh` passes the
phenotype to `buildRig`; the dev handle (`window.__cambrian`) gained `motion` + `covering`.

**Verified (2026-06-29):** `npm run typecheck` clean; `npm test` → **52/52** — the animation suite
(now 4 tests) keeps determinism + a tightened bound (displacement ≤ the rig's summed amplitudes,
`maxDisp`) and adds a **style-classification** test: across 40 rolls each, the dominant style is
swim for fish, scuttle for crab, flap for bird, slither for serpent, drift for cephalopod, walk for
felid. `npm run build` → succeeds. **In-browser:** 8 random rolls came out slither (legless) /
scuttle (6 legs) / drift (radial, 14 eyes) / flap (winged) / walk (legged) / swim (finned, legless)
— each matching its body plan, no console errors. (Motion *plays* only in a foregrounded browser —
the preview throttles rAF — so the live wiring is verified via the `motion` handle + the human's
eyes, as in M5.)

## M12 — Covering & texture · built 2026-06-29 (awaiting test)

The skin finally varies *as a material*, not just a hue (MORPHOLOGY §7). New `Covering` in the
genome (`type` ∈ skin/scales/fur/feathers/chitin/slime/plates · `pattern` ∈ plain/stripes/bands/
spots/ocelli/reticulate/mottle/gradient · `patternScale`/`patternContrast`/`sheen`), bounded in
`GENE_BOUNDS.covering`, sampled per-morphotype (the §4 "covering · pattern" column — felids furred &
spotted, lizards scaled & banded, cephalopods wet slime, dragons reticulate scales, …), point- and
structurally-mutated (a new `changeCovering` op re-skins type/pattern), and round-tripped through
`CAM2:`. The wild tail scrambles it freely.

`creatureMaterial.ts` was rebuilt around it. On top of the existing countershading + warm fresnel
rim: an **8-pattern in-shader color field** over body space (voronoi for spots/ocelli/reticulate,
fbm for mottle, sin bars for stripes/bands, a ramp for gradient), and **per-covering surface
relief** — a procedural height `h(x)` (scales = row-offset voronoi lenses, fur = directional fbm
streaks, feathers = shingled rows, chitin/plates = plated voronoi seams, slime = wet ripple, skin =
faint mottle) perturbing the view-space normal via the Mikkelsen screen-space-derivative bump (no
textures allocated). Per-covering roughness/metalness presets (fur matte → chitin glossy → slime
wet) + a `sheen`→iridescent oil-film term. A per-seed spatial offset keeps two same-covering
creatures from sharing a pattern phase. Store key bumped to `v2c`.

**Bug found & fixed in-browser:** the world-position varying relied on three's `worldPosition`,
which is only declared under certain defines (envmap/shadow) and was **undeclared** for our bodies
+ thumbnails → a vertex-shader compile failure (caught via the preview console). Now we compute it
ourselves: `vWPos = (modelMatrix * vec4(transformed,1.0)).xyz`.

**Verified (2026-06-29):** `npm run typecheck` clean; `npm test` → **51/51** (4 new: covering in
bounds across 2000 rolls; `CAM2:` round-trips it; mutation keeps it valid; the sampler spreads ≥5
coverings & ≥5 patterns); `npm run build` → succeeds. **In-browser:** default reads as matte
spotted **fur**; a roll came out wet glossy **slime** (radial, ocelli, sheen 0.84); another a hard
green **scaled** lizard (mottle) — three clearly different animals from similar primitives; the
shader compiles for the main view + all 9 thumbnails with **no console errors**.

## M11 — Divergence engine · built 2026-06-28 (awaiting test)

The attractor-basin machinery (MORPHOLOGY §11), so evolution drifts *between* morphotypes
instead of collapsing onto one. New `src/engine/morphospace.ts`: `describe()` reduces a grown
creature to an **8-D descriptor** (elongation, limb count, finniness, bulk, eye count, winged,
tailed, radial); each morphotype's **centroid** is sampled from the generator (memoized);
`coherence()` reports the nearest morphotype + a 0..1 score (high near a centroid = a clear
species, low in the valleys = an uncanny hybrid). **Niched litters** (`selection.ts::breederLitter`)
replace the nine near-clones with a spread — ~3 conservative, ~3 exploratory, ~2 **saltation**
(high-macro basin-hops), and 1 **confluence** (a `crossover` that grafts a random morphotype's
head + a couple of its parts onto the parent → griffins and chimeras). The store's gallery now
uses it; the HUD shows the live coherence label ("≈ shark · 96%" / "~ valley near …").

**Verified (2026-06-28):** `npm run typecheck` clean; `npm test` → **47/47** (new: descriptor
deterministic; creatures sit near an attractor — mean coherence > 0.45 with none in the void;
serpent self-labels, dragon reads as a winged beast; the niched litter spreads across morphospace
**more than a plain litter**; litter deterministic + growable). `npm run build` → succeeds.
**In-browser:** rolls labelled ≈ shark 96% / serpent 89% / rodent 99% / cephalopod 71% / dragon
92%; promote uses the niched litter; no console errors. _Coherence-pull-in-mutation deferred._

## Fix: offspring thumbnails showed scattered blobs · 2026-06-28

The breeder thumbnails ran the M5 animation, so drei `<Bounds observe>` kept re-fitting to a
moving creature → parts scattered and the framing collapsed (tiny). Added an `animate` prop to
`CreatureMesh` (default true); `OffspringThumb` passes `animate={false}` so thumbnails render the
**static base pose**, and tightened the Bounds margin 1.2→1.05 so the creature fills the cell.

## M10 — Morphotype library + sampler · built 2026-06-28 (awaiting test)

The milestone that ties M8's aim + M9's parts into **coherent species**. Rewrote `random.ts`
around a **morphotype library**: 24 terse priors — 16 familiar (felid, canid, rodent, ungulate,
ursid, lizard, crocodilian, serpent, anuran, fish, shark, bird, raptor, crab, insectoid,
arachnid) + 8 uncanny (dragon, wyvern, cephalopod, horror, slime, urchin, starfish, + the wild
tail) — each a *multivariate prior* (coupled girth/length/leg/wing/fin/tail/horn/eye/mouth
ranges, not a fixed mold). A generic `compile(morphotype → genome)` builds the body + parts via
parameterized builders (legs by posture, wings, fins, tails, horns, spines, antennae, eyes by
style, mouths by style, radial arms/tentacles). The **bimodal sampler**: 45% a Familiar
morphotype, 35% Uncanny, 20% the free "wild" compositional generator (the in-between tail) — so
the distribution has two strong modes, per the human's "familiar AND uncanny both strong" call.

Also raised `GENE_BOUNDS`: `radialCount` 8→12 (many-tentacled cephalopods), `appendageCount`
8→16 (legs+wings+fins+tail+spines stack; NODE_MAX is the real cap).

**Verified (2026-06-28):** `npm run typecheck` clean; `npm test` → **42/42** (within-bounds +
2000-genome fuzz + valid-phenotype + forced-mode + `CAM2:` round-trip all green on the new
generator); `npm run build` → succeeds. **In-browser** (14-creature sample): 28% radial
(cephalopods/horrors/urchins/starfish), fins/claws/horns/eyes/mouths spread across creatures,
node range 12–51, **all finite, no console errors**. _The visual "reads clearly as a cat / crab
/ heron / dragon" is the human's call._

## M9 — Part vocabulary (core) · built 2026-06-28 (awaiting test)

Distinct geometry per part, driven by a new **`style` gene** (0..1) that selects render
variants. The high-impact set (the face + the test's named items):

- **Eyes — 5 styles** by `style`: round (sclera+pupil+highlight), beady, slit (vertical
  reptile pupil), compound (faceted icosahedron dome), glowing (emissive alien).
- **Mouths — 5 styles**: maw (cavity + teeth), beak (two cones), mandibles (converging
  prongs), sucker (torus ring), baleen (fringe). The face finally varies.
- **Horns** (smooth keratin spikes, by `kind==='horn'`), **pincers** (new `pincer` terminal —
  two converging prongs, so radial creatures become **crabs**), **wings** (crude membranes by
  `kind==='wing'`), improved fins.

Plumbing: `style` added to `AppendageGene` (+ bounds/random/mutate/share/invariants); grow
tags each appendage node with `{kind, style}` so the renderer can pick variants;
`changeKind`/`reaim`/style-jitter already drift them. `pincer` added to the Terminal enum +
all validators. Session key bumped to `v2b`.

**Verified (2026-06-28):** `npm run typecheck` clean; `npm test` → **42/42** (style now in the
within-bounds + 2000-genome fuzz; `CAM2:` round-trip covers the new fields); `npm run build` →
succeeds. **In-browser:** default loads with horns; an 8-creature sample produced **pincers**
(a radial **crab** with 4; bilaterals with 6), mouths, eyes, fins, horns — all finite, the new
geometry (icosahedron/torus/cone/box) renders with **no console errors**. _Deferred to polish:
frills, ears, antennae, carapace, articulated wings, leg-posture geometry._

## M8 — Genome v2 + spherical part aim · built 2026-06-28 (awaiting test)

The foundation of the creature grammar (MORPHOLOGY). Migrated the whole engine to **genome
v2**. The headline unlock: every part now has a full **spherical aim** — `attachElevation`
(tilt forward/back) + `roll`, on top of `attachAzimuth` — plus a `kind` (leg/wing/tail/horn/
fin/…). The v1 model could only fan parts sideways with a fixed tiny back-tilt, which is *why*
everything looked same-y; now tails point back, fins/horns up, wings out-and-back.

- **`grow.ts`:** appendage direction is now `cos(elev)·(cos(az)·X + sin(az)·Y) + sin(elev)·Z`
  (MORPHOLOGY §3.1); bilateral mirror negates X; radial arrays the azimuth; `roll` rotates the
  part frame. Shoulder bulge keys on `kind==='leg'`.
- **`random.ts`:** v2 generator places **tails** (aimed back, ~50%), **horns** (up-forward on
  heads, ~30%), and dorsal/pectoral fins — via aim, not just splay.
- **`mutate.ts`:** jitters elevation/roll; new `changeKind` + `reaim` structural operators let
  a part swing to a new direction (a side fin → a tail) — drift toward the divergence engine.
- **`share.ts`:** `CAM2:` prefix + validates kind/elevation/roll; old `CAM1:` strings rejected.
  `bounds.ts`: `attachElevation` `[-π/2,π/2]`, `roll` `[-π,π]`, `NODE_MAX` 512→640. Store
  `STORAGE_KEY` bumped to v2 (old sessions dropped). Default creature is a horned, tailed quadruped.

**Verified (2026-06-28):** `npm run typecheck` clean; `npm test` → **42/42** — new `aim.test.ts`
*proves the unlock* (elevation places a part behind/ahead of the trunk, azimuth above/below; the
default creature's tail extends behind the origin), plus the 2000-genome v2 fuzz and 300-genome
`CAM2:` round-trip stay green. `npm run build` → succeeds. **In-browser:** clean load; the
default creature gained horns + a tail (Z-extent 3.4→4.6); a random roll came out a
horned/finned/4-legged/tailed creature, all-finite, `CAM2:` share, no console errors.

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
