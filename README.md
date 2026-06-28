# Cambrian

> Start with a randomly generated alien. Subject it to "evolution time." Watch its body
> mutate across generations into wildly different forms — steer a blob toward a rodent, a
> rodent toward a shark, a shark toward a tiger. Purely for fun and curiosity.

A 3D artificial-evolution toy: creatures are *grown* from a generative genome, mutated, and
selected — by you (Biomorphs-style breeder) or by directed pressures — so you can walk a
lineage from a scurrying blob to a finned giant to a striped quadruped.

**Status:** 🟢 M4 (directed pressures) — steer evolution by hand (breeder grid) or by target
(size / limbs / body length / aquatic↔terrestrial / predator↔prey, fast-forwarded K
generations), branch from any ancestor, and share creatures as `CAM1:` strings (session
persists). See [ROADMAP.md](ROADMAP.md) for what's next.

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
- [ROADMAP.md](ROADMAP.md) — milestone checklist with Test steps.
- [PROGRESS.md](PROGRESS.md) — build log.
- [CLAUDE.md](CLAUDE.md) — standing instructions for the AI build loop.
- [docs/adr/](docs/adr/) — architecture decision records.

## License

[MIT](LICENSE).
