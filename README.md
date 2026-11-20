# Cambrian

> Start with a randomly generated alien. Subject it to "evolution time." Watch its body
> mutate across generations into wildly different forms — steer a blob toward a rodent, a
> rodent toward a shark, a shark toward a tiger. Purely for fun and curiosity.

A 3D artificial-evolution toy: creatures are *grown* from a generative genome, mutated, and
selected — by you (Biomorphs-style breeder) or by directed pressures — so you can walk a
lineage from a scurrying blob to a finned giant to a striped quadruped.

**Status:** 🟢 Parts 1–2 complete (the breeder, the creature grammar, fidelity) — and **Part 3 is
live: the creatures have a world**, and evolve in it. Next is the planet (a sphere you can turn, with
climate by latitude), in a branch of its own. It opens on a **main menu** — Continue, New game (name,
first creature, the valley's seed, its cast, its size, or a scenario), Load game, Settings, Controls,
Quit — and `Esc` opens the in-game menu (save, load, settings, exit) over any of its three screens:

- **Breed** — the Biomorphs loop: nine divergent mutant offspring, click one to make it the parent;
  directed pressures, the Menagerie (MAP-Elites), lineage tree, `CAM2:` sharing, glTF export,
  physics-evolved walkers.
- **Studio** — a naturalist's bench: the creature from lateral / anterior / dorsal plates (true
  orthographic proportions, scale bars) and a face close-up, an x-ray skeleton, an inspector, a
  motion preview (walk / run / eat / sleep), and a **Bestiary** of every morphotype side by side.
- **World** — release creatures into a living ecosystem: a lake, meadows that yellow where herds
  graze, fruit-bearing woods, day and night, seasons, weather and dry years. Every creature's diet,
  speed, senses, weapons, armour, and how well it swims, walks and flies, are read off its anatomy;
  it eats, sleeps, flees, hunts, mates and dies. Mates mix their genes; a species is a population,
  and splits when its members fall into two groups that stay apart. Bodies that are badly made are
  stillborn, or cost more to keep. Selection is real: a coat matched to its ground hides, a showy one
  draws mates and hunters, a small warm-blooded body pays more for a hard winter, and a grazer or a
  swimmer breeds only where its food can carry one more. Water, land and air are by degree: fins can become legs, legs
  flippers; wings grow from flaps, a web of skin between the legs is a glider's; big fliers soar and
  roost in the trees. A census (with who is aloft), species cards (trends, deaths, a film of the
  body over the generations), a tree of life and a journal narrate it. Adopt a line to be told when it
  splits or dies out; take a creature home, breed it, and release it back as its own branch; clone
  one, or boost a species. Levers on the climate (a colder or warmer age, drier or wetter, an ice age,
  an ash winter, a meteor, a plague), an optional god mode (heal, carry, smite, cull, make breed, a
  bloom, a glut, rain or drought), and three scenarios with goals. The valley is stepped in a worker;
  far animals are drawn as markers, so a valley can hold 165, 330 or 600. `F` frames the valley,
  `Shift+1…4` saves a view (`1…4` returns), `P` is a photo mode.

Creatures are smooth organic bodies (an implicit round-cone field, welded and skinned) with
anti-aliased procedural coverings — fur, scales, feathers, chitin, slime, plates, crystal. Full variety spec in
[MORPHOLOGY.md](MORPHOLOGY.md); milestones in [ROADMAP.md](ROADMAP.md).

**Saves and settings.** The game in progress is kept in the browser as you play (Continue returns to
it; the valley itself is kept in IndexedDB, as a fifty-year valley runs to a few megabytes). Named
saves — the lineage and the valley together — live in IndexedDB too, and can be exported to a `.json`
file and imported back. A saved valley reloads and carries on exactly as it would have. Settings cover graphics (a Low / Medium / High level,
or resolution, shadows, grass, weather and creature detail one by one), sound and volume, and the
game (autosave, mood icons, hints, the turntable).

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

Open **http://localhost:5180**: the main menu. Start or continue a game and an alien rotates on the
left; click an offspring on the right to make it the next parent; the family tree along the bottom lets
you revisit/branch from any ancestor. Copy the `CAM2:` string to share a creature, or paste one and
hit Load to regrow it. The **Studio** and **World** tabs next to the title open the inspection bench
and the ecosystem; `Esc` (or ☰) opens the menu.

A valley run on for years with no browser, and what evolution did in it (species that last, bodies
that hold together, the lines' depth in generations): `npx vite-node scripts/valley-report.ts -- --seeds
11,12 --years 50` (`--scenario shore` sets a crowded lake beside a rich marsh; `--save-check` saves the
last year's valley, loads it, and checks that both run on alike).

Headless captures (dev server running): `node scripts/shoot.mjs out/ "seed=3&morph=felid&bare=1&spin=0"`
— see `src/main.tsx` and the Studio/World sources for the dev URL params (`?studio=1`, `?bestiary=1`,
`?world=1&warm=120&follow=felid`, …; `?world=1&crowd=600` fills a valley of 600, to see what it costs
to draw, `&worker=0` steps it on the page instead of in its worker, `&coarse=0` builds each body's wanted
skin alone). A dev page opened with parameters skips the menu; `?menu=1`
shows it (`&screen=new|load|settings|controls`), `?pause=1` the in-game one; `?juvenile=1` puts a
youngster on the Studio bench, and `?failstage=1` makes the stage fail to draw, to see the failure
card and its way back to the menu.

If the page is slow to answer, open it with `?safe=1` (there is a link at the foot of the main menu):
safe mode draws the lowest graphics and no 3D backdrop for that visit, and keeps nothing it changes.
The menu also goes without its backdrop on its own where the browser draws without a graphics card,
or where the backdrop's first frames are measured slow
(`?menu=1&forcestage=1`, dev only, mounts it there anyway — to watch the stage measure itself and be taken down).

Each game screen opens behind a loading screen, and is let in once its shaders are built, its creatures
drawn and its frames measured; where those frames are slow it lowers the graphics first (if the game may
adjust them) and measures again. The first visit takes longest, while the browser builds the creature
shaders: on Windows, Chrome builds them through Direct3D, seconds each. On a laptop with two graphics
chips, check which one the browser draws with: the loading screen names a computer's built-in graphics
when it finds them slow. Capture pages (`?seed=`, `?world=1`, `?bare=1` and the like) go without it.

## Layout

```
src/engine/   # pure, dependency-free: rng, genome, random, grow, mutate, selection, lineage, share
src/sim/      # pure, deterministic ecosystem: terrain, traits-from-anatomy, the world step (world.ts
              # over model / species / population / behaviour / motion / fields), selection, levers,
              # scenarios, god mode, saves, and the mirror the view draws from (replica.ts)
src/viewer/   # R3F: creature mesh + smooth skin + rig, materials, wings, Studio, breeder UI
src/world/    # the World screen: landscape, actors and markers, sky/day-night, HUD; the simulation
              # worker and its host (simWorker.ts, simHost.ts)
src/ui/       # React + Zustand store (lineage tree + current + litter + view, localStorage),
              # the menus (ui/menu), saved games (saves.ts, game.ts) and settings (settings.ts)
tests/        # engine / sim / viewer: determinism, fuzz, anatomy, rig, ecosystem behaviour
```

## Docs

- [DESIGN.md](DESIGN.md) — vision, the genome/growth core, architecture, milestones.
- [MORPHOLOGY.md](MORPHOLOGY.md) — the creature-variety system (genome v2: morphotypes →
  traits → parts → covering); drives Phase 3.
- [ROADMAP.md](ROADMAP.md) — milestone checklist with Test steps.
- [docs/adr/](docs/adr/) — architecture decision records.

## License

[MIT](LICENSE).
