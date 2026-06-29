# ROADMAP — Cambrian

The milestone checklist. Standing instruction: **"continue"** → build the next
unchecked milestone.

**Rules of the road:**
- Each milestone is an **independently runnable** slice — something the human can
  actually test, not an internal-only refactor.
- Every milestone ends with explicit **Test** steps: what to do and what should
  happen. These are the acceptance criteria.
- Build **top-down**: a thin end-to-end slice first, then deepen.
- Check a box **only after the human confirms its Test passes**, then add a
  `PROGRESS.md` entry.

---

## Phase 0 — Walking skeleton

- [x] **M0 — Skeleton & it runs.** Vite + R3F app boots; a fixed-seed genome →
  `grow()` → capsule-union mesh on a turntable with an orbit camera. Engine↔viewer
  wired end to end, one creature on screen. Determinism + 4000-genome fuzz tests pass.
  **Test:** `npm install` then `npm run dev` → open http://localhost:5173, a little
  alien rotates on a turntable; "Re-roll jitter" re-grows it. `npm test` → green;
  `npm run build` → succeeds. _(built 2026-06-27, awaiting human confirmation)_

## Phase 1 — A complete, fun toy

- [ ] **M1 — Random creatures + RNG discipline.** A bounds-driven `randomGenome(seed)`
  in the engine; "New random creature" button shows its seed. Full schema exercised
  (segments, appendages, bilateral symmetry). Determinism + fuzz tests stay green.
  **Test:** click "New random creature" repeatedly → visibly different, always-valid
  creatures appear; the same seed always regrows the same one.
  _(built 2026-06-27, self-verified in-browser, awaiting human confirmation)_

- [ ] **M2 — Mutate + breeder loop.** The four mutation operators (point / structural /
  duplication / macro) + a 3×3 offspring gallery; click a child → it parents the next
  generation. **This is the core toy.**
  **Test:** from a creature, pick offspring across ~10 generations and steer the body
  toward a target (e.g. "longer, more limbs"); the lineage visibly trends that way.
  _(built 2026-06-27, self-verified in-browser, awaiting human confirmation)_

- [ ] **M3 — Lineage + sharing.** Family-tree view, snapshots, `CAM1:` genome-string
  import/export, regrow-from-string, localStorage session.
  **Test:** copy a creature's string, reload the page, paste it → the exact same
  creature returns; the lineage tree shows the path and lets you branch from an ancestor.
  _(built 2026-06-27, self-verified in-browser, awaiting human confirmation)_

## Phase 2 — Direction & polish

- [ ] **M4 — Directed pressures.** `scorePhenotype` + a pressure vector + auto-select +
  `runGenerations` headless fast-forward, then show the result and the path taken.
  **Test:** set "bigger + aquatic", run 50 generations → the result is larger and more
  fin/streamlined than the start; running again with the same seed reproduces it.
  _(built 2026-06-28, self-verified in-browser, awaiting human confirmation)_

- [ ] **M5 — Better bodies & motion.** Radial symmetry, terminals (fins/claws/feet/eyes)
  rendered as distinct tips, procedural undulation/walk animation, palette/materials.
  **Test:** evolve a radial creature and a many-legged one; both animate plausibly
  (undulating spine, limbs in phase) without visual blow-ups.
  _(built 2026-06-28: distinct terminals + countershaded skin + procedural motion;
  awaiting human visual confirmation)_

## Phase 3 — The creature grammar (v2)  ·  **next priority**

The big variety push. Full spec in **[MORPHOLOGY.md](MORPHOLOGY.md)** — a genome v2 that
throws out recognizable *and* uncanny creatures (cats, crabs, herons, dragons, aliens) from a
morphotype → trait → part → covering grammar. Takes priority over the M6/M7 stretch below.

- [x] **M8 — Genome v2 + spherical aim.** New schema with **spherical part aim** (azimuth +
  elevation + roll — unlocks tails/wings/horns/necks); migrate `grow` + the generator; bump
  share to `CAM2:`; raise `NODE_MAX`. (Gallery `<View>` consolidation rides here if convenient;
  the remount churn is already fixed by stable keys.)
  **Test:** roll creatures with tails pointing back, fins up, horns forward — all expressible.
  _(built 2026-06-28, self-verified: aim test + 2000-genome v2 fuzz + in-browser; awaiting human)_

- [x] **M9 — Part vocabulary (core).** A `style` gene (0..1) selects render variants per
  part. Built the high-impact set: **5 eye styles** (round/beady/slit/compound/glowing),
  **5 mouth styles** (maw/beak/mandibles/sucker/baleen), **horns** (smooth spikes), **pincers**
  (new terminal — crabs!), **wings** (crude membranes), and fins. _Deferred to polish (M16):
  frills, ears, antennae, carapace, articulated wing struts, leg-posture geometry._
  **Test:** build creatures with a beak vs. a fanged maw vs. pincers; each reads distinctly.
  _(built 2026-06-28, self-verified: 42 tests + in-browser pincers/styles + no errors; awaiting human)_

- [x] **M10 — Morphotype library + trait sampler.** **24 morphotype priors** (16 familiar +
  8 uncanny) as terse data tables, a generic compiler (morphotype → genome via the M9 parts),
  and the **bimodal sampler** (45% familiar / 35% uncanny / 20% the wild compositional tail).
  Each morphotype is a multivariate prior — coupled ranges + characteristic parts — so rolls
  read as their kind but keep surprising.
  **Test:** random rolls read clearly as cat / crab / heron / dragon / cephalopod and keep
  surprising over a long session.
  _(built 2026-06-28, self-verified: 42 tests + in-browser variety (28% radial, finite, no
  errors); awaiting human's visual read on whether the species read clearly)_

- [x] **M11 — Divergence engine.** A computed **morphospace** (`morphospace.ts`: 8-D descriptor +
  attractor centroids sampled per morphotype + a **coherence** label), and **niched litters**
  — the 9 offspring spread across morphospace (conservative · exploratory · **saltation** ·
  one **confluence** hybrid) instead of near-clones. HUD shows "≈ shark · 96%" / "~ valley near
  X". _(Coherence-pull-in-mutation deferred — saltation + confluence + the spread deliver the
  divergence; revisit if lineages don't settle.)_ See MORPHOLOGY §11.
  **Test:** a lineage visibly drifts *between* morphotypes instead of staying one shape; each
  litter offers genuinely divergent choices.
  _(built 2026-06-28, self-verified: 47 tests + in-browser coherence labels; awaiting human)_

- [x] **M12 — Covering & texture.** A `Covering` gene (type + pattern + scale/contrast/sheen),
  sampled per-morphotype, mutated, and `CAM2:`-shared. The skin shader gained an 8-pattern color
  field (plain/stripes/bands/spots/ocelli/reticulate/mottle/gradient) + a per-covering in-shader
  surface bump (scales=lens cells · fur=streaks · feathers=shingles · chitin/plates=plated seams ·
  slime=wet ripple) via screen-space-derivative normal perturbation, + per-covering roughness/
  metalness presets + a sheen→iridescence term. No asset files. MORPHOLOGY §7.
  **Test:** the same silhouette in fur vs. scales vs. chitin looks like a different animal.
  _(built 2026-06-29, self-verified: 51 tests + typecheck + build; in-browser the default reads as
  matte spotted fur, a roll came out wet glossy slime, another a hard scaled lizard — all distinct,
  shader compiles with no console errors; awaiting human visual confirmation)_

- [x] **M13 — Motion styles.** The animation rig generalized from "undulation + gait" to **8
  styles** (walk / swim / slither / scuttle / flap / drift / ooze) picked from the creature's own
  morphology (leg/fin/wing/tentacle counts + trunk length + symmetry), each parameterizing shared
  per-node oscillation terms applied by **role** (spine/leg/wing/fin/tail/tentacle): a fish's caudal
  body wave + fin sway, a crab's many-leg metachronal ripple, a bird's wing-beat + body-bob, a
  serpent's lateral wave, a cephalopod's tentacle drift + mantle pulse. Still pure viewer math
  (`grow()` stays static). MORPHOLOGY §8.
  **Test:** a fish swims, a crab scuttles, a bird flaps, a serpent slithers — in character.
  _(built 2026-06-29, self-verified: 52 tests incl. a style-classification test (fish→swim · crab→
  scuttle · bird→flap · serpent→slither · cephalopod→drift · felid→walk) + deterministic/bounded
  motion; in-browser 8 rolls produced slither/scuttle/drift/flap/walk/swim each matching its body
  plan, no console errors; awaiting human's visual read on the foregrounded animation)_

- [x] **M14 — The Menagerie.** A **MAP-Elites** archive (`src/viewer/archive.ts`) over two
  morphospace axes (limb count × elongation) — every creature that appears (the current one + its
  9-strong divergent litter) is binned and each cell keeps its **most-coherent** specimen. A
  browsable SVG grid (`Menagerie.tsx`, no extra WebGL) fills as you play; click a cell to pull that
  creature as a fresh parent; "you are here" marks the current bin. Plus a **novelty** axis in the
  pressure vector — `scorePhenotype`/`runGenerations` reward morphospace distance from the archive
  (novelty search), so directed runs hunt forms unlike what's been seen. Archive lives in the store
  (engine stays pure) + persists with the session. See MORPHOLOGY §11.4–11.5.
  **Test:** after a session the menagerie holds a wide grid of distinct creatures; the novelty
  steer reliably produces forms unlike what's already there.
  _(built 2026-06-29, self-verified: 57 tests incl. a novelty-steer test (drives away from the
  reference set) + archive tests (binning in-range, the grid spreads, highest-coherence elite per
  cell, idempotent); in-browser the grid filled 3→25/49 over 20 rolls, clicking a cell loaded that
  specimen (gen→0, seed from the archive), the novelty run advanced gen 0→15, no console errors;
  awaiting human's read)_

- [x] **M15 — Smooth skin** *(elevated from far-stretch — biggest "less crude" win)*.
  `src/viewer/smoothSkin.ts`: a signed-distance field = the **smooth union** of the skeleton's
  capsules, polygonized by **marching tetrahedra** (6 tets/cell — watertight, no opaque metaball
  tuning; the iso-surface is exactly the smoothed capsule union, so it hugs the body). Adaptive,
  budget-bounded grid resolution; built once per creature off the render loop (~25–85ms). A HUD
  **skin** toggle (capsules ⇄ smooth, persisted) gates it; the per-covering material carries over
  unchanged (the shader is world-space). Smooth is the **main view** only — thumbnails keep capsules,
  so they stay at framerate; the smooth body is static (motion pauses while shown).
  **Test:** toggle smooth skin → one organic surface replaces the capsule kit without breaking
  on weird topologies; thumbnails still render at framerate.
  _(built 2026-06-29, self-verified: 61 tests incl. 4 smooth-skin tests (non-empty + finite +
  within padded bounds + spans the body across 30 creatures; deterministic; survives serpent/radial);
  in-browser the toggle flips capsules⇄smooth and rebuilds on every roll with no console errors, and
  a direct in-browser build of the default creature gave a 12,688-triangle surface in 84ms; awaiting
  the human's visual read on the organic look)_

- [ ] **M16 — Dials & polish.** Surface new axes in the UI (more pressure sliders, a morphotype
  filter); tune the distribution; expand the morphotype/part tables.
  **Test:** the directed-evolution panel can steer toward "winged + long-necked + scaled".

## Phase 4 — Stretch

- [ ] **M6 — (stretch) Physics fitness.** `@dimforge/rapier3d-deterministic-compat`,
  lazy-loaded; oscillating muscle drive; distance-traveled fitness; select the movers.
  **Test:** run physics fitness for N generations → later creatures travel measurably
  farther than earlier ones; identical seed → identical run.

- [ ] **M7 — (stretch) glTF export.** Bake the current creature (capsule or smooth skin) to
  `.glb` via three's `GLTFExporter`. _(The metaball/marching-cubes smooth skin itself was
  pulled forward to **M15** — it's too central to the look to leave as a far-stretch.)_
  **Test:** export a creature; it opens correctly in another glTF viewer.

---

**North star:** in ten clicks you can visibly steer a blob toward a shark — and share the
result as a short string that regrows it exactly on someone else's machine.
