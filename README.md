# Cambrian

> Start with a randomly generated alien. Subject it to "evolution time." Watch its body
> mutate across generations into wildly different forms — steer a blob toward a rodent, a
> rodent toward a shark, a shark toward a tiger. Purely for fun and curiosity.

A 3D artificial-evolution toy: creatures are *grown* from a generative genome, mutated, and
selected — by you (Biomorphs-style breeder) or by directed pressures — so you can walk a
lineage from a scurrying blob to a finned giant to a striped quadruped.

**Status:** 🟢 M1 (random creatures) — generate endless coherent, always-valid critters
from a seed; each grows and renders on a turntable. See [ROADMAP.md](ROADMAP.md) for next.

## Stack

TypeScript · Vite · React 18 + react-three-fiber (Three.js) + drei · Zustand · Vitest.
A **pure, headless evolution engine** (`src/engine/`) drives a thin R3F viewer. See
[DESIGN.md](DESIGN.md) for the full rationale.

## Run

```bash
npm install      # once
npm run dev      # dev server → http://localhost:5173
npm test         # engine unit + determinism + fuzz tests
npm run typecheck
npm run build    # tsc + vite production build
```

Open the dev URL: an alien rotates on a turntable; "New random creature" grows a fresh one.

## Layout

```
src/engine/   # pure, dependency-free: rng, genome, random, grow (the heart)
src/viewer/   # R3F: phenotype → capsule-union mesh, turntable
src/ui/       # React + Zustand store
tests/engine/ # determinism + 4000-genome fuzz invariants
```

## Docs

- [DESIGN.md](DESIGN.md) — vision, the genome/growth core, architecture, milestones.
- [ROADMAP.md](ROADMAP.md) — milestone checklist with Test steps.
- [PROGRESS.md](PROGRESS.md) — build log.
- [CLAUDE.md](CLAUDE.md) — standing instructions for the AI build loop.
- [docs/adr/](docs/adr/) — architecture decision records.

## License

[MIT](LICENSE).
