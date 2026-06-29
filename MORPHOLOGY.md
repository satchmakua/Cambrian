# MORPHOLOGY — the creature-variety system (Cambrian v2)

> Cambrian's novelty is **purely visual**. The graphics can be crude — capsules, spheres,
> flat-shaded blobs — and that's fine. But they must be **robust, effortful, complex, and
> visually interesting**: a player should be able to roll creatures for an hour and keep
> seeing forms they haven't seen. Today the generator produces too few silhouettes — the
> same body + N leg pairs + fins, over and over. This document specifies the system that
> fixes that: a **creature grammar** rich enough to throw out cats, canines, reptiles,
> birds, fish, crabs, rodents, dragons, *and* genuinely uncanny aliens — from one
> deterministic, evolvable genome.

**Status:** Design — drives a new build phase (see §11). Supersedes the ad-hoc archetype
generator in `src/engine/random.ts`. This is a **genome v2**; v1 `CAM1:` strings are dropped.

Read alongside [DESIGN.md](DESIGN.md) (the three pillars still hold: pure/headless engine,
absolute determinism, bounded & meshable growth).

---

## 1. The bar, and the target distribution

**The bar.** Variety is the product. Every knob that a real animal varies along should be a
dial here, and the parts catalogue should be deep enough that silhouettes rarely repeat.
"Crude but robust" means: simple primitives, but *many* of them, *combined* in many ways,
*proportioned* correctly, *textured* procedurally, and *moving* in character.

**The target distribution is bimodal — familiar AND uncanny are both strong signals.**
We are not aiming for a bland continuum where everything is a half-recognizable smudge. We
want:

- a strong **Familiar** mode — creatures that read *clearly* as "that's a cat", "that's a
  crab", "that's a heron", because their proportions and parts match a real body plan; and
- a strong **Uncanny** mode — dragons, cephalopod-aliens, many-eyed horrors, chimeras —
  that are coherent and deliberate, not just noise.

Roughly **45% familiar / 35% uncanny / 20% the wild in-between** at the random-roll stage;
selection and directed pressures then let the user travel anywhere.

**Non-goals (unchanged):** scientific accuracy, internal anatomy, an ecosystem, photoreal
rendering. Crude primitives stay; we add *breadth*, not fidelity.

---

## 2. Architecture — a four-layer grammar

```
seed ─▶ ┌──────────────┐   pick + jitter   ┌───────────────┐  ratio→genes  ┌────────────┐
        │  MORPHOTYPE   │ ────────────────▶ │  TRAIT VECTOR  │ ───────────▶ │  GENOME v2  │
        │  (the prior)  │                   │  (~24 dials)   │              │ (low-level) │
        └──────────────┘                    └───────────────┘              └─────┬──────┘
                                                                                 │ grow()
                                            ┌─────────────────────────────┐      ▼
                                            │   PART VOCABULARY (~25)       │  Phenotype
                                            │   + COVERING/TEXTURE + MOTION │  (skeleton)
                                            └─────────────────────────────┘      │
                                                                                 ▼
                                                            mesh (parts) · material (covering)
                                                                  · animation (motion style)
```

1. **Morphotype** — a high-level "vibe" that is a *multivariate prior*, not a fixed mold:
   coupled trait ranges + characteristic parts + covering + motion. ~24 of them (§4).
2. **Trait vector** — ~24 continuous dials sampled from the morphotype's prior, then
   jittered, so two felids differ and a felid differs from a canid in its *centers* (§5).
3. **Genome v2** — the low-level, evolvable encoding the traits compile *down* to: body
   regions, a part list with full spherical aim, covering/pattern genes (§3). **Mutation
   operates here** — the morphotype is only a sampling prior, never a runtime constraint, so
   evolution can still drift a cat toward something that was never any morphotype.
4. **Render** — parts → crude distinct geometry; covering → procedural pattern + bump;
   morphotype → motion style.

**Why a prior, not stored archetypes:** keeping the genome low-level preserves Pillar 1
(evolvability) — a single mutation can still leap between body plans. The morphotype just
seeds *coherent* starting points so random rolls aren't mush.

---

## 3. Genome v2 — the domain-critical core (get this exact)

The headline change that unlocks most new parts: **every appendage gets a full spherical
aim** (azimuth + elevation + roll), not the v1 "splay in the cross-section with a fixed
backward tilt." That single fix is what lets tails point *back*, wings *out-and-back*, horns
*up-and-forward*, necks *up*, gills *forward-down* — the reason v1 all looks same-y is that
parts could only fan sideways.

### 3.1 Aim convention (fixed)

Body forward = **+Z**, up = **+Y**, right = **+X** (unchanged). An appendage's base
direction from two angles:

```ts
// azimuth θ sweeps the cross-section (θ=0 →+X right, π/2 →+Y up, π →-X, 3π/2 →-Y down)
// elevation φ tilts toward the body axis (φ=0 → sideways, +π/2 → forward +Z, -π/2 → back -Z)
dir = cos(φ) * (cos(θ) * X + sin(θ) * Y) + sin(φ) * Z;       // unit vector
// + a roll about `dir` orients flat parts (fins, wings, frills, paws)
```

So: a **tail** = θ≈3π/2 (down) with φ≈−0.7 (back); a **dorsal fin/sail** = θ≈π/2, φ≈0;
**wings** = θ≈π/2..π, φ≈−0.3, rolled flat; **horns** = θ≈π/2, φ≈+0.5; **legs** = θ≈4.2,
φ≈0; **eyestalks** = θ forward-up, φ≈+0.4.

### 3.2 Schema

```ts
export const GENOME_VERSION = 2;

export interface Genome {
  version: 2;
  seed: number;                 // uint32 — deterministic growth jitter
  symmetry: 'bilateral' | 'radial' | 'none';
  radialCount: number;          // 3..12
  origin: MorphotypeId;         // CACHED birth label only; the live position is the COMPUTED
                                // morphospace descriptor (§11.1), never a runtime constraint
  body: BodyPlan;
  covering: Covering;
  palette: Palette;
}

export interface BodyPlan {
  segments: SegmentGene;        // the trunk chain (as v1: repeat, taper, curve, fusiform)
  // distinct regions so proportions read: a neck + head at the front, a tail at the back.
  neck?: SegmentGene;           // narrower chain toward the head (forward, often raised)
  head?: HeadGene;              // cranium shape + face features
  tail?: TailGene;              // backward chain (whip / tuft / fan / fin / club / none)
  parts: PartGene[];            // everything else, attached along the trunk
}

export interface PartGene {
  kind: PartKind;               // see §6
  style: number;                // 0..1 selects among that kind's variants
  attachT: number;              // 0..1 along the trunk
  aim: [number, number];        // [azimuth, elevation] (§3.1)
  roll: number;                 // orient flat parts
  segments: number;             // articulation depth (1..8)
  length: number; thickness: number; taper: number;
  curl: [number, number];       // per-segment bend (joints)
  pair: boolean;                // mirror across X=0
  terminal: Terminal;           // tip cap (claw/talon/pincer/hoof/foot/fin/none/…)
}

export type PartKind =
  | 'leg' | 'arm' | 'wing' | 'fin' | 'tail' | 'horn' | 'spine' | 'frill'
  | 'ear' | 'antenna' | 'whisker' | 'tentacle' | 'eyestalk' | 'plate' | 'gill';

export interface HeadGene {
  size: number; snout: number;  // snout 0 = flat face (cat/ape) … 1 = long (croc/heron)
  jaw: number;                  // 0 small … 1 huge maw
  eyes: EyeGene;
  mouth: MouthGene;
}

export interface EyeGene {
  count: number;                // 0,2,3,4,6,8…  (even = paired, odd = a cyclops/extra)
  style: EyeStyle;              // 'round'|'slit'|'compound'|'beady'|'stalked'|'glowing'
  size: number; forward: number;// forward 0 = side-set (prey) … 1 = front-set (predator)
}

export interface MouthGene {
  style: MouthStyle;            // see §6.3 — beak, maw, mandibles, sucker, baleen, lamprey, none
  size: number; teeth: number;  // 0 none … 1 fanged
}

export interface TailGene { length: number; style: TailStyle; thickness: number; curl: number; }

export interface Covering {
  type: CoveringType;           // 'skin'|'scales'|'fur'|'feathers'|'chitin'|'slime'|'plates'
  pattern: PatternType;         // 'plain'|'stripes'|'spots'|'bands'|'ocelli'|'reticulate'|'mottle'|'gradient'
  patternScale: number; patternContrast: number;
  sheen: number;                // 0 matte … 1 wet/iridescent
}
```

Every numeric gene is bounded in `GENE_BOUNDS` (Pillar 3) and clamped on mutation. The fuzz
test (now 10k genomes) must stay green: any `grow(genome)` yields a finite, capped,
single-tree skeleton.

---

## 4. Morphotype library (the presets — ~24)

Each row is a **prior**: it biases the trait sampler and supplies characteristic parts,
covering, and motion. "Lean" columns are *centers*, not fixed values. Two clusters, both
strong.

### Familiar cluster

| Morphotype | Build | Limbs / posture | Head / face | Signature parts | Covering · pattern | Motion |
|---|---|---|---|---|---|---|
| **Felid** | sleek, muscular | 4, digitigrade | short snout, forward eyes | long tail, retractable claws, whiskers, small ears | fur · spots/stripes/plain | stalk→trot→pounce |
| **Canid** | lean | 4, digitigrade | long snout, erect ears | bushy tail, blunt claws | fur · plain/mottle | trot/gallop |
| **Ursid** | robust, stocky | 4, plantigrade | big blunt head | big claws, stub tail | shaggy fur · plain | lumber |
| **Rodent** | small, round | 4 short | big incisors, round ears, big eyes | long thin tail, whiskers | fur · plain/agouti | scurry |
| **Ungulate** | tall, long-limbed | 4, hooves | side eyes (prey), long muzzle | horns/antlers, short tail | short fur · plain/spots | gallop |
| **Primate** | upright-ish | 4 grasping | flat face, forward eyes | long limbs, expressive face | fur · plain | climb/amble |
| **Mustelid** | long tube body, short legs | 4 short | small head | long body, short fur | fur · plain | bound |
| **Lizard** | low, sprawled | 4, sprawling | side eyes | long tail, dewlap/frill | scales · bands/reticulate | scuttle |
| **Crocodilian** | low, armored | 4 short sprawled | very long toothy jaw | scutes, spines, long tail | scales/plates · mottle | belly-crawl |
| **Serpent** | legless, long | 0 | small head, forked tongue | — | scales · bands/diamond | slither |
| **Anuran (frog)** | squat | 4, long hind | wide mouth, top-set bulging eyes | webbed feet | wet skin · spots/mottle | hop |
| **Chelonian (turtle)** | domed | 4 short | small beaked head | carapace plate, stub tail | plates · reticulate | trundle |
| **Songbird** | small, light | 2 legs + wings | beak, big eyes | tail fan, feather crest | feathers · barred/plain | hop/flit |
| **Raptor** | medium | 2 legs + broad wings | hooked beak, forward eyes | talons | feathers · barred | flap/glide |
| **Ratite** | tall, heavy | 2 long legs, vestigial wings | long neck, small head | — | shaggy feathers · plain | run |
| **Fish** | streamlined | 0, fins | side eyes, gills | dorsal/pectoral/pelvic/caudal fins | scales · countershade/spots | swim (body wave) |
| **Shark** | large, fusiform | 0, fins | toothy maw, side eyes | tall dorsal, crescent caudal | smooth · countershade | cruise |
| **Decapod (crab)** | wide, low carapace | 6–8 + 2 pincers | eyestalks | pincers, carapace plate | chitin · mottle | sideways scuttle |
| **Insectoid** | 3 segments | 6 legs | antennae, compound eyes, mandibles | wings (opt) | chitin · banded/iridescent | scuttle/buzz |
| **Arachnid** | bulbous abdomen + cephalothorax | 8 legs | multiple eyes, fangs | — | fine fur/chitin · mottle | creep |

### Uncanny cluster

| Morphotype | Build | Limbs / posture | Head / face | Signature parts | Covering · pattern | Motion |
|---|---|---|---|---|---|---|
| **Dragon** | large, muscular | 4 + wings | long horned head, fanged maw | long neck + tail, dorsal spines | scales · reticulate/iridescent | stalk/flap |
| **Wyvern** | lean | 2 legs + wings | horned, beaked-maw | long barbed tail | scales · banded | hop/glide |
| **Cephalopod-alien** | bulbous mantle | many tentacles | huge odd eyes, beak | siphon, fins on mantle | slime · iridescent/spots | drift/jet |
| **Chimera** | mismatched | mixed (e.g. 4 legs + wings + fins) | deliberately wrong head | spliced parts | mixed · clashing | uneven |
| **Amorphous (slime)** | blobby, few rigid parts | 0–2 vestigial | many scattered eyes | pseudopods | slime/translucent · gradient | ooze/pulse |
| **Many-eyed horror** | radial-ish | radial arms | eye clusters, mouths in odd places | many eyes, spines | skin · ocelli/glowing | writhe |
| **Arthro-alien** | wrong-arthropod | 10+ legs, odd posture | vertical eyes, multi-mandible | spines, plates | chitin · iridescent | ripple-scuttle |
| **Crystalline** | angular, segmented | rigid limbs | facet "head", glowing core | spikes, plates | plates/metallic · gradient | jitter/hover |

*(20 familiar-leaning + 8 uncanny here; ship ≥ 24, expand freely — they're cheap data.)*

---

## 5. Trait axes (the dials — ~24)

Continuous, sampled from the morphotype prior `(mean, spread)` then jittered, then mapped to
genome genes. **Proportions are encoded as ratios** (e.g. legLength / bodyDepth), so a cat
reads as a cat at any absolute size.

| Group | Axis | Range / meaning |
|---|---|---|
| **Build** | `mass` | gracile ↔ robust/muscular (girth + bulk) |
| | `bodyLength` | stubby ↔ serpentine (trunk segment count) |
| | `bodyDepth` | flat ↔ deep (cross-section y/x) |
| | `neckLength` | none ↔ long (heron/sauropod) |
| | `tailLength` | none ↔ long |
| **Limbs** | `limbCount` | 0,2,4,6,8,10+ |
| | `limbLength` | stubby ↔ stilt (ratio to bodyDepth) |
| | `limbThickness` | thin ↔ thick |
| | `posture` | sprawling ↔ upright ↔ digitigrade ↔ plantigrade ↔ hooved |
| | `wings` | 0 ↔ 1 pair (membrane/feathered) |
| **Head** | `headSize` | small ↔ large |
| | `snout` | flat face ↔ long muzzle/beak |
| | `jaw` | dainty ↔ huge maw |
| **Eyes** | `eyeCount` | 0,2,3,4,6,8 |
| | `eyeSize` | beady ↔ huge |
| | `eyePlacement` | side-set (prey) ↔ front-set (predator) |
| | `eyeStyle` | round / slit / compound / glowing / stalked |
| **Adornment** | `horns` | none ↔ many/large |
| | `spines` | none ↔ full dorsal ridge |
| | `frill` | none ↔ big (collar/sail/fan) |
| | `fins` | none ↔ full set |
| **Surface** | `covering` | skin/scales/fur/feathers/chitin/slime/plates |
| | `pattern` | plain/stripes/spots/bands/ocelli/reticulate/mottle |
| | `sheen` | matte ↔ wet/iridescent |
| **Demeanor** | `predator` | prey-cues (side eyes, no teeth/claws, herbivore mouth) ↔ predator-cues (front eyes, fangs, claws, maw) |

`predator` is a *meta-axis*: it nudges eyes, mouth/teeth, and claw terminals together, so
the morphological "feel" is coherent. These map onto the directed-pressure vector (M4),
which gains the new axes (`neck`, `tail`, `wings`, `horns`, `eyes`, …).

---

## 6. Part vocabulary (the assets — ~25, crude but distinct)

Each part = crude primitives, but *recognizable in silhouette*, with placement math from the
spherical aim (§3.1). Build these out fully — this is the "tedious robustness."

### 6.1 Limbs & locomotion
- **leg** — variants by `posture`: sprawling (out-then-down), upright (straight column),
  digitigrade (raised heel, walk on toes), plantigrade (flat foot), hooved. Knee/elbow bend
  from `curl`. Terminals: `paw`, `foot`, `talon`, `hoof`, `claw`.
- **arm** — forward-reaching, grasping terminal.
- **wing** — membrane (bat/dragon: a few struts + a skin web, rendered as a thin stretched
  triangle fan) or feathered (overlapping blade quills). Rolled flat.
- **fin** — dorsal (sail), pectoral (paired side), pelvic, caudal (tail fin); thin blades.
- **tentacle** — long, many-segment, high curl, drifts; sucker dots optional.

### 6.2 Eyes (the emotional anchor — `EyeStyle`)
- **round** (sclera + pupil + highlight — current), **beady** (small dark glossy),
  **slit** (vertical-pupil reptile), **compound** (faceted dome — insect), **glowing**
  (emissive, alien), **stalked** (eye on an `eyestalk` part — crab/snail).
- Count drives placement: 2 paired; 3/cyclops centered; 4/6/8 arrayed (spider/horror).
- Placement from `eyePlacement` (side ↔ front).

### 6.3 Mouths (we need mouths — `MouthStyle`)
A real face needs a real mouth. Each is a distinct crude assembly:
- **maw** — open jaw: upper + lower flattened wedges, dark interior, optional tooth row.
- **beak** — two hard cones meeting (bird/turtle/cephalopod); hooked variant (raptor).
- **mandibles** — paired side pincers that meet (insect/arachnid).
- **sucker** — a radial disc of small teeth (lamprey/leech) or a round suction ring.
- **baleen / filter** — a fringed slot (whale/basking).
- **tusked / fanged** — maw + protruding tusks/fangs (`teeth` gene).
- **proboscis** — a tube (butterfly/mosquito).
- **none** — featureless (slime/alien).

### 6.4 Head adornment & defense
- **horn** (cone; straight/curved/branched=antler by `style`), **frill** (a fanned collar
  or back-sail of struts + web), **spine/quill** (a dorsal ridge or scattered spikes),
  **ear** (cone/leaf/round), **antenna**, **whisker** (thin filaments), **crest** (feather
  fan), **plate/scute/carapace** (a flattened dome shell over a region), **gill** (slits or
  feathery rakes on the neck), **club/barb** (tail terminal).

### 6.5 Body regions
- **neck** — a narrowing forward chain (often raised via aim) between trunk and head; gives
  herons, sauropods, dragons, ostriches their read.
- **tail** — a backward chain; styles: whip, tuft (fur ball), fan (feathers), fin (fish),
  club (mace), barb (sting), spiked.

---

## 7. Covering & texture (procedural, in code)

No asset files. Two procedural systems on top of the existing countershading + fresnel rim,
both in **body/object space** (stable under the camera turntable), seeded per creature.

### 7.1 Color pattern (in-shader)
The covering's `pattern` selects a field `p(x) ∈ [0,1]` over body-space position / arc-length,
mixed between the base skin and the pattern color by `patternContrast`:

| Pattern | Field (sketch) | Reads as |
|---|---|---|
| `stripes` | `step(sin(arcLen·f))` perpendicular to the spine | tiger, zebra, fish bars |
| `bands` | `step(sin(arcLen·f))` *along* the body | snake, coral-snake, wasp |
| `spots` | threshold of cellular/voronoi noise | leopard, fawn, frog |
| `ocelli` | spots with concentric rings (`fract(dist·n)`) | peacock, moth, "eye" spots |
| `reticulate` | voronoi *edges* | giraffe, croc, net |
| `mottle` | low-freq fbm | camo, generic skin |
| `gradient` | along-body or top-down ramp | alien, amphibian |

Plus dorsal/ventral **countershading** (already in) and `sheen`→iridescence (thin-film hue
shift by view angle) for wet/alien skins.

### 7.2 Surface relief (procedural normal/bump)
The covering type perturbs the surface normal so light catches the texture. Prefer **in-shader
bump** (perturb the normal by the screen-space derivative of a procedural height `h(x)`) so no
textures are allocated; fall back to a generated tiling `DataTexture` where a detail repeats:

| Covering | Height field | Reads as |
|---|---|---|
| `scales` | voronoi cells, each a raised lens, row-offset | reptile/fish scales |
| `fur` | high-freq directional fbm streaks | mammal pelt |
| `feathers` | overlapping rounded rows (shingles) | bird plumage |
| `chitin` | large smooth plates + hard creases | insect/crab shell |
| `plates` | big voronoi scutes with deep gaps | croc/turtle/armor |
| `slime` | low bump + high `sheen` + slight transmission | wet alien |
| `skin` | very low mottle bump | generic |

Materials per covering: roughness/metalness presets (fur matte, scales semi-gloss, chitin
glossy, slime wet, plates hard). All deterministic from `(seed, covering)`.

---

## 8. Motion styles (per morphotype)

The animation rig (`src/viewer/animation.ts`) generalizes from "undulation + gait" to a small
library, chosen by morphotype and parameterized by trait values:

- **walk / trot / gallop** — phased leg lift+reach; gallop adds a body bound. (legged land)
- **slither** — strong lateral body wave, no legs. (serpent/eel)
- **scuttle** — many-leg metachronal ripple + low body. (crab/insect/arachnid)
- **hop** — crouch→launch→land cycle. (frog/ratite/rodent)
- **swim** — caudal body wave + fin counter-sway. (fish/shark/cetacean)
- **flap / glide** — wing beat + slight body bob; glide = wings held, slow bank. (bird/dragon)
- **drift / jet** — tentacle undulation + mantle pulse. (cephalopod/jelly)
- **writhe / ooze / hover** — uncanny idles for amorphous/crystalline.

Each is pure viewer math (Pillar: `grow()` stays static); each adds per-part oscillation
(tails sway, wings beat, frills ripple, antennae bob, eyes saccade occasionally).

> **Borrow from Spore:** our deformation is morphology-independent *by construction* (deform by
> node position) — the hard problem Spore solved via **motion retargeting** (author abstract
> gaits, retarget to any skeleton at runtime). For richer, more characterful gaits than pure
> sine math, author a few **motion primitives keyed by limb role** (stance/swing per leg, a
> wing-beat curve, a tail S-wave) and retarget them by the part's role — a small, high-value
> upgrade once the part vocabulary (§6) exists.

---

## 9. Determinism, bounds, evolvability (unchanged pillars)

- **Deterministic:** morphotype pick, trait sampling, and gene compilation all draw from the
  seeded `mulberry32`. `randomGenome(seed, opts)` is pure; `grow(genome)` is pure.
- **Bounded & meshable:** every new gene clamps to `GENE_BOUNDS`; growth honors
  `R_MIN`/`NODE_MAX`(raise to ~640 for busy creatures)/`DEPTH_MAX`; the fuzz test grows
  ~10k random genomes and asserts a valid single-tree skeleton — including all new part
  kinds and aims.
- **Evolvable:** mutation works on the flat v2 genome — point (jitter genes), structural
  (add/remove a part, change a part's `kind`/`style`/`terminal`, flip symmetry, grow a
  neck/tail), duplication (clone a part subtree → extra limb pairs), macro (re-roll a region).
  Because the morphotype is only a prior, a lineage can leave its starting body plan entirely.

---

## 10. Why this gets the variety (the math)

- **Morphotype = a multivariate prior.** Sampling a *coupled* trait vector (bird ⇒ 2 legs +
  wings + beak + feathers + light build, drawn together) is what makes a roll read as a
  *kind* rather than a bag of random parts. Independent sampling (today's bug) produces mush;
  correlated sampling produces species.
- **Bimodality is explicit.** The morphotype table is split familiar/uncanny and weighted so
  both modes are dense; the in-between is the deliberately-thin tail.
- **Ratios, not absolutes.** Encoding proportions relative to body depth/length makes the
  silhouette survive scaling and mutation — the #1 reason something "reads" as a cat.
- **Spherical aim** multiplies the expressible silhouettes: the same part library aimed
  up/back/forward yields crests, tails, wings, horns, necks, gills from shared code.
- **Procedural covering** multiplies again: every silhouette × {7 coverings × 8 patterns ×
  sheen} is a distinct-looking animal, for near-zero asset cost.

The combinatorics: ~24 morphotypes × continuous traits × ~25 parts (each multi-style) ×
covering/pattern/motion ⇒ effectively unbounded distinct creatures, anchored at recognizable
modes. That is the "vast array of presets and assets," generated rather than hand-drawn.

---

## 11. Morphospace & divergence — the attractor-basin engine

Variety isn't only *generating* diverse creatures; it's keeping *evolution* diverse — so a
lineage drifts and twists between body plans, falls into the weird valleys and confluences
between them, and throws out wildly divergent specimens instead of collapsing onto one
morphotype. That collapse is a known failure: **premature convergence into a single basin of
attraction**. The cure is **quality-diversity (QD) search** — novelty search, MAP-Elites, and
speciation/niching, which *illuminate* a space rather than converge in it (NSLC found *more*
morphological diversity than a global fitness function). We treat the morphotypes as
**attractor basins** and borrow that machinery.

### 11.1 Morphospace & the coherence field
- A **morphospace descriptor** = a ~8-D vector *computed from the phenotype* (not stored):
  `[elongation, limbCount, bulk, finniness, wingedness, headedness, eyeCount, sheen]` (+ a
  symmetry class). Because it's computed, a creature reports its **true current** position even
  after a lineage has evolved far from where it began.
- Each **morphotype** has a **centroid** here (its characteristic descriptor) — an attractor.
- **coherence(c) = maxₘ Gauss(‖descriptor(c) − centroidₘ‖)** ∈ [0,1]: high near a centroid
  (reads as a *clear* animal), low in the valleys between (uncanny hybrids). The UI label is the
  nearest centroid + coherence — "83% heron", or "valley: raptor × felid". This one field drives
  the bimodal sampler, the UI labels, and the novelty steer.

### 11.2 Basin dynamics in mutation
- Mutation is a **walk in morphospace**. A tunable **coherence pull** (soft, distance-weighted)
  biases offspring slightly toward the nearest centroid, so lineages *settle* into recognizable
  forms — turn it down and they wander the valleys. This *is* the basin: creatures roll downhill
  into a morphotype but can climb out.
- **Confluence:** near a basin boundary, a creature blends both attractors' characteristic parts
  (felid body + raptor head + wings → griffin). Boundaries are fertile, not forbidden.
- **Saltation (basin-hop):** a low-probability macro-mutation re-rolls a region toward a
  *different* attractor — escapes the funnel; the engine of sudden leaps.

### 11.3 Divergent litters (niche the breeder)
Today's nine offspring are nine small mutations of one parent → near-clones. Replace with a
**spread**, so every generation offers genuinely different choices:

| slots | step size | aim |
|---|---|---|
| 3 | small | conservative — refine the current form |
| 3 | large | exploratory — bold jumps in any direction |
| 2 | medium | **directed at the two nearest *other* attractors** — deliberate hybrids |
| 1 | macro | wildcard — a saltation / basin-hop |

This is local-competition / niching at the litter level: the user steers *through* morphospace
instead of polishing one point in it.

### 11.4 The Menagerie — a MAP-Elites archive (a feature, not just a mechanic)
As the user breeds or fast-forwards, maintain an **archive grid** over two chosen morphospace
axes (e.g. `limbCount × elongation`, or `covering × bulk`). Each cell keeps the most-interesting
creature discovered in that region. Over a session the grid fills with a **living field guide** of
wildly divergent specimens — the explicit QD "illumination" of the space. Browse it, pull any
cell back as a parent, or seed a directed run from it. (The archive lives in the UI/store, **not**
the pure engine — purity preserved — and replays from the seed + the user's choices.)

### 11.5 Novelty as a steer
Add a **novelty / weirdness** axis to the directed-pressure vector (§5): reward morphospace
distance from the archive / recently-seen forms (novelty search). Crank it to deliberately hunt
the uncanny valleys; combine with morphological targets for "novel **but** winged + long-necked".

### 11.6 Why this is robust *and* divergent
Naive hill-climbing collapses into one funnel. Coherence-pull + confluence + saltation + niched
litters + a QD archive keep **multiple basins populated and the valleys traversable** — the
diversity-maintenance (speciation / niching / illumination) that QD research shows beats global
fitness for morphological diversity. Determinism still holds (all stochasticity is seeded); the
archive replays from seed + choices.

---

## 12. Build plan (Phase 3 — ROADMAP is authoritative)

The arc, re-cut from the critical review (M8 was overstuffed; the divergence engine + menagerie
added; smooth skin elevated). See [ROADMAP.md](ROADMAP.md) for Test steps.

- **M8 — Genome v2 + spherical aim.** The schema (§3) + aim convention (§3.1); migrate `grow` +
  the generator to the flat v2 genome; `CAM2:` share; raise `NODE_MAX`. (The gallery `<View>`
  consolidation rides here or lands as its own quick win — the remount churn is already fixed by
  stable keys.)
- **M9 — Part vocabulary.** The ~25 parts (§6) with distinct crude geometry — **every eye style
  and every mouth style**, wings, tails, horns, fins, pincers, frills, carapace.
- **M10 — Morphotype library + trait sampler.** The ~24 priors (§4) + ~24 axes (§5) +
  ratio-based proportions + the bimodal sampler.
- **M11 — Divergence engine.** Morphospace descriptor + coherence (§11.1), basin dynamics
  (§11.2), niched litters (§11.3).
- **M12 — Covering & texture.** Procedural patterns + in-shader bump + per-covering materials (§7).
- **M13 — Motion styles.** The gait/swim/flap/scuttle/slither/drift library (§8).
- **M14 — The Menagerie.** MAP-Elites archive + browser + the novelty steer (§11.4–11.5).
- **M15 — Smooth skin *(elevated from far-stretch)*.** Marching-cubes metaball surface over the
  node field — the single biggest "less crude" win (it's what gave Spore its look), gated behind
  the robust capsule path. The capsule-union is the #1 thing keeping the look kit-like.
- **M16 — Dials & polish.** Surface the new axes in the UI; tune the distribution; grow the tables.

Still gated: physics fitness (Rapier), `.glb` export.

---

## 13. Open questions

- **Body-region vs. flat parts:** neck/tail as distinct chains (§3.2) vs. just more `parts`.
- **Mutation across `kind`:** how freely a structural mutation flips a leg→wing or horn→fin.
  Some freedom is the fun; too much is mush — tune the kind-transition table, and let the
  coherence pull (§11.2) clean up the incoherent results.
- **Morphospace axes:** which ~8 descriptors best separate the morphotypes (so the menagerie grid
  and coherence field are meaningful)? Pick empirically once the library exists.
- **How alien is too alien:** keep the uncanny mode *coherent* (deliberate asymmetry, eye
  clusters) — the line between "unsettling creature" and "buggy mesh".
- **Smooth-skin cost:** does marching-cubes (M15) hold framerate with 9 thumbnails + animation,
  or does it want a lower-res field / impostors for the thumbs?

---

## 14. Prior art & references (verified 2026-06-28)

- **Spore** — metaball skin (4th-order implicit surface, live remesh), **Rigblocks**
  (parameterized authored parts), and **morphology-independent motion retargeting**. Chris
  Hecker, *My Liner Notes for Spore* + *Real-time Motion Retargeting to Highly Varied
  User-Created Morphologies*. The creature-creator bar; our capsule-union is the cheap metaball,
  our part vocabulary the procedural Rigblocks, our `animation.ts` the morphology-independent
  motion.
- **Picbreeder / EndlessForms** (Secretan, Clune, Stanley et al.) — interactive collaborative
  evolution of 2D images / 3D forms via **CPPN + NEAT**. Cambrian's truest lineage; CPPNs are an
  alternative generative encoding worth studying.
- **Quality-Diversity** — *Illuminating search spaces by mapping elites* (Mouret & Clune,
  **MAP-Elites**); **Novelty Search / NSLC** (Lehman & Stanley); *Quality Diversity: A New
  Frontier* (Pugh, Soros, Stanley). The basis for §11.
- **Karl Sims, *Evolved Virtual Creatures* (1994)** — graph-genome creatures evolved in physics;
  ancestor of the genre and of our gated physics-fitness mode.
- **Framsticks** — long-running 3D creature-evolution simulator (bodies + brains via GA).
- **Theoretical morphology / Raup's morphospace** — a parameter space of possible forms with
  occupied and empty regions; the conceptual basis for §11's morphospace.
