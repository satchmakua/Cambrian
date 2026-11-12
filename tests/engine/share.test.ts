import { describe, it, expect } from 'vitest';
import { encodeGenome, decodeGenome, SHARE_PREFIX } from '../../src/engine/share';
import { randomGenome, genomeOfMorphotype, MORPHOTYPE_IDS } from '../../src/engine/random';
import { mutate } from '../../src/engine/mutate';
import { juvenileGenome } from '../../src/engine/juvenile';
import { breederLitter } from '../../src/engine/selection';
import { defaultGenome } from '../../src/engine/genome';
import { grow } from '../../src/engine/grow';

describe('genome string (CAM2)', () => {
  it('round-trips: decode(encode(g)) reproduces the exact creature', () => {
    for (let s = 0; s < 300; s++) {
      const g = s % 2 === 0 ? randomGenome(s) : mutate(randomGenome(s), s * 7, s % 9);
      const back = decodeGenome(encodeGenome(g));
      expect(back).toEqual(g);
      expect(grow(back)).toEqual(grow(g)); // same string ⇒ same creature
    }
  });

  it('is stable and prefixed', () => {
    const g = defaultGenome();
    expect(encodeGenome(g).startsWith(SHARE_PREFIX)).toBe(true);
    expect(encodeGenome(g)).toBe(encodeGenome(g)); // canonical ⇒ deterministic
  });

  it('rejects junk gracefully', () => {
    expect(() => decodeGenome('hello world')).toThrow(/CAM2/);
    expect(() => decodeGenome('CAM2:not-valid-base64!!')).toThrow(/Corrupt|bad/i);
    expect(() => decodeGenome(SHARE_PREFIX + btoa('{"not":"a genome"}'))).toThrow();
  });

  it('rejects an unsupported version', () => {
    const bad = SHARE_PREFIX + btoa(JSON.stringify({ ...defaultGenome(), version: 99 }));
    expect(() => decodeGenome(bad)).toThrow(/version/i);
  });

  it('every kind of creature the game makes comes back exactly (reading clamps nothing it wrote)', () => {
    for (const id of MORPHOTYPE_IDS) {
      for (let s = 0; s < 24; s++) {
        const g = genomeOfMorphotype(s * 31 + 5, id);
        expect(decodeGenome(encodeGenome(g))).toEqual(g);
        const young = juvenileGenome(g);
        expect(decodeGenome(encodeGenome(young))).toEqual(young);
        const kin = mutate(g, s + 1, 6);
        expect(decodeGenome(encodeGenome(kin))).toEqual(kin);
      }
    }
    for (let s = 0; s < 40; s++) for (const child of breederLitter(randomGenome(s), s * 13 + 1, 9)) expect(decodeGenome(encodeGenome(child))).toEqual(child);
  });

  it('a string that claims impossible numbers decodes to the nearest creature that can exist', () => {
    const g = randomGenome(7, 'radial');
    const wild = JSON.parse(JSON.stringify(g));
    wild.radialCount = 1e12;
    wild.body.repeat = -5;
    wild.body.taper = 1e300;
    const text = SHARE_PREFIX + btoa(JSON.stringify(wild));
    const t0 = Date.now();
    const back = decodeGenome(text);
    const p = grow(back);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(back.radialCount).toBe(12);
    expect(back.body.repeat).toBe(1);
    expect(p.nodes.every((n) => n.pos.every(Number.isFinite))).toBe(true);
  });

  it('tolerates surrounding whitespace', () => {
    const g = randomGenome(123);
    expect(decodeGenome(`  ${encodeGenome(g)}\n`)).toEqual(g);
  });
});
