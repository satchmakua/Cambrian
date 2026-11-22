import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The surface seam (src/sim/surface.ts): the simulation reads no coordinate of its own. Every place,
 * distance, heading and question about the ground goes through its world's surface, which is what lets a
 * planet stand where the valley does. Only the surfaces, and the valley's own terrain and trees that its
 * surface wraps, may touch a place's coordinates or ask the terrain directly.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SIM_DIR = join(HERE, '..', '..', 'src', 'sim');

/** the files that may: the port itself, the two surfaces (the valley's, with the terrain and trees it wraps,
 *  and the planet's), and the sphere's geometry (traits.ts reads the coordinates of a body's own parts, in
 *  its own frame: anatomy, not places) */
const OWN = new Set(['surface.ts', 'valley.ts', 'terrain.ts', 'stands.ts', 'planetSurface.ts', 'sphere.ts', 'traits.ts']);

// (a property read, not a spread's `...x`; a call of the terrain's own functions, not of a surface's methods
// that share their names)
const FORBIDDEN: [RegExp, string][] = [
  [/(?<!\.\.)\.(x|z|tx|tz|heading)\b/, "a place's coordinates or a heading's angle"],
  [/(?<![.\w])(heightAt|exactHeightAt|biomeAt|isWater|inBounds|normalAt|moistureAt|riverDist|standsOf|nearestTree|makeTerrain)\(/, 'the terrain asked directly'],
  [/\.(lakeX|lakeZ|lakeR)\b|terrain\.size/, "the valley's own shape"],
  [/Math\.atan2\(/, 'an angle worked out by hand'],
];

describe('the surface seam', () => {
  it('keeps the simulation off the coordinates: only the surfaces read them', () => {
    const offenders: string[] = [];
    for (const name of readdirSync(SIM_DIR)) {
      if (!name.endsWith('.ts') || OWN.has(name)) continue;
      // (comments may speak of what the code may not do)
      const code = readFileSync(join(SIM_DIR, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      code.split('\n').forEach((line, i) => {
        for (const [re, what] of FORBIDDEN) if (re.test(line)) offenders.push(`${name}:${i + 1} ${what}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
