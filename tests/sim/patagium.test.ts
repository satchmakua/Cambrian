import { describe, it, expect } from 'vitest';
import { genomeOfMorphotype } from '../../src/engine/random';
import { grow } from '../../src/engine/grow';
import { mutate } from '../../src/engine/mutate';
import { WEB_MAX, type Genome, type SegmentGene } from '../../src/engine/genome';
import { decodeGenome, encodeGenome } from '../../src/engine/share';
import { patagiumArea, traitsOf } from '../../src/sim/traits';
import { webPanels } from '../../src/viewer/bodyField';

const rodent = (seed = 11) => genomeOfMorphotype(seed, 'rodent');
function webbed(g: Genome, web: number): Genome {
  const out = structuredClone(g) as Genome;
  for (let s: SegmentGene | undefined = out.body; s; s = s.child) for (const a of s.appendages) if (a.kind === 'leg') a.web = web;
  return out;
}

describe("a glider's patagium", () => {
  it('skin between fore and hind legs carries a glide, never powered flight', () => {
    const plain = traitsOf(grow(rodent()));
    expect(patagiumArea(grow(rodent()))).toBe(0);
    expect(plain.glides).toBe(false);
    let glider = false;
    for (const w of [0.2, 0.35, 0.5, WEB_MAX]) {
      const p = grow(webbed(rodent(), w));
      const t = traitsOf(p);
      expect(patagiumArea(p)).toBeGreaterThan(0);
      expect(t.flies).toBe(false); // a sail, not a wing
      if (t.glides) glider = true;
    }
    expect(glider, 'a wide enough web glides').toBe(true);
    // more web, more lift
    expect(traitsOf(grow(webbed(rodent(), WEB_MAX))).lift).toBeGreaterThan(traitsOf(grow(webbed(rodent(), 0.2))).lift);
    // …and a sail between the legs hobbles the stride on the ground
    expect(traitsOf(grow(webbed(rodent(), WEB_MAX))).speed).toBeLessThan(plain.speed * 0.9);
  });

  it('is drawn as a panel of skin down each flank, never across the chest', () => {
    const p = grow(webbed(rodent(), 0.5));
    const panels = webPanels(p, () => true);
    expect(panels.length).toBe(2); // fore-to-hind, left and right
    expect(Math.sign(panels[0].c[0])).toBe(-Math.sign(panels[1].c[0]));
    expect(webPanels(grow(rodent()), () => true)).toHaveLength(0);
  });

  it('grows by mutation a little at a time from none, and is carried in a creature string', () => {
    let g = rodent(), steps = 0;
    for (let i = 0; i < 400 && patagiumArea(grow(g)) === 0; i++, steps++) g = mutate(g, 1000 + i, i);
    expect(steps).toBeLessThan(400);
    const legs: number[] = [];
    for (let s: SegmentGene | undefined = g.body; s; s = s.child) for (const a of s.appendages) if (a.kind === 'leg' && a.web) legs.push(a.web);
    expect(legs.length).toBeGreaterThan(0);
    expect(Math.max(...legs)).toBeLessThanOrEqual(WEB_MAX);
    expect(decodeGenome(encodeGenome(g))).toEqual(g);
  });
});
