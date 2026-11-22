/**
 * A valley's fingerprint: seeded valleys run headless for a while, and a hash of each one's save at the
 * marks along the way — so a change meant to alter nothing (a refactor) can be checked to alter nothing,
 * to the last bit. Pure simulation — no browser.
 *
 *   npx vite-node scripts/valley-fingerprint.ts -- --seeds 1,2,3 --days 24 --every 6
 *
 * Run it before the change and after it: the lines must be the same.
 */
import { createHash } from 'node:crypto';
import { createWorld, release, stepWorld, STEP, DAY_LENGTH } from '../src/sim/world';
import { genomeOfMorphotype } from '../src/engine/random';
import { starterCast } from '../src/sim/cast';
import { saveWorld } from '../src/sim/persist';

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const seeds = arg('seeds', '1,2,3').split(',').map(Number);
const days = Number(arg('days', '24'));
const every = Number(arg('every', String(Math.max(1, Math.round(days / 4)))));

for (const seed of seeds) {
  // (populated as a new game's standard valley is, and as the valley report does)
  const w = createWorld(seed);
  starterCast('standard').forEach(([kind, n], i) => release(w, genomeOfMorphotype((w.seed * 97 + i * 13) >>> 0, kind), n, undefined, kind));
  const marks: string[] = [];
  for (let d = 1; d <= days; d++) {
    for (let i = 0; i < DAY_LENGTH / STEP; i++) stepWorld(w);
    if (d % every === 0 || d === days) {
      const hash = createHash('sha256').update(saveWorld(w)).digest('hex').slice(0, 16);
      marks.push(`day ${d}: ${hash} (${w.creatures.filter((c) => c.alive).length} alive)`);
    }
  }
  console.log(`seed ${seed} · ${marks.join(' · ')}`);
}
