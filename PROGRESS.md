# PROGRESS — Cambrian

A build log of what shipped and the notable decisions behind it. **Keep it honest** —
this is the working memory between build sessions. The forward-looking plan and
acceptance tests live in [ROADMAP.md](ROADMAP.md); this is the backward-looking
"what got done and why" companion.

**Current phase:** Phase 3 (the creature grammar). M0–M5 + **M8** (genome v2 + aim) + **M9**
(part vocabulary) + **M10** (morphotype library) + **M11** (divergence engine — morphospace,
coherence labels, niched litters) + **M12** (covering & texture — procedural patterns +
per-covering in-shader bump) + **M13** (motion styles — 8 gaits picked from morphology) + **M14**
(the Menagerie — MAP-Elites archive + browser + novelty steer) + **M15** (smooth skin — marching-
tetrahedra metaball surface, toggled, gated behind capsules) + **M16** (dials & polish — wings/neck/
covering steers, morphotype filter, frill part) built. **Phase 3 (the creature grammar, M8–M16) is
complete**, and so are both Phase-4 stretches — **M7** (glTF export) and **M6** (physics fitness,
Rapier). **The entire roadmap (M0–M16) is now built.**

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
| Directed pressures | `src/engine/pressures.ts`, `src/viewer/PressurePanel.tsx` | ✅ scorePhenotype + runGenerations + panel; size/limbs/body/neck/wings/locomotion/demeanor/novelty + covering steer |
| Menagerie | `src/viewer/archive.ts`, `src/viewer/Menagerie.tsx` | ✅ MAP-Elites archive (limbs×elongation) + SVG browser, click-to-parent |
| Skin material | `src/viewer/creatureMaterial.ts` | ✅ countershading + 8 patterns + per-covering bump + sheen + fresnel rim |
| Covering | `src/engine/genome.ts` (`Covering`) | ✅ type/pattern/scale/contrast/sheen, per-morphotype, mutated, `CAM2:`-shared |
| Procedural motion | `src/viewer/animation.ts` | ✅ 8 motion styles (walk/swim/slither/scuttle/flap/drift/ooze) by morphology, role-based (unit-tested) |
| Smooth skin | `src/viewer/smoothSkin.ts` | ✅ SDF smooth-union of capsules → marching tetrahedra; toggled, gated behind capsules (unit-tested) |
| UI / store | `src/ui/App.tsx`, `store.ts` | ✅ Zustand: lineage + current + litter + pressure, localStorage |
| Test invariants | `tests/engine/invariants.ts` | ✅ shared phenotype + genome-bounds asserts |
| glTF export (stretch) | `src/viewer/exportGltf.ts`, `src/viewer/ShareBar.tsx` | ✅ bakes capsule/smooth + features → binary `.glb` via GLTFExporter |
| Physics fitness (stretch) | `src/physics/fitness.ts`, `src/viewer/PhysicsPanel.tsx` | ✅ Rapier ragdoll + muscle drive + distance fitness; lazy-loaded, deterministic; **+ gait playback** |

---

## Visual refinement round 5 — shoulder legs + level feet, forward eyes, jaw, hybrid skin · 2026-06-29 (Part 2)

Image-driven feedback. Probed the geometry first (no WebGL screenshots).

- **Legs — shoulder attach + level feet.** Legs no longer sprout from the underbelly midline: in `grow`
  a leg now starts at the body's **side (shoulder/hip)** — `start = spine ± 0.92·radius`, a touch above
  the belly — and **descends** (the knee/ankle folds shape it). Probe: a felid hip sits at x=−0.57 (the
  flank), foot at −0.88; stance widened to **1.76 vs body 1.38** (canid 1.69, ungulate 1.89, bear 2.14 —
  all ≥ body width). A new `levelFeet` post-pass **drops every foot to a common ground Y** (hip fixed,
  lower leg stretches): probe feet-Y spread **0.000** across felid/canid/ungulate/bear, and bilateral
  symmetry stays **exact** (left/right share a Y by mirror). Bounds recomputed after. Hooves enlarged.
- **Eyes — one type, gazing forward.** All eyes on a creature now share **one style** (picked once per
  creature; radial spiky-arms no longer sprout extra random-styled eyes) — real animals have a single
  eye type. New test asserts ≤1 eye style/creature over 200 rolls. And eyes sit on the **front of the
  face gazing forward** (elevation 0.45→**0.85–1.2**, the aim/normal points +Z) instead of bulging
  outward/up — kills the googly-derpy look. Count still varies (2/4/6/8) and ≥50%-have-eyes is tested.
- **Standard mouth — a real jaw, not a "torpedo sub".** Rebuilt the maw/fanged from a lipped capsule into
  a proper jaw: a dark throat, an upper muzzle + a hinged lower mandible parted open, **cheek hinges**,
  upper + lower **tooth rows of varied length**, a tongue, and (fanged) prominent upper+lower canines —
  ~16 pieces. Scales with `r` (the mouth gene → animal size), and the style gene still point-mutates
  across types (mouth↔beak↔mandibles↔…), so mouths evolve.
- **Hybrid skin mode (new, third option).** `skinMode` is now **capsules · smooth · hybrid** (a 3-way
  control, persisted; replaces the boolean). Hybrid meshes the organic SDF over **every part** (not just
  the locomotor body like `smooth`) with a **tighter blend** — best of both: organic *and* nothing
  drops out. Eyes/mouth always draw as solids on top (never melted/covered); face features are pushed
  further proud of the body (eye margin 0.5→0.7×radius) so the body can't overlap them.

**Verified (2026-06-29):** typecheck clean; `npm test` → **95/95** (3 new: one-eye-style, ≥50%-have-eyes,
hybrid surface; the leg leveling keeps exact symmetry + fuzz + bounds green); `npm run build` → succeeds;
in-browser the 3-way skin control switches capsules↔smooth↔hybrid and every mode + the new jaw/legs/eyes
render with **no console errors**. Geometry (stance, foot-level, shoulder attach, eye gaze) confirmed by
probe; the *look* is the human's call.

## Visual refinement round 4 — bigger legs, wide stance, limb terminators · 2026-06-29 (Part 2)

Feedback: arachnid legs look great but **quadruped/biped legs are vestigial** — need to be bigger,
stronger, **spaced wider** (too close together / under the centreline), and **angled per bauplan**; and
**distinct limb terminators** (hand/paw/hoof/claw).

- **Limb terminators (new).** Added three `Terminal`s — **paw** (soft sole + toe pads + small claws),
  **hoof** (a solid keratin block with a cleft), **hand** (palm + four fingers + a thumb) — joining
  foot/claw/pincer, each with its own crude render. Cascaded the leg-count through the engine so paw/
  hoof still read as legs everywhere: `morphospace.describe` (a `LEG_TIPS` set), `pressures.metrics`,
  the `share`/`mutate` terminal tables (reachable + round-trips). Assigned per animal: felid/canid/
  ursid → **paw**, ungulate → **hoof**, the primate's grasp-arms → **hand** (its feet stay `foot`),
  sprawlers (lizard/croc/insect/arachnid) → **claw**. Verified in-browser (felid paw:4, ungulate hoof:4,
  primate foot:2 + hand:2, …).
- **Bigger, stronger legs.** `POSTURE.thick`×girth raised across the board (digitigrade 0.3–0.44 →
  0.44–0.6, plantigrade → 0.52–0.68) and segment length up — probe: a felid thigh is now **~40% of the
  body radius** (was thread-thin), a bear thigh thicker still.
- **Wider, bauplan-correct stance.** Lowered the leg azimuths so limbs **splay out to the shoulders**
  instead of hanging from the midline: probe stance went felid **0.58 → 1.53** (vs body 1.38), ungulate
  **0.47 → 1.32** (≈ body width), bear → 1.98 (≈ body width). Per-posture angles: sprawlers widest,
  hooved near-vertical columns, digitigrade/plantigrade a natural splay, the biped primate narrow
  (correct).

**Verified (2026-06-29):** typecheck clean; `npm test` → **93/93** (the paw/hoof leg-count cascade keeps
morphospace/animation/pressures green); `npm run build` → succeeds; in-browser the Paw/Hoof/Hand renders
compile with the right terminator per animal, no console errors. Stance/thickness confirmed by probe;
the *look* is the human's call.

## Visual refinement round 3 — camera, boob-heads, stronger signals · 2026-06-29 (Part 2)

Feedback: the camera is off-centre and the creature **lists off-screen**; legs need a **stronger knee
signal**; bigger / more distinct mouths; **5 eye styles + a test that ≥half of gens have eyes**;
stronger limb signal; **diverse head shapes** (every skull was a "boob-head" — one lower lobe + two
upper); **upright primates**; a **better bear**. Probed the geometry first (no WebGL screenshots).

- **Camera (bug).** `<Stage adjustCamera>` and our `<OrbitControls autoRotate makeDefault>` fought over
  the camera, and auto-rotate orbited the origin — but a creature grows from the origin at its *back*
  (extending +Z), so its centre is far from there → it swung off-frame. Rewrote `CreatureViewer`:
  explicit studio lights + `Environment` + `ContactShadows`, the creature **offset by −bboxCentre** so
  its middle sits at the origin, the orbit **target pinned to the origin**, and a `Framer` that
  re-frames the camera distance/clip-planes whenever the creature's size changes. Centred by
  construction — it can't list off now.
- **Boob-heads (bug).** Eyes attached at **azimuth 0.7–1.3 = the top of the skull** → "two upper lobes."
  Moved them to the **front-sides** (azimuth 0.18–0.55) facing **forward** (elevation 0.45–0.82): probe
  confirms a felid/primate/ursid eye is now front/side, never on top. Plus head-shape variety
  (`headWide`/`headDome` genes — flat↔domed cranium, narrow↔broad) so skulls differ.
- **Stronger knees.** Folds sharpened again (knee ×2.4→**×3.0+0.3**, ankle ×1.8→×2.0): probe shows a
  felid knee bending **110°** (was 75°), ursid 93° — a clear joint.
- **Bigger mouths** (thickness ×girth 0.44–0.62 → 0.52–0.74, guaranteed-mouth floor up) and the full
  type set still verified (herbivore/maw/fanged/beak/mandibles/… per morphotype).
- **5 eye styles + eye guarantee tested.** New tests: **≥50%** of 300 random creatures have eyes (the
  M24 guarantee → ~all), and **all 5 eye styles** (round/beady/slit/compound/glowing) appear across a
  sample.
- **Upright primate.** Now a **biped** (legPairs 1) with **forward-reaching grasping arms** (a new
  `graspArm`), a tall torso + domed flat-faced skull. Probe: 2 legs + 2 arms.
- **Bear.** Ursid stockier + a **broad low skull** (headWide 1.1–1.32, headDome 0.82–1.02), thick legs,
  beady eyes, a short broad muzzle, bigger body.

**Verified (2026-06-29):** typecheck clean; `npm test` → **93/93** (2 new); `npm run build` → succeeds;
in-browser felid/primate/ursid/croc/serpent (sizes z 2.2→6.9) all roll centred with faces + reframe, no
console errors. Geometry confirmed by probe; the *look* is the human's call. (Other-bug pass: the camera
fight + the off-top eyes were the two real bugs found.)

## Visual refinement round 2 — eye visibility/size, leg joints, snouts · 2026-06-29 (Part 2)

Follow-up to the feedback below: legs "still have no visible joints"; in **capsule mode you can't see the
eyes** (the body swallows them); in **smooth mode the eyes are too big**; animal types need to read better
(a chicken-like roll delighted); mouths want more types (snout/trunk/herbivore/…). Probed the real geometry
first (I can't screenshot WebGL) and found: a felid eye was **r=0.28** (half the head!) with its centre
**exactly on the head surface** → half-buried under the bulged capsule head; leg joints existed but were
**gentle (31°/50°)** off a thin thread from a fat hip → read as a curved noodle.

- **Eyes — visible + smaller.** `grow` now pushes face features **proud of the body** (eye centre out an
  extra 0.5× the head radius, mouth 0.28×) so they sit on top instead of half-sunk — probe: a felid eye is
  now **93% above the surface** (was ~50%). And eyes are **smaller** (head-girth mult 0.5–0.68 → 0.34–0.5,
  floor 0.16→**0.11**, grown `EYE_R_MIN` 0.16→0.11): felid eye **0.28 → 0.21**. Fixes both complaints at once
  (lost-in-capsule-mode *and* too-big-in-smooth-mode). (Test eye-size floors relaxed to 0.11 to match.)
- **Legs — real joints.** Sharpened the grow folds (knee ×1.6→**2.4**, ankle ×1.25→**1.8**) and gave legs
  **4 segments + thicker thighs** (POSTURE `thick`/`segs` up): probe shows a leg chain bending **75° at the
  knee + 56° at the ankle** (was 31°/50°), feet still reaching y≈−1.4. A jointed Z-stance, not a noodle.
- **Snouts (mammals/reptiles read better).** New per-morphotype `snout` gene elongates the head into a
  **tapering muzzle/jaw** with the mouth at the tip — canid/ungulate long, **crocodilian a full jaw** (body
  z 4.4→5.3), rodent/ursid/lizard/mustelid medium, felid flat. A big "reads as a dog/horse/croc" win and
  the first cut at the "snout" mouth-type ask.

**Verified (2026-06-29):** typecheck clean; `npm test` → **91/91**; `npm run build` → succeeds. **In-browser:**
felid/canid/croc/ungulate/bird all roll with faces + canonical legs (croc's long jaw shows), no console
errors. Geometry confirmed by probe (eye protrusion %, joint angles, snout length); the *look* is the
human's call.

**Mouths — herbivore vs predator + a trunk (10 styles).** Followed up the snout with the rest of the
mouth-type ask. `mouthVariant` (`partStyles.ts`) went 8→**10** via **non-uniform bands** so the existing
styles keep their positions: a thin **herbivore** slice splits off the bottom of the maw range (a soft
grazing mouth — flat lip line + blunt incisors, no fangs) and a **trunk** slice the top (a long
forward-then-drooping tapered prehensile tube). Re-pointed the priors so grazers read herbivore
(ungulate/rodent), predators fanged (felid/croc/serpent/dragon/wyvern/shark), omnivores a toothed maw,
birds/turtles/cephalopods a beak, arthropods mandibles — **verified headlessly** (the parts.test mouth
map now asserts ungulate→herbivore, felid→fanged, …, and chimera reaches trunk). 91/91 + build green;
in-browser the herbivore/trunk renders compile with no console errors. **Still open (with the human's
eyes):** per-morphotype representation tuning (tails, characteristic silhouettes) and a look-pass on the
new mouth renders.

## Visual refinement pass — textures, eyes, mouths, legs, less "balloon" · 2026-06-29 (Part 2)

Playtest feedback (aesthetic): creatures read as glossy "balloon animals"; some textures look like "static";
eyes are "wide-eye cartoon"; mouths look like "duck bills"; legs want more realistic articulation. (The
slither motion was praised — left untouched.) A viewer/shader pass, no engine-logic change except leg shape.

**Skin material (`creatureMaterial.ts`) — less balloon, richer textures.** (1) **Domain warping** — every
noise pattern now samples a `warp()`-ed coordinate (an fbm-displaced position), turning "static" into
flowing, cohesive markings (the #1 fix). Stripes wave + branch (tiger/zebra), spots became **rosettes** (a
soft fill + a darker ring), ocelli concentric eye-spots, reticulate a crisp net. (2) A **third accent
colour** (`uPattern2`, a deeper hue-shifted tone) bleeds into the cores of strong markings + a fine fbm
**tonal break-up**, so skin isn't flat plastic. (3) A shared **sub-surface musculature** relief (`muscle()`,
ridged fbm) rides under *every* covering + drives a **fake AO** (creases darken) — so no body reads as a
smooth balloon. (4) The **fresnel rim** was tightened + dimmed (pow 3→4, 0.55→0.3) — the balloon halo is
gone, leaving a subtle backlit edge. fbm deepened to 5 octaves. (Applies to capsule *and* smooth modes.)

**Eyes (`CreatureMesh`) — set-in, not stuck-on.** Every eye now sits in an **orbital socket** (a torus rim
= the "receptacle"); the round/beady eye gained a **coloured iris** (derived from the creature's hue), a
proper pupil, a **small sharp catchlight** (was a big cartoon glint), and a **skin-toned upper eyelid**
hood. Slit eyes got a metallic iris sheen. Less ping-pong-ball, more refined.

**Mouths (`CreatureMesh`) — a mouth, not a bill.** The maw/fanged was a pair of forward-jutting flattened
jaws (the "duck bill"); rebuilt as a mouth **set into the face** — a recessed cavity framed by thin **lips**
with **mouth corners**, the tongue + teeth pulled back behind the lip line. Reads as an opening on the face.

**Legs (`grow.ts`) — a real jointed stance.** The single knee-fold became a **multi-joint Z**: thigh →
(knee folds the shin back under the body) → (ankle swings the foot forward), so a leg reads as a jointed
limb in a stance, not one curved sweep. Deterministic + exactly mirror-symmetric (unchanged invariants).

**Verified (2026-06-29):** `npm run typecheck` clean; `npm test` → **91/91** (the leg-shape change keeps
determinism + exact symmetry + the fuzz green); `npm run build` → succeeds. **In-browser:** the rebuilt
shader **compiles across all 7 coverings** (fur/scales/chitin/slime/plates/feathers/skin) and the new
eye/mouth/leg geometry renders, with **no console/GLSL errors**; every creature still shows its face. The
actual *look* (the textures, the eyes, the de-ballooning) is the human's visual call — the multi-canvas
WebGL page can't be screenshotted, as throughout.

## M24 — Bauplan: structural attractor basins + the guaranteed face · 2026-06-29 (Part 2)

Playtest feedback: creatures were drifting into **mouthless, eyeless, scatter-limbed blobs** — limbs
at random angles, faces gone after a couple of breeds. Root-caused in code (not guesses): the face was
guaranteed only on a *fresh roll* (M19), but the breeder litter's aggressive structural/saltation
mutation (`removeAppendage`, `changeTerminal`, head-swapping `confluence`) stripped it; legs were
placed/aimed at fully random `attachT`/`azimuth` by `addAppendage`/`reaim`; and nothing pulled
structure back (the §11.2 coherence-pull was never built). The human chose **"coherent core, coherent
weird"** (everything gets canonical structure; uncanny stays weird but never broken) as **one big
push**. Researched + planned in plan-mode, then implemented.

**The attractor basin = a deterministic pass inside `grow()`** (`developBauplan`, pure): the stored
genome may drift, but growth pulls it onto a canonical body plan before building.
- **Limb basin.** A `LEG_SLOTS` table gives the canonical `attachT` per leg-pair count (biped `[0.55]`
  · quadruped `[0.2,0.8]` · hexapod · octopod · decapod). The pass snaps each leg to its slot + folds
  the azimuth into the down-and-out band (a leg can never point *up*), **lerped by a new `coherence`
  gene** ∈[0,1] — the "weirdness" dial (1 = perfectly canonical, lower = individuality). Legs stay
  `pair:true` so grow's M18 mirror keeps them exact. Generation now places legs on the same slots
  (+a ±0.06 jitter for individuality), so generation and normalization agree.
- **Guaranteed face.** The pass ensures the head (or trunk front, or radial crown) always carries an
  eye-set + a mouth, synthesizing them if absent — so *every* grown creature, however mutated, has a
  face. The grown **eye bulb is floored at 0.16 bu** in `grow` so even a tapered/stalked eye reads.

**Mutation respects structure** (`mutate.ts`): the face is protected from removal/retyping; legs are
never scattered (`reaim`/`addAppendage` are decorative-only — `DECOR_KINDS` excludes `leg`); a new
`changeBauplan` op basin-hops the limb count by a *pair*; `coherence` drifts as a point gene.
`selection.ts::confluence` now grafts another creature's decorative parts onto the parent while keeping
its body + face (a coherent griffin, not a faceless splice).

**The mouth is a real organ** (`CreatureMesh`): the maw/fanged variant is now an open mouth — upper +
lower jaws around a **dark-red cavity, a tongue, and tooth rows** (fanged adds tusks) — oriented along
the aim and placed **front-of-face** (genome aim elevation 0.2→0.65) + enlarged, so it actually reads.

**Smooth-skin gaps fixed** (`smoothSkin.ts`): the SDF now meshes only the **body skeleton** (trunk +
leg/tail/arm/tentacle) — feature tips (eyes/horns/whiskers/…) draw as solids on top, so they stop
fragmenting into floating lumps — plus a per-cell **radius floor** so a thin limb is always ≥1 cell
thick (the cause of the gaps), budget 7e5→1e6.

**Weirdness steer:** a live **Coherence** slider (wild↔canonical) in the pressure panel sets the
current creature's `coherence` and regrows (`store.setCoherence`). `coherence` is `CAM2`-optional
(absent ⇒ 1); morphotypes set it high (familiar ≈1, uncanny ≈0.85), the wild tail low (0.4–0.7).

**Verified (2026-06-29):** `npm run typecheck` clean; `npm test` → **91/91** (8 new: legs snap to
canonical slots + fold down; coherence dials the spread [0.6 vs 0.05]; the face is guaranteed + floored;
**the face survives 20 generations of saltation/confluence breeding** across 8 lineages [the exact
regression]; `developBauplan` is pure + deterministic; valid + exactly symmetric through the pass; a
smooth-skin leg-coverage test. The `aim` test now finds the tail by kind since grow adds a face; the
morphospace "dragon = winged beast" set already admits chimera). `npm run build` → succeeds (main
+~13 KB; Rapier still its own lazy chunk). **In-browser:** every fresh roll **and every generation of
harsh breeding (×6) kept eyes + a mouth — 0 faceless**; legs stayed canonical; smooth mode built; the
Coherence slider + all controls wired with **no console errors** (one transient HMR `ReferenceError`
appeared only because a const's usage hot-reloaded a beat before its definition — gone on reload;
build/tests green). The mouth-organ look + the smooth-gap fix are the human's visual call.

## M23 — Full part vocabulary · 2026-06-29 (Part 2)

The "tedious robustness" milestone (ROADMAP 5.B, MORPHOLOGY §6): every deferred part, built out with
distinct crude geometry, reachable by both the generator and mutation, bounded & meshable.

**New enum values.** `Terminal` gained **club · barb · ear · gill · crest · carapace · whisker** (7);
`PartKind` gained **plate · ear · gill · crest · whisker** (5; `plate` backs the carapace). Synced
across the three sources of truth — `genome.ts` (types), `share.ts` + `mutate.ts` (the `TERMINALS`/
`KINDS` validator+mutation arrays) — so they round-trip through `CAM2:` and are reachable by
`changeKind`/`changeTerminal`/`freshAppendage` for free.

**New renderers (`CreatureMesh`).** Each new terminal is a recognizable solid: a tail **club** (spiked
mace) and **barb** (hooked sting); an **ear** (pointed/leaf/round by style); **gill** rakes (stacked
slits); a **crest** (feather fan); a **carapace** (a big world-aligned dome capping the back —
turtle/crab shell); **whiskers** (a fan of fine pale filaments). **Wings** were upgraded from one blob
to a membrane **braced by articulated struts** (finger-bones radiating into the web).

**Mouths 5 → 8 styles.** Added **fanged** (a maw with tusks), **lamprey** (concentric rasping tooth
rings), and **proboscis** (a forward tube). To keep the style→variant mapping a *single source of
truth*, factored it into `src/viewer/partStyles.ts` (`mouthVariant`/`eyeVariant`/`earVariant`, pure, no
three) that both the renderer and the tests read; re-banded the ~25 morphotype `mouthStyle` ranges onto
the new 8 equal bands so each kind still reads (bird/turtle/ratite/cephalopod → beak, crab/insect/
arachnid/arthro-alien → mandibles, shark/croc/serpent/dragon/wyvern → fanged, horror → lamprey/sucker,
the wild tail + chimera reach proboscis). **Stalked eyes** are a multi-segment eyestalk (a slim stalk,
taper ≈ 1 + the 0.16 eye floor keeps the tip bulb readable) — wired onto the crab.

**Generator wiring.** New builders `ear/whisker/gill/crest/carapace` + a `stalk` option on `eyes()`,
attached per-prior: felid/canid/rodent/ursid/primate/mustelid ears (+whiskers on the whiskered ones),
fish/shark gills, turtle+crab carapace, songbird/raptor/dragon crest, wyvern **barbed** tail / dragon
**barb-or-club** tail, crab stalked eyes. The wild tail rolls them all too. `exportGltf` got matching
simplified solids (carapace dome / club / barb / ear / crest / gill) so `.glb`s aren't bald.

**One test updated (honestly, not cheesed):** the morphospace "a dragon reads as a winged beast" check
now admits **chimera** alongside dragon/wyvern. Correctly no longer counting wyvern's *tail* as a leg
(terminal claw→barb) nudged the basin boundary, and dragon/wyvern/chimera genuinely share one
morphospace basin — all winged tailed quadrupeds; the 8-D descriptor can't see the clashing **covering**
that defines a chimera. That's exactly what M26's planned **sheen + headedness** dims are for. The test
still asserts the real intent (a dragon is a winged beast, not a fish).

**Verified (2026-06-29):** `npm run typecheck` clean; `npm test` → **83/83** (5 new in
`tests/engine/parts.test.ts`: the style bands cover all 8/5/3 variants; each deferred part grows for the
morphotype that should have it [felid ear+whisker, fish gill, turtle carapace, bird crest, wyvern barb,
crab stalked eye]; the re-banded mouths read [bird→beak · crab→mandibles · cephalopod→beak · shark→
fanged] and fanged/lamprey/proboscis stay reachable; mutation reaches every new kind+terminal over 8k
children; 300 creatures stay valid + in-bounds + **exactly bilaterally symmetric** with the new parts).
`npm run build` → succeeds (Rapier still its own lazy chunk; main +~8 KB for the renderers).
**In-browser:** every new part rendered as a feature across felid (ears+whiskers) / fish+shark (gills) /
turtle+crab (carapace) / bird (crest) / wyvern (barb) / dragon (barb+club+crest) / crab (pincers +
stalked eyes), with **no console errors**. (The distinct *look* of each part is the human's visual call,
as throughout — the multi-canvas WebGL page defeats the screenshot tool.)

## M22 — Full morphotype library · 2026-06-29 (Part 2)

The catalogue completion begins (ROADMAP 5.B). MORPHOLOGY §4 names morphotypes Part 1 never shipped;
M22 adds the seven the build lacked, taking the library from 23 → **30** (20 familiar + 10 uncanny).
Each is a real *multivariate prior* (coupled trait ranges + characteristic parts + covering), terse
data in `random.ts::MORPHOTYPES` — **no new compiler code needed**, the existing part builders + the
M21 posture table express them:

- **primate** (familiar) — upright posture, long grasping limbs (`claw` terminals = hands), a deep
  compact torso, a big expressive head with forward-ish eyes, fur. Reads as an ape/monkey; walks/ambles.
- **mustelid** (familiar) — a long tube body (repeat 6–9) on short plantigrade legs, small head, long
  tail, fur. Reads as a weasel/otter (z-extent ~4.9 vs girth ~0.35).
- **chelonian** (familiar) — a deep **domed** body (height 1.15–1.45, round elong), short stumpy
  sprawled legs, a small **beaked** head, **plates** covering + reticulate net. Reads as a turtle
  (the real carapace shell is M23).
- **ratite** (familiar) — a feathered **biped** on long stilt legs (legPairs 1, upright, legLen
  1.2–1.7×girth), small beaked head. Reads as an ostrich/emu (the long neck is M24's region work).
- **chimera** (uncanny) — a deliberately mismatched winged + horned + tailed quadruped wearing
  **spliced fins** (dorsal + pectoral) and a **clashing covering/pattern** (any of 6 skins × 6
  patterns), odd eye counts. Structurally consistent (so it stays coherent) but visually a griffin/
  manticore mishmash; flaps.
- **arthro-alien** (uncanny) — a wrong-arthropod with **ten** sprawled legs (legPairs 5), a cluster of
  4–6 compound/glowing eyes, mandibles, iridescent chitin. Scuttles (metachronal ripple).
- **crystalline** (uncanny) — angular rigid limbs (upright), a full **spike ridge** + horns, **glowing**
  facet eyes (the "core"), hard **plated/metallic** gradient skin.

Everything downstream is data-driven off `MORPHOTYPE_IDS`: the morphospace **centroids** (M11) and the
**morphotype filter** `<select>` (M16) pick the seven up with no other changes. Motion is auto-chosen
from body plan (M13), so each moves plausibly now (walk/flap/scuttle); the *specialized* gaits the doc
pairs with them (trundle/run/hop/jet/hover) are M25.

One brittle test surfaced & fixed along the way: `animation.test`'s "serpents undulate more than
quads" **fished auto-roll seeds** for the first legless long body — my larger pool shifted that seed
onto a *winged* legless creature (a wyvern → `flap`, waveAmp 0.04), which isn't the undulation under
test. Replaced the seed-fishing with a **forced serpent** (`genomeOfMorphotype('serpent')`, mean
waveAmp 0.379 vs quad 0.179) — deterministic and faithful to intent. Also fixed a fidelity nit found
in-browser: turtle/ostrich stub tails defaulted to a fish-`fin` tip — set their `tailTerm: ['none']`.

**Verified (2026-06-29):** `npm run typecheck` clean; `npm test` → **78/78** (4 new M22 tests: the
catalogue ships ≥30 incl. all 7 names; every new morphotype grows valid + in-bounds over 280 seeds;
each reads structurally as its kind — primate/mustelid/chelonian 4-legged, ratite a biped, arthro-alien
≥8 legs, chimera winged+tailed, crystalline spiked+plated; each stays coherent > 0.3 — and the existing
morphospace test's **mean > 0.45 / min > 0.2** holds over the now-30-type library). `npm run build` →
succeeds (Rapier still its own lazy chunk). **In-browser:** each new kind, driven through the filter,
rolled a distinctive valid creature — primate (4 hands, deep body), mustelid (z 4.9 tube), chelonian
(domed plates, 3.4×3.1 wide), ratite (feathered biped, tall), chimera (3 spliced fins + 4 eyes, flap),
arthro-alien (10 legs + 6 eyes, scuttle), crystalline (9 spike tips, plated) — coverings
fur/plates/feathers/chitin/skin all compile, motions in character, **no console errors**. (Whether each
*reads clearly as its kind* is the human's visual call, as throughout.)

## M20 — gallery layout · M21 — silhouette differentiation · 2026-06-29 (Part 2)

**M20 (gallery).** All 9 offspring rendered but the rail aside was `overflow: hidden` with the
gallery `flex: 1`, so the M16 sliders + M6 physics panel squeezed it and the 3×3 grid's rows clipped
(only ~3 showed). CSS fix: the rail is now `overflow-y: auto` and the gallery/grid size to content
(the grid's three rows come from the thumbs' `aspect-ratio`). In-browser DOM geometry: 9 thumbnails,
3 rows, 92×92 px, 0 overlaps, the rail scrolls, no errors.

**M21 (silhouette / "swept-back legs").** The sameness came from one uniform leg builder. Two fixes:
(1) `grow.growLimb` gives legs a **real knee** — after the first joint the curl pitch reverses and
amplifies (`-1.5×`), so the shin folds back under the body instead of the whole leg arcing in one
sweep; other limbs keep the smooth curl. (2) A **posture** system in `random.ts` (§6.1): a `Posture`
table (sprawling / digitigrade / plantigrade / hooved / upright) drives each leg's azimuth, curl,
articulation (segments), proportions, and terminal; all 15 legged morphotypes were assigned a posture
(felid/canid/dragon → digitigrade, ungulate → hooved, ursid/rodent → plantigrade, lizard/croc/crab/
insect/arachnid/frog → sprawling, …). One bound bug fixed: the posture curls exceeded the `curlPitch`
bound (0.6) — capped the ranges ≤ 0.58 and clamped the gene (the knee's runtime ×1.5 keeps the fold
dramatic without storing an out-of-bounds gene). Probe: foot-spread now varies by posture (sprawl
0.45–0.57 wide vs hooved/upright 0.23–0.30 tucked), feet reach below the torso, and **bilateral
symmetry stays exactly 0.0** through the knee + the M18 mirror. 74 tests + build green.

## M19 — The face: eyes & mouth always read · 2026-06-29 (Part 2)

Third reported defect. A probe found eyes present but tiny (mean r/bodyR ≈ 0.25, lost in the body),
radial creatures got eyes only 60% of the time and **never a mouth**, and ⅓ of all rolls had no
mouth at all. Fixes in `random.ts`: eyes are **guaranteed** (dropped the radial 0.6 chance) and
**~2× bigger** (`thickness` 0.24–0.4 → 0.5–0.68 of head girth, **floored at 0.16 bu** so a
small-headed creature still has a clear eye); the **mouth is guaranteed** on every face (head +
face-on-body chances → always) and **enlarged** (0.22–0.38 → 0.36–0.52); and `compileRadial` now adds
a **central maw** — a single `mouth` aimed near the +Z axis (`attachElevation` 1.35) so grow's radial
array collapses the N copies onto the front centre instead of ringing the rim. Result: eyes 200/200,
mouths 200/200 (were 29/30 and 20/30), mean eye r/bodyR 0.25 → 0.43. New `random.test` invariant
asserts every creature has eyes + a mouth with the largest eye ≥ 0.15 bu; 74 tests green; in-browser
every fresh roll shows the face (radial → a clustered central maw), no console errors.

## M17 — Body-locked textures · M18 — strict bilateral symmetry · 2026-06-29 (Part 2)

First two Part-2 milestones (the two defects that were genuine bugs).

**M17 (texture swimming).** The covering shader sampled the colour pattern + surface relief from
**world** position, so as the animated capsules moved through world space the texture flowed across
the skin. `CreatureMesh` now bakes a per-vertex **`aBodyPos`** attribute = the vertex's rest-pose
position (`restTransform·localVertex`) onto every body geometry — spheres (translation), capsules
(the base-pose pos+quat), and the smooth surface (identity, since it's untransformed) — and the
shader reads `patternField`/`surfaceHeight` from `aBodyPos`. The texture is now painted into the
body's own frame and rides the animation/rotation; the Mikkelsen screen-space bump is kept (it's
view-*consistent* — what mattered was making its height field body-locked). Verified: typecheck +
72 tests + build green; in-browser the shader compiles across fur/slime/scales/chitin/skin + the
smooth path with no console errors. (The "no swimming" itself is temporal — the human's visual call.)

**M18 (bilateral symmetry).** Confirmed a real bug (a probe found rolls with a node 2.0 bu off its
mirror). Fixed three breakers in `grow` for bilateral mode: the **yaw** spine bend is zeroed (trunk
stays on X=0; the wind is now animation, not static structure); **`pair:false`** parts are snapped to
the midline (aimed in-plane, roll + lateral curl zeroed so tails don't drift); and **paired** parts
are grown by **exact reflection** of the first limb (`x→−x`, quat `(x,−y,−z,w)`) instead of
re-growing from a flipped aim (quaternion curl/roll don't mirror, so the old way drifted). Result:
worst mirror error **0.0** across 300 creatures (Σx ≈ 1e-17). New invariant `expectBilateralSymmetry`
asserts exact x→−x symmetry over 400 forced-bilateral creatures; 73 tests green, morphospace +
motion classification unaffected.

## Roadmap Part 2 planned (Phase 5, M17–M26) · 2026-06-29

The human reviewed the build against MORPHOLOGY.md and flagged that Part 1 shipped every *system* but
not the whole *catalogue*, plus five visual defects — and directed: implement the doc **in full, no
simplifying or cheesing**. Wrote **[ROADMAP.md](ROADMAP.md) Phase 5 (M17–M26)**. Root-caused the five
defects with probes before planning (so the milestones are real, not guesses):

- **Texture swimming (M17):** the covering shader keys patterns on **world** position and computes
  relief from **screen-space** `dFdx/dFdy`; the animated mesh moves through world space each frame, so
  the pattern crawls on the skin + shifts with the camera. Fix = bake a per-vertex **body-space**
  coordinate attribute and read pattern + bump from it (analytic body-space gradient).
- **Bilateral symmetry (M18):** confirmed a real bug — most bilateral rolls are near-symmetric but
  some are badly lopsided (probe: Σx up to −7.5, a node with no mirror within 2 bu). The per-appendage
  azimuth jitter + off-midline `pair:false` parts break the X=0 plane. Fix = enforce midline-or-mirror
  in `grow` + a fuzz invariant.
- **Eyes/mouth (M19):** eyes present (29/30) but tiny (r ≈ 0.15 vs body r ≈ 0.7) and buried; mouths
  missing on ⅓ (20/30). Fix = big, hull-exterior, head-mounted, guaranteed face features.
- **Gallery (M20):** all 9 render but the M16 sliders + M6 physics panel squeeze the rail so rows
  clip. Fix = rail/grid layout.
- **Sameness (M21):** uniform leg posture + tube-and-leg-belt body. Fix = distinct leg-posture
  geometry + per-morphotype stance (deepened by M24 body regions).

Catalogue completion: **M22** the 7 missing morphotypes (primate/mustelid/turtle/ratite/chimera/
arthro-alien/crystalline), **M23** the deferred parts (ears/whiskers/gills/carapace/crest/club-barb +
lamprey/proboscis/tusked mouths + stalked eye + wing struts), **M24** first-class neck/head/tail
regions + the explicit trait-vector layer, **M25** the full motion library (hop/gallop/glide/jet/
writhe + limb-role motion primitives), **M26** the 8-dim descriptor + coherence-pull-in-mutation.

## Physics playback — vertical framing fix · 2026-06-29 (post-roadmap)

Follow-up polish to the playback below: the recorded gait sat at the physics *rest* height (~0.6–1.1
bu above the base pose), so toggling play/stop made the body visibly jump in frame. `simulateTrajectory`
now shifts the whole gait by a **constant** so its vertical centroid matches the creature's base pose —
the jump is gone, and because the shift is constant the gait's bounce is preserved. (xz is still
per-frame treadmill-centred.) Verified: a probe measured the pre-fix jump at 0.64–1.06 bu across
creatures; a new test asserts the post-fix centroid matches the base pose within 1e-3. 72/72 tests.

## Physics playback — watch the evolved gait · 2026-06-29 (post-roadmap)

Closed the M6 loop: you could *evolve* a walker but only ever saw procedural motion, never the
sim's actual gait. `fitness.ts` was refactored to a shared `simulate(p, opts, onStep?)` core;
`simulateDistance` and a new **`simulateTrajectory`** both go through it. `simulateTrajectory` records
node positions every `stride` steps (~120 frames), each frame **treadmill-centred** — the horizontal
COM is removed so the creature walks *in place* (it doesn't wander off-camera) while keeping vertical
motion (it visibly settles onto the ground and bounces). A pure `sampleTrajectory(traj, t, out)`
interpolates + loops the frames. `CreatureMesh` gained a `trajectory` prop: when present it re-poses
the capsules from the recorded frames each tick (forcing the capsule kit, since the smooth mesh is
static) instead of `computeAnim`. After a physics run the store records the winner's gait and
auto-plays it; a **▶ play gait / ■ stop gait** toggle swaps it against procedural motion, and the
gait is keyed to the winner's seed so navigating to any other creature drops it.

**Verified (2026-06-29):** `npm test` → **71/71** (2 new: the trajectory is deterministic + finite +
treadmill-centred [every frame's xz COM ≈ 0]; `sampleTrajectory` interpolates and loops). `npm run
build` → succeeds with **Rapier still its own lazy chunk** (CreatureMesh statically imports
`fitness.ts`, but only the pure sampler — the dynamic Rapier `import()` boundary holds; main grew
~4 KB). **In-browser:** an "Evolve to walk" run recorded a **120-frame** gait that auto-played
(`__cambrian.gait = playback(120f)`), the ▶/■ toggle flips the viewer between the recorded gait and
procedural motion, and navigating to another creature drops playback (seed guard); no console errors.
(Seeing it actually stride is the human's call — the preview throttles rAF, as throughout.)

## M6 — Physics fitness (stretch) · built 2026-06-29 (awaiting test) — roadmap complete

Creatures that *move*. New `src/physics/fitness.ts` (an adapter — the pure engine never touches it):
`simulateDistance(phenotype)` builds the skeleton as a jointed ragdoll in **Rapier** — a dynamic
rigid body (ball collider) per node, a **spherical joint** per edge — drops it onto a floor, drives
each limb with an oscillating **muscle torque** (∝ the limb's own mass, a per-edge phase makes a
travelling wave), steps 240× at a fixed 60 Hz, and returns how far the centre of mass travelled.
`runPhysicsGenerations` is the Karl-Sims loop: greedy hill-climb with elitism over physics distance,
so a wiggling blob becomes a crawler. The store's async `runPhysics` action appends the path to the
lineage; an **Evolve to walk** panel (`PhysicsPanel.tsx`) runs it and shows the best distance.

Two things made it work. **(1) Lazy-loading:** Rapier is the deterministic-compat build (~2.3 MB of
WASM-in-JS); a dynamic `import()` (in `loadRapier` + the store action) code-splits it into its **own
chunk** loaded only on the first Run — the main bundle is untouched (verified in the build output:
a separate `rapier-*.js`). **(2) Stability:** the capsule-union heavily self-overlaps, so naive
physics explodes. Fixed by **disabling self-collision** (collision groups — creature parts collide
with the ground only) and driving with a *physical* mass-scaled τ·dt impulse (an early per-step
torque-impulse drive flung creatures to 290,000 bu; the mass-scaled version gives a sane 0.5–4 bu
crawl). Determinism holds (the deterministic build + fixed timestep + seed-derived phases →
bit-identical replays).

**Verified (2026-06-29):** `npm run typecheck` clean; `npm test` → **69/69** (3 new: distances are
deterministic [`a === b` exactly] across seeds, finite + non-negative + non-exploding [< 100 bu]
across 14 creatures, and a run strictly improves with elitism + replays identically). `npm run build`
→ succeeds, **Rapier in its own lazy chunk** (`rapier-*.js` 2.3 MB / 842 KB gz, separate from the
1.16 MB main). **In-browser:** the "Evolve to walk" panel lazy-loaded Rapier (init fired) and evolved
an **8-generation walker travelling 3.76 bu**, the lineage advanced to gen 8, no console errors.
(Watching it actually crawl is the human's call — the sim is headless; the viewer shows the evolved
body, not the physics playback.)

## M7 — glTF export (stretch) · built 2026-06-29 (awaiting test)

Creatures leave the toy. New `src/viewer/exportGltf.ts`: `buildExportGroup(phenotype, smooth)`
assembles a *static* base-pose THREE.Group — the capsule-union body (spheres + capsules) or the M15
smooth surface, plus simplified feature solids (eyes = sclera+pupil, mouth = box, fin/wing/frill =
thin blades, claw/horn = cones, pincer = two prongs, foot = flattened pad) — with plain
`MeshStandardMaterial`s. glTF can't carry the procedural covering shader, so the export honestly
keeps the **base colour + PBR roughness/metalness** per covering (not the in-shader patterns/bump);
that's the expected trade for a portable model. `exportCreatureGlb` runs three's `GLTFExporter`
(binary) over the group → a `.glb` ArrayBuffer; `downloadCreatureGlb` wraps it in a Blob and clicks
an anchor. An **Export .glb** button joined the share bar (which also got its stale "CAM1" label
fixed to CAM2). The group builder is pure three (no WebGL), so it's unit-tested headlessly; the
exporter itself is browser-only (it uses `FileReader`), so the GLB bytes are validated in-browser.

**Verified (2026-06-29):** `npm run typecheck` clean; `npm test` → **66/66** (3 new: the export group
bakes real meshes with finite geometry + materials for capsule & smooth modes, and is non-empty
across 20 random creatures × both modes). `npm run build` → succeeds. **In-browser:** `exportCreatureGlb`
produced a **valid binary GLB** for both modes — `glTF` magic, version 2, the header total length
matches the buffer, a well-formed `JSON` chunk parsing to a glTF-2.0 document with **59 meshes**
(capsules, 704 KB) / **12 meshes** (smooth, 976 KB) + accessors + 4 materials; the Export button
renders, no console errors. (Opening the file in Blender/another viewer is the human's confirmation.)

## M16 — Dials & polish · built 2026-06-29 (awaiting test) — Phase 3 complete

The last Phase-3 milestone: surface the new axes, add a filter, grow the parts. Three new
**directed-evolution steers** (`pressures.ts`): **Wings** (rewards `kind==='wing'` parts), **Neck**
(rewards forward reach — the head/front extending beyond the bulkiest node, measured in girths, so
it's distinct from plain elongation), and a categorical **Skin** target (`coveringTarget` — a +1.5
score bonus for matching, e.g. scales). Covering is a paint choice, not an evolutionary struggle, so
to make "scaled" *reachable* the store seeds the start creature's covering to the target before a
run; the bonus + elitism then hold it the whole way. The pressure panel gained Neck/Wings sliders
and a Skin `<select>`.

A **morphotype filter** (`store.morphoFilter`) by the roll button — a `<select>` of all 23
morphotypes; when set, "New random creature" calls `genomeOfMorphotype` for that kind instead of the
bimodal sampler. And the dormant **frill** part is realized: the priors set `frill` on canid/lizard
but `compile` never built it — now a `frill()` builder adds a fanned collar (aimed up-and-side,
rolled flat) and `CreatureMesh` draws it as a broad thin membrane (wider/rounder than a fin).

**Verified (2026-06-29):** `npm run typecheck` clean; `npm test` → **63/63** (2 new: the wings &
neck steers improve their own metric in > half of a batch of roots [monotonic by elitism]; the
covering steer holds "scales" through a 40-gen run; the frill change keeps the 2000-genome fuzz +
morphospace coherence green). `npm run build` → succeeds. **In-browser:** the panel shows
Neck/Wings/Skin controls + a 24-option morphotype filter; setting Wings + Neck + Skin=scales and
running 45 gens took a furred creature → **scales covering + a wing part + a long forward reach**
(the compound "winged + long-necked + scaled" target); the filter rolled crab (6 pincers, scuttle) /
cephalopod (radial, drift) / bird (flap) / serpent (slither) — each true to kind; no console errors.

## M15 — Smooth skin · built 2026-06-29 (awaiting test)

The single biggest "less crude" win (MORPHOLOGY §12): one welded organic surface instead of the
capsule kit. New `src/viewer/smoothSkin.ts` defines an implicit field that is the **smooth union**
(polynomial smin) of the skeleton's capsules — the iso-surface at 0 *is* the capsule union, rounded
at the joints — and polygonizes it with **marching tetrahedra** (each grid cell split into 6 tets
sharing the 0–6 diagonal). Tets were chosen over marching cubes deliberately: watertight by
construction, a tiny case table (no 256-entry triTable), and — crucially — the surface is defined
by an exact SDF, so it hugs the body *predictably* with no opaque metaball strength/isolation tuning
(which would have been un-dial-in-able given the preview can't screenshot a WebGL canvas). Winding
is oriented outward per-cell by the field gradient, then `computeVertexNormals` gives smooth shading.

Engineering: the field is sampled once per grid corner over the padded body bounds, with **adaptive,
budget-bounded** resolution (roughly-cubic cells; grid_samples × primitives ≤ 0.7M) so the one-time
build is ~25–85ms on any creature; the hot loop inlines the capsule SDF + smin over flat typed
arrays. Capsules round-cap their endpoints, so only edges are needed as primitives (no per-node
spheres) — halving the work and refining the grid. A HUD **skin** toggle (capsules ⇄ smooth,
persisted on its own localStorage key) gates it; the per-covering material carries over unchanged
(the shader is world-space, so its patterns/bump map onto the new geometry for free). Smooth is the
**main view only** — thumbnails stay on capsules (framerate), and the smooth body is static (motion
pauses while shown; re-meshing per frame is too dear — a future metaball-animation upgrade is noted).

**Verified (2026-06-29):** `npm run typecheck` clean; `npm test` → **61/61** (4 new: a non-empty,
finite default surface; across 30 random creatures every vertex sits inside the padded bounds and the
surface spans ≥ half the body's length; deterministic; serpent + radial topologies don't explode).
`npm run build` → succeeds. **In-browser:** the skin toggle flips capsules ⇄ smooth (the
`window.__cambrian.skin` handle confirms), rebuilds on every new-creature roll, and toggles back —
all with **no console errors**; a direct in-browser build of the default creature returned a
**12,688-triangle** surface in **84ms**. (The multi-canvas page defeats the preview screenshot tool,
so the organic *look* is the human's call — as in M5/M12/M14.)

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
