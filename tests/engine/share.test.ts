import { describe, it, expect } from 'vitest';
import { encodeGenome, decodeGenome, SHARE_PREFIX } from '../../src/engine/share';
import { randomGenome } from '../../src/engine/random';
import { mutate } from '../../src/engine/mutate';
import { defaultGenome } from '../../src/engine/genome';
import { grow } from '../../src/engine/grow';

describe('genome string (CAM1)', () => {
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
    expect(() => decodeGenome('hello world')).toThrow(/CAM1/);
    expect(() => decodeGenome('CAM1:not-valid-base64!!')).toThrow(/Corrupt|bad/i);
    expect(() => decodeGenome(SHARE_PREFIX + btoa('{"not":"a genome"}'))).toThrow();
  });

  it('rejects an unsupported version', () => {
    const bad = SHARE_PREFIX + btoa(JSON.stringify({ ...defaultGenome(), version: 99 }));
    expect(() => decodeGenome(bad)).toThrow(/version/i);
  });

  it('tolerates surrounding whitespace', () => {
    const g = randomGenome(123);
    expect(decodeGenome(`  ${encodeGenome(g)}\n`)).toEqual(g);
  });
});
