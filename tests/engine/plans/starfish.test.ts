import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { eyeVariant, mouthVariant } from '../../../src/viewer/partStyles';
import { buildFieldPrims, CHAIN_CUTS } from '../../../src/viewer/bodyField';

const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);
const star = (seed: number) => {
  const g = genomeOfMorphotype(seed, 'starfish');
  return { g, p: grow(g) };
};
/** the disc and its arms: each arm a chain from a root on the disc out to its tip */
function arms(p: Phenotype) {
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  const disc = p.nodes[0];
  const roots = p.nodes.filter((n, i) => n.part?.kind === 'spine' && parent.get(i) === 0);
  const tips = p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'spine');
  return { disc, roots, tips };
}

describe('starfish', () => {
  it('has five arms, evenly spaced round its disc and laid flat on the ground', () => {
    // (one in three had four, at right angles: a throwing star, a ray)
    for (const seed of SEEDS) {
      const { g, p } = star(seed);
      expect(g.radialCount, `#${seed}`).toBe(5);
      const { disc, roots, tips } = arms(p);
      expect(roots.length, `#${seed} arms`).toBe(5);
      expect(tips.length, `#${seed} tips`).toBe(5);
      const az = roots.map((n) => Math.atan2(n.pos[2] - disc.pos[2], n.pos[0] - disc.pos[0])).sort((a, b) => a - b);
      az.forEach((a, i) => {
        const gap = (i + 1 < az.length ? az[i + 1] : az[0] + 2 * Math.PI) - a;
        expect(gap, `#${seed} spacing`).toBeCloseTo((2 * Math.PI) / 5, 6);
      });
      // flat: each tip below the top of the disc (its tips may lift a little, as a sea star's do), and
      // well out from it
      for (const t of tips) {
        expect(t.pos[1], `#${seed} flat`).toBeLessThan(disc.pos[1] + 0.3 * disc.radius * (disc.scale?.[1] ?? 1));
        expect(Math.hypot(t.pos[0] - disc.pos[0], t.pos[2] - disc.pos[2]), `#${seed} reach`).toBeGreaterThan(2.2 * disc.radius);
      }
    }
  });

  it('its arms are plump and end in round tips, not needle points', () => {
    for (const seed of SEEDS) {
      const { roots, tips } = arms(star(seed).p);
      const root = Math.max(...roots.map((n) => n.radius));
      for (const t of tips) expect(t.radius / root, `#${seed}`).toBeGreaterThan(0.4);
    }
  });

  it('has no face on top: its small eyes look down from under the rim, its mouth is underneath', () => {
    // (a crown of eyes on the disc, with a maw — and a feeding tube or a ring of teeth — among them:
    // a face pasted on a star, the thing it was read as)
    for (const seed of SEEDS) {
      const { g, p } = star(seed);
      const { disc } = arms(p);
      const under = disc.pos[1] - disc.radius * (disc.scale?.[1] ?? 1) * 0.8;
      const eyes = p.nodes.filter((n) => n.terminal === 'eye');
      const mouths = p.nodes.filter((n) => n.terminal === 'mouth');
      expect(eyes.length, `#${seed}`).toBeGreaterThan(0);
      expect(mouths.length, `#${seed}`).toBeGreaterThan(0);
      for (const n of [...eyes, ...mouths]) expect(n.pos[1], `#${seed} underneath`).toBeLessThan(under);
      for (const e of eyes) expect(e.radius / disc.radius, `#${seed} small`).toBeLessThan(0.2);
      for (const a of g.body.appendages) {
        if (a.terminal === 'eye') expect(eyeVariant(a.style), `#${seed}`).toBe('beady');
        if (a.terminal === 'mouth') expect(mouthVariant(a.style), `#${seed}`).toBe('maw');
      }
    }
  });

  it('wears nothing else: no second ring of spines, no stalks', () => {
    for (const seed of SEEDS) {
      const { g } = star(seed);
      const kinds = g.body.appendages.map((a) => a.kind).sort();
      expect(kinds, `#${seed}`).toEqual(['eyestalk', 'maw', 'spine']);
      const eye = g.body.appendages.find((a) => a.kind === 'eyestalk')!;
      expect(eye.segments, `#${seed} no stalk`).toBe(1);
    }
  });

  it('is a plated sea star in reds and oranges, its markings in its own hue', () => {
    let warm = 0;
    for (const seed of SEEDS) {
      const { g } = star(seed);
      expect(g.covering.type).toBe('plates');
      expect(['plain', 'mottle', 'spots']).toContain(g.covering.pattern);
      // (a rare vivid morph aside: 14% of the uncanny plans' founders)
      if (g.palette.hueA <= 0.1 || g.palette.hueA >= 0.95) warm++;
    }
    expect(warm).toBeGreaterThanOrEqual(12);
  });
  it('each arm is one smooth curve from the disc to its tip — not a string of sausages joined at its links', () => {
    // (a straight cone from each joint to the next met its neighbour at an angle where the girth changed:
    // a crease round the arm at every joint)
    for (let seed = 1; seed <= 6; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'starfish'));
      const f = buildFieldPrims(p, 'hybrid');
      // a link between two of an arm's own nodes is cut into CHAIN_CUTS cones along a spline
      const armLinks = p.edges.filter(([a, b]) => p.nodes[a].part?.kind === 'spine' && p.nodes[b].part?.kind === 'spine').length;
      expect(armLinks, `#${seed}`).toBeGreaterThan(0);
      let cones = 0;
      for (let m = 0; m < f.nc; m++) if (p.nodes[f.ia[m]].part?.kind === 'spine' && p.nodes[f.ib[m]].part?.kind === 'spine') cones++;
      expect(cones, `#${seed}`).toBe(armLinks * CHAIN_CUTS);
    }
  });
});
