/**
 * A valley run on for years, headless, and what evolution did in it: the long-run check the ROADMAP's
 * evolution milestones are measured by (species that last, bodies that hold together, lines that
 * change). Pure simulation — no browser.
 *
 *   npx vite-node scripts/valley-report.ts -- --seeds 1,2,3 --years 10
 *
 * Prints, for each seed, a row per few years and a summary line; then a summary across seeds.
 */
import { createWorld, release, stepWorld, bodyOf, liveCount, STEP, DAY_LENGTH, YEAR_DAYS, type World, type Species } from '../src/sim/world';
import { genomeOfMorphotype } from '../src/engine/random';
import { coherence } from '../src/engine/morphospace';
import { starterCast } from '../src/sim/cast';
import { heightAt, WATER_LEVEL } from '../src/sim/terrain';
import { loadWorld, saveWorld } from '../src/sim/persist';
import { formable } from '../src/engine/grow';
import type { SegmentGene } from '../src/engine/genome';

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const seeds = arg('seeds', '1,2,3').split(',').map(Number);
const years = Number(arg('years', '10'));
const every = Number(arg('every', String(Math.max(1, Math.round(years / 5)))));
// 'shore': a crowded, poor lake beside a rich marsh and bank — the opportunity a fish line would go ashore for
const scenario = arg('scenario', 'standard');
// --save-check: at the end, save the valley, load it back, run both on a day, and compare them byte for byte
const saveCheck = process.argv.includes('--save-check');

const YEAR = DAY_LENGTH * YEAR_DAYS;

/** The founder species a species descends from (its line's first name). */
function rootOf(w: World, sp: Species): Species {
  let s = sp;
  for (let i = 0; i < 64 && s.parent !== null; i++) s = w.species.find((x) => x.id === s.parent) ?? s;
  return s;
}

const median = (a: number[]) => {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '-');

interface Row {
  seed: number;
  year: number;
  alive: number;
  kinds: number;
  derivedAlive: number;
  renames: number;
  splits: number;
  ofOne: number;
  lasting: number;
  cohMed: number;
  cohMin: number;
  bloatMed: number;
  /** nine bodies in ten are within this of their founder's node count */
  bloat90: number;
  bloatMax: number;
  maxGen: Record<string, number>;
  habitats: string;
  fliers: number;
  gliders: number;
  stillborn: number;
  fitMed: number;
  /** the fish line: how many alive, how many on legs, their mean paired-fin form, their share ashore */
  fish: string;
}

function measure(w: World, seed: number): Row {
  const live = w.creatures.filter((c) => c.alive);
  const cohs: number[] = [];
  const bloat: number[] = [];
  const maxGen: Record<string, number> = {};
  const hab: Record<string, number> = {};
  let fliers = 0, gliders = 0;
  for (const c of live) {
    const sp = w.species.find((s) => s.id === c.species)!;
    const root = rootOf(w, sp);
    const body = bodyOf(c.genome);
    cohs.push(coherence(body.phenotype).score);
    bloat.push(body.phenotype.nodes.length / bodyOf(root.founder).phenotype.nodes.length);
    maxGen[root.kind] = Math.max(maxGen[root.kind] ?? 0, c.generation);
    hab[c.traits.habitat] = (hab[c.traits.habitat] ?? 0) + 1;
    if (c.traits.flies) fliers++;
    else if (c.traits.glides) gliders++;
  }
  const sorted = [...bloat].sort((a, b) => a - b);
  const derived = w.species.filter((s) => s.parent !== null);
  return {
    seed,
    year: Math.floor(w.time / YEAR),
    alive: live.length,
    kinds: w.species.filter((s) => s.alive > 0).length,
    derivedAlive: derived.filter((s) => s.alive > 0).length,
    renames: w.species.filter((s) => s.evolvedInto !== null).length,
    splits: derived.filter((s) => !w.species.some((p) => p.id === s.parent && p.evolvedInto === s.id)).length,
    ofOne: derived.filter((s) => s.born <= 1).length,
    lasting: derived.filter((s) => s.born >= 5 && ((s.extinctAt ?? w.time) - s.firstSeen >= 2 * YEAR || s.alive > 0)).length,
    cohMed: median(cohs),
    cohMin: cohs.length ? Math.min(...cohs) : NaN,
    bloatMed: median(bloat),
    bloat90: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] : NaN,
    bloatMax: bloat.length ? Math.max(...bloat) : NaN,
    maxGen,
    habitats: Object.entries(hab).map(([k, v]) => `${k[0]}${v}`).join(' '),
    fliers,
    gliders,
    stillborn: w.tally.stillborn,
    fitMed: median(live.map((c) => c.fit)),
    fish: fishLine(w),
  };
}

function fishLine(w: World): string {
  const line = w.creatures.filter((c) => c.alive && rootOf(w, w.species.find((s) => s.id === c.species)!).kind === 'fish');
  if (line.length === 0) return 'none';
  let legged = 0, ashore = 0, form = 0, fins = 0;
  for (const c of line) {
    if (c.traits.legs >= 2) legged++;
    if (heightAt(w.terrain, c.x, c.z) > WATER_LEVEL + 0.15) ashore++;
    for (let s: SegmentGene | undefined = c.genome.body; s; s = s.child) for (const a of s.appendages) if (formable(a) && a.kind === 'fin') { form += a.form ?? 0; fins++; }
  }
  return `n${line.length} legs${legged} form${fins ? (form / fins).toFixed(2) : '-'} ashore${Math.round((ashore / line.length) * 100)}%`;
}

const header = 'seed year alive kinds derived renames splits ofOne lasting  coh(med/min)  bloat(med/p90/max)  habitats  fly/glide  fit  stillborn  deepest generations';
console.log(header);
const finals: Row[] = [];
const t0 = Date.now();
for (const seed of seeds) {
  const w = createWorld(seed);
  starterCast('standard').forEach(([kind, n], i) => release(w, genomeOfMorphotype((w.seed * 97 + i * 13) >>> 0, kind), n, undefined, kind));
  if (scenario === 'shore') {
    const L = w.terrain;
    for (let k = 0; k < w.grass.length; k++) {
      w.algaeCap[k] *= 0.5;
      w.algae[k] = Math.min(w.algae[k], w.algaeCap[k]);
      const x = -L.size / 2 + ((k % w.gridN) + 0.5) * 4, z = -L.size / 2 + (Math.floor(k / w.gridN) + 0.5) * 4;
      const d = Math.hypot(x - L.lakeX, z - L.lakeZ);
      // (a marsh: reeds out into the shallows as well as the bank's meadow — each step a fish's fins take
      // toward a crawl reaches a little more of it)
      if (d < L.lakeR + 12 && heightAt(L, x, z) > WATER_LEVEL - 0.3) {
        w.grassCap[k] = 0.9;
        w.grass[k] = 0.9;
      }
    }
    const fish = w.species.find((s) => s.kind === 'fish')!;
    release(w, fish.founder, 14, { x: L.lakeX, z: L.lakeZ });
  }
  const steps = Math.round(YEAR / STEP);
  for (let y = 1; y <= years; y++) {
    for (let i = 0; i < steps; i++) stepWorld(w);
    if (y % every === 0 || y === years) {
      const r = measure(w, seed);
      const gens = Object.entries(r.maxGen).map(([k, v]) => `${k}:${v}`).join(' ');
      console.log(
        `${String(seed).padStart(4)} ${String(r.year).padStart(4)} ${String(r.alive).padStart(5)} ${String(r.kinds).padStart(5)} ${String(r.derivedAlive).padStart(7)} ${String(r.renames).padStart(7)} ${String(r.splits).padStart(6)} ${String(r.ofOne).padStart(5)} ${String(r.lasting).padStart(7)}  ${f2(r.cohMed)}/${f2(r.cohMin)}     ${f2(r.bloatMed)}/${f2(r.bloat90)}/${f2(r.bloatMax)}      ${r.habitats.padEnd(9)} ${`${r.fliers}/${r.gliders}`.padStart(9)}  ${f2(r.fitMed)} ${String(r.stillborn).padStart(9)}  fish[${r.fish}]  ${gens}`,
      );
      if (y === years) finals.push(r);
    }
    if (liveCount(w) === 0) break;
  }
  if (saveCheck) {
    const json = saveWorld(w);
    const b = loadWorld(json);
    const same0 = saveWorld(b) === json;
    for (let i = 0; i < DAY_LENGTH / STEP; i++) {
      stepWorld(w);
      stepWorld(b);
    }
    const same1 = saveWorld(b) === saveWorld(w);
    console.log(`save check, seed ${seed}: ${(json.length / 1024).toFixed(0)} KB; reloads as saved: ${same0}; a day on, the same: ${same1}`);
  }
}
const all = (f: (r: Row) => number) => finals.map(f);
console.log(`\n${finals.length} seeds × ${years} years in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log(`lasting new species per seed: ${all((r) => r.lasting).join(', ')}   species of one: ${all((r) => r.ofOne).join(', ')}`);
console.log(`median coherence of the living: ${all((r) => r.cohMed).map(f2).join(', ')}   worst: ${all((r) => r.cohMin).map(f2).join(', ')}`);
console.log(`median body-node growth vs founder: ${all((r) => r.bloatMed).map(f2).join(', ')}   nine in ten within: ${all((r) => r.bloat90).map(f2).join(', ')}   worst: ${all((r) => r.bloatMax).map(f2).join(', ')}`);
