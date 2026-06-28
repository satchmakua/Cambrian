# ROADMAP — Cambrian

The milestone checklist. Standing instruction: **"continue"** → build the next
unchecked milestone.

**Rules of the road:**
- Each milestone is an **independently runnable** slice — something the human can
  actually test, not an internal-only refactor.
- Every milestone ends with explicit **Test** steps: what to do and what should
  happen. These are the acceptance criteria.
- Build **top-down**: a thin end-to-end slice first, then deepen.
- Check a box **only after the human confirms its Test passes**, then add a
  `PROGRESS.md` entry.

---

## Phase 0 — Walking skeleton

- [x] **M0 — Skeleton & it runs.** Vite + R3F app boots; a fixed-seed genome →
  `grow()` → capsule-union mesh on a turntable with an orbit camera. Engine↔viewer
  wired end to end, one creature on screen. Determinism + 4000-genome fuzz tests pass.
  **Test:** `npm install` then `npm run dev` → open http://localhost:5173, a little
  alien rotates on a turntable; "Re-roll jitter" re-grows it. `npm test` → green;
  `npm run build` → succeeds. _(built 2026-06-27, awaiting human confirmation)_

## Phase 1 — A complete, fun toy

- [ ] **M1 — Random creatures + RNG discipline.** A bounds-driven `randomGenome(seed)`
  in the engine; "New random creature" button shows its seed. Full schema exercised
  (segments, appendages, bilateral symmetry). Determinism + fuzz tests stay green.
  **Test:** click "New random creature" repeatedly → visibly different, always-valid
  creatures appear; the same seed always regrows the same one.

- [ ] **M2 — Mutate + breeder loop.** The four mutation operators (point / structural /
  duplication / macro) + a 3×3 offspring gallery; click a child → it parents the next
  generation. **This is the core toy.**
  **Test:** from a creature, pick offspring across ~10 generations and steer the body
  toward a target (e.g. "longer, more limbs"); the lineage visibly trends that way.

- [ ] **M3 — Lineage + sharing.** Family-tree view, snapshots, `CAM1:` genome-string
  import/export, regrow-from-string, localStorage session.
  **Test:** copy a creature's string, reload the page, paste it → the exact same
  creature returns; the lineage tree shows the path and lets you branch from an ancestor.

## Phase 2 — Direction & polish

- [ ] **M4 — Directed pressures.** `scorePhenotype` + a pressure vector + auto-select +
  `runGenerations` headless fast-forward, then show the result and the path taken.
  **Test:** set "bigger + aquatic", run 50 generations → the result is larger and more
  fin/streamlined than the start; running again with the same seed reproduces it.

- [ ] **M5 — Better bodies & motion.** Radial symmetry, terminals (fins/claws/feet/eyes)
  rendered as distinct tips, procedural undulation/walk animation, palette/materials.
  **Test:** evolve a radial creature and a many-legged one; both animate plausibly
  (undulating spine, limbs in phase) without visual blow-ups.

## Phase 3 — Stretch

- [ ] **M6 — (stretch) Physics fitness.** `@dimforge/rapier3d-deterministic-compat`,
  lazy-loaded; oscillating muscle drive; distance-traveled fitness; select the movers.
  **Test:** run physics fitness for N generations → later creatures travel measurably
  farther than earlier ones; identical seed → identical run.

- [ ] **M7 — (stretch) Metaball skin.** `MarchingCubes` smooth surface over the node
  field, gated behind the robust capsule path; optional `.glb` export.
  **Test:** toggle smooth skin → one organic surface replaces the capsule kit without
  breaking on weird topologies; export opens in another glTF viewer.

---

**North star:** in ten clicks you can visibly steer a blob toward a shark — and share the
result as a short string that regrows it exactly on someone else's machine.
