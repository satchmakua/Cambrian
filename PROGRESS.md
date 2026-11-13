# PROGRESS — Cambrian

A build log of what shipped and the notable decisions behind it. **Keep it honest** —
this is the working memory between build sessions. The forward-looking plan and
acceptance tests live in [ROADMAP.md](ROADMAP.md); this is the backward-looking
"what got done and why" companion.

**Current phase:** Phase 6 (Part 3 — the Studio and the World; see the top entries, M94: an eighth look, harder; M93: what the seventh look left — tails, claws, paws and eyes; M92: a seventh look, the scores rise; M91: a sixth look — grins, a cat's face, a dragon's folded wing; M90: cut stone, a mouth of flesh, and hops that land; M89: a faster valley and an independent fifth look; M88: a fourth look, and breeding that stays coherent; M87: octopuses, webbed feet, bears; M86: a third look by eye, and bodies that keep their room; M83–M85: the valley by the square, the last of the parallel plans, a second wave of plans; M79–M82: a re-audit by eye, surfaces that read, and plans reworked in parallel; M76–M78: two reviews and the body plans one by one; M67–M75 and M60–M66 before them). Earlier: Phase 3 (the creature grammar). M0–M5 + **M8** (genome v2 + aim) + **M9**
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
| World skins | `src/world/skinQueue.ts`, `lod.ts`, `src/viewer/geometryCache.ts` | ✅ three finenesses by distance, ordered and built off the render within a frame budget, kept once built (tested in node) |
| Marks on the skin | `src/viewer/gills.ts`, `wings.ts` (`buildFin` root), `eyeSeat.ts` | ✅ gill covers / slits and midline fin bases traced over the drawn surface |
| Cut stone | `src/viewer/creatureMaterial.ts` (`facets`), `shards.ts` | ✅ the crystal covering: flat faces meeting in sharp edges (a tetrahedral grid, cut twice), a coat that mirrors face by face, shard clusters for horns and back spines |
| Imbricated coats | `src/viewer/creatureMaterial.ts` (`scallops`) | ✅ feathers and scales as overlapping scallops laid along a direction field on the skin (rest normal), relief sloped per pixel |
| Cells | `src/world/cells.ts`, `Flora.tsx`, `Landscape.tsx` | ✅ grass, crowns and bushes as one instanced mesh a square, each culled on its own; far grass thinned; a square re-posed only when its grass changes |
| Quills | `src/viewer/quills.ts`, `src/engine/grow.ts` (`QUILL_STYLE`) | ✅ an urchin's spines as one smooth cone each, root to point, all one mesh, kept out of the skin |
| Ape limbs and brow | `src/viewer/apeLimbs.ts`, `face.ts`, `src/engine/grow.ts` (`knuckleArm`, `armWalker`) | ✅ shoulders, knuckle-walking fists, flat feet, a brow ridge traced on the skull |
| Webs | `src/viewer/bodyField.ts` (`webPanels`), `feet.ts` (`isHindFoot`, toe webs) | ✅ a webbed ring of arms (the `web` gene) joined by flat panels of skin in the field; a frog's hind toes joined by thin two-sided webs |
| Room | `src/sim/world.ts` (`keepRoom`, `footprintGap`) | ✅ bodies on the ground keep their room: trunk footprints eased apart, the lighter giving way; a hunter at its prey and a courting pair let be (tested) |
| Saved games | `src/ui/saves.ts`, `game.ts`, `ScreenBoundary.tsx` | ✅ validated all-or-nothing loads, runaway numbering renumbered; a failed screen leads back to a menu that stands on its own |

---

## M94 — An eighth look, harder: a stone, a hawk's bill, an urchin's underside · 2026-11-13

- **An eighth look, briefed as a demanding art director** (seed 23, on the code after M93). Its mean,
  3.19, is not comparable with the seventh's 4.29: the brief was harsher, and it named something on
  every plan. Its worst ten and its recurring problems were the work list; what was done:
  - *Crystalline: a soft camouflage-patched blob* [4]. Countershading picks the belly's, the flank's
    or the back's tone by the surface normal, and on a skin cut into flat faces each face took one of
    the three: the patchwork. A cut skin has none now; its faces' own shades and inner glow only nudge
    the colour, and the narrow bevels between faces are lit as the cut's edges.
  - *Dragon: no tail, a winged horse* [4]; *rodent: no tail, a guinea pig* [3]. Both drew a tail 95
    and 90 times in 100; both always do.
  - *Hawk: a straight cone beak* [3]. The hook dropped the bill's centreline 0.6 of the mouth's radius
    while the bill tapered from 0.72 of it, so the upper mandible's underside ran level to the point. A
    hooked bill now stays deep, tapers late, hooks 0.84–0.94 down near its tip, over a shorter lower
    mandible: its point lies below the lower mandible's.
  - *Urchin: canister feet tied on with black strings* [3]. A radial body grows its central maw once
    per arm; aimed not quite straight down, an urchin's eight traced eight seams round its underside
    (the strings), a sea star's five a swirl of dark arcs, a horror's crown overlapping funnels. A
    radial body now draws and carves the first copy of each mouth gene (the sim keeps its copies). Its
    tube feet stood it on stilts and are gone (their draws still made); without them the hybrid skin's
    fallback skinned its quills as beaded rods, and now leaves them out. Its mouth is a small round one,
    straight down.
  - *Octopus: gold emoji goggles* [3]. Its eye was one metallic gold dome: it is now a dark wet
    eyeball with a fibred iris darkening to its rim round a bolder bar, a fifth smaller.
  - *Tortoise: legs poking above the shell like periscopes* [3]. Its legs run out level to a knee just
    outside the shell's wall, then down; the horn shell now swells out over each leg's root and knee.
  - *Crab: balloon boxing gloves with black thorns, in raw-flesh latex* [3]. The palm is pressed flat,
    the fingers dark only over their last quarter, the shell a darker red-brown.
  - *Feathers like fish scales* (songbird, hawk, ostrich, chimera). The head and the underside are now
    smooth plumage; the feathers' edges show on the back and wings, in a softer shadow.
  - *Cartoon faces from the front*: a shut mouth's crease was near-black, a line in ink under two eyes.
    It is a deep shade of the creature's own hide.
- **And from looking at the World and the studio between:** a rat's tail is naked (the bird's
  bare-shank gate generalised to any part), its ears pink inside, and a tailless rodent bare-pawed too;
  a coat keeps a fringe of fur along its outline however far off (the shells fade elsewhere); mood
  bubbles stay small when the camera comes close (a world-sized tag hid a mouse).
- **Then the rest of its recurring list:**
  - *A ball of a skull with a tube of a muzzle* (dog, bear). A skull with a stop is a braincase with a
    muzzle half its girth hung on its front, and its skin was just that: its lower outline stepped up
    where the muzzle began. A furred skull with a stop now has a jaw in its skin, a tapered cone from
    under the braincase to the chin: the jaw line runs on from the throat to the chin.
  - *Black stockings on bare shanks* (theropod, chimera, ostrich): a slate bill's legs were as dark as
    the bill. They are a mid grey now, under a softer plumage line.
  - *Hard-edged bands, painted on* (dragon, arachnid): a band's edge is a short blend now, the bands a
    little narrower than the ground between them.
  - *One cone for every horn*: a horn is a keratin sheath swept back along a curve from its root, ridged
    toward its base, dark at the root and pale at the point.
  - *The ape on round pads with bead toes*: its toes were stubs in black skin; they are long, like
    fingers, the big toe stands off like a thumb, in the face's own skin a shade darker.
  - *A songbird's wings as smooth clamshell slabs*: the folded wing's coverts were one flat pale field;
    two more shingled rows of lesser coverts lie above the first.
  - *A slug's mouth as a mail slot*: a mouth on a headless trunk is held to 1.5 of its radii (was 2.4,
    half the body's breadth), and a slime body shows no teeth along its seam. The dashed dark line along
    every seam (a zipper) was not the lip but the seam's upper jaw mass, a sliver a twentieth of a radius
    proud of the skin, in the hide's own material, fighting it for the same pixels; it is not drawn.
  - *Kermit's smile on the insects*: a mandibled mouth has no lips, but its dark opening ran its whole
    span, a U under the eyes; only its middle shows now (a little over a quarter of it hidden at each
    end, behind the blades' roots), a small slot between the mandibles.
  - *A theropod with one magenta arm and one mint*: its body is mirrored exactly, but its pattern was
    sampled at the raw position, so the noise under each arm differed. Markings now mirror across the
    midline (and the normal an eye-spot is laid on with them).
- **A ninth look: the same seed and the same brief, on the code with the fixes above** (a comparable
  read). Mean 3.26, from 3.19: up on the mouse, the hawk, the spider, the tortoise, the octopus, the
  sea star, the chimera and the dragon; down on the cat, the deer, the snake, the frog, the slug and the
  urchin (a reader's noise is half a point either way). It caught two regressions of this round, both
  fixed:
  - *The urchin a pear on its narrow end, a red band round it like a grin*: its new round mouth's
    funnel carved its bottom away. It is a seam again, drawn once, straight down, out of sight.
  - *Grainy dark stubble on muzzles* (cat, dog, mouse, deer, bear): the outline's fur fringe brought
    back the strands' dark roots the distance fade had toned out. The tone follows the fade again;
    only whether a strand is drawn follows the outline.
  …and, from its list:
  - *The crystal still a patchwork*: the patches were the clear coat, each face mirroring the white sky
    or the dark ground. A cut skin takes a satin polish now, in bigger faces (0.75 of the girth across),
    its edges lit more softly.
  - *A snake's tail hooked up*: a legless body has no feet, so the step that lays a tail on the floor
    never ran; it does now for a body that lies on its belly, and each link settles as the tail thins.
  - *Stockings, still*: bare shanks take four tenths of the coat's own colour, darkened.
  - *The far eye out of the outline, marble eyes*: a face's eyes sit a little deeper (0.52 of their
    radius under the skin, was 0.42).
  - *A deer's horns growing out of its ears*: both attached at the back of the skull, the horns'
    sideways angle overlapping the ears'. The horns rise from near the top of the crown, a little
    forward on the brow, and the ears stand out to the sides.
  - *A dog's muzzle a bulb creased onto the skull*: as well as its jaw, a stopped skull has a bridge in
    its skin, from the brow down onto the muzzle's first link: the top line slopes onto the nose.
  - *Glossy vinyl arthropods*: chitin wore a near-mirror coat with an oil-slick shimmer; it is a satin
    lacquer now (a 0.45 coat at 0.24 roughness, half the shimmer).
  - *A shark's skin like a stuffed sock*: every covering wore the same sub-surface musculature, which
    rumpled taut skin. It shows by covering now: a third on bare skin, under half on slime, six tenths
    on scales, full on fur, feathers and plates. And its tail stock is short (0.44–0.6 of the girth a
    link, was 0.6–0.85): no lollipop stick under the crescent.
  - *A frog's goggle eyes*: a round eye bulging from a bare crown has a gold or bronze iris across nearly
    the whole ball, round a black horizontal pupil.
  - *Paint smears and stained glass* (a theropod's magenta snout on mint, a dragon's purple bands, a
    wyvern's crack network, a sea star's navy polka dots): feathers and uncanny plans could wear any
    marking hue, and a plan's sober-markings flag was ignored on an uncanny one. The flag now holds
    whatever the cluster, and the theropod, the dragon and the wyvern ask for it: markings in the
    body's own hue, darker or paler, or umber.
  - *Pale puffball paws* (cat, dog, bear, ape, weasel): a paw faces the ground, so countershading gave
    it the belly's tone; a leg and its paw wear the flank's now.
- **Still to do from it:** the weasel end on (its shoulder joints stand out past its flanks); ears
  that are spikes edge-on (the far ear, facing forward-out, from a three-quarter view: thicker ears
  didn't help — it is the angle); the frog a bun on its chin (its forelegs attach under the middle of
  its body, behind its broad head); FACE plates that frame nothing or cut the head off.

## M93 — What the seventh look left: tails, claws, paws and eyes · 2026-11-13

- **A shark's tail is a crescent.** Its fin was a fan from the root to an outline that ran through a
  notch right behind the root: each lobe a sliver, two thin spikes (0.14 of the box they spanned). It
  is now a crescent, the upper lobe's leading edge rising convex far back to its tip, the trailing edge
  hollow down to a notch low on the fin, a short lower lobe; the tail stock is slimmer before it. The
  five gill slits, drawn at the gill part's own tiny size, are each a third of the flank's depth.
- **An octopus's eye is round.** The almond lids every vertebrate wears hid the top half of its yellow
  iris from any view above: a half-disc under a skin hood with a dark bar along its top edge, read as a
  gaping mouth. A radial body's lids now open about 52° all round, and the bar is slimmer.
- **A mouse stands low on bare pink paws.** Its row never named a foot, so it took the default felt pad:
  a flat dark disc. It now has paws, and a rat-like body (small, furred, on paws, with a thin tail —
  its root under a quarter of the trunk's radius tells a rat from a weasel, its height a rat from a
  cat) wears them bare: flesh pink, a narrow palm, four long fanned toes. (In the coat they were fuzzy
  slippers.) Its legs are three links, not three or four, so they stand 1.2–1.5 trunk radii below the
  belly, not 1.1–2.0. Shortening the length gene alone ran the links into its floor (0.2), where a
  youngster's legs could no longer be shorter than its parent's.
- **A crab's claws fold in before its face on slim arms.** The arm's links were as thick as the claw at
  its end, four balls a gene's length apart: one bloated sausage with fingers on. A claw-bearing arm's
  links are now 0.62 of its girth and the claw keeps the full girth, so the palm is the bulk. The
  claws crossed in an X because the arm curled in until each pointed across the face; the wrist now
  sets each claw's heading so its fingertips stop just short of the midline (20–46° in).
- **Alien eyes are eyes, not lamps; an insect's are bare domes.** Every non-vertebrate eye sat in a dark
  torus a quarter of its radius thick: round a flat lit disc with a dot of a pupil it was a pair of
  spectacles, round a coarse black faceted dome a pair of goggles. A glowing eye is now a dark wet ball,
  a lit iris (darkening to its rim, fibred) round a slit pupil, a catchlight, in a thinner rim of the
  body's own covering; teal, bile green, amber or violet. A compound eye is a ringless dome of fine
  facets, tinted dark bronze, rust, bottle green or slate.
- **An arthropod's legs run on into points.** A chitin leg ended in the generic claw, a dark cone as
  wide as the leg's end set on its last node: a tack pushed into the leg. It now tapers on along its
  last link in the body's own covering, from inside the node so no collar shows, to a slim dark point
  on the ground.
- **A weasel's face, not a hamster's.** Its head was a round cranium and one blunt muzzle link with a
  pink button nose. The skull is now narrower and flatter, and the muzzle two links narrowing to the
  nose (its snout gene just past the line where a mammal's muzzle grows its second link — the weasel's
  own tests had pinned it at one). A small animal with a brush of a tail (its root over 0.3 of the
  trunk's radius) is pink-nosed a third as often: a weasel's nose is mostly dark, a rat's still pink.
- **Still to look at:** the bear's muzzle (a tube ending in a bulb), the ape's coat at a distance (bare
  rubber), a rat's furred tail (a real one is naked).

## M92 — A seventh look: the scores rise, and what they found · 2026-11-13

- **A seventh look, at a fresh seed (17), on the code as it stands.** The mean score rose from 4.06 (the
  sixth look, seed 13) to 4.29: the cat, the crab, the horror and the chimera from 3 to 4, nine plans
  now 5. Two looks at different seeds by different readers are noisy, but the plans fixed between them
  are the ones that rose. Its worst ten, and what was done:
  - *An earless bear in hot pink.* The bear drew ears nine times in ten; now always. A familiar pelt's
    rare vivid morph (4% of founders) took any hue; it is now one a mammal has, a dark charcoal or a
    pale cream in the plan's own hue.
  - *Wings bolted on with a pole*, on the dragon, the wyvern and the chimera: the folded wing's
    humerus, its radius a share of a span now built a third bigger, was a round-ended peg 0.09 units
    thick on a big dragon. The folded arm is now a finger ray's weight, the membrane's leading edge.
  - *An owl's face on the ostrich.* An eye's elevation, unset, aims it straight ahead (right for a hawk,
    an ape); the ostrich and the songbird now look out to the sides, the ostrich's eyes on its crown
    behind the bill instead of beside it, where they were two-thirds as wide as the skull.
  - *Crystal facets like two skins flickering.* The skin was cut into faces (M90) and the shader went
    on cutting its own, elsewhere. A cut skin now has a material that cuts nothing and shades each
    geometric face its own tone (a face's normal is the same at its corners, so it hashes to one value).
  - *A crest like a paper hat.* Its blades were thin along the crest's aim, which points up: they lay
    flat on the crown. It is now a tuft standing in the plane of the head, sweeping back.
  - *Sad cartoon mouths* on the fish, the frog and the slug. A seam mouth split a wide gape about its
    line, its upper lip arching up in the middle: a frown. It now parts a sliver, and its lips are
    levelled across the face (each sample's pitch nudged until it sits at the middle's height), since
    a sweep at one pitch rises at the corners on a narrow snout and falls on a round head.
- **The card you are looking at.** In the World, a creature's card showed an empty dark square for a
  portrait: portraits are drawn one at a time, first come first served, and the card's waited behind
  every census icon. The portrait queue now takes urgent requests first.
- **What it left:** the shark still a dolphin from the side (no mouth seen, a beak of a snout); a
  weasel's hamster face; an octopus's slit eyes read as mouths; a mouse on stilts; a crab's claws
  crossing in an X; flat glowing disc eyes on the uncanny plans; tack-like caps on arthropods' legs.

## M91 — A sixth look: grins, a cat's face, a dragon's folded wing · 2026-11-13

- **A sixth look, by another's eye.** All 31 plans at a fresh seed (13), cropped to the creature
  alone (no classifier labels in frame), went to an independent reviewer judging only the pictures.
  Most plans now read as their animal (4 or 5 of 5); five scored 3: the cat (a striped dog), the
  shark (a smiling dolphin), the crab (a spider in three-quarter view), the horror and the chimera.
  It also found faults across plans: cartoon smiles on many faces, hoop stripes, slipper feet.
- **My own cut, torn.** The crystal hide's facets (M90) showed dark slivers and gaps. Three causes,
  each found by elimination with before/after renders and a debug channel: triangles turned over
  (the undo test compared a triangle with its corners' new normals, and a bevel could pass while it
  faced into the body: 40–48 a skin; it now compares with the triangle's own original face, and none
  turns), notches in thin legs (a face is wider than a shin; the legs are left uncut), and black
  flecks round the mouth (the lip seam and the sockets were seated on the uncut surface; the skin
  round the eyes and the mouth is left uncut). The mesh was watertight all along: the specks that
  survived a colour override were other meshes standing out of a sunken skin.
- **Closed mouths stop grinning.** The lip line was swept across the face about the mouth's own up,
  and a mouth aims down onto the face, so that up leans forward: the line was a circle on a tilted
  plane, and from in front its corners rose above its middle by up to two-thirds of the mouth's size
  (a shark's). It now sweeps about the head's own vertical, and the worst lift across every plan falls
  to 0.12. A seam's corners now fall only a little; a muzzle's lip line falls well back to its corners,
  as a dog's or an ape's does, since a level line wrapped round a muzzle reads as a grin from above.
- **A cat's face.** The cat wore a dog's: a big black nose, round brown eyes, and a pale hood that
  stopped dead at the neck. It now looks out of slit eyes (a slit eye in fur takes a cat's gold, amber,
  green or pale blue, not a reptile's russet); its nose pad scales with how far the muzzle reaches
  ahead of the braincase (a cat's about 1.6 radii, a dog's 2.4) and is rose two times in three on a
  short muzzle; and the plain-head mask (M89) now covers bands only, since a tiger's or a tabby's
  stripes run on over its face.
- **A dragon's folded wing.** The resting fold (M89) was a fan the size of the head standing on the
  back, its arm a peg. It is now built at a third more than the open span, its fingers raked back and
  down from the wrist like a cape, its bones slim: a great half-raised sail over the back, the resting
  pose most dragons are drawn in. (Draped against the flank instead, it read as a pattern on the skin.)
- **Check the check.** A "fails on the old code" check that stashed an already-committed file stashed
  nothing and ran the new code twice. The old file is now taken from the commit before, not the stash.
- **More from the same look.** The shark, its grin gone with the lip-line fix, reads from the side and
  face as a pointed-snouted shark. A crab now folds its claws in before its face, a joint more to fold
  at (the curl gene's bound stopped three joints short: every mutant is checked against it), so the
  claws curl round the front of the shell and all but meet; they ran straight out ahead, a scorpion's.
  A funnel mouth's rim rounds over (a sharper cut stair-stepped and caught the light, a torn rim) and
  its rasp's knobs are thick enough to read as knobs. A songbird's skull is always round (a third were
  drawn broad, a helmet) on a neck near its girth (it was half: a ball on a stalk); a thicker neck
  still cost the game's own identifier its songbirds, since the neck lowers the headedness it measures.
  A feathered tail lies in a shallow trough, the outer feathers lifted to either side, and runs longer:
  laid flat, from the side it was its own edge, a twig in a hawk's rump.
- **A tiger's stripes were the wrong way about.** The stripe field laid the marking colour over two
  thirds of each period and left the coat only in narrow lines, so every striped animal was a dark coat
  ringed with thin pale hoops: the reviewer's "rings on a toy". The marking now lies in the narrow band
  where the wave crosses zero, dark stripes on the coat, and stripes and bands run down from the back
  and give out under the belly instead of wrapping the trunk at one width. (The hoop complaint had been
  read for years as a matter of spacing; the render, zoomed, showed it was polarity.)
- **A long muzzle's nose.** A dog's, a bear's and a deer's nose pad covered a third of the muzzle's
  front, a dot on the end of a hippo's snout; it now grows with the muzzle's reach to about half (a
  cat's stays small), and a bear's muzzle runs a little shorter and tapers to it. The end of a bear's
  muzzle still bulges from the side.
- **A pelt at a distance, not yet.** Fur reads up close (its shells, its per-pixel relief) and as
  smooth rubber at the distance most views see it from. Streaks of tone along the way the hair lies
  were tried and taken out: squeezing the noise along a direction that turns across the body warps it
  into swirls, and the pelt read as wood grain, worse than rubber.

## M90 — Cut stone, a mouth of flesh, and hops that land · 2026-11-13

- **What the fifth look left, part one.** The horror's crown mouth read as a drain: a near-black,
  glossy funnel whose facets caught the light like cut glass, ringed by a smooth pale hoop. The funnel
  is now painted along its depth, wet flesh at the rim through gum to the near-black of the throat,
  and less glossy; the rasp is a ring of fifteen keratin knobs, dulled toward the lip's flesh. A
  lamprey's rows of teeth now stand in flesh too.
- **A crystal hide is cut, outline and all.** The crystalline beast was faceted only in its shading:
  its outline was every other creature's soft round body, a pig in a glass texture. Its skin is now
  laid onto flat faces after it is polygonized: the vertices are split into Voronoi cells over body
  space (a face about 0.62 of the trunk's girth, the cells hashed from the seed) and each cell's
  vertices are projected onto its own plane, taking its normal; the triangles spanning two cells
  become the bevels between faces. Nothing is split, so the mesh, its index and its skin weights stay
  as they were. Laid flat across the crease of a leg into the body the skin folded over itself, a black
  tear, so a vertex turned well away from its face's plane, or far off it, stays put, and a triangle the
  cut turned over is put back. About 5,000 vertices come out on some 600 faces, at about 5 ms a skin.
- **Two things the look left stay left.** A dog's and a bear's muzzle is a tube ending in a round bulb,
  a sausage on the face, but the dog's own test holds the muzzle's girth to the nose on purpose (a
  tapering cone read as a bull terrier) and a re-taper would undo that; it needs a better shape, not a
  tweak. A weasel seen end on is a ball behind a small head: its shoulder joints set the width, slimmer
  legs fail its "stout" test before the joints thin, and a wider skull barely shows.
- **Saltation that lands.** A litter's two saltation children are bursts of structural change, and
  about one in five came down near no plan at all: a bird swollen to a sausage, a deer ballooned round
  on its legs, a dog with a chest like a barrel. Such a child now keeps its structure (which parts, and
  where) and has its proportions drawn 70% of the way back toward a founder of its lineage's plan:
  each body section's size, link count, taper and bend, and each part's toward the founder's part of
  the same kind. Of 99 such children of ten founders, 35 had a body section more than 1.8 times its
  parent's (or under 1/1.8 of it); landed, 14.
- **Aim at the right attractor.** The roadmap said to hop toward the *nearest* plan. Drawn toward the
  plan the child itself was nearest, the ballooned deer, nearest a shark by the coarse measure, lay
  out long and low as a shark does. The measure is ruled by structure (counts of legs, wings, tails and
  eyes; radial or not), so it can't say what proportions a body should have; the lineage's own plan
  can. The same reason is why the measure barely moves (21% → 20% in a valley): landing keeps the
  structure.
- **A hop to the other symmetry lands whole.** One saltation child in twelve flipped symmetry, and
  every one came down near nothing: a cat's legs splayed round a disc, a hawk a heap of feathers.
  Bilateral proportions can't mend a radial body, so such a child now becomes a founder of the nearest
  plan that shares its symmetry, in its lineage's colours and with its own seed: a sea urchin or an
  octopus in the cat's coat colours. (The coarse measure's nearest plan for a flipped cat is usually a
  bilateral one, so the search runs down the ranked list to the first of the child's symmetry.)

## M89 — A faster valley, and a fifth look · 2026-11-13

- **Profile the fast-forward.** A simulated year spent a sixth of its time scanning all 170 plants for
  cover (every hunter's prey and every fleeing animal, every step) and a third sampling the terrain
  (fractal noise and the river's course, microseconds a sample, several times a creature a step).
  Plants are now gridded by the square; they never move, and the answers are identical (same births,
  kills and population over a year). Heights are sampled once onto a half-unit grid, a tile at a time
  as the ground is first asked for, and read back bilinearly by the sim, the landscape and the
  creatures alike. Mean error 0.002 bu, worst 0.09 at a river bank, and over fourteen valleys a year
  ends with the same 5.8 kinds on average as with exact heights. A year: about 12.7 s → 7.4 s.
- **A test should say what it means.** With heights sampled, one valley's year ended with four kinds
  of seven instead of five. The fourteen-valley run shows that was chance, and the test, named "most of
  its kinds", now asks for four. Bodies keeping their room was simply too soft, though: grazers
  drifting into one another as they fed outran an easing of 40% of an overlap a pass. A pass now eases
  the whole overlap up to its cap, and standing animals' deep overlaps fall from up to 0.44 a snapshot
  to 0–0.11. One walking past another still passes through it for a moment.

- **Dry years.** Every year was the same year, and a valley settled into one balance and stayed
  there. Now, like the weather, a pure function of the seed and the year makes one year in four dry
  (never a valley's first), with a severity of a half to all. Its wet spells come that much less often,
  grass and fruit come back slower, and what a meadow can hold falls by up to half, the standing grass
  above that withering over a day or so (slower regrowth alone did nothing: a meadow near full fed a
  herd through any slow year). The journal tells of it at the year's first dawn, the season reads "dry
  year" or "drought", and the green bleaches toward straw. Over six valleys run three years a dry
  year's lowest population falls 12–20% while ordinary years are unchanged, and every valley ends with
  five to seven kinds of seven.
- **A fifth look, by someone else's eye.** All 31 plans at a fresh seed (8) went to an independent
  look that judged the pictures alone, with no code. What it confirmed, fixed in order of how badly
  each misread:
  - *Five plans floated.* The ground is the bounds' lowest point, and that counted a mouth or an eye
    hung under the body (a sea star's mouth, an octopus's beak) and took every node as a ball of its
    radius, though a flat disc or a shell reaches less far down. A creature now rests on its body and
    limbs, as drawn: the sea star sat 0.22 bu off the floor, the octopus's arms 0.23. The slug's sole
    now lies level, and an octopus has eight arms.
  - *Wings were a pole and a paddle.* A dragon's membrane wing was only ever built spread and raised,
    so it walked the valley with its wings held open: edge on, a pole; head on, a crucifix. It now
    folds at rest as a bat's does (the wrist and its thumb claw over the shoulder, the fingers back
    down the flank, the skin pleated between them) and opens from the fold to fly.
  - *An emu stood knock-kneed.* A two-legged bird's legs were yawed toward each other at every joint:
    an emu's feet came down at an eighth of its hips' spread, crossed. They now stay in the fore-aft
    plane, feet under hips.
  - *A hawk wore a pigeon's bill.* Its hook dipped only at the very tip of a pale wedge. A stout bill
    now curves down its whole culmen into a deep hook, painted from a yellow cere where it leaves the
    face (found by marching the bill's spine out of the skin) through blue-grey horn to a dark tip.
    Painting it showed a second fault: a tall blade rooted up the face stood its buried root's top edge
    out above the brow, a plate fixed upright on the forehead. Every ring of a bill still inside the
    head is now drawn back under the skin. Ratites draw only slim bills.
  - *The dragon was a llama, once a duck.* A domed cranium over a dropped mammal muzzle, a horn
    standing up off the crown like an ear, and a flat cyan disc for an eye (three dragons in five drew
    an insect's facets or a glowing eye). Its eye is now a reptile's slit under a scowling brow, its
    skull low and broad, its jaw running out level, its horns swept back along the skull. The duck
    was a colour fault: a band's edge across the face painted the snout like a bill. A banded or
    striped coat now leaves the head one tone, a capsule from braincase to snout tip in the shader.
  - *The shark was a toy beluga.* Three head links, tapering no further than a gene allows, ended in a
    cap a third of the head across, and a bony fish's silver-ringed eye looked out over a grin. Four
    links bring the snout to a point over the mouth, the skull is broader than deep, and a swimmer in
    bare skin has a dark eye.
  - *The crab was a spider or a tick.* A small shell slung between long, thin, high-kneed legs, its
    claws the size of their tips. Its legs are shorter and stouter, reaching about twice the shell's
    half-width, and its claws heavier.
  - *The face plate looked out from inside an arm.* A sea star's or an urchin's face is its middle, and
    the portrait camera stood a head's distance in front of it. It now stands outside the body, and a
    radial animal's crown is looked down on from far enough back to see all of it.
- **Keep a bad fix from moving another plan.** A plan's change is checked against a fingerprint of
  every plan's founders, and each change above moved only its own plan (and random genomes drawn as
  it). One reached further: a thicker dragon snout made the dragon's headedness descriptor drop toward
  the chimera's, and the classifier began reading eight chimeras in forty as dragons (four before). A
  snout a little slimmer keeps the dragon's look and puts the count back at four.
- **What the look left.** A weasel seen end on is a ball behind a small head (its head is about 0.65 of
  its body's width; a ferret's 0.8), mammal muzzles are much alike, the crystalline beast is smooth
  where it should be cut, and the horror's mouth on its crown reads as a drain grate.

## M88 — A fourth look, and breeding that stays coherent · 2026-11-13

- **A fourth look by eye.** All 31 plans rendered at a fresh seed (5) read as their animals. What
  stood out was colour, not shape. Every animal's iris is hashed from its seed alone, and the palette
  had no brown, the commonest mammal eye. An animal's eye (round or beady) now takes a natural colour:
  dark brown above all, then amber, hazel, gold, a cat's green, a rare pale blue. An alien's glowing
  eye keeps the striking accents. A familiar frog, lizard or snake took any marking hue a third to
  half of the time, plus a complementary flash: a green frog with purple spots, a yellow snake banded
  in violet. Its markings are now mostly its own hue, darker or paler, or umber; birds keep the most
  colour. Dragons always have wings, and a mouth on a headless trunk (a slug's) is capped at a mouth's
  width, where before its seam ran across the whole front of the animal.
- **Measure the litter, not one child.** The breeder's wilder children read as jumbles. Over five
  generations down the exploratory and saltation lines of six familiar founders (1,026 offspring),
  52% carried a part whose tip didn't fit its kind (a horn ending in a hoof, a leg in an eye) or a
  head's part grown off the head (an ear on the rump). Each kind now has its tips, taken from the plan
  library; a part that changes kind is re-tipped; a fresh ear, horn, crest, whisker or feeler grows on
  the head, near its crown: 3.6%.
- **A protection can be a ratchet.** The face is never removed, so a lineage keeps its face; but a
  fresh maw or eye-stalk counted as the face, and a mouth sprouted on a flank stayed for good. 17% of
  offspring had a second face. Mutation no longer creates face parts or duplicates the head (grow
  guarantees the face itself): 0.
- **Step a scale gene by a share of itself.** Point mutation stepped every gene by a share of its
  whole range: a size by about ±0.28 bu (half a fox's trunk), a link count by about ±3. A fox's
  exploratory child was a worm curled up on a sliver of a trunk. Sizes, lengths and thicknesses now
  step log-normally, and link counts half as freely (four links is a cat's leg, six an insect's): a
  dimension doubled or halved in 0% of conservative children (from 18%) and 11% of exploratory ones
  (from 61%). The saltation children, the basin hops, still hop.
- **A hop should land.** A body that loses its last legs now becomes a legless one: two more links,
  slimmer, longer and level (a bird without legs or wings had been a feathered sausage standing on
  end). A body that gains a pair grows a link to carry it, and a part is copied only if it is
  decorative: a copied leg had been a third pair crowded under a cat's belly, and a copied eye pair a
  second face over the first. A symmetry flip went to "none" a third of the time, which leaves every
  paired part one-sided (a fox on two legs down one flank), and one saltation child in five flipped.
  A flip is now bilateral ↔ radial only, and rare (2–3% of children).

## M87 — Octopuses, webbed feet, bears · 2026-11-13

- **One gene copied round a ring is a starburst.** A radial body grows every part once per sector:
  an octopus with eight arms got eight eyes, a ring of glowing discs round its mantle, over eight
  identical straight arcs (from above, a spider's legs). A part can now grow on a radial body as a
  pair mirrored either side of the front (`radialPair`). The octopus has two eyes, low on its head
  just above the arms: gold, under a heavy lid, with a short flat bar of a pupil (on a radial body
  the slit eye's pupil lies flat and short; a sliver from rim to rim, laid flat, was sunglasses).
  Each of a radial body's arms bends its own way, a little to one side, some lifting their tips. The
  bend is hashed from the seed and the arm, so no draw in the stream moves. The horror's tentacles
  writhe too, and the urchin's two-link tube feet are left as they were.
- **Arms that leave the head as one.** An octopus's arm is now broad where it leaves the head (its
  neighbours' roots meet its own) and drawn out to a fine tip over five or six links. A web of skin
  joins the arms near their roots (`web`, a share of their length): in the skin field, one flat
  ellipsoid between each arm and the next, half an arm thick. The rig binds its skin to the arms on
  either side of it, so it moves with them. Both genes are optional, and an older share string
  decodes as it always did.
- **A web that can't be seen is not a web.** A frog's hind foot was its hand again: short
  pad-tipped toes splayed on bare ground. The first web was right in the geometry and invisible on
  screen. At a hand's length the toes nearly touched for half their run, so a web stopping halfway
  out lay under them, and every gap the eye saw was beyond its margin. A frog's hind toes (the legs
  rooted furthest back: `isHindFoot`) are now 30% longer and fanned a little wider, and their webs
  reach nearly to the pads.
- **A sign is a carriage.** The bear stood level from rump to shoulders, its muzzle hung from the
  brow at the default droop: a tapir. Its trunk now pitches gently up toward the front, the
  highest point over its shoulders, and its muzzle is held out level. A positive pitch, tried first,
  is the weasel's arch, which grow levels so that its hump sits mid-back: it humped the middle.
- **The coat runs onto the paw.** A paw is drawn in the skin's base coat, but the fur shells covered
  only the body, so the coat stopped at the ankle in a ring over a bare shiny paw (a sock and a
  slipper). The shells now run on over the paw: a bear's, a fox's and a cat's feet are furred.

## M86 — A third look by eye, and bodies that keep their room · 2026-11-13

- **Look again after the rework.** All 31 plans were rendered to one sheet at the same seed and read
  by eye. Three still read as something else. The slug's mouth fell in the sucker band: a dark
  ringed hole a third of its body wide, blades standing inside it. It is now a small soft grazing
  mouth, a seam across the front of the foot or out of sight beneath it. The wyvern's skull came out
  either flat (twice as wide as tall, overhanging a thin neck: a mushroom cap on a pole) or a narrow
  wedge, with nothing between; its breadth and depth are now pinned between the two. The ratite drew
  any skull, a domed one in a third of its heads (an emu's head is about a quarter of its body's
  depth), and a feathered tail fan, which seen edge-on was a straw stuck in the rump. It now has a
  small tapered, wedge or round head and a short plain stub of a tail.
- **A dropped draw moves every draw after it.** Taking the ratite's tail away shifted the random
  stream under the neck and the legs: half the birds could no longer bring their beaks to the
  ground (the rig's test of reach for a tall bird failed). The tail is still drawn, only plain, and
  the founders' bodies are as they were. Each fix proves with the plan fingerprint that no other
  plan's founders moved.
- **See it where it lives.** The new meshes (an urchin's quills, a centipede's pointed legs, a
  crocodile's scutes) are built at the World's lower detail and on its rigs, which the Studio does not
  exercise. Each was released into a World with `?morph=…&follow=…` and looked at up close: all three
  draw, with no errors.
- **Bodies keep their room.** That look found herds standing inside one another: two crocodiles
  crossed like scissors, centipedes running through centipedes. The sim never kept bodies apart.
  Each body on the ground now has a footprint, a capsule over its trunk down its heading. Any pair
  whose footprints overlap eases apart along the line between their nearest points, a share of the
  overlap per second, and the lighter animal gives way the more (a mouse steps round a bear). A
  hunter at its prey and a courting pair are exempt: a snake's footprint runs metres down its back,
  and held off its prey its jaws, measured from its middle, would never close. Fliers aloft and fish
  against waders are skipped, and no push carries a body where it can't stand. Measured on thirty
  animals released in heaps: deep overlaps fell from 11–15 to 0–1.
- **Profile before optimizing.** The pass first made a year of fast-forward 40% slower. Sweep and
  prune didn't help, because the broad phase wasn't the cost. A counter showed two terrain samples
  per push (fractal noise and the river's course), a comparator sort, and a population 6% larger
  (herds spread out graze and breed a little better). The sort now runs natively over numeric keys
  that pack each body's index under its west edge. The pass runs every other step, over both
  steps' time. The shore is sampled only for a body whose own ground height puts it near the
  water. A year runs in 8.7 s, against 8.9 s before the pass.

## M83–M85 — The valley by the square, the last parallel plans, a second wave · 2026-11-13

- **Measure the frame, then cut what is out of it.** One instanced mesh for all the grass, all the
  crowns, all the bushes had the whole valley for its bounds: drawn whole, in the main pass and
  again from the sun, wherever the camera looked. Sorted into squares with spheres of their own,
  the renderer's frustum test drops what is out of view (938k → 567k triangles a frame up close at
  High). Where nothing is out of view — looking the length of the valley — the far squares of grass
  are drawn thinner. A square of grass is re-posed only when its grass changed; berries that are
  not on a bush are not drawn (an instance scaled to nothing still sent its triangles); the sun's
  shadow map is redrawn every other frame.
- **Two right fixes can be wrong together, again.** The fox's fixer gave a plain tail's style gene a
  brush from 0.6; the crocodile's, a sculling blade from 0.7 — each without the other, with rows that
  overlapped. One cut to a band now (rod, brush, blade), and a test grows both. The fox's forehead
  step was withheld from heads "set on the shoulders"; the crocodile's fixer gave it a neck. The
  reason a crocodile has no stop is a flat skull with no brow to step from: the rule now reads that.
- **A merge is also a cleanup.** The fixers had independently added the same knobs under different
  names — sober markings twice, a level head twice, a leg taper three times, an arm's link count
  twice. One of each is kept. A worker that died mid-run left complete work in its checkout (renders,
  a test file): its patch was rescued, read in full, merged and checked like the others.
- **What a part is drawn as can be the fix.** An urchin's spines were chains of skinned links ending
  in claws: beaded rods capped with dark discs, a pincushion. Quills are now one cone each, root to
  point, kept out of the skin; all of a body's quills are one mesh. A sea star's face was a crown of
  eyes and a maw on its disc; its eyes now look down from under the rim and its mouth is underneath.
- **A rule keyed on the wrong thing breaks quietly.** A tortoise's legs grew a lizard's haunch, which
  stood out under the shell rim as a ball; its shell's skirt was cut by a fixed share of the radius,
  above a belly that hung below it. A shelled body now grows its legs as columns and its skirt is cut
  from the trunk's depth. A deer's legs, on the slots every quadruped shares, were bunched under its
  middle: a hooved leg now roots on toward the end of the trunk it carries.
- **The second wave.** Sea stars (five plump arms, no face on top), tortoises (a shell that encloses
  them, columns of legs on round stumps, a beak), urchins (quills; mouth and eyes underneath),
  lizards on bent limbs with a low wedge of a head (the crocodile's legs and the frog's arms bend at
  the elbow too), snakes (a flat spade of a head, eyes halfway back, a tail that runs out to a point),
  deer (legs that frame the body, straight down; a tail at the croup), frogs (a short wide head set on
  the body), bears (the fox's stop). Spots are solid soft-edged blotches for every coat, fading down
  the legs. And scales and feathers lie up and back over a forehead instead of whirling into a
  rosette there.
- **Don't edit under a running gate.** One commit's `git add -A` ran after its tests and swept in an
  edit made while they were running: committed untested, under a message that said only the snake
  changed. The next commit's run covered it and its message says so. Edits now wait for the gate.

## M79–M82 — A re-audit by eye, surfaces that read, plans reworked in parallel · 2026-11-12

- **Ask people who did not make it, twice.** Every plan was rendered to a sheet (a three-quarter
  view and four plates) and shown, with no code, to independent viewers: what does this read as,
  what is wrong, and — given the sheets from before the rework — is it better. Recognisability rose
  2.84 → 3.39 and craft 2.35 → 2.60 across the 31 plans; none was judged worse, 83 defects were
  confirmed, and the same few causes ran through most of them. Those came first.
- **A shut mouth is one seam.** Mouths were drawn as lips: two cords that crossed at the corners,
  stood off the face and ran past its sides. A closed mouth is now a single fold in the skin, its
  lower jaw and teeth drawn only once it opens; a mandibled mouth is as wide as its jaws, no wider.
- **Measure the relief's slope where it is drawn.** The GPU's derivative of a height is one value
  per 2×2 pixels. Wherever a scale or a plate's edge was a few pixels across, every block took one
  slope and the hide broke into a mosaic of little squares. The slope is now the height one pixel
  over, across and down, evaluated at this pixel (three reads of the relief instead of one: on at
  Medium and High, `fineRelief`). Fur's last sparse strands keep the coat's tone instead of their
  root shadow, so a bear seen whole no longer wears pepper.
- **A chain is a curve.** A trunk, a neck and a tail were straight cones between their nodes, and
  every node a crease that the sky's bounce lit as a ring round the belly. Each link is now three
  cones along a spline through the nodes.
- **Three tries at cut stone.** The crystal creature was a plated lump. Crystal is now a covering
  like fur (any lineage can wear it). Cells with a random plane each: stained glass. The same
  bevelled to a common floor so the faces could meet: pebbles in gutters. Heights at the corners of
  a tetrahedral grid, blended flat inside each: true flat faces, sharp edges, no step — and a
  regular wire net. The stone is cut twice, at two angles and sizes, and the higher cut shows: flat
  faces of every shape. The clear coat takes each facet's tilt (three.js leaves a coat on the smooth
  body under the bump: a glaze over the stone). Horns and back spines become clusters of shards.
- **Feathers lie on feathers.** A cell per feather with straight borders is a crazed glaze: both
  audits called it cobblestones. Each cell now roots a scallop — a ball whose height ramps from root
  to tip along a lay direction — and the highest one over a point shows, so every tip lies on the
  roots behind it and ends in a round, shadowed edge. The lay is a field on the skin: toward the
  tail and a little down, projected flat from the body's rest normal, so plumage runs back along
  the back and down a chest that faces forward, and does not turn when the animal does. Scales use
  the same, smaller.
- **A fin is part of the animal's outline.** Fins are drawn from their nodes, not grown as nodes,
  so a body's bounds ended at its tail's last link and the side plate cut every fish's tail off.
  Framing now reaches out to the fins as built. Fish and sharks got heads that run on from the
  body's depth (a shark's began at half its shoulders': a neck, then a melon), level snouts,
  pectorals behind the gills rather than beside the belly fins, and a gill cover sized to the flank
  it lies on instead of to the gill part (where it was a comma).
- **One plan, one worktree, one server — and a judge.** Eight of the lowest-rated plans went out
  in parallel, each to its own checkout with its own dev server, its audit notes, a fingerprint
  tool proving no other plan's founders moved, and an independent viewer to accept or reject the
  before/after. Two things broke first: the checkouts shared one Vite dependency cache through a
  symlinked `node_modules` (two copies of React, every page blank — the cache is per checkout now),
  and worktrees were created at an old commit (each now pins the commit it must build on).
- **Two right fixes can be wrong together.** The ape's fixer moved a reared trunk's hips to the
  back of its pelvis, checking that no other plan leans that far. On the commit it built from, none
  did; meanwhile the hawk's fixer had stood the hawk up. Merged, the hawk's legs slid back and it
  stood ahead of its own feet. The proxy (how far the trunk leans) was not the reason (its arms
  carry its front): the rule is keyed on the arms now, and a test grows the ape without arms and
  the hawk with them.
- **What the plans became.** Crabs: pincers with a gape, legs that arch, eyes on stalks at the
  shell's front rim. Weasels: an arched back on short stout legs, a wedge of a head on a real neck.
  Hawks: upright, chest out, a flat crown, a scowl, long wings down the back, talons. Apes: a small
  browed head between broad shoulders, column arms to knuckle-walking fists, a dark bare face.
  Chimeras: a feathered wing on four legs is carried raised and open (folded, it was saddlebags),
  the frill a mane round the skull.

## M76–M78 — Two reviews, and the body plans one by one · 2026-11-12

- **Review what shipped, then make the review prove itself.** Twice, finders read a batch area by
  area and every finding went to a separate verifier told to refute it by reproduction. 21 held in
  the menu / saves / skins batch, 13 in the creature rework; a handful were refuted, and one came
  back "this needs eyes" (is a kitten's head too big?) — settled by rendering it both ways. The
  first script counted a verifier that crashed as a refutation; it now reports "unverified".
- **A fix that leans on an assumption has to make it true.** Ears were taken out of the skin to cure
  lobed skulls, on the assumption an ear is one node. Founders' are; mutation jitters every part's
  link count, and a third of all cat and dog litters held a child whose ear hovered above its head.
  The rule now lives in growth (an ear gene grows one node, whatever it says), which also mends the
  saves already holding such genes — a guard in mutation would not have.
- **A threshold beside a prior is a cliff.** "Reared upright" was a line at −0.26 and the most
  upright hawk leans −0.255: a tenth of hawk chicks had their legs jump from mid-body to the rump.
  Moving the prior changes the animal; moving the line moves the cliff. It is a ramp now.
- **A ceiling on a counter only moves the edge.** A save counting from 1e15 loaded cleanly and then
  minted ids its own reader refuses. Capping at 1e9 leaves the same trap at 1e9 for a file sitting
  there. A lineage whose numbering has run away is renumbered from 0 on load: no edge.
- **Draw on the surface that is drawn.** A feature's node sits on its trunk link's own ellipsoid;
  the blended skin stands a fraction of a radius clear of it, by a different amount at each end of
  a mark. Gill covers and slits laid flat at the node were two-thirds buried; a fish's sail, run
  straight from its root, hung over the back's fall. Both are traced over the field now, and the
  check is a ray test against the real mesh, not the field they were placed with.
- **The way out cannot pass through the wreck.** The main menu is where a failed screen sends the
  player. It drew the creature being bred — so when that creature was the failure, the menu failed
  too, with no button left. The menu now mounts before anything grows that creature, and its own
  stage sits behind a boundary. (`?failstage=1` breaks the stage on purpose, to see this.)
- **Proportions in the animal's own units.** Each plan was measured in chest depths (trunk length,
  belly clearance, skull, neck rise, tail) against the animal it is meant to be, before and after:
  "a cat's skull is 0.9 of its chest, its back level, its belly a chest-depth off the ground" is a
  target a prior can be tuned to and a test can hold; "looks more like a cat" is neither.
- **One skull, then ears.** The lobes on every mammal's head were ear stubs meshed into the skin.
  With ears as features only and a neck that rises from the top of the shoulders, cats, dogs, mice,
  bears, deer and weasels each got a head that is one shape, carried above the back.
- **A new knob must not reshuffle the old ones.** Every new prior field draws from the generator
  only where a plan sets it, so giving the shark a blade did not re-roll every cat already bred.
- **Feeding is a whole-body pose.** A biped tips at the hips as one piece (bent joint by joint, a
  bird's wings stood off its back); a long neck arches down; a body on splayed legs keeps its trunk
  still, since those legs are not refolded — on two legs as well as six.
- **Gate the commit on the test run.** One commit went out with a failing test because the commit
  was chained after the run with `;`. Commits are now `&&`-ed behind the suite's exit code.

## M74–M75 — A front door; half the frame · 2026-11-12

- **Two stores, one game.** A game spans the breeder's lineage and the valley; `game.ts` moves both
  together and orders a load so the step that can fail (a damaged World) comes first — the failure
  test asserts nothing changed. The save format validates genomes with the engine's own checker
  (now exported), so an edited file can't smuggle in a body the engine would never grow.
- **Where saves live.** A lineage runs to megabytes; localStorage holds five. Slots are IndexedDB
  records split into a header and a body so the list never reads a body; the browser's own autosave
  of the game in progress stays in localStorage, because it must be written synchronously as the
  page goes. IndexedDB can't be unit-tested in node, so the slot logic runs against an in-memory
  store and the real one is driven in a browser (save → reload → the slot is still there).
- **One object for quality.** Options the player sees map to `RenderQuality`, a table of concrete
  budgets; renderers read that and nothing else. `High` is the game as it was, to the number.
- **A menu over a busy canvas starves itself.** With the valley rendering behind the in-game menu,
  clicks took seconds under software GL. The screens now stop drawing while the menu is up — which
  is also simply what "paused" should mean.
- **Measure the frame before trimming it.** The plan was to cut grass and add creature LOD. The
  renderer's counters said the scene was drawing twice its own triangles; hiding each part in turn
  and re-rendering showed every part costing two draw calls. One `transmission: 0.6` on the fish
  spawn was a second pass over the whole valley. That single property was worth more than every
  quality option combined. (Three's `info.render` resets after the shadow pass, so it counts the
  main pass only.)
- **And what not to touch.** Animating the whole cast: 0.7 ms a frame. Re-posing 17,000 grass tufts:
  1.2 ms twice a second. Splitting the bundle: 7%. Written down so nobody optimises them on a hunch.

## M73 — Body waves, ape hands, octopuses · 2026-11-11

- **Check a motion's direction, not just its look.** A still frame of a slithering snake looked
  right; the wave's crest, tracked over time, ran tail to head. The lag between neighbouring joints
  (a cross-correlation) is now the test, and sets the wave's speed against the ground's.
- **A change in one pose is a change in all of them.** Hanging the ape's arms to the ground fixed
  its stance and broke its sleep (the body drops; the arms went through the floor). Every pose that
  moves the body needs the new limb checked: the lie-down fold is solved per frame from the drop.
- **Reach, then decide the behaviour.** Whether a hand can reach the mouth (a two-link solve, the
  head nodding to meet it) now decides how an armed body feeds; before, any arm at all meant "glance
  down", which left theropods eating air.
- **A shortest-arc frame is not a consistent frame.** Radial parts were each oriented by the
  shortest turn from +Z, which twists near −Z: one arm in every octopus and star curled its own way.
  An upright frame (heading, then tilt) makes the array truly radial.
- **A union field's inside is not a depth.** Inside two overlapping parts it reads the deeper one;
  two mouth tests that bound a root's depth under the skin skip mouths crowded by arm roots.

## M72 — Apes, still snakes, ears, cats and dogs · 2026-11-10

- **Look at litters, not specimens.** Random "Any Kind" litters (what a player breeds from) showed
  the primates as hunched lumps: their arms, aimed out and back and half again as long as the
  shoulders are high, lay along the floor behind them. The morphotype's own Studio plates had hidden
  it behind a front view.
- **Pose once, not per frame.** The static views have no rig, so `restPosed` applies the rig's rest
  bends to the nodes (all yaws: angles add down the tree) and the skin is built along the curve —
  checked against the rig's own FK to 1e-15.
- **An orientation can be the whole problem.** Cat and dog ears were the right size and shape, but
  faced dead ahead: edge-on in profile they read as horns. Turned out to their side they read.

## M71 — Snakes, fish, frogs, whole limbs · 2026-11-10

- **Know where a shape can come from.** Growth keeps a bilateral spine on the midline (it drops the
  yaw bend), so a snake can never be grown in an S: its resting curve lives in the rig, as one
  heading curve over trunk and tail, centred on the facing, faded out by the travelling wave.
- **A prior's chance can hide a body plan.** One fish in seven had no head (`head: 0.85`): its face
  sat on the trunk's blunt front, the egg-shaped ones. And a one-node trunk can't tilt — the frog lay
  flat until its trunk had two links for the pitch to act between.
- **Measure the artifact, then sweep.** A dashed mouse tail became a count (separate pieces of the
  built skin); swept over every morphotype it was 79 of 248 skins, mostly at thumbnail quality. The
  radius floor was below half a grid cell's diagonal, so a thin tube could slip between samples.
- **Census a geometric fix before keeping it.** The lip-on-face clamp first narrowed every mammal's
  mouth and every croc's: an old/new diff of lip positions per morph showed it. Muzzles (the mandible
  drops by design), long snouts (the mouth runs along the jaw line) and radial bodies are exempt.

## M70 — Stances, frills, close-ups · 2026-11-10

- **Look for thresholds inside prior ranges.** The crocodile bug (a sprawl threshold at splay 0.5,
  a prior range of 0.47–0.61) suggested a sweep: every morph's leg-azimuth range against every
  branch point in `grow`. The turtle straddled the same line — and, judged leg by leg, it could do
  so within one animal. The fix is structural (one stance per body), the priors only tidy it.

## M68–M69 — Quick picks, the World's camera and load · 2026-11-10

- **Profile the browser, not the engine.** A pick's engine work is ~10 ms (litter, archive, growth).
  The CPU profile of a driven session (CDP `Profiler`, long-task observer, `linkProgram` counted in
  an init script) put everything else in shader programs: 4–14 links on every pick. three frees a
  program when its last material is disposed, and a litter swap disposes all nine before the new
  ones render — the same shaders, relinked each time. `KeepPrograms` pins what a renderer compiles
  (an after-frame pass over `gl.info.programs`). Remaining first-ever variants are a few, once.
- **Software GL distorts the picture.** SwiftShader makes a link cost seconds and a context loss
  tens of seconds; the measurements that transfer are counts (links per pick) and CPU self time.
- **Same results, measured.** The skin-weight rewrite was checked with a per-morph fingerprint of
  the weights — identical for every creature but the stalk-eyed crab, whose change was the bug fix.
- **The World** compiles its scene with `compileAsync` before its first frame (the canvas mounts
  with `frameloop="never"`): parallel on the GPU process where the extension exists, no worse where
  it doesn't. Portraits wait for idle and use `toBlob` (async encoding) instead of `toDataURL`.

## M67 — The frozen litter · 2026-11-10

- **Reported, reproduced, then read the library.** A driven Breed session (DOM clicks, the gallery
  canvas read back with `toDataURL`, since dev keeps its drawing buffer) showed the hero and lineage
  advancing while the nine thumbnails never changed. drei's `View` source had the cause: its
  offscreen test compares the element's window rectangle with the canvas's width/height — right only
  for a canvas at the window origin (the Studio's), wrong for the gallery's in the right rail. The
  gallery no longer uses `View`; `scissor.ts` measures each button against the canvas's own rectangle.
- **Watch the inline styles.** Dropping drei's `eventSource` let R3F's wrapper put an inline
  `pointer-events: auto` over the buttons, beating the stylesheet — the canvas swallowed every click.
  A hit-test at each thumbnail's centre (and a real mouse click) now checks that clicks get through.

## Part 3i — Arthropods of tagmata, silhouettes, crabs, apes, deer, stance, theropods, birds (M60–M66) · 2026-11-08

- **The crab's ball was two bugs, not a prior.** Flattening the crab's trunk changed nothing on
  screen: its carapace shell, for a one-node trunk, was built from a sphere of the node's scalar
  radius (ignoring its shape), and every limb's root cone started from a sphere of that radius too.
  Both now honour the node's ellipsoid; the leg-root fix also slims flat lizards' and frogs' hips.
- **An ape's pear was the torso rule, not its genes.** Every trunk swells mid-way (the fusiform
  bulge), which is right for a horizontal body and wrong for an upright one: an ape's belly was its
  widest part. A reared trunk now grows as a torso (chest over hips); with that, the head set on the
  shoulders and arms that hang straight to the ground, the primate stopped reading as a seal.
- **One bad seed is a range bug.** A deer that sat low turned out to be a posture's segment range
  ([3, 4]): a third of all deer drew three-link legs. The stance test's floor for deer had been set
  below that deer, so it passed; it is now set at what a deer is (legs ≥ 0.85 of its depth).
- **Tried and reverted:** dropping the trunk's mid-way swell on chest-heavy quadrupeds (so the
  belly tucks up). Side by side with the old shapes it made dogs a touch more athletic and cats weak
  in the rump — not a clear win, so the dog's fawn look was fixed in its own priors instead. The
  front view found the real fault: every mammal stood splayed like a foal.

- **Structure before tuning.** No prior could make one trunk with legs spaced down it into an insect
  or a spider: the body plan itself was wrong. The arthropod compiler (`compileArthropod`) builds the
  abdomen as the trunk and a leg-bearing thorax as its child, and growth reads the plan from the
  genome's own shape — a section past the trunk carrying three or more leg pairs is a thorax — so its
  joints pinch to waists and its legs fan out. No new genes: mutation, sharing and saves are untouched.
- **Everything that assumed "legs live on the trunk"** turned up by grepping for `body.appendages`
  and `segment === 0`: the bauplan's leg normaliser (now per section), the leg-count mutation (now on
  the leg-bearing section — and dropping a body section may no longer delete the thorax, all six
  legs with it), and the rig's trunk/neck split (the trunk runs through the last leg-bearing section;
  counted as "neck", the thorax swung all six legs round with every glance).
- **Variants read off the phenotype.** A beetle's wing-cases are the existing conforming shell over
  what is now the abdomen; a spider's chelicerae are the mandibles mouth on a face that sits on a
  leg-bearing section. Neither needed a gene.
- **Solve, again.** The arched legs' fixed sleeping roll left a resting insect's feet treading the
  air; it is now solved per leg, so each foot stays on the floor as the body lies down.

## Part 3h — Bodies at rest, gaits that grip, watching them (M57–M59) · 2026-11-08

- **Measure, then fix.** Each motion change came with a number before it had a picture: the planted
  foot's slip as a fraction of the body's speed (35% → 1–8%), how far a feeding mouth misses the
  grass (a deer's: 0.61 of its shoulder height → reaching it), how far folded legs sink through the
  floor. Stills from the Studio's frozen gait phase (`?gaitphase=`) and `?motion=` checked the look.
- **Solve, don't tune.** One fixed leg fold for sleeping, one fixed neck pitch for feeding, one
  swing angle for every leg each read fine on a cat and failed on a deer. The rig template now
  solves them per body. Every standing pose is a set of pitches about the body's X axis, so the
  solves are planar forward kinematics mirroring the bone hierarchy (`planarFK`), walking only the
  chains that move: ~2 ms per new body (a full-skeleton search first cost ~70 ms — a frame hitch for
  every newborn mutant).
- **The young are a viewer transform.** `juvenileGenome` re-proportions a genome (pure, bounded,
  cached); the World draws it until 60% of maturity. The sim never sees it — saves and replays are
  untouched.
- **Seeing through leaves** is a shared GLSL helper and one uniform: leaves, trunks and berries
  discard fragments in a tunnel round the camera→creature sightline with an ordered (Bayer) dither.
  A random per-pixel dither left a speckle of stray leaves; berries left out floated in the hole.
- **The screenshot harness** now opens a fresh page per shot: a page left animating (a motion
  preview) kept the main thread so busy that navigating it on timed out.

## Part 3g — Nests, reviews and two visual audits (M53–M56) · 2026-10-31

- **How the audits ran.** Three critics (mammals; reptiles and fish; birds and fliers) screenshotted
  every morph from the Studio's canonical angles and ranked the crudest things they saw, each with a
  measured cause and a proposed fix — 24 findings. Each fix was checked against before/after
  screenshots and pinned by a test that fails on the old code. The Studio grew a `?studiocam=eye`
  macro for the eye work.
- **The single biggest win was a sign.** Every column leg's pitch was inverted: hind knees pointed
  back like a bird's heel and forelegs folded the same way, so a dog walked on four hind legs. Found
  by printing a felid's leg chain; fixed with the foreleg's own elbow-back fold.
- **Bleached pelts were a colour space.** `THREE.Color.setHSL` defaults to the LINEAR working space;
  the palette is sRGB HSL (as the UI swatches always read it). Every coat rendered a pastel of itself
  and every belly was lerped (in linear) toward a fixed grey that outweighed it ~4:1.
- **Eyes measured, not guessed.** A fixed 0.36r sink left eye centres anywhere from 1.1r under the
  skin to right on it; the seat now marches each eye to 0.42r under the real hybrid field after
  turning it within ~29° of the face normal (an oblique aim left a crescent of bare eyeball). The fur
  shells then had to clear a ring round each seated eye.
- **Proportions, not just priors.** A front-heavy taper is normalised to the peak an untapered chain
  would have — the first attempt ballooned every cat into a blob. Legs below the belly were 2–42% of
  the trunk's depth; now 55–100%.
- **Wings.** ~30 feather cards wrapped onto the flank collapsed onto one iso-shell and z-fought; one
  lofted sheet painted in tiers (with a per-vertex lift so the wrap keeps its dome) replaced them.
  The tier colours looked missing in the first shots only because the Studio crops a spread wing's
  hand — checked by logging the vertex colours from inside the page.
- **Plumage relief** first went from domed Voronoi cells (turtle scutes) to imbricated cells with a
  step at each tip — which the derivative bump drew as a dotted line; every cell border now falls
  to one floor, so the relief is continuous.
- **A latent bound bug**: `compileRadial` never clamped its taper; a wild draw handed a radial body a
  bird's new front-heavy taper (1.16 > 1.15). Clamped like the bilateral trunk.

## Part 3f — Portraits, a river, faces and fur (M50–M52) · 2026-10-08

- **Portraits** are an offscreen R3F root (`createRoot` on a detached canvas, `frameloop: 'never'`,
  one `advance()` per portrait, read back with `toDataURL`) — one extra WebGL context in total.
- **A beak on a cat.** Retuning felid/canid mouth styles to [0.2, 0.28] crossed the beak band (fanged
  is [0.125, 0.25) — the Morpho comment's band values were stale), so a third of cats and dogs grew
  bills, and the ecology tuning that day ran with them as omnivores. Fixed, audited every morph's
  range against the real bands, pinned with a test, and the 6-seed × 2-year survival re-run.
- **The pale band under every chin** was the upper-lip fold (built to hide a reptile's tooth roots)
  drawn in the coat below the lip line; found by hiding the jaw's sub-meshes one at a time.
- **Recolonisation** rolled each dawn on the shared RNG stream; one test world drew ten > 0.5 in a
  row. It now rolls on its own hash of (seed, day, species).
- **Fur**: the same creature material with a shell uniform (one program for all); the strand mask
  samples the rest-pose body position, so every shell slices the same cells and hairs stay rooted;
  a backward-and-down lean turns the towel-pile dots into combed hair.

## Part 3e — Courtship, weather, fast-forward, a lasting balance (M46–M49) · 2026-10-08

- **Why the ecology work.** With fast-forward, a three-year run of the default valley ended with three
  species: fish and insects drifted out with their food at 100% (a global soft cap let a species with
  ≥10 members breed only while the world was under 135 — the grazers kept it over), every hunter
  starved mid-chase as a young adult (ungulates outran canids; hunters sprinted the whole chase), and
  rodents lost to generalists. Diagnosed by instrumenting deaths by cause and per-kind populations
  each season (scratch tests, not committed). Fixes in M49; the regression test is a one-year
  diversity check.
- **Overshoot on the way.** Stalking alone let predators wipe out rodents and insects (canids → 58):
  notice distances were raised (0.32 → 0.42 for a stalker) and the pounce shortened (6 → 4.5 s).
  "Canids" with a maw-style mouth were omnivores competing with every grazer — they now get fanged
  mouths; mutations across the fanged/maw boundary still make omnivores (emergent, kept).
- **Weather** is a function, not state: nothing to save, identical on replay. The rain was first
  invisible (0.16 mean alpha, light grey on a light scene); snow was white on white — both re-tuned.
- **The worker** reuses persistence: `saveWorld` → worker `loadWorld` + `runFor` → `saveWorld` →
  `adoptWorld` into the live object (keeps the landscape). `bodyOf` caches by content too, so the
  adopted world's fresh genome objects find their built skins.

## Part 3d — Saved worlds and anatomy pass III (M44–M45) · 2026-10-08

- **Saved worlds.** The world RNG is now `mulberry32State` (its 32-bit state readable), so a save
  can resume the stream exactly. The test compares the *whole serialisation* of the original and
  the reloaded world after both run on 150 s — and fails if the RNG state isn't restored (checked).
  Autosave goes to `localStorage` every minute and on page hide; dev pages with query parameters
  never resume (the screenshot harness stays reproducible). A world is ~0.3–0.6 MB.
- **A bad hash.** `mix32` (bare FNV over words) was read directly as a fraction for iris and bill
  colours; for consecutive seeds its high bits barely move, so irises came only from the
  pale-yellow…violet end of the palette. `unitHash` adds the murmur3 finaliser. (Engine seeds still
  use `mix32` — mulberry32 scrambles them.)
- **Seasons look.** Keyed at the season middles, the first day of spring was still half winter: the
  world opened under snow with half-bare trees while the clock said Spring. Snow/leaf-fall/autumn
  colour now run inside their seasons.
- **Anatomy.** 10% of felids (any `head < 1` necked plan) grew no head — the face sat on the trunk;
  necked/muzzled and reptile plans now always grow one. A quarter of frogs and lizards drew a splay
  wide enough to take the *arthropod* leg arch (knees above the back); the arch is now chitin-only.
  Bare shanks are a shader zone (`uBareY`) below a feathered body's shank line, so toes and shanks
  share the keratin without new geometry. Eye lids are per-eye geometries in the body material with
  body-space coordinates baked at the open pose.
- New Morpho dials reuse the draw they replace (`tailAz`, `armAz`/`armEl`/`armT`, `earAz`) or cost
  none (`hindLeg`/`foreLeg` constants), so other morphotypes' genomes don't shift.

## Part 3c — Behaviour, landscape, tree of life (M39–M41) · 2026-10-08

- **Behaviour.** Alarm propagation is limited to close kin (≤ 9 bu) and threats within 0.8 vision —
  over 8 seeds × 20 min it costs ~10% of kills and predators persist in all eight. Juveniles wander
  around a living parent. `bitAt` drives the actor's lunge; `attackedAt` its flinch. Mood sprites
  are four shared canvas textures (one SpriteMaterial each).
- **Eyelids**: hemispheres just outside the eyeball rotated about the eye's X axis — the earlier
  attempt's "crescent" problem was orientation, not the idea. `LidContext` carries sleep.
- **All jawed mouths rest shut** (REST_PARTED 0.05) and no longer carve; carve tests use a lamprey.
- **Flora**: 17k instanced tufts; three flips normals on back faces of double-sided materials,
  which blacked out half the blades — patched out of `normal_fragment_begin` for grass.
- **Water**: a 160² half-float height texture of the ground drives depth colour, alpha and foam.
- **Radial** bodies now array parts about +Y. **Slimes** stay two links (three tapering links read
  as "headed" in the M26 descriptor). **Stalk eyes** mesh their last link into the eyeball.
- Process note: twice a commit was chained after piped test output (`vitest | grep && git commit`)
  and went in with a failing test. Tests now run to a file and the exit code is checked first.

## Part 3b — Mammals, faces and flight (M36–M38) · 2026-10-08

The Studio's side/face cameras made the remaining crudeness obvious: every mammal was a frog in a
fur suit — a skull-wide lip loop wrapped round a ball head sitting straight on the shoulders, thighs
ballooning out of the flanks as lobes, a fish fin on the tail, legs pulled in to the middle of a
sausage body. Fixed at the anatomy level rather than with decals:

- **Skeleton.** A neck segment (per-link lift; the chain's last segment levels itself — *head
  carriage*); the fusiform bulge is a torso's only (necks and muzzles taper straight); quadruped legs
  at the trunk's ends (0.1 / 0.92); column-leg hips seated inside the torso below the midline;
  reared bipeds root their legs at the pelvis (`UPRIGHT_PITCH`).
- **Skull.** `muzzleHead`: cranium + a narrower dropped muzzle (a third link for long snouts). Eyes,
  ears and horns ride the cranium; the mouth's size floor is capped by the snout link carrying it.
- **Muzzled mouths** (`MouthSpec.muzzled` = fur + jawed): the upper lip is fixed low on the muzzle
  and only the mandible drops; no carve; rests shut (`REST_SHUT`) without a jaw control; teeth
  reduced to what a closed mammal mouth shows; the jaw and lip fold wear the body's *own* covering
  material (body-space coords baked onto the feature mesh), plus a wet nose pad. The same trick
  dresses paws (sole + toes + claws) and ears (built in the body frame, facing forward).
- **Feather/scale relief** had a hard step under the derivative bump (`fract(row)`, `floor(z)`):
  1-px streaks at every row. Feathers are now domed vanes on anisotropic cells.
- **Flight** (sim + view): `flies`/`flySpeed` traits, `alt`/`fly` state, `planFlight` (what is
  flown, landing rules, never over water), altitude-aware bites; balanced against a no-flight
  baseline (six seeds, 15 min: 145 vs 153 birds alive). Bugs found on the way: long-trip wander
  targets fell outside the world (the flier slid along the edge forever) — now clamped; a 0.6 s
  re-pick kept fliers circling — flights now finish, with hysteresis on intent, not altitude.

## Part 3 — See them, then set them loose (M27–M35) · 2026-10-08

A long autonomous session with two aims: give creatures an honest way to be **looked at**, and a
**world** to live in. Everything is judged from real renders now — a headless Chromium harness
(`scripts/shoot.mjs`) plus the Studio's plates and Bestiary made each defect visible before fixing it.

**Seeing them.** The canvas blanked whenever the CDN HDR fetch failed (a throw that Suspense doesn't
catch) — replaced by a procedural studio environment PMREM'd once per renderer. The covering read as
TV static; the root cause was the bump (a 0..1 relief fed in as a height in body units → slopes ~30,
saturated normals), not the colour. Physical relief heights + band-limited procedural noise +
`MeshPhysicalMaterial` lobes fixed it. Bodies were bead chains with flat facets: the field is now
round cones (exact SDF), the mesh welded with gradient normals and SDF AO, sampled as a narrow band.
The **Studio** (plates, x-ray skeleton, inspector, Bestiary, motion preview) shares one WebGL context.

**Anatomy found by looking.** Carapace = a scaled sphere that swelled into an egg → a shell polygonized
from the trunk field. Arachnids were balls → every leg pair re-thickened the same node ×1.22. Legs
collapsed onto 1–2 nodes → interpolated attach + arched arthropod legs. Wings were kites drawn from
the tip node → shoulder-built folded feathered wings (shrink-wrapped to the flank) and membrane wings.

**The World.** `src/sim/` (seeded, headless, Math.random-banned): terrain, traits read off anatomy, and
creatures choosing flee/sleep/eat/breed/wander; breeding mutates; drift past a morphospace threshold
speciates. Balancing was done with 20-day headless runs, and the findings were not where expected:
grazers chasing "the best cell" starved while standing in algae (→ graze in place); meals were
interrupted by the re-deliberation that started them (→ hysteresis); and minority species died not of
hunger but because the grazers filled the population cap within a day so nobody else could ever breed
(→ a soft cap with a rescue band for rare species, condition-gated breeding, ectotherms at half the
burn). Runs now show predator-prey cycles, persistent hunters and, in some worlds, stable fish.

**Motion.** A bone per node, the smooth skin skinned by round-cone distance, features portaled into
bones; one gait phase rule gives trot / tripod / alternation. Idle wobble stays removed — motion comes
only from what a creature is doing. World perf: ~5–7k → ~520 draw calls (LOD, merged kit, budgeted builds).

**Verified:** typecheck clean; the full suite green (190+ tests: new anatomy, wings, rig, shell,
smooth-skin, material, and ecosystem tests); every visual change checked in headless renders.
_Known limits:_ the World is heavy for software GL (fine on a GPU); mouths still rest open; no flight.

## M26 — Morphospace descriptor dims (headedness + sheen) · 2026-07-18

The last unchecked milestone. The morphospace descriptor was 8-D and **structural only**, so basins
that differ by surface or by whether the animal owns a head collapsed together — the roadmap called
out chimera reading as a dragon, but measurement showed the problem was far wider: **7 morphotypes
never self-labelled at all** (ungulate, insectoid, chelonian, ratite, horror, starfish, crystalline).

Added the two dims §11.1 specifies, appended so `archive.binKey` (which reads dims 0–1) is untouched:

- **headedness** — computed from the grown spine: `1 − (min radius of the forward half) / (max spine
  radius)`. It asks "is there a neck?", so a heron/ungulate/serpent pinches toward a distinct head
  while a slime or urchin, having no forward axis to constrict, scores a flat 0. Chainless/radial
  bodies score 0 by construction.
- **sheen** — read off `covering.sheen`. The only descriptor sourced from the genome rather than the
  skeleton, and deliberately so: it is the surface axis, and surface is exactly what separates
  structurally identical creatures (chitinous insectoid vs. furred ursid, wet cephalopod vs. horror).

**Measured (not asserted):** catalogue-wide self-labelling **47.1% → 57.3%** (1200 samples, 30
morphotypes × 40 seeds). Chimera self-labels **22/40 → 27/40**, misread as dragon **4 → 1**. Both new
dims carry real variance (σ 0.26 / 0.29 against elongation's 0.20), so neither is a dead axis padding
the distance. Mean coherence fell 0.841 → 0.702, which is the expected consequence of measuring in a
higher-dimensional space — the clustering test's floors still pass untouched.

**Verified:** `npm run typecheck` clean; `npm test` → **168/168** across 27 files (5 new: 10-D shape +
bounds, headedness blob-vs-neck separation, sheen tracks the gene and varies across the catalogue,
the chimera/dragon regression, and a catalogue-wide self-labelling floor); `npm run build` clean.

_Remaining confusions are genuinely structural — ungulate vs. canid, ratite vs. primate, horror vs.
urchin — pairs that share a body plan and differ mostly in proportion. Separating those wants
proportion dims, not these two._

## Mouth overhaul — surface-anchored mouths, carved maws, the end of the sandwich · 2026-07-16

The primitive-assembly mouths (including the 5 fitted jaw builds below) never stopped reading
as glued-on toys: a mouth is **negative space in a face**, and everything we drew was a convex
blob in front of one, with teeth at hand-authored offsets that nothing tied to the actual skin.
Researched how Spore (authored rigblocks) and SDF systems (boolean carves) solve this, then
rebuilt the whole subsystem around one idea: **every piece of mouth geometry anchors to a curve
ray-traced onto the true body surface.**

**Architecture (new modules):**
- `src/viewer/bodyField.ts` — the skin as a pure implicit field (capsules + the per-node
  ellipsoids, smooth-union, shared with smoothSkin) + `Carve` subtraction ops + ray/Newton
  surface projection + the viewer's small shared vec/quat math.
- `src/viewer/mouthLine.ts` — `MouthSpec` (variant/gape/arc per creature, seeded), the mouth
  LINE (two lip curves welded at the corners, traced by a ray fan from inside the head) and
  the mouth RING (closed loop for orifice/socket mouths), plus `mouthCarves()`.
- `src/viewer/sweep.ts` — variable-radius, flattenable, closable swept tubes (lips, gums,
  collars, trunks). `src/viewer/teeth.ts` — pure tooth placement along the same curves
  (mirrored jitter → M18 symmetry; interlocking rows; ring variant) + one shared curved-fang
  geometry with a root→tip vertex-color gradient, drawn as InstancedMesh rows.
- `src/viewer/mouths/` — one module per variant band: `jawed.tsx` (herbivore/maw/fanged/
  underbite as ONE parametric build: lips + gum ridges + interlocking teeth + a mandible group
  hinged at the true mouth corners), `ring.tsx` (sucker/lamprey funnels with interior tooth
  rings), `beak.tsx` (cere collar + hooked lofted halves), `mandibles.tsx` (serrated shear
  blades at the corners), `baleen.tsx` (keratin curtain), `probe.tsx` (proboscis/trunk),
  `palette.ts` + `shared.ts` (house flesh tones, interior sheet, rel mapper).
- **Carved maws:** `smoothSkin.ts` subtracts the mouth cavities from the field (smooth-max,
  soft lip rim) and emits an `aFlesh` vertex weight; `creatureMaterial.ts` shades it as dark
  wet gum-flesh (pattern/covering give way, roughness drops, rim glow dies in the throat). On
  smooth/hybrid skin a maw is now a genuine recess in the head. Eyes/mouths stay solids.
- **Jaw idle:** `animation.ts` gained pure `jawGape()`; the jawed family's mandible group
  (lower lip/gum/teeth/tongue) breathes open/shut about the corner hinge in capsule mode.
- Engine: the mouth's seat dropped 0.45→0.12 (the anchor hugs the skin it draws on); the
  smooth field now honors per-node ellipsoid scale, so shaped skulls survive smooth mode.

Five variant modules were built by a parallel agent fan-out against the shared API, then TWO
adversarial review rounds. Consistency lens: 10 findings (dead exports, duplicated helpers,
palette drift, a threshold parity slip, missing jawed tests, MORPHOLOGY §6.3 drift) — fixed.
Deep lenses (geometry / determinism / react-perf / measured-jank probes) confirmed 9 real
bugs, all fixed: **(sev5)** capsule mode passed the cavity carves into the mouth builds, so
lower lips traced onto an un-rendered cavity — buried inside the head on the DEFAULT render
path (now `carves` flow only when the carved skin is shown); **(sev4)** every `sweepTube` was
wound inside-out (walls backface-culled — flipped + signed-volume regression test); lips were
traced on the hard-union field while smooth/hybrid render the k-blended one (a `SkinSurface`
mode now threads through so lips sit on the skin that's actually drawn); mouth carves could
hollow the flesh behind eyes on ~37% of carve-bearing creatures (`spareTheEyes` shrink-clamp +
test); `toothRing` fed closed rings through an open interpolator (teeth bunched at the wrap —
ring-aware sampling + spacing test); the variant components' single dispose effect killed
still-in-use shared geometry/materials on every phenotype swap (split by lifetime, all 6
modules); lamprey teeth raked down a throat that doesn't exist on the un-carved kit (cavity-
aware rake); baleen plates could hang through the fat lower lip (clamped to the measured
opening); grow-only ref arrays retained detached meshes (truncated per creature).

**Verified (2026-07-16):** `npm run typecheck` clean; `npm test` → **169/169** across 28 files
(62 new: mouth line on-surface/symmetry/determinism on BOTH skins, tooth-root ≤ sink-depth
invariant, carve add/remove-matter + eye-sparing, aFlesh marking, shader-injection integrity,
sweep winding, ring spacing, jawGape bounds, per-variant suites); `npm run build` clean
(Rapier still its own lazy chunk). Live dev-server mounts across capsules/smooth/hybrid, 10+
morphotypes incl. a radial 9-mouth urchin and 7-mouth horror: zero console errors. (rAF never
ticks in the headless preview pane — nothing paints, which is also why screenshots hang — so
shader compile is verified by a Node test that runs the real `onBeforeCompile` against three's
standard shader source, and geometry claims by measurement probes in the test suite.)

_The genome is untouched (same `CAM2:` codes) — same creatures, new faces._

## Mouth jaw builds — 5 fitted constructions across the maw bands · 2026-06-29 (Part 2)

The standard "sandwich" mouth (top oval + bottom oval) was replaced. Mocked up **6 schematics** (current
+ 5 new) with the visualize tool; the direction taken: build all five and let the style band pick which.
Five new jaw components in `CreatureMesh`, each fitted from many distinct pieces (not 2 ovals):
- **SnarlMouth (#2)** — a soft mammal muzzle: rounded snout, nose pad, lips framing a dark slit, blunt
  teeth, tongue. → the **herbivore** band.
- **AnatomicalJaw (#3)** — a maxilla + a separate mandible with a chin + jaw-joint condyles + a throat +
  upper/lower tooth rows in gum ridges + tongue. → the **maw** band (the general toothed mouth).
- **HingedJaw (#1)** — long tapering upper/lower jaws (cones) that open at hinge balls, tooth rows down
  both, big canines + a throat. → the **fanged** band (style < 0.22) — predators/dragons/crocs.
- **UnderbiteJaw (#5)** — a big lower jaw thrust past a small upper with long upturned teeth. → the
  **fanged** band (style ≥ 0.22), and chimera/wild.
- **RingMaw (#4)** — a fleshy lip ring + a circle of 9 radial fangs around a deep throat + a tongue plug.
  → the **lamprey** band (horror, chimera). The old **sucker** keeps its torus ring.

So the maw-family render is now **band-driven** (herbivore→snarl · maw→anatomical · fanged→hinged/
underbite · lamprey→ring), and since the `style` gene point-mutates, a lineage's mouth **drifts between
builds** as it evolves. Everything scales with the mouth radius (→ animal size). The mouth-variant *names*
are unchanged, so the variant-mapping test is untouched.

**Verified (2026-06-29):** typecheck clean; `npm test` → **95/95**; `npm run build` → succeeds; in-browser
ungulate/ursid/felid/croc/horror/chimera each roll their build (snarl/anatomical/hinged/ring) with **no
console errors**. The *look* is a visual call.

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
probe; the *look* is a visual call.

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
the *look* is a visual call.

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
console errors. Geometry confirmed by probe; the *look* is a visual call. (Other-bug pass: the camera
fight + the off-top eyes were the two real bugs found.)

## Visual refinement round 2 — eye visibility/size, leg joints, snouts · 2026-06-29 (Part 2)

Follow-up to the feedback below: legs "still have no visible joints"; in **capsule mode you can't see the
eyes** (the body swallows them); in **smooth mode the eyes are too big**; animal types need to read better
(a chicken-like roll delighted); mouths want more types (snout/trunk/herbivore/…). Probed the real geometry
first (WebGL can't be screenshotted here) and found: a felid eye was **r=0.28** (half the head!) with its centre
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
errors. Geometry confirmed by probe (eye protrusion %, joint angles, snout length); the *look* is a
visual call.

**Mouths — herbivore vs predator + a trunk (10 styles).** Followed up the snout with the rest of the
mouth-type ask. `mouthVariant` (`partStyles.ts`) went 8→**10** via **non-uniform bands** so the existing
styles keep their positions: a thin **herbivore** slice splits off the bottom of the maw range (a soft
grazing mouth — flat lip line + blunt incisors, no fangs) and a **trunk** slice the top (a long
forward-then-drooping tapered prehensile tube). Re-pointed the priors so grazers read herbivore
(ungulate/rodent), predators fanged (felid/croc/serpent/dragon/wyvern/shark), omnivores a toothed maw,
birds/turtles/cephalopods a beak, arthropods mandibles — **verified headlessly** (the parts.test mouth
map now asserts ungulate→herbivore, felid→fanged, …, and chimera reaches trunk). 91/91 + build green;
in-browser the herbivore/trunk renders compile with no console errors. **Still open (pending a visual
read):** per-morphotype representation tuning (tails, characteristic silhouettes) and a look-pass on the
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
actual *look* (the textures, the eyes, the de-ballooning) is a visual call — the multi-canvas
WebGL page can't be screenshotted, as throughout.

## M24 — Bauplan: structural attractor basins + the guaranteed face · 2026-06-29 (Part 2)

Playtest feedback: creatures were drifting into **mouthless, eyeless, scatter-limbed blobs** — limbs
at random angles, faces gone after a couple of breeds. Root-caused in code (not guesses): the face was
guaranteed only on a *fresh roll* (M19), but the breeder litter's aggressive structural/saltation
mutation (`removeAppendage`, `changeTerminal`, head-swapping `confluence`) stripped it; legs were
placed/aimed at fully random `attachT`/`azimuth` by `addAppendage`/`reaim`; and nothing pulled
structure back (the §11.2 coherence-pull was never built). The direction taken — **"coherent core, coherent
weird"** (everything gets canonical structure; uncanny stays weird but never broken) — landed as **one big
push**. Researched and planned first, then implemented.

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
build/tests green). The mouth-organ look + the smooth-gap fix are a visual call.

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
stalked eyes), with **no console errors**. (The distinct *look* of each part is a visual call,
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
quads" **fished auto-roll seeds** for the first legless long body — the larger pool shifted that seed
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
*reads clearly as its kind* is a visual call, as throughout.)

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
smooth path with no console errors. (The "no swimming" itself is temporal — a visual call.)

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

A review of the build against MORPHOLOGY.md flagged that Part 1 shipped every *system* but
not the whole *catalogue*, plus five visual defects — the mandate: implement the doc **in full, no
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
(Seeing it actually stride is a visual call — the preview throttles rAF, as throughout.)

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
(Watching it actually crawl is a visual call — the sim is headless; the viewer shows the evolved
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
renders, no console errors. (Opening the file in Blender/another viewer is the remaining confirmation.)

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
so the organic *look* is a visual call — as in M5/M12/M14.)

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
the preview throttles rAF — so the live wiring is verified via the `motion` handle + a visual
read, as in M5.)

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
the distribution has two strong modes, per the "familiar AND uncanny both strong" goal.

Also raised `GENE_BOUNDS`: `radialCount` 8→12 (many-tentacled cephalopods), `appendageCount`
8→16 (legs+wings+fins+tail+spines stack; NODE_MAX is the real cap).

**Verified (2026-06-28):** `npm run typecheck` clean; `npm test` → **42/42** (within-bounds +
2000-genome fuzz + valid-phenotype + forced-mode + `CAM2:` round-trip all green on the new
generator); `npm run build` → succeeds. **In-browser** (14-creature sample): 28% radial
(cephalopods/horrors/urchins/starfish), fins/claws/horns/eyes/mouths spread across creatures,
node range 12–51, **all finite, no console errors**. _The visual "reads clearly as a cat / crab
/ heron / dragon" is a visual call._

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
- **Attractor basins → a real divergence engine (MORPHOLOGY §11).** Formalized the guiding
  intuition with quality-diversity research: a computed **morphospace** with morphotypes as
  **attractor centroids**, a **coherence field** (familiar near centroids, uncanny in the
  valleys), **basin dynamics** (coherence pull / confluence / saltation), **niched litters**
  (9 offspring spread across morphospace, not 9 near-clones), a **MAP-Elites "Menagerie"**
  archive, and a **novelty** steer. This is the cure for premature convergence (collapse to one
  morphotype) that was flagged.

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
  strong *familiar* and a strong *uncanny* cluster by design), ~24 **trait axes**,
  a ~25-part **vocabulary** (wings, tails, horns, fins, pincers, frills, carapace, every eye
  style, every mouth style), and a **procedural covering/texture** system (in-shader patterns
  + bump for scales/fur/feathers/chitin/slime — no asset files, procedural by design).
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
a real foregrounded browser). Pending a visual read on the animation.

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
distinct** sizes. Pending a visual read.

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
  tally + a visual read), and `window.__cambrian.terminals` reports the face/limb tally.

**Verified (2026-06-28):** `npm run typecheck` clean (added `vite/client` types for
`import.meta.env`); `npm test` → **32/32** (bounds guard caught an over-range knee curl —
fixed); `npm run build` → succeeds. **In-browser feature tally:** quadrupeds spawn with 2
eyes + 4 feet + a mouth, fish with 2 eyes + 3 fins + a mouth, radials with a clawed-arm
crown. Pending a visual read on whether it now reads as a creature.

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
  geometry stats + a visual read.)

**Verified (2026-06-28):** `npm run typecheck` clean; `npm test` → **32/32** (added a
forced-mode test: radial/bilateral honored and valid across 300 seeds each); `npm run build`
→ succeeds. **In-browser geometry stats:** bilateral z:width dropped from ≈3.3 → **≈2.2 avg**
(animal proportions); bodies are now chunky (max radius 0.47–0.93, up from ~0.37 threads);
radial creatures are fat discs/domes with arm crowns. Pending a visual read.

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
