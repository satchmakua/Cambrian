# Cambrian

> Start with a randomly generated alien. Subject it to "evolution time." Watch its body
> mutate across generations into wildly different forms — steer a blob toward a rodent, a
> rodent toward a shark, a shark toward a tiger. Purely for fun and curiosity.

A 3D artificial-evolution toy: creatures are *grown* from a generative genome, mutated, and
selected — by you (Biomorphs-style breeder) or by directed pressures — so you can walk a
lineage from a scurrying blob to a finned giant to a striped quadruped.

**Status:** 🟢 **Part 1 complete (M0–M16)** + **Part 2 in progress** — fidelity fixes (M17 body-locked
textures · M18 strict bilateral symmetry · M19 always-readable face · M20 gallery layout · M21
distinct leg postures) done, the **morphotype library is now 30** (M22 added primate, mustelid,
turtle, ratite, chimera, arthro-alien, crystalline), the **full part vocabulary** ships (M23: ears,
whiskers, gills, carapace/shell, crest, club/barb tails, 8 mouth styles, stalked eyes, strut-braced
wings), and a **bauplan** layer (M24) gives every creature a canonical limb arrangement + a guaranteed
prominent face (a real mouth organ) that survives evolution, with a tunable "weirdness" dial. Genome **v2 + spherical aim (M8)**, a **part
vocabulary** with eye/mouth styles, horns, pincers, wings (M9), **morphotype priors + a bimodal sampler** (M10)
so rolls read as cat / crab / heron / dragon / cephalopod, a **divergence engine** (M11:
morphospace + coherence labels + niched litters), **procedural covering & texture** (M12: in-shader
patterns + per-covering surface bump for fur / scales / chitin / slime / feathers / plates), and
**morphology-driven motion** (M13: walk / swim / slither / scuttle / flap / drift picked from the
body plan), **the Menagerie** (M14: a MAP-Elites archive that fills with divergent specimens as you
play, browsable + pull-as-parent, plus a novelty steer), and **smooth skin** (M15: a toggleable
marching-tetrahedra surface that welds the capsule kit into one organic body), and **dials & polish**
(M16: wings/neck/covering steers, a morphotype filter, the frill part), plus the two stretches —
**glTF export** (M7: bake any creature to a `.glb`) and **physics fitness** (M6: evolve creatures
that walk, via a lazy-loaded Rapier ragdoll sim). M0–M5 done: faces, countershaded skin, breeder +
directed evolution, lineage, `CAM2:` sharing. Full variety spec in [MORPHOLOGY.md](MORPHOLOGY.md); see [ROADMAP.md](ROADMAP.md).

## Stack

TypeScript · Vite · React 18 + react-three-fiber (Three.js) + drei · Zustand · Vitest.
A **pure, headless evolution engine** (`src/engine/`) drives a thin R3F viewer. See
[DESIGN.md](DESIGN.md) for the full rationale.

## Run

```bash
npm install      # once
npm run dev      # dev server → http://localhost:5180
npm test         # engine unit + determinism + fuzz tests
npm run typecheck
npm run build    # tsc + vite production build
```

Open **http://localhost:5180**: an alien rotates on the left; click an offspring on the right to make it
the next parent; the family tree along the bottom lets you revisit/branch from any ancestor.
Copy the `CAM1:` string to share a creature, or paste one and hit Load to regrow it.

## Layout

```
src/engine/   # pure, dependency-free: rng, genome, random, grow, mutate, selection, lineage, share
src/viewer/   # R3F + UI: capsule mesh, turntable, breeder gallery, lineage tree, share bar
src/ui/       # React + Zustand store (lineage tree + current + litter, localStorage)
tests/engine/ # determinism + bounds + 2000-genome fuzz + CAM1 round-trip
```

## Docs

- [DESIGN.md](DESIGN.md) — vision, the genome/growth core, architecture, milestones.
- [MORPHOLOGY.md](MORPHOLOGY.md) — the creature-variety system (genome v2: morphotypes →
  traits → parts → covering); drives Phase 3.
- [ROADMAP.md](ROADMAP.md) — milestone checklist with Test steps.
- [PROGRESS.md](PROGRESS.md) — build log.
- [docs/adr/](docs/adr/) — architecture decision records.

## License

[MIT](LICENSE).
