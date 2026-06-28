import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pillar 3 guard (DESIGN §4.2): the engine's ONLY randomness is the seeded
 * mulberry32. Non-deterministic globals (Math.random, Date.now, performance.now)
 * would silently break reproducibility, so they are banned under src/engine/.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = join(HERE, '..', '..', 'src', 'engine');
const BANNED = ['Math.random', 'Date.now', 'performance.now'];

function engineFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => join(e.parentPath ?? dir, e.name));
}

describe('engine determinism guard', () => {
  it('contains no non-deterministic globals under src/engine/', () => {
    const offenders: string[] = [];
    for (const file of engineFiles(ENGINE_DIR)) {
      // Strip comments first — documentation *mentioning* the ban is legitimate;
      // we only forbid the tokens appearing in actual code.
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      for (const banned of BANNED) {
        if (code.includes(banned)) offenders.push(`${file}: ${banned}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
