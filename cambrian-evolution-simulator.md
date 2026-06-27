# Cambrian — Software Design Document

> Start with a randomly generated alien. Subject it to "evolution time." Watch its body
> mutate across generations into wildly different forms — steer a blob toward a rodent,
> a rodent toward a shark, a shark toward a tiger. Purely for fun and curiosity.

**Status:** Design draft · **Language:** TypeScript · **Stack target:** browser (WebGL)

Name suggestion: **Cambrian** — after the *Cambrian explosion*, the period ~540 million
years ago when, in a geological blink, almost all the major animal body plans first
appeared. It's the single best-known burst of "wildly different forms," which is exactly
the vibe. Alternates: **Mutagen**, **Driftwood**, **Speciate**, **Phylo**.

---

## 1. Concept

A creature is grown from a **genome**. The genome is mutated to produce offspring, you
(or a fitness function) **select** which offspring survive, and the survivors breed the
next generation. Run that loop and the body plan drifts — sometimes gradually, sometimes
in a sudden leap when a structural mutation lands. Over many generations you can walk a
lineage from a small scurrying thing to a giant finned thing to a striped quadruped.

Two things make "wildly different forms" actually possible:

1. **A generative (developmental) genome**, not a direct one. Instead of the genome
   storing "vertex 1 is here, vertex 2 is here," it stores *growth rules* — segment
   counts, symmetry, limb recursion, proportions. A one-gene change ("repeat this limb
   3 more times," "recurse the branch one level deeper") can transform the whole body.
   Direct encodings can only nudge; generative encodings can leap. This is the key idea.
2. **Selection you can steer.** You're not just watching random drift — you pick the
   mutants you like (or set pressures like "bigger / more limbs / aquatic"), so you can
   actually guide evolution toward a shark or a tiger.

> Two foundational references, explained:
> - **Biomorphs** (Richard Dawkins, *The Blind Watchmaker*, 1986) — a toy where simple
>   branching figures evolve by you repeatedly choosing which offspring becomes the next
>   parent. It showed how cumulative selection of tiny random changes produces complex,
>   surprising forms. Cambrian's interactive "breeder" mode is Biomorphs in 3D.
> - **Evolved Virtual Creatures** (Karl Sims, 1994) — a landmark artificial-life work
>   where 3D creatures, with bodies and brains encoded in a *directed graph* genome,
>   evolved via a genetic algorithm inside a physics simulation; fitness was things like
>   how far they could swim or walk. Cambrian's optional physics-fitness mode is a small
>   homage to this.

---

## 2. Goals / Non-goals

**Goals**
- Genome → creature growth that supports a huge morphological range from one encoding.
- Mutation operators that can do both fine-tuning and dramatic restructuring.
- Steerable selection so the user can drive evolution toward a chosen body type.
- A visible **lineage / family tree** — the fun is partly in seeing the path.
- Deterministic & shareable: a genome is a short string/seed; the same seed grows the
  same creature, so creatures and lineages can be shared.

**Non-goals (v1)**
- Scientific accuracy. This is "evolution as a toy," not a biology model. No genetics
  realism, no real selection pressures from an ecosystem.
- A full ecosystem/world. Creatures evolve in isolation against the user or a simple
  fitness function, not against predators/prey/climate. (Ecosystem is a big later idea.)
- Internal anatomy. We evolve external body plan, not organs.
- Neural-network controllers. v1 animation is procedural; evolved *brains* are a stretch.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** | The evolution engine is pure logic (great for TS + unit tests); the viewer is WebGL. |
| Evolution engine | **Pure TS module** | Genome, growth, mutation, selection — no rendering deps, fully unit-testable, deterministic with a seeded RNG. |
| RNG | **seedrandom** (or a small xorshift) | Reproducible mutation; a seed *is* the creature. |
| 3D | **Three.js + react-three-fiber** | Render the grown creature; you already use Three.js. |
| Physics (optional, fitness mode) | **Rapier** (rapier.js, Rust→WASM) | Fast deterministic physics for the Karl-Sims-style "does it move?" fitness. Optional module, lazy-loaded. |
| UI | **React + Zustand** | Generation gallery, lineage tree, pressure sliders. |

> Rapier = a modern physics engine written in Rust, compiled to WebAssembly, with a
> JS binding — fast and deterministic, which matters if fitness must be reproducible.

The architectural separation that matters: **engine (pure, headless) vs. viewer
(rendering)**. You can run evolution with no graphics at all (handy for testing and for
batch "evolve 500 generations overnight").

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      UI (React)                           │
│  GenerationGallery · PressureSliders · LineageTree ·      │
│  CreatureViewer · seed import/export                       │
└───────────────▲──────────────────────────────┬───────────┘
                │ select survivors / pressures   │ display
┌───────────────┴───────────────────────────────▼──────────┐
│            Evolution Engine  (pure TypeScript)            │
│  Genome ── grow() ──▶ Phenotype (body graph)             │
│     ▲                                                     │
│  mutate() ◀── select() ◀── fitness()/user choice          │
│  + lineage tracking, seeded RNG                           │
└───────────────────────────────┬──────────────────────────┘
                                 │ Phenotype
┌───────────────────────────────▼──────────────────────────┐
│        Mesh Builder + Viewer (Three.js / R3F)            │
│   body graph → skinned mesh → procedural animation        │
│   (optional) → Rapier sim → fitness score                 │
└──────────────────────────────────────────────────────────┘
```

---

## 5. Core systems

### 5.1 Genome (generative encoding)

The genome is a small graph of **morph genes**. Think of it as a recipe with loops and
recursion rather than a blueprint of fixed coordinates.

```ts
interface Genome {
  seed: number;                 // base RNG seed
  symmetry: 'bilateral' | 'radial' | 'none';
  body: SegmentGene;            // the root of a recursive body description
  palette: ColorGene;
}

interface SegmentGene {
  id: string;
  size: [number, number, number];   // ellipsoid radii → proportions
  repeat: number;                    // how many times this segment chains (spine length!)
  taper: number;                     // size falloff along the chain
  appendages: AppendageGene[];       // limbs/fins/etc attached to this segment
  child?: SegmentGene;               // next body section (head, tail) — recursion
}

interface AppendageGene {
  attachAngle: number;          // where on the segment it sprouts
  segments: number;             // limb length (recursion depth of the limb itself)
  thickness: number;
  curl: number;                 // bend
  terminal: 'foot' | 'fin' | 'claw' | 'none';
  symmetricPair: boolean;       // mirrored to the other side?
}
```

Why this enables wild divergence:
- `repeat` on a segment is "how many vertebrae" — bump it and a stubby body becomes a
  serpent/centipede.
- `appendages[].segments` is limb length; `appendages.length` is limb count. Few short
  limbs → rodent; many → insectoid; broad `fin` terminals + radial-ish layout → shark.
- `size` ratios set proportions; one mutation can stretch a body into a tiger silhouette
  or squash it into a blob.

### 5.2 Development (grow)

`grow(genome) → Phenotype` interprets the genome into an explicit body graph: walk the
segment chain (honoring `repeat` and `taper`), spawn appendages (honoring symmetry and
recursion), and emit a tree of nodes with world transforms. This is the L-system-like
step — small rules, expanded into structure.

> An **L-system** (Lindenmayer system) is a rewriting system where simple symbols expand
> via rules into complex structures; it's the classic way to grow plants/branching forms
> procedurally. Cambrian's growth step is a creature-flavored cousin of that idea.

```ts
interface Phenotype {
  nodes: BodyNode[];            // segments + limb joints, each with transform + radius
  edges: [number, number][];    // skeleton connectivity
  bounds: Box3;
}
```

### 5.3 Mutation

Three operator classes, applied with tunable rates:

- **Point mutation** — jitter a numeric gene (size, angle, thickness). Fine-tuning.
- **Structural mutation** — change `repeat`, add/remove an appendage, change `terminal`,
  add a `child` segment, flip `symmetry`. *These create the big leaps.*
- **Duplication** — copy a segment or appendage subtree (how you get extra limb pairs,
  longer bodies). Duplication-then-divergence is a real evolutionary motif.

All driven by the seeded RNG so a (parent genome + mutation seed) deterministically
yields the same child.

### 5.4 Selection — three modes

1. **Breeder (default, Biomorphs-style).** Show a grid of N mutated offspring of the
   current creature. Click the one you like → it becomes the parent of the next
   generation. This is the most fun, most steerable, and cheapest (no physics). It's how
   you deliberately walk toward "shark" or "tiger" — just keep picking the ones trending
   that way.
2. **Directed pressures.** Instead of hand-picking, set sliders/toggles — *bigger,
   more limbs, longer body, aquatic vs terrestrial, predator-cues (forward eyes, claws)
   vs prey-cues.* The engine scores offspring against the pressure vector and auto-selects.
   Lets you "set a direction and run."
3. **Physics fitness (optional, Karl-Sims-style).** Drop the creature in Rapier, apply a
   simple oscillating muscle drive, score by distance traveled (swim/walk). Select the
   movers. More ambitious, slower, and the most "alife." Lazy-loaded module.

### 5.5 "Evolution time" — the generation loop

Run K generations: mutate → grow → select → repeat. Track **lineage** (each creature
records its parent + the mutation that made it) so you can render a **family tree** and
replay the path from ancestor to current form. Snapshot interesting individuals. A "fast
forward" runs many generations headless (engine is graphics-free) then shows the result.

```ts
interface LineageNode {
  id: string;
  genome: Genome;
  parentId?: string;
  generation: number;
  thumbnail?: string;          // rendered preview
}
```

### 5.6 Mesh builder & animation

Turn the Phenotype skeleton into something you can see:

- **v1 — primitive skinning:** wrap each body node in a capsule/ellipsoid sized to its
  radius, joined at edges; a simple skinned mesh over the skeleton. Fast, reads clearly,
  handles any topology.
- **Stretch — metaball skin:** run **marching cubes** over the node field to get one
  smooth organic surface (the Spore-ish look). Prettier, heavier.
- **Animation:** procedural — sinusoidal muscle drive along the spine and limbs, phased
  so longer bodies undulate and limbed bodies "walk." Reuses the same procedural-rig
  trick as Chimera.

> **Marching cubes** = an algorithm that converts a 3D scalar field (e.g. summed
> metaball influences) into a polygon mesh — the standard way to get smooth blobby
> surfaces from implicit shapes.

---

## 6. UX / aesthetic

- Center: the current creature on a turntable, idle-animating.
- A **generation gallery** strip: offspring thumbnails to choose from (breeder mode).
- **Pressure panel:** sliders/toggles for directed mode; a "generations to run" + "go".
- **Lineage tree** view: zoomable family tree, click any ancestor to revisit/branch.
- Seed box: copy a creature's seed/genome string; paste to regrow someone else's beast.
- Tone: curious, naturalist — like flipping through an alien field guide you're writing
  in real time.

---

## 7. Milestones

- **M0 — Grow one creature.** Genome type + `grow()` + primitive mesh; render a single
  randomly-seeded creature. No mutation yet.
- **M1 — Mutate + breeder loop.** Mutation operators + the Biomorphs-style "pick an
  offspring" generation loop. This alone is a complete, fun toy.
- **M2 — Lineage + persistence.** Family-tree tracking, snapshots, seed import/export.
- **M3 — Directed pressures.** Pressure scoring + auto-selection + "run K generations."
- **M4 — Better bodies.** Symmetry variety (radial creatures), terminals (fins/claws),
  procedural undulation/walk animation.
- **M5 (stretch) — Physics fitness.** Rapier locomotion fitness mode.
- **M6 (stretch) — Metaball skin.** Marching-cubes smooth surface.

---

## 8. Risks / open questions

- **Most mutations are ugly.** Expected — that's why selection exists. Breeder mode hides
  it (you only keep the good ones); directed/physics modes need decent scoring so they
  don't wander into garbage. Tune mutation rates so leaps are occasional, not constant.
- **Topology → mesh robustness.** Arbitrary evolved skeletons must always skin without
  exploding. Primitive-capsule skinning is robust by construction; that's why it's v1.
- **Reproducibility.** Every random draw must flow from the seed (mutation, growth,
  physics if used) or shared seeds won't reproduce. Centralize the RNG; forbid
  `Math.random()` in the engine.
- **Search getting "stuck."** Directed/physics evolution can plateau. Inject occasional
  larger structural mutations (a crude "macro-mutation") to escape local optima.
- **Scope creep toward an ecosystem.** Tempting to add predators, food, a world. Note it,
  resist it for v1 — it's a different (huge) project closer to Omnia.

---

## 9. References

- **Biomorphs — Dawkins, *The Blind Watchmaker* (1986)** — interactive cumulative
  selection of branching forms; the model for breeder mode.
- **Evolved Virtual Creatures — Karl Sims (1994)** — graph-genome creatures evolved in
  physics for locomotion; the model for fitness mode.
- **L-systems (Lindenmayer)** — rule-based growth; the inspiration for the developmental
  genome → phenotype step.
- **Marching cubes** — implicit-surface-to-mesh algorithm; the stretch-goal smooth skin.
- **Spore (Maxis, 2008)** — adjacent inspiration for the creature aesthetic and the
  "make an alien" joy (see the sibling doc, Chimera, for the *builder* take on this).
- **Rapier** — Rust/WASM physics engine for the optional locomotion fitness.
- **Shared opportunity:** like Chimera and Brickyard, this wants the common R3F editor
  shell (camera/grid/scene); good candidate for the shared package on second use.
