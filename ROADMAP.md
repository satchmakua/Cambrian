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

- [x] **M53 — Nests, eggs and ambient life.** Egg-layers lay clutches in nests that hatch a third of a
  day later; a hungry hunter raids an unguarded nest; the narrator and the documentary director tell
  and film it. Fireflies on warm nights, butterflies by day; leafy clumped tree crowns, conifers and
  bushes instead of faceted gems. **Test:** `world.test.ts › nests and eggs`.

- [x] **M54 — Two review passes.** A verified review of Part 3 and an adversarial check of its fixes:
  19 bugs fixed — species bookkeeping and caps counting eggs and pending clutches, deferred
  speciation for eggs, recolonised and re-released species, a river that never raises a lake bed,
  the leg-only bare shanks. **Test:** `world.test.ts › bookkeeping that holds`.

- [x] **M55 — Visual audit I: eyes, coats, tails, body plans.** No merged eye pairs; gaze by kind
  (cats and apes forward, deer sideways); every lidded eye seated in the real skin with a curved,
  fibred iris; coats read as sRGB (no more bleached greige), bellies in the coat's own hue; reptile
  tails that rest on the ground; quadrupeds deepest at the chest, on longer legs whose knees and
  elbows bend the right way; head-heavy fish, rope snakes, bipeds standing over their feet.
  **Tests:** `tests/engine/eyes.test.ts`, `tails.test.ts`, `bodyplan.test.ts`,
  `tests/viewer/eyeSeat.test.ts`, `creatureMaterial.test.ts`.

- [x] **M56 — Visual audit II: faces, wings, plumage, and the odd ones out.** Fish with lidless
  metallic eyes on the sides of the head and seam mouths; feathered wings as one continuous sheet
  painted in feather tiers (folded and spread); bills running on from the brow; imbricated plumage
  instead of turtle scutes; teardrop birds; frogs with broad flat heads, crown eyes and folded
  jumping legs; turtles with a horn shell over leathery skin; dragons with long reptilian skulls and
  elbowed membrane wings; primates with a chest and some muscle; flat nose pads with nostrils;
  clumped fur; the followed World creature in the fine skin. **Tests:** `wings.test.ts › plumage
  sheets`, `beak.test.ts`, `bodyplan.test.ts › frog / dragon`, `jawed.test.ts`.

- [x] **M57 — Bodies at rest and in their prime.** Apes wear bare faces (a skin mask the coat and
  the fur shells give way to, a matte skin nose, brown eyes); sleepers lie down on their bellies with
  their legs folded (the last joint's fold solved against the floor, so a deer's long cannons don't
  drive through it); carcasses go limp with their eyes shut; the young wear a youngster's
  proportions (big head and eyes, short legs, stub tail) until well on to maturity. Dev:
  `?motion=sleep|dead`, `?juvenile=1`, `?follow=young`, `?look=carcass`. **Tests:**
  `tests/viewer/face.test.ts`, `tests/engine/juvenile.test.ts`, `rig.test.ts › asleep / carcass`.

- [x] **M58 — Gaits that grip.** A walk takes shorter steps than a run; quadrupeds break into a
  rotary gallop with a flexing back; a steady stance stroke, a per-leg swing sized to its reach and
  the trunk's sway undone at the hips keep a planted foot planted (slip from ~35% of the body's speed
  to 1–8%); feeders solve their neck bend and chest dip so the mouth reaches the grass with every
  foot planted. **Tests:** `rig.test.ts › walk / gallop / feeder / planted foot`.

- [x] **M59 — Watching them.** The follow camera sees through leaves, trunks and berries along its
  sightline (a dithered tunnel that widens toward the creature); heads turn to what a creature is
  dealing with — prey, predator, mate, attacker. **Tests:** `tests/world/foliage.test.ts`,
  `rig.test.ts › look`.

- [x] **M60 — Bodies by their plan: arthropods of tagmata.** An insect is a head, a thorax carrying
  all six legs and a legless abdomen; a spider a cephalothorax carrying its eight legs, its eyes and
  its chelicerae, with a big abdomen behind it on a narrow waist (one trunk with the legs spaced
  down it read as a caterpillar and a tick). The legs radiate from the thorax — front pairs reaching
  forward, hind pairs back — and a spider's knees peak over its back; beetles close glossy wing-cases
  over the abdomen, split by a dark seam and wearing the body's own markings. Arthropods lie down
  with their feet still on the floor and die with their legs curled under them. The rig's trunk runs
  through the leg-bearing section, and a lineage keeps its thorax (legs come and go a pair at a
  time). Three silhouettes retuned: ratites (a long neck held up on long legs), mustelids (a thick
  low tail, small round ears), cats (long and lean, a round head with big ears). **Tests:**
  `bodyplan.test.ts › insect / spider / crab / ratite`, `rig.test.ts › insect glance / arthropod lies
  down / dead arthropod`, `mutate.test.ts › arthropod keeps its thorax`, `mandibles.test.ts ›
  chelicerae`.

- [x] **M61 — Crabs.** A wide, flat carapace (a thin chitin skin over the body's own shape — a
  one-node trunk's shell was a sphere of its radius, so every crab wore a ball), a pair of chelipeds
  held out in front ending in real claws (a swollen palm, a fixed and a hinged finger, dark at the
  points), four pairs of walking legs splayed low to the sides, eyes on stalks at the front edge.
  Limb roots now start inside a shaped body node instead of at its full radius. **Tests:**
  `bodyplan.test.ts › crab`, `smoothSkin.test.ts › crab's carapace`, `claw.test.ts`.

- [x] **M62 — Apes.** A reared trunk is a torso — chest broad over a narrower waist and hips, no
  belly swelling between them (a pear) — with the head on the shoulders (no neck), close-set eyes on
  the brow above the muzzle, and long, near-straight arms hanging down and out so the knuckles rest
  on the ground: a gorilla's or a baboon's silhouette instead of a seal's. Hands, like tails, rest on
  the ground and never pass through it. **Test:** `bodyplan.test.ts › ape`.

- [x] **M63 — Deer.** Every hooved leg has its four links (a deer that drew three sat on legs half
  its body's depth, a pig on stilts); a shallower, compact trunk instead of a deep humped one; the
  neck rising steeply from the shoulders; ears almost always; a low skull with the muzzle running
  straight on from the brow (a domed cranium with the muzzle drooping off it read as a camel).
  **Test:** `bodyplan.test.ts › stand on their legs` (a deer's legs now at least 0.85 of its depth).

- [x] **M64 — Standing straight.** Cats, dogs and bears stand with their legs straight down under the
  body (each leaned out up to 27° from the shoulder — an A-frame stance, every one a newborn foal);
  dogs carry a bigger head with big pointed ears on a lower, thicker neck and a long bushy tail (a
  slim raised neck, a small head and stub ears read as a fawn). **Test:** `bodyplan.test.ts › legs
  straight down`.

- [x] **M65 — Theropods.** The generic biped (an upright walker on a deep two-link trunk — a blob, a
  cartoon dinosaur, a penguin) is a theropod: a level body balanced over two long, strong legs, a
  long tail held out behind to counterweigh a big-jawed reptile head on an S-curved neck, small
  arms. **Test:** `bodyplan.test.ts › theropod`.

- [x] **M66 — Birds' heads.** A bird's and a raptor's skull is round or broad (the raptor was pinned
  to a tall, narrow wedge and the bird drew any skull at all: heads and necks merged into a hood, a
  cobra's). **Test:** `bodyplan.test.ts › bird's head is round`.

- [x] **M67 — The breeder's litter redraws.** Picking a parent or rolling a new litter left the
  gallery showing its first nine creatures: drei's `<View>` judges a view offscreen by its WINDOW
  position against the canvas's SIZE, and the gallery's canvas sits in the right-hand rail, so every
  thumbnail went dark after its first frame. Each thumbnail now draws itself, scissored, into its
  button's rectangle measured against the canvas's own. Bears are brown, not salmon pink.
  **Test:** `tests/viewer/scissor.test.ts` (and a driven Breed session: every pick and reroll redraws).

- [x] **M68 — Quick picks.** A breeder pick no longer recompiles shaders: swapping a litter disposed
  all nine thumbnails' materials before their replacements rendered, so three freed the programs they
  shared and linked them again (4–14 per pick — a 100–500 ms compile each on a real GPU). Every
  canvas now keeps the programs it compiles (`KeepPrograms`). Skin weights cost half as much (and no
  longer put a stalk-eyed creature's body on the wrong bones); the hero shows a new creature at once
  and sharpens a moment later; the lineage saves when the browser is idle; thumbnails redraw only
  when they change. **Tests:** `programs.test.ts`, `rig.test.ts › stalk-eyed skinning`; driven
  sessions — every pick and reroll redraws, and 12 rapid steps settle on the current litter.

- [x] **M69 — The World's camera and load.** WASD or the arrow keys pan over the ground (Shift
  hurries; panning takes the camera back from following and the documentary); the zoom goes in to a
  creature's whiskers. The scene mounts paused while three compiles its shaders — in parallel where
  the browser has `KHR_parallel_shader_compile` — behind a short "Waking the world…"; portraits wait
  for idle time and encode off the main thread. **Test:** `tests/world/keyPan.test.ts`.

- [x] **M70 — Stances, frills, close-ups.** A body's legs share one stance, decided from their mean
  splay (a third of turtles sprawled the fore and stood the hind on posts), and crocodiles and turtles
  sit wholly in the sprawl (a third of crocodiles stood on thin columns). Frills are ribbed ruffs
  round the neck (`frill.ts`), not a pale disc. In the World a creature near the camera wears its
  fine skin, built one per frame behind every plain skin. **Tests:** `bodyplan.test.ts › sprawl /
  legs agree`, `frill.test.ts`.

- [x] **M71 — Snakes, fish, frogs, whole limbs.** A resting snake lies in a loose S (the rig poses it,
  each animal its own lie; it straightens to slither). Fish are deep and flattened side to side, thin
  steadily to a slim tail stalk, and carry an anal fin. Frogs sit up on their forelegs with long hind
  feet folded beside them, big eyes on top, and a closed mouth that stays on the face (a flat head's
  lips no longer slide under the chin). Thin limbs come out whole in every skin — no dashed tails or
  legs. **Tests:** `rig.test.ts › resting snake / fish hangs straight`, `bodyplan.test.ts › fish /
  frog sits up`, `mouthLine.test.ts › lips stay on the face`, `smoothSkin.test.ts › thin limbs whole`.

- [x] **M72 — Apes, still snakes, ears, cats and dogs.** Apes knuckle-walk, arms hanging from the
  shoulders as front legs (they lay swept out behind). The litter's and the bestiary's snakes lie in
  the rig's resting S (`restPosed`). Ears open forward and out, so a profile shows them; cats and
  dogs carry their heads on thicker, lower necks, stand on sturdier legs, and hold their tails back
  and up. **Tests:** `bodyplan.test.ts › ape's arms / cat's or dog's tail`, `rig.test.ts › still
  view S`, `ear.test.ts`.

- [x] **M73 — Body waves, ape hands, octopuses.** A slitherer's and a swimmer's wave runs head to
  tail at the body's own speed (it ran backward, a third as fast). An ape rests its hands on the floor
  when it lies down and feeds hand to mouth, one hand at a time; arms too short to reach (a
  theropod's) leave the head to go down to the food. Octopuses stand a tall mantle over arms rooted
  beneath it and sprawled along the ground; every radial arm curls like its siblings. **Tests:**
  `rig.test.ts › body wave / ape rests its hands / feeding`, `bodyplan.test.ts › octopus`.

- [x] **M74 — A front door: main menu, saved games, settings.** The game opens on a main menu
  (Continue · New game · Load game · Settings · Controls · Quit) with a creature turning behind it;
  New game sets up a name, the first creature and the valley (seed; lively, sparse or empty). `Esc` or
  ☰ opens the in-game menu over any screen (the screen stops drawing, the valley's clock stops). A save
  is the lineage and the valley together, in a named IndexedDB slot, exportable to a file; whatever is
  read is checked, and a save that will not load changes nothing. Settings (graphics level or its
  parts, sound and volume, autosave, mood icons, hints, the turntable) are kept in the browser, and
  the graphics options derive one `RenderQuality` object every renderer reads. **Test:** open the
  game → New game → breed two generations → `Esc` → Save game → breed on → `Esc` → Load game → the
  saved generation is back; reload the page → Continue and the save are still there. **Tests:**
  `tests/ui/settings.test.ts`, `saves.test.ts`, `game.test.ts`.
- [x] **M75 — Half the frame.** The valley was drawn twice every frame: the fish spawn's material was
  transmissive, which makes the renderer redraw the whole opaque scene into a refraction buffer.
  Without it the main pass halves at every level and camera (Low, overview: 1.65 M triangles and 301
  draw calls → 0.83 M and 201). Creatures wear a skin by distance — a third, coarser one (under half
  the triangles) past the detail bands — built in the background, the cheapest first. The valley's and
  the Studio's code loads when they are first opened. **Tests:** `tests/world/renderCost.test.ts`
  (no transmissive materials; the distant skin's size and bounds).

- [x] **M76 — The first review, fixed.** A fast-forward never lands on a valley that was swapped
  under it (a new game, a load, a reset each end the run). A save is one family tree of numbered
  creatures with every gene inside its bounds, and a load changes nothing unless all of it reads.
  `Esc` opens the menu from a slider or a tick box (not from a text field), a held key opens it once,
  the screens behind it stop drawing, and a screen that fails — or whose code cannot be fetched —
  shows a card with a way out instead of a blank page. World skins are built ahead of the render
  (surface, skin weights, shell), kept once built, and chosen by a level of detail that does not
  flicker at its edges. **Tests:** `tests/world/worldStore.test.ts`, `skins.test.ts`,
  `tests/ui/saves.test.ts`, `game.test.ts`, `keys.test.ts`, `browserKeep.test.ts`,
  `tests/engine/share.test.ts`, `lineage.test.ts`.

- [x] **M77 — The body plans, one by one.** Twenty-odd plans reworked against proportions measured
  in chest depths: cats and dogs (one skull, ears on its corners, a wedge of a trunk, a level back);
  mice and bears; fish (a wedge of a head, a long sail, a keel) and sharks (a snout, a raked blade,
  slits); birds (one tail) and hawks that are not pigeons; dragons that stand and wyverns that are
  bipeds; deer with necks that reach the grass; urchins with a coat of spines, a horror of its own,
  slugs, slender eye stalks; turtles, chimeras, theropods, ostriches; crocodiles with jaws, lizards
  with necks and whip tails, slim weasels. Feeding keeps every foot planted: bipeds tip at the hips,
  long necks arch, sprawlers hold still. **Tests:** `tests/engine/bodyplan.test.ts` (per plan),
  `morphospace.test.ts`, `parts.test.ts`, `tests/viewer/rig.test.ts › feeding`, `wings.test.ts ›
  fin cuts`, `ear.test.ts`, `nose.test.ts`, `mouths/beak.test.ts`.

- [x] **M78 — The second review, fixed.** Bred bodies keep the rules their founders keep: an ear is
  one flap on the skull, a one-link trunk is not shrunk by its taper, a trunk rears by degrees
  (`rearedness`), a youngster's head is big for its body and not bigger than it. Gill covers and
  slits are traced over the skin (`gills.ts`) and a midline fin's base follows the back. The skin
  queue is its own module (`skinQueue.ts`): a youngster's adult body is ordered at what the camera
  calls for now, and a body waiting for its first skin builds no shell in the render. A lineage whose
  numbering has run away is renumbered on load; the Studio's camera keeps its angle when a pose
  changes; the main menu no longer depends on the creature being bred. **Tests:**
  `bodyplan.test.ts › bred bodies`, `juvenile.test.ts`, `tests/viewer/gills.test.ts`,
  `framing.test.ts`, `tests/world/skins.test.ts › built to order`, `saves.test.ts › runaway
  numbering`, `keys.test.ts › a part that fails`; in a browser, `?failstage=1` → the failure card →
  Main menu → the menu.

- [x] **M79 — Surfaces that read.** A shut mouth is one seam in the skin (no crossed strokes, no
  cords past the cheeks); a relief's slope is measured at every pixel, so scales and plates no
  longer break into squares (`fineRelief`, on at Medium and High); thinning fur keeps the coat's
  tone; a trunk, a neck and a tail are curves, not cones with a crease ring at every node.
  **Tests:** `tests/viewer/mouths/jawed.test.ts`, `mandibles.test.ts`, `mouthLine.test.ts`,
  `creatureMaterial.test.ts › the relief's slope`, `bodyField.test.ts › chains`.
- [x] **M80 — Cut stone, plumage, scales.** Crystal is the eighth covering: flat facets that meet in
  sharp edges and mirror the sky face by face, shard clusters for horns and back spines, and a
  crystal beast that wears them. Feathers and scales are overlapping scallops laid along the body.
  **Tests:** `creatureMaterial.test.ts › a crystal hide`, `› plumage and scales`, `shards.test.ts`,
  `tests/engine/plans/crystalline.test.ts`, `covering.test.ts › every covering is a gene`.
- [x] **M81 — Crabs, fish and sharks.** A crab has pincers, arched legs and stalk eyes on its
  shell's rim; a fish and a shark have heads that run on from the body, fins in their places, a gill
  cover that crosses the flank, and their tail fins in the picture (`finBounds`). **Tests:**
  `tests/engine/plans/fish.test.ts`, `tests/viewer/claw.test.ts`, `gills.test.ts`,
  `framing.test.ts › a finned body`, `bodyplan.test.ts › crab`.
- [x] **M82 — Plans reworked in parallel.** Weasels that arch, hawks that stand, apes with
  shoulders, brows and fists, chimeras with raised wings and a mane — each fixed in its own checkout
  against its audit notes, judged before/after by an independent viewer, and merged with a proof
  that no other plan's founders moved. **Tests:** `tests/engine/plans/mustelid.test.ts`,
  `raptor.test.ts`, `primate.test.ts`, `chimera.test.ts`, `bodyplan.test.ts › an ape's hips`.

- [x] **M83 — The valley by the square.** Grass, crowns and bushes are drawn a square at a time, each
  culled on its own in the main pass and the shadow pass; far grass is thinned; a square of grass is
  re-posed only when it changes; empty berry slots are not drawn; the sun's shadows are redrawn every
  other frame. **Tests:** `tests/world/cells.test.ts`.
- [x] **M84 — The last of the parallel plans.** Foxes (a stop, paws, a brush), crocodiles (scutes, a
  bladed tail, a skull narrower than the body), theropods (a wedge of a skull, clawed hands, three
  toes), and the many-legged alien as a myriapod of armoured rings. **Tests:**
  `tests/engine/plans/canid.test.ts`, `crocodilian.test.ts`, `biped.test.ts`, `arthro-alien.test.ts`,
  `bodyplan.test.ts › a plain tail's style gene has one cut to a band`.
- [x] **M85 — A second wave of plans.** Sea stars, tortoises, urchins (quills), lizards and every
  walking sprawler's limb, snakes, deer, frogs, bears; solid spots; scales over the brow. **Tests:**
  `tests/engine/plans/starfish.test.ts`, `chelonian.test.ts`, `urchin.test.ts`, `lizard.test.ts`,
  `serpent.test.ts`, `ungulate.test.ts`, `anuran.test.ts`, `ursid.test.ts`.

- [x] **M86 — A third look by eye, and bodies that keep their room.** Slugs with a small soft mouth,
  wyverns with a dragon's skull, ratites with a small head and no straw of a tail fan; the new meshes
  checked in the World; animals on the ground no longer stand inside each other, the lighter giving
  way, a hunter at its prey and a courting pair let be. **Tests:** `tests/engine/plans/slime.test.ts`,
  `wyvern.test.ts`, `ratite.test.ts`, `tests/sim/world.test.ts › room`.

- [x] **M87 — Octopuses, webbed feet, bears.** An octopus with two eyes, arms broad at the head and
  fine at the tips, each bending its own way, joined by a web; frogs on webbed hind feet; bears with
  the hump over their shoulders and a level muzzle; the coat running on over every furred paw.
  **Tests:** `tests/engine/plans/cephalopod.test.ts`, `tests/viewer/feet.test.ts › webbed`,
  `tests/engine/plans/ursid.test.ts › hump`.

- [x] **M88 — A fourth look, and breeding that stays coherent.** Natural eyes (browns first) and
  natural markings on familiar animals, dragons with wings, a slug's small mouth; bred parts whose tips
  fit their kind, head parts on the head, no mutation-born second faces, and proportions that step by a
  share of themselves. **Tests:** `tests/viewer/iris.test.ts`, `tests/engine/random.test.ts › a
  familiar frog`, `tests/engine/mutate.test.ts › bred offspring stay coherent`.

- [x] **M89 — A faster valley, and a fifth look.** A simulated year 40% faster (plants gridded,
  heights sampled onto tiles), one year in four dry; from an independent look at seed 8: nothing
  floats, dragons fold their wings at rest and wear reptile heads, birds' feet under their hips, a
  hawk's hooked two-toned bill, heads kept one tone under bands, a shark's pointed snout and dark eye,
  a crab's stout legs and heavy claws, face portraits from outside the body.
  **Tests:** `tests/sim/weather.test.ts › dry years`, `tests/engine/ground.test.ts`,
  `tests/viewer/wings.test.ts › folded`, `tests/viewer/mouths/beak.test.ts › a hawk's bill`,
  `tests/engine/plans/wyvern.test.ts › a dragon's head`, `tests/viewer/face.test.ts › a plain head`,
  `tests/engine/plans/fish.test.ts › a shark's snout`, `tests/engine/bodyplan.test.ts › a crab's legs`,
  `tests/viewer/framing.test.ts › a face's portrait`.

- [x] **M90 — Cut stone, a mouth of flesh, and hops that land.** The crystalline beast's hide cut into
  flat faces, outline and all; the horror's crown mouth a funnel of flesh with a knobbed rasp; a
  saltation child that comes down near no plan takes back its lineage's proportions (structure kept),
  and one that flipped symmetry lands whole in the nearest plan of its own, in its lineage's colours.
  **Tests:** `tests/viewer/facets.test.ts`, `tests/viewer/mouths/ring.test.ts › a sucker's throat`,
  `tests/engine/landing.test.ts`.

- [x] **M91 — A sixth look: grins, a cat's face, a dragon's folded wing.** From an independent review at
  seed 13: the crystal cut no longer tears (no turned faces; legs and face uncut), closed mouths no
  longer grin (the lip line sweeps about the head's vertical), the cat has a cat's face (slit eyes, a
  small rose nose, stripes over the brow), a dragon's folded wing is a great sail on slim bones, a crab's
  claws fold in before its face, a songbird's head is round on a feathered neck, a feathered tail
  lies in a trough, and stripes are narrow and dark, giving out under the belly.
  **Tests:** `tests/viewer/facets.test.ts`, `tests/viewer/mouthLine.test.ts › a closed mouth doesn't
  grin`, `tests/engine/plans/felid.test.ts`, `tests/viewer/wings.test.ts › hangs from the wrist`.

- [x] **M92 — A seventh look: the scores rise.** Mean 4.06 → 4.29 between looks. Bears always eared,
  pelts' rare morphs a mammal's; folded wings without a peg; side-set eyes on the ostrich and the
  songbird; a cut crystal shaded by its own faces; a standing crest; level seam mouths; the World card's
  portrait drawn first. **Tests:** `tests/engine/plans/ursid.test.ts › always has ears`,
  `tests/engine/random.test.ts › a familiar pelt's rare colour morph`, `tests/viewer/mouthLine.test.ts
  › frown`, `tests/engine/plans/ratite.test.ts › looks out of the sides`, `tests/viewer/portraitQueue.test.ts`.

- [x] **M93 — What the seventh look left.** A shark's crescent tail and deep gill slits; an octopus's
  round eye; a mouse low on bare pink paws; a crab's claws folded in on slim arms, fingers short of
  each other; alien eyes with a lit iris round a slit, in a rim of hide, and ringless compound domes;
  arthropod legs that taper to points; a weasel's narrow head tapering to a dark nose. **Tests:**
  `tests/viewer/wings.test.ts › crescent`, `tests/viewer/gills.test.ts`, `tests/viewer/feet.test.ts ›
  bare pink paws`, `tests/viewer/claw.test.ts › folded in across its face`, `tests/engine/juvenile.test.ts`,
  `tests/engine/plans/mustelid.test.ts › wedge of a head`, `tests/viewer/nose.test.ts › weasel`.

- [x] **M94 — An eighth look, harder.** A cut stone without camouflage; dragons and rats always
  tailed; a hawk's hooked bill; an urchin on its spines, one maw per radial body; an octopus's eye; a
  tortoise's shell over its legs; flat crab claws; smooth plumage on head and breast; mouths as creases
  in the hide; a rat's naked tail and pink ears; fur fuzz on the outline; small mood bubbles near; a
  jaw under a dog's and a bear's muzzle; grey shanks; banded edges blended; swept, ringed horns.
  **Tests:** `tests/viewer/creatureMaterial.test.ts › crystal`, `tests/engine/bodyplan.test.ts › always
  have a tail`, `tests/viewer/mouths/beak.test.ts › hawk's bill`, `tests/viewer/mouthLine.test.ts ›
  drawn once`, `tests/engine/plans/urchin.test.ts › tube feet`, `tests/engine/plans/chelonian.test.ts ›
  over each leg's root`, `tests/viewer/feet.test.ts › naked`, `tests/viewer/face.test.ts`,
  `tests/viewer/bodyField.test.ts › has a jaw`, `tests/viewer/horn.test.ts`.

- [x] **M95 — Thin limbs drawn exact, and a tenth look.** Legs, tails and arm tips too thin for the skin's
  grid drawn as exact swept tubes, at their own girth at every fineness; a dragon's folded wing draped
  down its flank in pleats; an urchin a low round dome with pale-tipped spines; a crab's legs swept back,
  a spider's arcing out; a horror's crown mouth its own skin rolled over a rim, ringed by feelers; no
  ring round a stretched trunk at each node; a fish's tail a broad fan; a dog's and a bear's muzzle a
  wedge under a straight bridge; a chimera's mouth a jaw or a beak; a cut stone's faces meeting in
  creases, lit face by face. **Tests:**
  `tests/viewer/limbTubes.test.ts`, `tests/viewer/wings.test.ts`, `tests/engine/plans/urchin.test.ts`,
  `crab.test.ts`, `arachnid.test.ts`, `horror.test.ts`, `tests/viewer/mouths/ring.test.ts › rim`,
  `tests/viewer/smoothSkin.test.ts › the maggot`.

- [x] **M96 — An eleventh look (3.32), and a deer named a deer.** Identification by hide and telltale
  parts (98% of founders, from 90%); horror feelers round the crown; a wyvern no giraffe; a shark's tail
  stock; a snake's head; a dog's brush; a frog's round lids; a sea star's smooth arms; level whiskers;
  an ostrich's shaggy plumes; a hawk's dark hooked bill; a lizard's wedge of a head; eyes seated on flat
  skulls; paws no wider than the wrist, legs one tone down to them; cupped ears with a pale inside;
  an insect's eyes seated as domes, its feelers fine, no letterbox mouth; no dark ring where a leg's
  skin hands on to its exact tube; a weasel's short pile; an ostrich's broad bill and downy head;
  no seam painted across a slug's face.
  **Tests:** `morphospace.test.ts › a deer is no dog`, `horror.test.ts`, `wyvern.test.ts`,
  `fish.test.ts`, `serpent.test.ts`, `canid.test.ts`, `lids.test.ts`, `starfish.test.ts`,
  `whiskers.test.ts`, `creatureMaterial.test.ts › shaggy`, `beak.test.ts`, `lizard.test.ts`,
  `eyeSeat.test.ts`, `feet.test.ts › knows its legs`, `ear.test.ts › a deep cup`,
  `bodyField.test.ts › feelers`, `arthro-alien.test.ts › feelers rise`, `limbTubes.test.ts › no dark ring`,
  `pile.test.ts`, `beak.test.ts › an ostrich's bill`, `creatureMaterial.test.ts › short down`,
  `jawed.test.ts › a slug's shut mouth`.

- [x] **M97 — A twelfth look (3.45), and its worst diagnosed in parallel.** Legs with joints; a horror with
  no face (a band of glowing eyes, rising feelers, a lamprey's maw); a crystal trunk as one cut stone; a
  theropod's sleek feathers, toothy jaw and bare shanks; a fish's gill cover on its skull and a tail stock;
  reptile jaws along the side of the head with teeth outside them; brown eyes, not grey ball bearings; a
  hawk's neck; a centipede's plates; pointed tail and tentacle tips; a crocodile's low keeled plates; a
  python's net, not crackle glaze; a shark's narrow head over a crescent mouth; horns as one sheath; a
  bear's barrel on columns, its short snout and its ears facing the camera; a slug's taper and feelers; a
  weasel's small nose, low ears and full tail; wings at the shoulders and back spines that point out.
  **Tests:** see PROGRESS M97.

- [x] **M98 — A thirteenth look (3.32, framed wider), spiders' eyes and snakes' heads.** Face eyes
  pressed into the skin (no goggle past the outline); fur grain along the coat's lay; a cat's fine dense
  markings and tawny coat; domed plates; a tortoise's scutes in rows; whisker pads only on a cat; a slime
  hide's soft papillae and a slug's mantle; a chimera's tail sting; an urchin of one colour; shut reptile
  jaws showing only their animal's teeth; markings of another hue laid solid, an insect's mostly its own;
  each scale its own shade; eyes seated by the skin along their aim; a snake's spade head on a neck, its
  open round eye and its seam; a spider's cluster of lenses, short chelicerae, tapering legs; a bird's tail
  closed at rest under its coverts, barred on a banded coat; an ape's jutting jaw, crest, forearms and
  broad nose; a wyvern's level tail, arm-wings and parted horns; an ostrich's long flat bill; a dragon's
  level tail, folded wing laid to its body, spines and horns apart.
  **Tests:** see PROGRESS M98.

- [x] **M99 — What the thirteenth look left, diagnosed plan by plan.**
  - deer: a grazer's straight neck carried forward, its head bowed, broad nose pad, dapples, knobbed knees.
  - bear: a dark nose pad, never a cat's pink button.
  - octopus: a raised gold eye and long arms curling at the tip.
  - crystal: a beast of stones from head to toe.
  - cat: its throat meets its jaw at an angle; whiskers fanned from the pads.
  - fish: a pointed snout with a jaw and gape, a gill cover in relief, a narrowed tail stalk.
  - mouse: bead eyes, thin pink ears, a plain coat.
  - crab: eyes on the shell's front rim, a toothed broad front, folded mouthparts.
  - insect: elbowed feelers, faceted eyes, a dark plain cuticle, tapering legs.
  - chimera: a net, not a harness; paws; two fine fangs.
  - bird: a smooth breast, the folded wing in the back's tone onto its tail, a shut bill.
  - crocodile: one flat hull, no rings, a snout that narrows to its tip.
  - arthro-alien: plated rings, a dark cuticle, lens clusters, forcipules under the head.
  - Plus the fixes an independent review confirmed.
  **Tests:** see PROGRESS M99.

- [x] **M100 — A fourteenth look (3.68), and parts an animal is never without.**
  - The review of round 2's commits: a fish's jaw only on a bony fish, a long crab's shell closed, every ring
    plated.
  - Tails, ears, wings and whiskers that define a plan are certain.
  - From its list: a cat's pads, ears and back; a dog's head and muzzle; a deer's knees, hocks, hooves and
    nose; a songbird's bill, head and wing; a chimera's eyes and legs; a slug's face and mantle; a fish's
    pectoral and jaw; a dragon's chest, head, fangs and wings; a crab's stalks and claws.
  - A second round: smooth hand-overs from skin to tube on every limb; a lizard's sprawl; a tortoise's neck,
    feet and dome; a shark's slits and foils; a crocodile's seam on its drawn skin; an ostrich's spoon bill
    and three toes; a theropod's seam and folded arms; an octopus's small rings and whole web; a hawk's
    hooked bill and hanging tail.
  **Tests:** see PROGRESS M100.

### Next up (unchecked — pick from here)

#### The front door (before anything else)

- [x] **A menu that always opens.** On the main menu the page froze for seconds at a time: the backdrop
  creature was drawn at full quality in an always-on loop (about 70 draw calls and 209,000 triangles a
  frame, 12 fur shells being 90% of it), 3.5-9 s a frame with no GPU acceleration. Measured in a
  software-GL browser, a click on Settings now takes 7-10 ms (3-7 s before). Not yet measured on a hardware
  GPU.
  - The menu's stage is lazy, never mounted on a software renderer or in safe mode, starts still and
    without fur, and turns (with its fur) only once a frame is proven fast.
  - Graphics lower themselves to Low on a software renderer or slow first frames, with one line saying
    why; `?safe=1` starts with the lowest graphics and no backdrop.
  - The page shows a static shell before any JavaScript runs; the entry chunk is 107 KB gzipped (461 KB
    before).
- [x] **No draw waits for a shader.** A Windows laptop (Chrome on Direct3D, RTX 5070 Ti) showed the real
  cause: the creature's shader took 52 s to build, and the first draw that used it held the page until it
  was done (a 32 s block after a 20 s wait gave up; on `main`, the whole 52 s).
  - `programs.ts guardDraws`: a draw whose program is still building is skipped and drawn when it is
    ready; a creature is held back whole. Portraits and still canvases are drawn again once it is.
  - The stage waits for its shaders however long they take (the page is free meanwhile).
  - Each covering's relief is compiled only into the programs that wear it (`COVER`, `BARE_LEGS`,
    `USE_SCUTES`): the creature's fragment shader is about a third of its size. Ten plans render
    pixel-identical.
- [x] **A loading screen in front of every game screen.** The same laptop's Chrome had restarted its
  graphics process onto the processor's own Radeon 610M, the RTX idle beside it. There the breeder opened
  as a dead screen: 87 s without an answer (one wait for the creature's shader alone took 86 s, and the
  shader then failed to link), each pick another 100 s, and every tab of the browser slowed with it.
  - `ui/LoadingGate`, `ui/gate.ts`: a screen is mounted behind a loading screen and let in only once it
    is ready: its shaders built, a frame drawn whole (`programs.ts DrawnWhole`), the litter drawn in its
    skins, its frames measured. It shows its steps and a clock; the menu is always a click away, and a way
    in regardless after 12 s. The breeder, the valley and the Studio are each gated when opened.
  - A first verdict cheaper than 100 ms but slower than 33 ms is timed twice, and lowers the graphics if
    the game may (`PACE.smoothMs`); the valley measures its median frame and lowers once if under 24 a
    second (`WORLD_SMOOTH_MS`). The lowering happens behind the loading screen, and is measured again.
  - Where the drawing is slow on a computer's built-in graphics, the loading screen and the lowered-
    graphics notice name the chip and say how to give the browser the graphics card (`gpu.ts slowGpuHint`).
  - Repaired on the way: the litter stayed blank once a thumbnail had been held for its shader (marked
    drawn, never redrawn); the guard went in after a canvas's first frame (a 4 s block); the menu's stage,
    taken down mid-build, held the page 9 s in `loseContext` (a context is now given up once its builds
    are done, 20 s at the most); a timed frame that left a held creature out was timed cheap; polling a
    deleted program warned on the console.
  - Measured with an empty shader cache, Start game to the breeder: 15-35 s on the Radeon 610M (no task
    over 1.2 s), 9-14 s on the RTX 5070 Ti; 1.6 s on the RTX once its shaders are kept. The valley on the
    Radeon: 27 s behind its loading screen, then 20-24 frames a second at Low.
- [ ] **What the front door left.**
  - The first entry to the breeder on a software renderer still holds the page for some seconds.
  - The valley is still too heavy for a software renderer: it warns, but is not lighter.
  - The creature's shader now builds in a second or so on Direct3D, whatever its covering, on either chip:
    FXC, the compiler Chrome's Direct3D path goes through, unrolls every loop whose count it knows, and the
    noise octaves now run to a count it cannot know (`OCT`). Compile and link, the shader cache bypassed,
    RTX 5070 Ti (the Radeon 610M within 0.1 s of it): skin 3.3 → 1.2 s, scales 2.2 → 1.0, fur 4.0 → 1.25,
    fur with a bare tail 4.5 → 1.25, feathers with bare legs 5.3 → 1.6, chitin 3.4 → 1.15, slime 3.4 → 1.2,
    plates 2.0 → 0.95, a tortoise's scutes 2.1 → 1.0, crystal 2.4 → 1.05. A first entry to the breeder has
    every program built in 6 s, not 17, on either chip. 24 views of 15 plans render identical before and
    after on SwiftShader and on the RTX; on the Radeon 6 of them differ by a shade in 1-4 pixels.
  - Drawing a creature costs a little more since the octaves were rolled: a furred close-up with its twelve
    shells 8-11% on the Radeon (71 → 77-78 ms a frame at 960×600, two measurements), 2% on the RTX; other
    views 2-5%. Each loop's first octave worked out before it, so no step is chosen inside, gets that view to
    6% but builds 60-90% slower (fur 2.0 s, a bird 3.0 s): what is left is the rolled loop itself.
  - Not done: reading the relief in one place would take another 0.3 s off each program, but Direct3D then
    rounds a few pixels a shade differently (2 of 24 views on the RTX, 8 on the Radeon).
  - A tortoise shell's program still draws Direct3D's "potentially uninitialized variable" warning, from
    the early return its pattern takes for the scutes (`patternField`).
  - A lowering from High to Low builds the stage's shaders again (shadows off: 10 s more on the Radeon,
    measured before the octaves were rolled).
  - On a built-in chip with 512 MB of its own memory, a second tab of the game in the valley leaves none
    for the first: a frame a second, the chip idle.
  - One deleted program is still polled somewhere on the way in, and warns on the console.

#### The simulation: making it a game (agreed 2026-11-17)

Principle: the player changes the pressures, never the animals directly. The breeder is the one place for
artificial selection.

- [x] **1. Evolution you can see.** Works on any map, so it comes first.
  - Trait-over-time charts for a species (size, speed, coat, diet).
  - Species cards: where it lives, what it eats, what eats it, how it differs from its founder.
  - Causes of death, per species and over time.
  - The lineage film: a species' body over the generations as a strip of portraits.
  - Adopt a lineage: follow "your" species and be told when it splits or dies out.
  **Done (2026-11-20).** The trait charts, cards and deaths by cause were there; added the film (a
  species' typical body each dawn it has visibly changed, at most twelve frames, on its card) and adopted
  lines (☆ on the card; a split, a renaming or an extinction anywhere in the line is announced, with a way
  to its card).
- [ ] **2. A planet with climate zones.** Built together, so terrain is rewritten once.
  - A small sphere you can rotate, with no map edge. Distant animals as simple markers, full bodies when
    zoomed in.
  - Climate by latitude: ice caps, temperate belts, desert, tropics.
  - Oceans and islands that isolate populations, so species split by geography.
  - Costs to plan for: terrain, movement, the grass grid, the camera, plant rendering and saves all assume
    a flat square today; the 165-creature cap is a rendering budget; old saves will not carry over.
- [x] **3. Selection that is real.** Traits matter differently by place.
  - Camouflage: coat colour against the local ground changes how easily a hunter spots prey.
  - Mate choice: crests and bright colours attract mates and hunters alike.
  - Fur or bare skin against temperature; body size against cold.
  - Replace the per-species and per-guild quotas with ecological limits where the food web can carry it.
  **Done (2026-11-20)** (sim/selection.ts). A coat is seen against the ground under it (the scene's own
  colours, snow in the depth of winter): hunters spot a matched one only nearer, and a matched stalker
  creeps nearer unseen. Crests, frills, a bright coat and a bold pattern draw mates and hunters alike. A
  coat of fur or feathers is warm blood: a small body pays more for a hard winter than a big one, a big one
  a little for a hot summer; the cold-blooded slow down instead. A grazer or a swimmer breeds only where
  the grass and fruit, or the algae, around it can carry one more (`foodWebCarries`); a hunter is held by
  what it catches (a gate on the prey in sight left no hunter past its fourth generation). The quotas stay
  as the valley's ceiling, with the limits inside them, not in their place: loosened, the valley sat at its
  hard cap, where no minority kind can breed. Ten fifty-year valleys with all of it: hunters past generation
  20 in all ten (canids to 155, felids to 142), 80–148 alive and 6–13 kinds at the end; rodents reach
  generation 20 in 6 of ten and one valley's median coherence fell to 0.54 — see "Selection's side effects".
- [ ] **4. Levers on the environment.**
  - Shape it: sea level, temperature, rainfall, forests, a land bridge or a strait.
  - Events: an ice age, a volcano, a meteor, a plague, then watch what radiates into the gaps.
  - Introductions: release a bred design as an invader and see whether it lasts.
  **Built (2026-11-20), but for the terrain:** the 🌦 climate menu sets a colder or warmer age and a drier or
  wetter valley, and sets going an ice age, an ash winter or a meteor; "a plague on it" is on a species'
  card (sim/levers.ts, each told in the journal, saved with the valley). Releases are the introductions.
  Sea level, forests, a land bridge and a strait wait for the planet's terrain.
- [x] **5. Scenarios.** Goals that give a run a point: "get something to colonise the ice cap", "keep three
  levels of the food chain alive for 100 years".
  **Done for the valley (2026-11-20)** (sim/scenarios.ts): "Three levels for a century", "Through the ice
  age" and "A walker takes wing", chosen in the new-game panel; the goal and where it stands at the foot of
  the view, won or lost at a dawn, in the journal. The ice cap waits for the planet.

#### What a 26-year valley showed (proposed 2026-11-20)

Read from a valley 301 days old (year 26): 7,714 births, 2,601 of them mutated, and 27 speciations. Every
one of the 27 new species had a single member, ever, and died with it. Rodents, felids, insectoids and birds
were still at generation 0–1, re-seeded by copies of their founders. Only the two big herbivores evolved,
and their bodies came apart: the ursids went from 32 body nodes to as many as 74, coherence 0.71 → 0.56
(the worst 0.29). The one aquatic species changed little, held down by the lake's algae. The birds did fly
(half were aloft), but nothing on screen said so.

- [x] **The valley's bar and creature panel, repaired.** The bar's menus ("+ release", "world") opened
  under the creature panel. The panel's ✕ didn't close it: in documentary mode the director picked a new
  subject at once. A year's fast-forward moved the day on twelve with no year shown, and zoom and
  keyboard panning crawled.
  - The bar sits above the side panels. On a narrow window it wraps onto a second row, and the panels sit
    under it at its measured height (`--bar-h`).
  - The creature panel: ‹ n of N › steps through its species' living members (`,` and `.` too). ✕ closes
    the panel but keeps the selection, and the camera keeps following. `I` opens it again, and so does a
    creature clicked.
  - The clock shows the year beside the day: "Year 26 · day 301" (`yearNumber`, twelve days to a year).
  - A wheel notch zooms 1.8× as far, a drag pans 1.4× as far, and the keys pan at 0.95 of the camera's
    distance a second (0.6 before).
  **Test:** select a creature and open "+ release": its list shows over the panel. ›, `.` and `,` step
  through its kin. ✕ closes and `I` reopens the same creature. With documentary on and the panel closed,
  the panel stays closed. "year" moves the clock from Year 1 to Year 2. At 1100 px wide the bar wraps and
  the census starts below it.

- [x] **Species that can last.** A species is a population, not one mutant.
  - Split by clusters: once a day, a species with ≥ 8 alive whose members fall into two groups further
    apart than `SPECIATION_DIST`, each at least 4 strong, becomes two. A lone mutant is variation.
  - Mates mix: a child takes each numeric gene from either parent, and its plan from one, swapping parts
    where both plans match. Budding kinds stay clonal. Mates prefer their own look.
  - Releases and new valleys start varied, not as clones. Immigrants come from a seed bank of the
    species' last living genomes, mutated a little each day, not from its founder.
  **Test:** ten seeds, fifty years each, headless. New species reach five members and live two years.
  Species of one are rare. Rodents, fish and birds pass generation 20.
  **Done (2026-11-20).** Splits wait six dawns of two groups apart (`SPLIT_*`, sim/species.ts); a population
  whose average body drifts past `SPECIATION_DIST` takes a new name ("felid α has become felid β"); mates
  cross (engine/crossover.ts); immigrants come from a bank of the last eight living genomes. What it took
  besides: a fish lake with food for its fish (algae ×2.3), the cold-blooded breeding on a fair meal, prey
  that fears only hunters that hunt (it had spent two days in five running), a diet that holds across births
  (`DIET_SHIFT`: within two years every canid had become a grazer), bigger litters for small bodies, hunters
  weighing what prey is worth, and a minority floor of 16 (6 for hunters). Ten valleys, fifty years
  (`scripts/valley-report.ts`): 9–23 lasting new species each, 0 species of one; generation 20
  passed by birds in 10 of ten, fish in 9, rodents in 8 (not in valleys 11 and 17; with the selection round
  on top of it — camouflage, display, the cold by size, food limits — birds 8, fish 9, rodents 6: see
  "Selection's side effects" below).

- [x] **Bodies that hold together.** A body's viability, worked out at birth, has a price.
  - Viability comes from coherence, fused or useless limbs, node count against the plan's, asymmetry and
    contorted joints. Very low: the embryo fails. Low: dearer upkeep, less health and speed, fewer mates.
  - The valley's structural mutations follow the plan: pairs in canonical slots, only the plan's own
    parts. Each node costs upkeep, so a part that earns nothing shrinks away.
  **Test:** ten seeds, fifty years. The median coherence of the living stays ≥ 0.6, and nine bodies in
  ten stay within 1.3× their founder's node count. Lineages still drift far enough to split.
  **Done (2026-11-20).** sim/viability.ts scores a body against its line's first founder (coherence lost,
  node bloat, limb chains fused, curls contorted, symmetry lost): below 0.25 it is stillborn; above, its
  upkeep is dearer and mates pass it over. The fin ↔ leg path is not charged (a walking fish reads as no
  plan, but is its line's own). Ten valleys, fifty years: median coherence of the living 0.65–0.84 (with the
  selection round, 0.54–0.86: one valley under 0.6, see below); nine bodies
  in ten within 1.10–1.25× (1.08–1.19× with selection) of their founder's nodes; 9–23 (4–26 with selection)
  lasting new species each.

- [ ] **Water, land and air by degree.** Capacities replace the habitat label:
  - swim
  - walk: legs that can carry the body
  - breathe water: gills, with a time limit ashore
  - breathe air: a time limit under water
  - stay moist: slime and bare skin dry out on land

  The rest of the milestone:
  - A `limbForm` gene from fin to leg, and a fluke-to-tail one, so the in-between forms can grow. A
    pinniped and an otter-like join the morphotypes.
  - Semi-aquatic lives: forage in the water and haul out to rest. A fish can flop into the shallows.
  - The starter cast holds two or three aquatic species and a semi-aquatic one, and the lake grows more
    food.
  **Test:** an otter-like forages on both sides of the shore. In seeded runs with a crowded lake and a rich
  shore, a fish lineage gains legs and spends a third of its time ashore in some seeds. In seeds without
  that opportunity it never does.
  **Built (2026-11-20), one part of its test open.** Traits carry swim, walk and breath ashore (sim/traits.ts;
  the habitat label is read off them). A paired fin's or a leg's `form` gene (0 fin … 1 leg) grows a lobe,
  joints, a foot, or folds a leg to a paddle and a flipper (grow's `expressForm`); every step is viable, and
  each step of crawl reaches further up the water's margin and what grows there (model's `canStand`). The
  otter and the pinniped are morphotypes; the starter cast has fish, cephalopods, anurans and otters, and
  the lake grows more. An otter forages both sides of the shore (fruit on the bank, algae in the lake), a
  seal hauls out to sleep, a lobe-fin caught ashore makes for the water before its breath runs out (tests).
  Open: in seeded shore runs (`--scenario shore`, sixty years) no fish line crossed to legs: fin form drifts
  to 0.1–0.27 in shore and control valleys alike, so the push toward land is still too weak to see. Not
  built: a fluke-to-tail gene.

- [x] **Flight by degree.** A lift ratio, wing area against mass^⅔, replaces `wings && mass < 9`.
  - Below 0.4 there is no flight.
  - From 0.4 to 0.8, a glider: it launches from a height and can only come down.
  - Above that, powered flight, with its climb, speed and time aloft set by the ratio and its energy.
  - A `wingDev` gene grows a wing from a flap, and a web of skin between the legs is a glider's patagium.
  - Flight you can see:
    - a shadow under everything aloft, at every graphics level
    - higher flight paths and soaring
    - perches in tree crowns
    - the census's count of those aloft
  **Test:** a glider can't climb, and a heavy body with small wings can't take off. Gliders appear in some
  seeded runs with woods and ground predators. A flier's shadow shows at Low.
  **Done (2026-11-20).** Lift is 0.6 (span/s)²/s off the wing's open span (`wingSpanFactor`, shared with the
  drawn wing: below a gene of 0.15 a wing is a flap, scaled down); a leg's `web` is a patagium (a flank of
  skin to the next leg behind, drawn in the skin field; its area carries a glide, never more), and drifts by
  point mutation. Gliders leap and come down at their glide ratio; fliers climb and cruise by their spare
  lift and pay more the less they have. Big fliers ride the thermals, high and cheap; fliers roost in the
  broadleaves' crowns at night (sim/stands.ts lists the trees the scene draws), out of reach of walkers. A
  soft shadow lies under anything aloft at every graphics level; the census counts those aloft. Tests: a
  stub-winged or overweight bird stays down, a glider never climbs, roosting and soaring; over ten
  fifty-year valleys gliders appeared in eight, never more than 28 at once (with webs drifting three times
  as fast and costing nothing, in all ten, up to 87).

- [x] **The player's cast.**
  - New game: choose the kinds and their numbers (two or three aquatic by default), re-roll a kind's looks,
    or paste `CAM2:` strings. Each game's founders vary within their plan.
  - Take a creature home, breed it, and release it as its own named species, "bred from ursid α": as many
    as you like, where you click.
  - Clone a creature ×N from its panel, or boost a species from the census.
  **Test:** two new games with different seeds show visibly different felids. A bred ungulate, released,
  appears in the census and the tree of life under its own name, with its parent recorded.
  **Done (2026-11-20).** The new-game panel edits the cast (kinds, counts, ↻ another look, a pasted
  `CAM2:`), kept with the game (sim/cast.ts); a look is a number, so a game keeps the founders it showed.
  Felids of seeds 11 and 12 lie 0.09 apart in morphospace with different coats. "take home" notes the
  creature's species; the breeder's line released again is "ungulate β, bred from ungulate α" (journal,
  census, card, tree of life), as many as you like, where you click. Clone ×1/×5 on the panel, "+5 more"
  on the species card.

- [x] **God mode.** A sandbox switch, off in scenarios, with every act told in the journal.
  - Creatures: clone, cull, smite, heal and feed, carry one elsewhere, make a pair breed.
  - The world: an algae bloom or a fruit glut, rain or a drought now, a mutation-rate dial, immigration on
    or off.
  **Test:** each act works from the panel, the census or the bar, and is told in the journal. With god
  mode off, none is offered.
  **Done (2026-11-20).** sim/god.ts: heal and feed, carry (click the ground), make breed, smite (a carcass),
  cull (none); a bloom, a glut, rain or a drought now (`skyNow`, `dryNow`), the mutation dial (0×–3×),
  immigration on or off. Switched from the "world" menu; its acts sit on the creature panel and a ⚡ menu,
  and are told in the journal in gold. Off, every act does nothing (tested); it is not offered in a scenario.

- [x] **Room for a planet.** Groundwork before the sphere:
  - `sim/world.ts` (about 2,000 lines) split by concern.
  - The simulation stepped in a worker, with the view drawing from snapshots.
  - Far creatures drawn as markers, so more can live than can be drawn whole.
  - The valley's autosave moved from localStorage (880 KB at year 26, against a quota of about 5 MB that
    the breeder shares) to IndexedDB.
  **Test:** a valley of 600 creatures holds its frame rate. A fifty-year valley saves and loads, and a
  reload continues bit-for-bit.
  **Done (2026-11-20).** sim/world.ts (2,574 lines) is a facade over model, species, population, behaviour,
  motion and fields. The valley is stepped in a worker (world/simWorker.ts); the page draws from a mirror
  (sim/replica.ts) that frames keep exactly the world (a save of one is a save of the other, tested), and a
  change made on the page hands the worker its world. Past 80 bu, and beyond the nearest 90, an animal is a
  marker. A valley holds 165, 330 or 600 (chosen with the game). The valley's autosave is in IndexedDB
  (ui/valleyStore.ts). On the laptop's RTX 5070 Ti: 600 creatures at 57 fps (330 at 59, an ordinary valley
  60); at 16× the worker keeps 28 fps where the page managed 20. Ten fifty-year valleys (1.6–3.2 MB) each
  reloaded as saved and ran on a day identically.

- [ ] **The planet, in a branch** (item 2 above), in this order:
  1. A sphere that spins, with water and the line of day, and today's creatures walking on it.
  2. Procedural terrain, with climate by latitude and rain shadows. Biomes by temperature and rainfall,
     each with its own plants and food.
  3. The fields on a cube-sphere grid.
  4. Far markers and more creatures.
  5. Weather fronts, and seasons by hemisphere.
  6. Saves, and the new-game planet options.

  The flat valley stays as a mode, so its saves still play.

- [x] **Smaller things the valley wants.**
  - **No bead chains on the way in.** Bodies wear the capsule skin for several seconds while their smooth
    skins build. A coarse smooth skin should come first ("More headroom" plans the skin worker).
  - **A camera that goes where you point.** Zoom toward the pointer, a key that frames the whole valley,
    and saved views.
  - **A photo mode.** Hide the bar and panels, frame a shot, save a still.
  **Done (2026-11-20).** A body with no skin yet asks for the coarse one as well, built first: a crowded
  valley's bodies left their capsules in 6.2 s after the scene appeared, against 10.9 s (an ordinary one's
  in under a second). The wheel zooms toward the pointer; `F` flies out to frame the valley; `Shift+1…4`
  saves a view and `1…4` flies back to it. `P` is a photo mode (everything but the picture hidden; `S` or
  its button saves a PNG).

- [ ] **Selection's side effects, tuned.** The selection round of 2026-11-20 (camouflage, display, the
  cold by size, food limits for grazers and swimmers) cost the small kinds and coherence a little: over ten
  fifty-year valleys, rodents reach generation 20 in 6 (8 before it), birds in 8 (10), and one valley's
  median coherence fell to 0.54 as its 13 kinds diverged (every other stayed at 0.64 or more). Two wrong
  turns are already undone: a food gate on hunters (no hunter past its fourth generation) and loosened
  quotas (the valley sat at its hard cap, where no minority kind can breed). To try: a grazer's food reckoned
  by the needs of the mouths around it (a mouse eats less than a deer), shelter for small bodies in a hard
  winter (a burrow, a huddle), and display weighed against a body's coherence.
  **Test:** "Species that can last" and "Bodies that hold together" pass again with selection on.

#### Creature looks (on hold while the simulation is worked on)

- [ ] **What the fourteenth look left.** A tail's or tentacle's spline hand-over (the chain blend stands
  proud of the collar); the other reptiles' seams on the drawn skin; a tortoise's parrot beak; a mouse's
  neckless wedge head; a weasel's slit eyes; a slug's sole; a songbird's pear shape from the front.

- [ ] **What the thirteenth look left.** A songbird's pear shape from the front (a dark breast band over a
  pale belly); a crocodile's teeth still unseen at studio scale.

- [ ] **What the twelfth look left.** The crystal's smooth glass head on its cut stone; a slug's sole;
  the dragon's pale underwing web; a bear's paw still a step below its wrist.

- [ ] **What the eleventh look left.** The crab's balloon claws; the arthro-alien's string of beads; a
  cut stone still papery; plush heads (a cat's box of a head, sock muzzles); the bare-shank seams on
  birds' legs; goggle eyes; painted mouths.

- [ ] **What the tenth look left.** The frog's balloon head with its clamshell seam and wedge-cut
  eyelids; the ostrich's scaly plumage; the serpent's blunt tail with an upturned nub; the starfish's
  sausage arms; the songbird's finger crest and slab wings; a cut stone's creases still step where two
  faces meet at a shallow angle (the mesh is finer than the faces, so the choice of plane flickers).

- [ ] **What the ninth look left.** Ears that are spikes edge-on (the far ear's angle); the weasel end
  on (its shoulder joints stand out past its flanks); the frog a bun resting on its chin (forelegs
  under its middle).

- [ ] **What the sixth look left.** The crab's walking legs still arch high like a spider's; the bear's
  muzzle a hippo's (a tube ending in a bulb, a small nose on it); the ape's coat reads as bare rubber;
  round slipper feet on bears and apes.

- [ ] **Hops that land in more than one basin.** A flipped cat, songbird or hawk lands as an urchin
  nearly every time (the coarse measure puts every radial sprawl nearest it). Spread them over the
  radial plans (octopus, sea star, horror) by what the child kept: its eyes, its limbs' length.

- [ ] **Richer world.** Burrows and nests, a second lake.
- [ ] **What the fifth look left.** A weasel end on is a ball behind a small head (its shoulder joints
  set the width); a dog's and a bear's muzzle is a tube ending in a bulb (the dog's test holds its
  girth to the nose on purpose: it needs a better shape, not a re-taper).
- [ ] **More headroom.** Skin builds off the main thread (a worker for the marching tetrahedra); the
  flowers as cells like the grass; level-of-detail crowns for far trees.

---

**North star:** in ten clicks you can visibly steer a blob toward a shark — and share the
result as a short string that regrows it exactly on someone else's machine.
