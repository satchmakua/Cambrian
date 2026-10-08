import { describe, it, expect } from 'vitest';
import { mulberry32, mix32, range, unitHash, mulberry32State } from '../../src/engine/rng';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  it('stays within [0, 1)', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range() maps into [min, max)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = range(r, -3, 5);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(5);
    }
  });
});

describe('mix32', () => {
  it('is deterministic and order-sensitive', () => {
    expect(mix32(1, 2, 3)).toBe(mix32(1, 2, 3));
    expect(mix32(1, 2)).not.toBe(mix32(2, 1));
  });

  it('returns an unsigned 32-bit integer', () => {
    const h = mix32(0xdeadbeef, 42, 7);
    expect(h).toBe(h >>> 0);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe('unitHash', () => {
  it('spreads consecutive seeds evenly over [0, 1) (it is read directly as a fraction)', () => {
    for (const salt of [0x1e5, 0xb111, 7]) {
      const bins = new Array(10).fill(0);
      for (let seed = 1; seed <= 4000; seed++) {
        const u = unitHash(seed, salt);
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThan(1);
        bins[Math.floor(u * 10)]++;
      }
      for (const b of bins) expect(b).toBeGreaterThan(320); // ≈ 400 each
    }
  });
});

describe('mulberry32State', () => {
  it('is mulberry32, with a state that can be read and restored mid-stream', () => {
    const a = mulberry32(99), b = mulberry32State(99);
    for (let i = 0; i < 50; i++) expect(b()).toBe(a());
    const saved = b.state.a;
    const next = [b(), b(), b()];
    b.state.a = saved;
    expect([b(), b(), b()]).toEqual(next);
  });
});
