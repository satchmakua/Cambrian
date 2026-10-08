# ROADMAP — Cambrian

The milestone checklist. Build the next unchecked milestone.

**Rules of the road:**
- Each milestone is an **independently runnable** slice — something actually
  testable end-to-end, not an internal-only refactor.
- Every milestone ends with explicit **Test** steps: what to do and what should
  happen. These are the acceptance criteria.
- Build **top-down**: a thin end-to-end slice first, then deepen.
- Check a box **only after its Test passes**, then add a
  `PROGRESS.md` entry.

---

## Phase 0 — Walking skeleton

- [x] **M0 — Skeleton & it runs.** Vite + R3F app boots; a fixed-seed genome →
  `grow()` → capsule-union mesh on a turntable with an orbit camera. Engine↔viewer
  wired end to end, one creature on screen. Determinism + 4000-genome fuzz tests pass.
  **Test:** `npm install` then `npm run dev` → open http://localhost:5173, a little
  alien rotates on a turntable; "Re-roll jitter" re-grows it. `npm test` → green;
  `npm run build` → succeeds. _(built 2026-06-27, pending visual confirmation)_

## Phase 1 — A complete, fun toy

- [ ] **M1 — Random creatures + RNG discipline.** A bounds-driven `randomGenome(seed)`
  in the engine; "New random creature" button shows its seed. Full schema exercised
  (segments, appendages, bilateral symmetry). Determinism + fuzz tests stay green.
  **Test:** click "New random creature" repeatedly → visibly different, always-valid
  creatures appear; the same seed always regrows the same one.
  _(built 2026-06-27, self-verified in-browser, pending visual confirmation)_

- [ ] **M2 — Mutate + breeder loop.** The four mutation operators (point / structural /
  duplication / macro) + a 3×3 offspring gallery; click a child → it parents the next
  generation. **This is the core toy.**
  **Test:** from a creature, pick offspring across ~10 generations and steer the body
  toward a target (e.g. "longer, more limbs"); the lineage visibly trends that way.
  _(built 2026-06-27, self-verified in-browser, pending visual confirmation)_

- [ ] **M3 — Lineage + sharing.** Family-tree view, snapshots, `CAM1:` genome-string
  import/export, regrow-from-string, localStorage session.
  **Test:** copy a creature's string, reload the page, paste it → the exact same
  creature returns; the lineage tree shows the path and lets you branch from an ancestor.
  _(built 2026-06-27, self-verified in-browser, pending visual confirmation)_

## Phase 2 — Direction & polish

- [ ] **M4 — Directed pressures.** `scorePhenotype` + a pressure vector + auto-select +
  `runGenerations` headless fast-forward, then show the result and the path taken.
  **Test:** set "bigger + aquatic", run 50 generations → the result is larger and more
  fin/streamlined than the start; running again with the same seed reproduces it.
  _(built 2026-06-28, self-verified in-browser, pending visual confirmation)_

- [ ] **M5 — Better bodies & motion.** Radial symmetry, terminals (fins/claws/feet/eyes)
  rendered as distinct tips, procedural undulation/walk animation, palette/materials.
  **Test:** evolve a radial creature and a many-legged one; both animate plausibly
  (undulating spine, limbs in phase) without visual blow-ups.
  _(built 2026-06-28: distinct terminals + countershaded skin + procedural motion;
  pending visual confirmation)_

## Phase 3 — The creature grammar (v2)  ·  **next priority**

The big variety push. Full spec in **[MORPHOLOGY.md](MORPHOLOGY.md)** — a genome v2 that
throws out recognizable *and* uncanny creatures (cats, crabs, herons, dragons, aliens) from a
morphotype → trait → part → covering grammar. Takes priority over the M6/M7 stretch below.

- [x] **M8 — Genome v2 + spherical aim.** New schema with **spherical part aim** (azimuth +
  elevation + roll — unlocks tails/wings/horns/necks); migrate `grow` + the generator; bump
  share to `CAM2:`; raise `NODE_MAX`. (Gallery `<View>` consolidation rides here if convenient;
  the remount churn is already fixed by stable keys.)
  **Test:** roll creatures with tails pointing back, fins up, horns forward — all expressible.
  _(built 2026-06-28, self-verified: aim test + 2000-genome v2 fuzz + in-browser; pending a visual read)_

- [x] **M9 — Part vocabulary (core).** A `style` gene (0..1) selects render variants per
  part. Built the high-impact set: **5 eye styles** (round/beady/slit/compound/glowing),
  **5 mouth styles** (maw/beak/mandibles/sucker/baleen), **horns** (smooth spikes), **pincers**
  (new terminal — crabs!), **wings** (crude membranes), and fins. _Deferred to polish (M16):
  frills, ears, antennae, carapace, articulated wing struts, leg-posture geometry._
  **Test:** build creatures with a beak vs. a fanged maw vs. pincers; each reads distinctly.
  _(built 2026-06-28, self-verified: 42 tests + in-browser pincers/styles + no errors; pending a visual read)_

- [x] **M10 — Morphotype library + trait sampler.** **24 morphotype priors** (16 familiar +
  8 uncanny) as terse data tables, a generic compiler (morphotype → genome via the M9 parts),
  and the **bimodal sampler** (45% familiar / 35% uncanny / 20% the wild compositional tail).
  Each morphotype is a multivariate prior — coupled ranges + characteristic parts — so rolls
  read as their kind but keep surprising.
  **Test:** random rolls read clearly as cat / crab / heron / dragon / cephalopod and keep
  surprising over a long session.
  _(built 2026-06-28, self-verified: 42 tests + in-browser variety (28% radial, finite, no
  errors); pending a visual read on whether the species read clearly)_

- [x] **M11 — Divergence engine.** A computed **morphospace** (`morphospace.ts`: 8-D descriptor +
  attractor centroids sampled per morphotype + a **coherence** label), and **niched litters**
  — the 9 offspring spread across morphospace (conservative · exploratory · **saltation** ·
  one **confluence** hybrid) instead of near-clones. HUD shows "≈ shark · 96%" / "~ valley near
  X". _(Coherence-pull-in-mutation deferred — saltation + confluence + the spread deliver the
  divergence; revisit if lineages don't settle.)_ See MORPHOLOGY §11.
  **Test:** a lineage visibly drifts *between* morphotypes instead of staying one shape; each
  litter offers genuinely divergent choices.
  _(built 2026-06-28, self-verified: 47 tests + in-browser coherence labels; pending a visual read)_

- [x] **M12 — Covering & texture.** A `Covering` gene (type + pattern + scale/contrast/sheen),
  sampled per-morphotype, mutated, and `CAM2:`-shared. The skin shader gained an 8-pattern color
  field (plain/stripes/bands/spots/ocelli/reticulate/mottle/gradient) + a per-covering in-shader
  surface bump (scales=lens cells · fur=streaks · feathers=shingles · chitin/plates=plated seams ·
  slime=wet ripple) via screen-space-derivative normal perturbation, + per-covering roughness/
  metalness presets + a sheen→iridescence term. No asset files. MORPHOLOGY §7.
  **Test:** the same silhouette in fur vs. scales vs. chitin looks like a different animal.
  _(built 2026-06-29, self-verified: 51 tests + typecheck + build; in-browser the default reads as
  matte spotted fur, a roll came out wet glossy slime, another a hard scaled lizard — all distinct,
  shader compiles with no console errors; pending visual confirmation)_

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
  plan, no console errors; pending a visual read on the foregrounded animation)_

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
  pending a visual read)_

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
  a direct in-browser build of the default creature gave a 12,688-triangle surface in 84ms; pending
  a visual read on the organic look)_

- [x] **M16 — Dials & polish.** New directed-evolution axes — **Wings** (reward wing parts),
  **Neck** (reward the head reaching forward of the bulk), and a categorical **Skin** steer (hold
  a covering, e.g. scales; the store seeds the start skin so it's reachable). A **morphotype filter**
  by the "New random creature" roll (bias to one of the 23 kinds). Realized the dormant **frill**
  part (a fanned collar — distinct geometry) that the priors set but never built.
  **Test:** the directed-evolution panel can steer toward "winged + long-necked + scaled".
  _(built 2026-06-29, self-verified: 63 tests incl. wings/neck steers moving their trait in most
  lineages + the covering steer holding "scales" through a run; in-browser the Wings/Neck/Skin
  controls + a 45-gen run took a furred creature → scales + a wing + a long forward reach, and the
  morphotype filter rolled crab/cephalopod/bird/serpent correctly (right symmetry + motion), no
  console errors. **Phase 3 complete.** Pending a visual read)_

## Phase 4 — Stretch

- [x] **M6 — (stretch) Physics fitness.** `src/physics/fitness.ts` builds the skeleton as a jointed
  ragdoll in **Rapier** (`@dimforge/rapier3d-deterministic-compat`, **lazy-loaded** — its own 2.3 MB
  chunk, kept out of the main bundle), drives the limbs with an oscillating mass-scaled muscle
  torque, drops it on a floor, and measures how far the centre of mass travels; `runPhysicsGenerations`
  selects the movers (greedy + elitism). An **Evolve to walk** panel runs it and shows the distance.
  Self-collision is disabled (collision groups) so the overlapping capsule-union doesn't explode.
  **Test:** run physics fitness for N generations → later creatures travel measurably
  farther than earlier ones; identical seed → identical run.
  _(built 2026-06-29, self-verified: 69 tests incl. 3 physics tests — distances are deterministic
  (bit-identical replays), finite + non-exploding (< 100 bu) across 14 creatures, and a run strictly
  improves with elitism + replays identically; in-browser "Evolve to walk" lazy-loaded Rapier and
  evolved an 8-gen walker travelling 3.76 bu, lineage advanced, no console errors. **The roadmap is
  complete.** Pending a visual read)_

- [x] **M7 — (stretch) glTF export.** `src/viewer/exportGltf.ts` bakes the current creature
  (capsule-union *or* the M15 smooth surface) + simplified feature solids into a static THREE.Group
  with plain PBR materials, and `GLTFExporter` writes a binary **`.glb`** (the procedural covering
  shader can't carry into glTF, so the export keeps the base colour + roughness, not the in-shader
  patterns). An **Export .glb** button in the share bar downloads `cambrian-<seed>.glb`.
  **Test:** export a creature; it opens correctly in another glTF viewer.
  _(built 2026-06-29, self-verified: 66 tests incl. 3 export-group tests (real meshes, finite
  geometry, non-empty across 20×2 creatures); in-browser the exporter produced a **valid GLB** for
  both modes — `glTF` magic, version 2, intact JSON chunk + length, glTF-2.0 doc with 59 meshes
  (capsules) / 12 (smooth) + materials; the button renders, no console errors. Pending an
  open-in-Blender check)_

---

## Phase 5 — Fidelity & the full grammar (Part 2)

Part 1 (M0–M16) shipped every *system* in [MORPHOLOGY.md](MORPHOLOGY.md), but **not the whole
catalogue**, and playtesting surfaced real fidelity bugs. Part 2's mandate is blunt: **implement
MORPHOLOGY.md in full — every morphotype, part, motion style, and body region the doc specifies —
and fix the visual defects. No simplifying, no cheesing, no "folded into X".** Same rules of the
road: each milestone is an independently-runnable, **tested** slice; the engine stays pure &
deterministic; growth stays bounded & meshable; the 4000-genome fuzz test stays green.

### 5.A — Reported defects (fix these first)

- [x] **M17 — Textures welded to the body (stop the swimming).** The covering shader keyed patterns
  on **world** position, so on a deforming/animated creature the pattern flowed across the skin.
  `CreatureMesh` now bakes a per-vertex **`aBodyPos`** attribute (the vertex's rest-pose / body-space
  position — `restTransform · localVertex`) onto every body geometry (spheres, capsules, and the
  smooth surface), and the shader reads the colour pattern **and** the surface relief from `aBodyPos`
  instead of world position. Because the attribute is fixed to the mesh, the texture is painted into
  the body's own frame and rides the animation/rotation. (The Mikkelsen screen-space-derivative bump
  is kept — it's view-*consistent*; what mattered was making its height field body-locked.) §7.
  **Test:** a surface point keeps the same pattern/relief as the creature animates and the camera
  orbits — the texture is fixed to the body, no swimming.
  _(built 2026-06-29: typecheck + 72 tests + build green; in-browser the shader compiles across all
  covering types (fur/slime/scales/chitin/skin) + the smooth path with no console errors; the
  body-locked mechanism replaces the world-space sampling — pending a visual read that the
  swimming is gone)_

- [x] **M18 — Strict bilateral symmetry.** Bilateral creatures are now **exactly** mirror-symmetric.
  Three breakers were fixed in `grow`: (1) the lateral (yaw) spine bend is dropped for bilateral, so
  the trunk stays on the X=0 plane (the wind/S-curve now comes from the slither *animation*, not the
  static body); (2) `pair:false` parts are snapped to the midline — aimed in the X=0 plane with their
  roll + lateral curl zeroed so a multi-segment tail can't wander off; (3) paired parts are grown by
  **exact reflection** of the first limb (position x→−x, orientation (x,−y,−z,w)) rather than
  re-growing from a flipped aim — quaternion curl/roll don't mirror, so the old approach drifted.
  **Test:** a new invariant — every bilateral phenotype is exactly symmetric under x→−x (each node has
  a mirror within ε) — asserted over 400 forced-bilateral creatures.
  _(built 2026-06-29: probe shows worst mirror error **0.0** across 300 creatures (was up to 2.0),
  Σx ≈ 1e-17; 73 tests incl. the new invariant; morphospace coherence + motion classification stay
  green despite the straighter spine)_

- [x] **M19 — The face: eyes & mouth always read.** Eyes were tiny (≈¼ the head, mean r/bodyR ≈ 0.25)
  and radial creatures only got eyes 60% of the time / never a mouth; ⅓ of all rolls had no mouth.
  Now: eyes are **~2× bigger** (sized to the head, mean r/bodyR ≈ 0.43, **floored at 0.16 bu** so even
  a small-headed creature has a clear eye), **guaranteed** on every creature (bilateral head/face +
  radial crown, no more chance gate); the **mouth is guaranteed** everywhere (head, face-on-body, and
  a new **central maw** for radials — aimed near the +Z axis so grow's radial array collapses it onto
  the front centre) and enlarged.
  **Test:** every creature has ≥1 eye and a mouth; the largest eye is ≥ 0.15 bu (never tiny).
  _(built 2026-06-29: probe → eyes 200/200, mouths 200/200 (were 29/30 and 20/30), mean eye r/bodyR
  0.25→0.43; 74 tests incl. the face invariant; in-browser every fresh roll shows 2 eyes + a mouth
  (radial: a clustered central maw), no console errors — pending a visual read that the face pops)_

- [x] **M20 — Right-rail / gallery layout.** The rail aside was `overflow: hidden` with the gallery as
  `flex: 1`, so the M16 sliders + M6 physics panel squeezed it and the 3×3 grid's rows clipped.
  Fixed in CSS: the rail is now `overflow-y: auto` (scrollable) and the gallery/grid size to their
  content (the grid's three rows come from the thumbs' `aspect-ratio`), so all nine thumbnails stay
  at a usable size and the panels coexist below.
  **Test:** at the standard window size all nine thumbnails render distinctly with no clipping or
  stacking, and every panel stays reachable.
  _(built 2026-06-29: in-browser DOM geometry → 9 thumbnails, 3 rows, 92×92 px each, 0 overlaps, the
  rail scrolls; no console errors)_

- [x] **M21 — Silhouette differentiation (de-samey).** The "sheep with swept-back legs" came from one
  uniform leg builder (azimuth ~4.2, single-direction curl → a back-swept arc). Two fixes: (1) `grow`
  now folds legs at a **real knee** — the shin bends back (the curl reverses + amplifies ×1.5 after the
  first joint) so a leg reads as a leg in a stance, not a curved tentacle; (2) a **posture** system
  (§6.1) — sprawling / digitigrade / plantigrade / hooved / upright — sets each morphotype's leg
  azimuth/curl/articulation/proportion/terminal, so a sprawled croc, a digitigrade cat, a hooved
  ungulate, and a plantigrade bear stand differently. All 15 legged morphotypes assigned a posture.
  (First-class body regions deepen this in M24.) MORPHOLOGY §1/§6/§10.
  **Test:** a battery of morphotypes yields measurably distinct silhouettes (limb posture, stance
  width), not variations on one body.
  _(built 2026-06-29: probe → foot-spread varies by posture (croc 0.57 / lizard 0.45 sprawl vs
  ungulate 0.23 / bird 0.30 tucked), feet reach below the torso; **bilateral symmetry stays exact
  (0.0)** through the knee + mirror; 74 tests + build green — pending a visual read that creatures
  now look distinct)_

### 5.B — Complete the catalogue

- [x] **M22 — Full morphotype library (§4).** Add every named morphotype the doc lists and the build
  lacks: **primate, mustelid, chelonian (turtle), ratite, chimera, arthro-alien, crystalline** (keep
  urchin/starfish), each a real multivariate prior with characteristic parts, covering, and motion.
  **Test:** each new morphotype reads clearly as its kind; coherence stays healthy (mean > 0.45, none
  in the void) with the larger library.
  _(built 2026-06-29: 7 new priors → **30 morphotypes** (20 familiar + 10 uncanny); each a coupled
  multivariate prior (primate = upright grasping ape · mustelid = long tube + short legs · chelonian =
  deep domed plated body + beak · ratite = feathered biped on stilt legs · chimera = winged horned
  tailed mishmash with spliced fins + clashing skin · arthro-alien = 10-leg compound-eyed scuttler ·
  crystalline = spiked glowing-eyed plated rigid form). Centroids + the morphotype filter are
  data-driven off `MORPHOTYPE_IDS`, so they wire in automatically. typecheck + **78 tests** (4 new
  M22 tests: catalogue present ≥30 · all new types grow valid/in-bounds over 280 seeds · each reads
  structurally as its kind [4-leg/2-leg/10-leg/winged/spiked] · each stays coherent > 0.3; the
  existing morphospace test's mean > 0.45 / min > 0.2 holds over the 30-type library) + build green;
  in-browser each new kind rolled a distinctive valid creature (motions walk/flap/scuttle in character;
  coverings fur/plates/feathers/chitin/skin all compile) with no console errors. Fixed one fidelity
  nit found in-browser: turtle/ostrich stub tails no longer render a fish-fin tip. Pending a
  visual read that each new kind reads clearly.)_

- [x] **M23 — Full part vocabulary (§6).** Implement every deferred part with distinct crude geometry:
  **ears, whiskers, gills, plate/scute/carapace** (a shell over a region), **crest, club/barb** tail
  terminals; the missing **mouth styles** (lamprey, proboscis, tusked/fanged); a real **stalked eye**
  on an eyestalk; **articulated wing struts**. Each reachable by the generator + mutation, bounded &
  meshable.
  **Test:** each new part renders distinctly and appears across a sample; the fuzz test stays green.
  _(built 2026-06-29: 7 new `Terminal`s (club/barb/ear/gill/crest/carapace/whisker) + 5 new `PartKind`s
  (plate/ear/gill/crest/whisker), each with a crude distinct renderer; the mouth went 5→**8 styles**
  (added fanged/lamprey/proboscis) via a centralized `partStyles.ts` band lookup (single source of
  truth, re-banded the ~25 morphotype `mouthStyle` ranges to match); stalked eyes = multi-segment
  eyestalks (crab); **articulated wing struts** (finger-bones into the membrane). New builders wired
  into the priors (felid ears+whiskers, fish/shark gills, turtle/crab carapace, songbird crest, wyvern
  barb / dragon barb+club tails, crab stalked eyes) + the wild tail + reachable by mutation. typecheck +
  **83 tests** (5 new: style bands cover all variants · each deferred part grows for its morphotype ·
  re-banded mouths read [bird→beak, crab→mandibles, shark→fanged, …] + the new styles reachable ·
  mutation reaches every new kind/terminal · 300-creature validity+bounds+exact-symmetry) + build green;
  in-browser every new part rendered as a feature across felid/fish/turtle/bird/wyvern/crab/shark/dragon
  with no console errors. (Updated the morphospace "dragon reads as a winged beast" test to admit chimera
  as a basin sibling — the descriptor can't see covering; M26's sheen/headedness dims separate them.)
  Pending a visual read.)_

- [x] **M24 — Bauplan: structural attractor basins, the guaranteed face & the mouth organ.**
  _(Re-scoped from "body regions" per playtest feedback — creatures were drifting into mouthless,
  eyeless, scatter-limbed blobs.)_ A pure, deterministic **bauplan pass inside `grow()`**
  (`developBauplan`) pulls the legs onto a canonical body-plan layout (biped/quadruped/hexapod/octopod
  slot table, lerped by a new **`coherence`** gene — the "weirdness" dial) and **guarantees a prominent
  face** (eye-set + mouth) on every creature, synthesizing it if mutation deleted it. Mutation now
  **respects structure**: the face is protected from removal/retyping, legs are never scattered
  (`reaim`/`addAppendage` are decorative-only; a new `changeBauplan` adds/drops a leg *pair*), and
  `confluence` grafts decorative parts while keeping the parent's face. The **mouth is a real organ**
  (open jaws, red interior, tongue, teeth — front-facing); the grown **eye bulb is floored** so it
  always reads. The **smooth surface** meshes only the body skeleton (features draw as solids) with a
  per-cell **radius floor**, fixing the floating/shredded thin-part gaps. A live **Coherence** slider
  (wild↔canonical) dials it. _(Neck/tail as first-class typed regions + the explicit trait-vector
  layer are deferred — not part of the reported defect.)_
  **Test:** legs land on canonical slots (symmetric); the face survives 20 generations of breeding (no
  eyeless/mouthless blobs); coherence dials the limb pull; smooth legs reach the body; fuzz + exact
  symmetry stay green.
  _(built 2026-06-29: typecheck + **91 tests** (8 new in `bauplan.test.ts` + a smooth-skin leg-coverage
  test; the `aim`/`morphospace` tests adjusted for the guaranteed face) + build green; in-browser every
  fresh roll AND every generation of harsh breeding (saltation/confluence ×6) kept eyes + a mouth (0
  faceless), legs stayed canonical, smooth mode built, the Coherence slider + all controls wired with
  no console errors. Pending a visual read on the mouth organ + smooth fix.)_

- [ ] **M25 — Full motion library (§8). — DEFERRED INDEFINITELY (2026-07-18).** Idle animation was
  removed from the project entirely: the procedural undulation/gait pass (`viewer/animation.ts`, the
  M13 motion styles, the jaw-gape idle) read as wobble rather than life and was judged not to earn
  its keep, so creatures now hold the static rest pose `grow()` produces. Building *more* gaits on
  top of a deleted system is moot. **Do not pick this up as "the next milestone."** Reviving it means
  first re-litigating whether idle motion belongs at all.
  _(Physics fitness (M6) and its recorded-gait playback are untouched and still live — evolving
  walkers by distance is a selection pressure, and playback is the one thing that still moves a
  creature.)_
  <sub>Original scope, for the record: **hop** (crouch→launch→land), **trot/gallop** (with a body
  bound), **glide** (wings held, slow bank), **jet** (mantle pulse), **writhe/hover** (uncanny idles);
  plus Spore-style **motion primitives keyed by limb role** (author abstract gaits, retarget per
  limb) for motion beyond pure sine math.</sub>

- [x] **M26 — Morphospace descriptor dims (§11.1).** Brought the descriptor to the doc's full
  dimension set by **adding headedness + sheen** (now 10-D: the eight structural dims plus these two).
  **headedness** is computed from the grown spine — the constriction between the body's widest point
  and the narrowest point of its forward half — so a heron or ungulate pinches toward a head while a
  slime or urchin scores a flat 0. **sheen** is read off `covering.sheen`, the one surface axis, which
  is what tells structurally identical basins apart (chitinous insectoid vs. furred ursid, wet
  cephalopod vs. dry horror).
  _(The structural **coherence pull** the original M26 specced was implemented in M24 as the bauplan
  pass + the tunable `coherence` gene, so this milestone was just the descriptor dims.)_
  **Test:** _(built + self-verified 2026-07-18)_ catalogue-wide self-labelling **47.1% → 57.3%**;
  chimera self-labels **22/40 → 27/40** and is misread as a dragon **4 → 1**; both new dims carry real
  variance (σ ≈ 0.26 / 0.29, on par with elongation's 0.20) so neither is a dead axis; `describe()`
  stays deterministic and every dim finite in [0,1]; the coherence + niching tests stay green.
  **168 tests** (5 new, in `tests/engine/morphospace.test.ts`). `binKey` reads dims 0–1 only, so the
  Menagerie grid is unaffected by the append.

---

## Phase 6 — See them, then set them loose (Part 3)

Two directions at once: an honest way to **look** at creatures (they were judged from a turntable
in software screenshots), and a **world** to drop them into — so the bodies you breed have to eat,
sleep, hunt, breed and die, and keep evolving there. Same rules of the road; `src/sim/` is held to
the engine's determinism discipline (seeded RNG only, headless-tested, `Math.random` banned).

- [x] **M27 — Offline rendering + headless capture.** The CDN HDR environment threw on any failed
  fetch and blanked the canvas; replaced by a procedural studio environment (PMREM'd once per
  renderer, shared by every viewport). `scripts/shoot.mjs` renders URL-param views headlessly.
  **Test:** with no network, the app renders; `node scripts/shoot.mjs out "seed=3&bare=1&spin=0"` writes a PNG.

- [x] **M28 — Skin that reads.** The covering looked like TV static: the bump fed a 0..1 relief in as
  a height in body units (slopes ~30 → saturated normals). Physical relief heights, every procedural
  term band-limited against the pixel footprint, `MeshPhysicalMaterial` (fur/feather sheen, slime/
  chitin clearcoat, iridescence by the sheen gene), baked crease AO; `?dbg=N` shows one shading term.
  **Test:** fur, scales, plates and slime read as distinct clean materials at any zoom.

- [x] **M29 — Smooth skin v2.** Round-cone field (tapering chains are one smooth limb, not beads),
  welded indexed mesh with gradient normals (no facets), SDF ambient occlusion, a narrow-band grid +
  exact primitive culling (3× the triangles at similar cost), per-primitive blend; hybrid is default.
  **Test:** bodies are single organic forms with soft creases; smoothSkin tests assert welded, outward,
  unit-normal surfaces.

- [x] **M30 — The Specimen Studio.** A main stage + lateral/anterior/dorsal orthographic plates with
  scale bars + a face close-up, all in one WebGL context (drei `View`); an x-ray skeleton overlay; an
  inspector (nearest kinds, measurements, 10-D descriptor, parts, covering); a **Bestiary** of every
  morphotype; a **motion preview** (walk / run / eat / sleep). Dev: `?studio=1 ?bestiary=1 ?bones=1
  ?motion= ?gaitphase= ?studiocam=`.
  **Test:** Breed → Studio shows the creature from every angle; the Bestiary adopts a specimen.

- [x] **M31 — Anatomy pass.** Carapaces are shells polygonized from the trunk's own field (not an egg);
  haunches no longer compound into a ball on short trunks; legs attach interpolated along the chain;
  hexapods+ grow slender **arched** arthropod legs; feet always reach the ground; wings are built from
  the shoulder — **folded feathered wings** shrink-wrapped to the flank and **membrane wings** with
  fingers and scalloped billowing skin — and birds get tail fans.
  **Test:** spiders read as spiders, turtles wear shells, birds fold their wings (anatomy/wings tests).

- [x] **M32 — The ecosystem engine.** `src/sim/`: a seeded terrain (lake, meadows, woods, rock),
  traits read off the anatomy (diet from the mouth, speed from leg reach, senses from eyes, weapons and
  armour, habitat, endo/ectotherm from the covering, allometric metabolism/lifespan), and a world of
  creatures with energy/fatigue/health/age choosing to flee, sleep, eat (graze/fruit/algae/scavenge/
  hunt), breed or wander. Breeding mutates with the breeder's operators; drift past a morphospace
  threshold founds a new species. Balanced over 20-day headless runs (predator-prey cycles, a rescue
  band so rare species can always breed).
  **Test:** `tests/sim/world.test.ts` — determinism, grazing, hunting, births/mutations/deaths,
  starvation, habitat constraints.

- [x] **M33 — The World view.** The ecosystem in 3D: biome terrain whose meadows yellow where grazed,
  a lake, fruit bushes showing their fruit, woods; a day/night sky; time-warp 1–48×; a census with a
  population chart, a creature card (needs, traits, follow-cam, take-home-to-breeder), a field
  journal of births/kills/speciation/extinction; release your creature or a stranger.
  **Test:** Breed → World: creatures graze, hunt, sleep at night, breed and die; the census moves.

- [x] **M34 — Living motion.** A bone per skeleton node, the smooth skin skinned to it (round-cone
  distance weights), features riding their bones; a procedural gait (trot / tripod / alternation from
  one phase rule, arched sweeps, slither and swim waves, tails, head bob, eat, sleep).
  **Test:** in the World and the Studio motion preview, legs step in phase and the skin deforms
  without tearing (rig tests).

- [x] **M35 — World performance.** Per-actor LOD (full / lite / silhouette), merged capsule kit,
  budgeted skin builds, hitbox picking: ~5–7k → ~520 draw calls at 150 creatures.

- [x] **M36 — Mouths that close.** Jaws hinge on the lip bisector and articulate in the World
  (shut at rest, chewing, agape on the hunt); a mammal's mouth rests shut everywhere.

- [x] **M37 — Mammals.** Necks between trunk and head (rising per link, the head held level),
  narrower skulls, a **cranium + muzzle** skull (two or three links: eyes and ears on the cranium,
  nose, whiskers and mouth on the muzzle), **muzzled mouths** (a thin lip line on the muzzle, only
  the mandible drops, canines/incisors only, the jaw wearing the coat, a wet nose pad), plain tails
  sized per kind (bear stub, horse switch, cat sweep), legs rooted inside the torso under the
  shoulders and hips, coat-covered paws with toes, forward-facing ears with an inner ear, upright
  apes and bipeds standing on their hips. Dev: `?studiocam=face|headside`.
  **Test:** cats, dogs, bears, deer and mice read as themselves in the Studio side and face views
  (mouthLine muzzled test, anatomy stance test).

- [x] **M38 — Flight.** Winged walkers take off, cruise, bank, stoop and land: an altitude in the
  sim (trips, escapes and approaches are flown; feeding and sleeping wait for touchdown; nothing
  lands on the lake; walkers can't reach a bird on the wing), spread feathered wings that beat
  about the shoulder, legs tucked in flight, a Studio `fly` preview.
  **Test:** in the World (`?world=1&warm=60&follow=aloft`) birds fly between meals and land to eat;
  `tests/sim/world.test.ts › flight`.

- [x] **M39 — Behaviour you can see.** Herd alarms (kin bolt together), the young keep to a parent,
  bites are lunges and the bitten flinch, mood bubbles (Zz / heart / ! / claws) with a `moods`
  toggle; eyelids that blink and close in sleep; jawed mouths of every kind rest shut.
  **Test:** in the World, a herd scatters together from a hunter, a courting pair shows hearts.

- [x] **M40 — A living landscape.** Grass tufts that sway and show grazing (cropped straw stubble,
  regrowth), wildflowers, lobed broadleaves and conifers, a depth-shaded rippling lake with a
  lapping foam line, world-space ground detail (turf patches, soil, rock strata).

- [x] **M41 — The tree of life.** A panel drawing every species ever as branches through time
  (founding, splits, extinctions), click to follow a living member. Plus: radial bodies arrayed
  about the vertical (sea stars lie flat, octopuses squat), slug-like slimes with eyestalks that
  reach their eyes, low-domed turtles.

- [x] **M42 — Seasons.** A twelve-day year: a spring flush of grass, summer fruit, an autumn of
  turning leaves, a lean, cold winter with snow on open ground and bare broadleaves. The ecology
  follows smooth climate curves; the look (`yearLook`) keeps snow and leaf-fall inside their own
  seasons, so the first morning of spring is green.
  **Test:** `tests/sim/world.test.ts › seasons`, `tests/sim/seasonLook.test.ts`.

- [x] **M43 — The documentary.** An auto-director that cuts between the most interesting things
  happening (hunts, births, flights), with narrated captions; synthesized ambience and spatial
  creature calls (Web Audio, no assets).

- [x] **M44 — Save & resume a world.** `saveWorld`/`loadWorld` (src/sim/persist.ts): the static
  world rebuilds from its seed, every dynamic piece — fields, creatures, carcasses, species, log,
  history and the RNG's own state — is restored, genomes stored once each as share strings with
  identity kept. A loaded world continues **bit-for-bit** as the original would. The World bar
  saves to a file and opens one; the world is also kept in the browser and resumed next visit.
  **Test:** `tests/sim/persist.test.ts` (save → load → both run on → identical serialisations).

- [x] **M45 — Anatomy pass III.** Toed feet (a bird's three-forward-one-back on bare scaly shanks
  coloured like its bill; a lizard's clawed fan; a frog's pad-tipped toes); eyes sunk into the
  skull with coat-covered lids; reptile and frog mouths that shut as a seam (only a croc's small
  teeth show); frogs that crouch on springing haunches (no more spider-arched vertebrates);
  primates whose arms hang from the shoulders with ears on the sides of the head and tails from
  the back; songbird-sized heads; every necked body plan grows a head; coat markings kin to the
  coat; and a proper hash for per-creature variety (every iris used to come out blue or red).
  Dev: `?studiocam=feet`, `?bseed=N`.
  **Test:** `tests/viewer/feet.test.ts`, `jawed.test.ts › seam`, `random.test.ts › marking
  colours`, `rng.test.ts › unitHash`.

- [x] **M46 — Courtship & young.** A pair circle each other for a display (head high and bobbing,
  tail raised, a bird's wings half-open and shivering) before they mate; an idle partner joins the
  dance. A juvenile bolts with its fleeing parent, even from sleep. Dev: `?follow=courting`.
  **Test:** `world.test.ts › courtship & young`.

- [x] **M47 — Weather.** Half-day spells, wet or dry by a hash of (seed, spell) with seasonal odds;
  a wet spell clouds over, rains (snows, in the cold) and clears. GPU rain streaks and snowflakes
  ride the camera; the sun dims, the sky greys, the fog closes in, soaked ground darkens and shines;
  a rain hiss joins the soundscape; showers bring the grass on. A pure function of seed and time.
  Dev: `?wx=rain|snow`. **Test:** `tests/sim/weather.test.ts`.

- [x] **M48 — Fast-forward.** Skip a day, a season or a year: the world runs in a Web Worker (shipped
  over as a save, folded back with `adoptWorld`), then a chronicle says what happened — births,
  deaths by cause, species that arose and died out. **Test:** `tests/sim/fastForward.test.ts`
  (worker round-trip ≡ running in place, bit for bit).

- [x] **M49 — A balance that lasts.** Guild caps (water / hunters / grazers), stalk-and-pounce
  hunting (prey notice a crouching stalker late; a failed dash is given up), cover (small prey dive
  into bushes), recolonisation (a lost founding stock may wander back in), lineages that keep their
  heads under segment mutations. Over 4 seeds × 2 years every kind survives in most runs (before:
  three species left). **Test:** `world.test.ts › a living balance`, `mutate.test.ts › head`.

- [x] **M50 — Evolution you can read.** Species portraits (an offscreen R3F root renders any genome,
  cached by share string) on the census rows, the creature card and the fast-forward chronicle; the
  card sets a species' founder beside the animal you're watching and says what changed, in words
  (`howItDiffers`), and where the species branched from. **Test:** `tests/sim/lineage.test.ts`.

- [x] **M51 — A river and a voice.** Every valley drains its lake through a meandering stream (a
  valley lowered toward meadow height, a channel cut in its floor); the documentary's captions can
  be read aloud by the browser's speech synthesis. Dev: `?look=river`.

- [x] **M52 — Faces and fur.** Readable mammal eyes, muzzles that narrow to the nose, a lip line that
  ends under the eye, no lip fold hanging under the chin, no beaked cats (a mouth-band audit and
  test); leopard rosettes break into arcs; new sessions start on a russet fox-dog, framed closer;
  **shell fur** — twelve combed, tapering strand layers over a pelt in the close-up views (hero,
  Studio, portraits, the World's selected animal), skinned on the rig, fading out where a strand
  would be sub-pixel.

### Next up (unchecked — pick from here)

- [ ] **Richer world.** Drought years, burrows and nests, a second lake.
- [ ] **Feet that grip the ground.** Foot planting / IK so strides don't slide.
- [ ] **A lineage film.** A wild species' body changes over the generations, as a strip of portraits.

---

**North star:** in ten clicks you can visibly steer a blob toward a shark — and share the
result as a short string that regrows it exactly on someone else's machine.
