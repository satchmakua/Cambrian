import { describe, it, expect } from 'vitest';
import { yearLook } from '../../src/world/seasonLook';
import { DAY_LENGTH, YEAR_DAYS } from '../../src/sim/world';

const at = (phase: number) => yearLook(phase * DAY_LENGTH * YEAR_DAYS);

describe('the look of the year', () => {
  it('spring is green: no snow and full leaf from its first morning', () => {
    for (const p of [0.0, 0.007, 0.05, 0.2, 0.3]) {
      expect(at(p).snow).toBe(0);
      expect(at(p).bare).toBe(0);
      expect(at(p).turn).toBe(0);
    }
  });
  it('autumn turns the leaves, winter strips them and lays snow, and it is gone by spring', () => {
    expect(at(0.66).turn).toBeGreaterThan(0.9);
    expect(at(0.87).bare).toBeGreaterThan(0.95);
    expect(at(0.87).snow).toBeGreaterThan(0.8);
    expect(at(0.999).snow).toBe(0);
  });
});
