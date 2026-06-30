import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { defaultGenome, type Genome } from '../../src/engine/genome';

// A minimal creature: a small trunk with one part aimed by (azimuth, elevation).
function aimed(azimuth: number, elevation: number): Genome {
  return {
    version: 2,
    seed: 1,
    symmetry: 'none',
    radialCount: 4,
    covering: { type: 'skin', pattern: 'plain', patternScale: 3, patternContrast: 0, sheen: 0.2 },
    palette: { hueA: 0, hueB: 0, sat: 0.5, light: 0.5 },
    body: {
      size: [0.4, 0.4, 0.4],
      repeat: 2,
      taper: 1,
      curve: [0, 0],
      appendages: [
        {
          kind: 'tail',
          style: 0.5,
          attachT: 0.5,
          attachAzimuth: azimuth,
          attachElevation: elevation,
          roll: 0,
          segments: 3,
          length: 0.5,
          thickness: 0.1,
          taper: 0.9,
          curl: [0, 0],
          terminal: 'none',
          pair: false,
        },
      ],
    },
  };
}

const UP = Math.PI / 2;
const DOWN = (3 * Math.PI) / 2;

// the tail's tip (grow's bauplan pass now also adds a guaranteed face, so find the part by kind)
function tailTip(g: ReturnType<typeof grow>) {
  const tail = g.nodes.filter((n) => n.part?.kind === 'tail');
  return tail[tail.length - 1].pos;
}

describe('spherical part aim (v2 unlock)', () => {
  it('elevation aims a part backward / forward along the body axis', () => {
    // the trunk runs along +Z from the origin
    const back = grow(aimed(DOWN, -1.3)); // elevation -1.3 ⇒ mostly -Z (behind)
    const fwd = grow(aimed(DOWN, 1.3)); // elevation +1.3 ⇒ mostly +Z (ahead)
    const spineZ = (g: ReturnType<typeof grow>) => g.nodes.filter((n) => n.kind === 'spine').map((n) => n.pos[2]);

    expect(tailTip(back)[2]).toBeLessThan(Math.min(...spineZ(back))); // behind the whole trunk
    expect(tailTip(fwd)[2]).toBeGreaterThan(Math.max(...spineZ(fwd))); // ahead of the whole trunk
  });

  it('azimuth aims a part up / down across the body', () => {
    const up = grow(aimed(UP, 0));
    const down = grow(aimed(DOWN, 0));
    const spineY = (g: ReturnType<typeof grow>) => g.nodes.filter((n) => n.kind === 'spine').map((n) => n.pos[1]);

    expect(tailTip(up)[1]).toBeGreaterThan(Math.max(...spineY(up))); // above
    expect(tailTip(down)[1]).toBeLessThan(Math.min(...spineY(down))); // below
  });

  it('the default creature has a tail behind the body (it grows backward)', () => {
    const p = grow(defaultGenome());
    const minZ = Math.min(...p.nodes.map((n) => n.pos[2]));
    const maxZ = Math.max(...p.nodes.map((n) => n.pos[2]));
    // the trunk + head run forward; the tail pushes the bounding box behind the trunk start
    expect(minZ).toBeLessThan(0); // something extends behind the origin (the tail)
    expect(maxZ).toBeGreaterThan(0);
  });
});
