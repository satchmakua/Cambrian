# Cambrian

> Start with a randomly generated alien. Subject it to "evolution time." Watch its body
> mutate across generations into wildly different forms — steer a blob toward a rodent, a
> rodent toward a shark, a shark toward a tiger. Purely for fun and curiosity.

A 3D artificial-evolution toy: creatures are *grown* from a generative genome, mutated, and
selected — by you (Biomorphs-style breeder) or by directed pressures — so you can walk a
lineage from a scurrying blob to a finned giant to a striped quadruped.

**Status:** 🟢 Parts 1–2 complete (the breeder, the creature grammar, fidelity) — and **Part 3 is
live: the creatures have a world.** Three screens:

- **Breed** — the Biomorphs loop: nine divergent mutant offspring, click one to make it the parent;
  directed pressures, the Menagerie (MAP-Elites), lineage tree, `CAM2:` sharing, glTF export,
  physics-evolved walkers.
- **Studio** — a naturalist's bench: the creature from lateral / anterior / dorsal plates (true
  orthographic proportions, scale bars) and a face close-up, an x-ray skeleton, an inspector, a
  motion preview (walk / run / eat / sleep), and a **Bestiary** of every morphotype side by side.
- **World** — release creatures into a living ecosystem: a lake, meadows that yellow where herds
  graze, fruit-bearing woods, day and night. Every creature's diet, speed, senses, weapons and armour
  are read off its anatomy; it eats, sleeps, flees, hunts, breeds (offspring mutate — new species
  branch off on screen) and dies. Bodies walk with a procedural skinned gait. A census, a creature
  card with follow-cam, and a field journal narrate it; take any wild creature home to breed.

Creatures are smooth organic bodies (an implicit round-cone field, welded and skinned) with
anti-aliased procedural coverings — fur, scales, feathers, chitin, slime, plates. Full variety spec in
[MORPHOLOGY.md](MORPHOLOGY.md); milestones in [ROADMAP.md](ROADMAP.md).

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
Copy the `CAM2:` string to share a creature, or paste one and hit Load to regrow it. The **Studio** and
**World** tabs next to the title open the inspection bench and the ecosystem.

Headless captures (dev server running): `node scripts/shoot.mjs out/ "seed=3&morph=felid&bare=1&spin=0"`
— see `src/main.tsx` and the Studio/World sources for the dev URL params (`?studio=1`, `?bestiary=1`,
`?world=1&warm=120&follow=felid`, …).

## Layout

```
src/engine/   # pure, dependency-free: rng, genome, random, grow, mutate, selection, lineage, share
src/sim/      # pure, deterministic ecosystem: terrain, traits-from-anatomy, the world step
src/viewer/   # R3F: creature mesh + smooth skin + rig, materials, wings, Studio, breeder UI
src/world/    # the World screen: landscape, actors, sky/day-night, HUD
src/ui/       # React + Zustand store (lineage tree + current + litter + view, localStorage)
tests/        # engine / sim / viewer: determinism, fuzz, anatomy, rig, ecosystem behaviour
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
