import { describe, it, expect } from 'vitest';
import { pinPrograms } from '../../src/viewer/programs';

describe('kept shader programs', () => {
  it('pins each program once, so disposing its last material no longer frees it', () => {
    // (three frees a program when --usedTimes reaches 0: swapping a breeder litter disposed the
    // materials before their replacements rendered, and every pick relinked the same shaders)
    const programs = [{ usedTimes: 1 }, { usedTimes: 3 }];
    const gl = { info: { programs } } as unknown as Parameters<typeof pinPrograms>[0];
    expect(pinPrograms(gl)).toBe(2);
    expect(programs.map((p) => p.usedTimes)).toEqual([2, 4]);
    expect(pinPrograms(gl)).toBe(0); // idempotent: a program is pinned once
    programs.push({ usedTimes: 1 });
    expect(pinPrograms(gl)).toBe(1);
    // its only material disposed: one release, and the program is still held
    programs[2].usedTimes--;
    expect(programs[2].usedTimes).toBeGreaterThan(0);
  });

  it('copes with a renderer that has compiled nothing yet', () => {
    const gl = { info: { programs: null } } as unknown as Parameters<typeof pinPrograms>[0];
    expect(pinPrograms(gl)).toBe(0);
  });
});
