import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildSmoothGeometry, SKIN_RES } from '../../src/viewer/smoothSkin';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', 'src');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => join(e.parentPath ?? dir, e.name));
}

describe('what a frame costs to draw', () => {
  it('no material is transmissive: one in view makes the renderer draw the whole scene twice', () => {
    // (the fish spawn's glassy material had `transmission: 0.6` — while any eggs were in view, which was
    // nearly always, every tree, tuft and creature was drawn a second time into a refraction buffer:
    // 1.65 M triangles and 301 draw calls a frame at the Low preset, 0.83 M and 201 without it)
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      if (/\btransmission\s*[:=]\s*(?!0\b)/.test(code)) offenders.push(file.slice(SRC.length + 1));
    }
    expect(offenders).toEqual([]);
  });

  it('the distant skin is well under half the plain one, and still the same animal', () => {
    expect(SKIN_RES.far).toBeLessThan(SKIN_RES.low);
    let far = 0;
    let low = 0;
    for (const kind of ['ungulate', 'canid', 'bird', 'fish', 'insectoid', 'rodent']) {
      const p = grow(genomeOfMorphotype(97, kind));
      const a = buildSmoothGeometry(p, true, [], 'far');
      const b = buildSmoothGeometry(p, true, [], 'low');
      const ta = a.getIndex()!.count / 3;
      const tb = b.getIndex()!.count / 3;
      far += ta;
      low += tb;
      expect(ta / tb, `${kind} triangles`).toBeLessThan(0.6);
      // the same body: its bounds agree to within a couple of the coarse grid's cells
      a.computeBoundingBox();
      b.computeBoundingBox();
      const size = b.boundingBox!.max.clone().sub(b.boundingBox!.min);
      const cell = Math.max(size.x, size.y, size.z) / SKIN_RES.far;
      expect(a.boundingBox!.min.distanceTo(b.boundingBox!.min), `${kind} min corner`).toBeLessThan(2.5 * cell);
      expect(a.boundingBox!.max.distanceTo(b.boundingBox!.max), `${kind} max corner`).toBeLessThan(2.5 * cell);
    }
    expect(far / low).toBeLessThan(0.5);
  });
});
