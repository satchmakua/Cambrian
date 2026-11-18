import { describe, it, expect } from 'vitest';
import { PACE, judgePace } from '../../src/viewer/FramePace';

describe('frame pace', () => {
  it('a stage loops once a timed frame is cheap, and not before one is timed', () => {
    expect(judgePace([])).toBe('probing');
    expect(judgePace([4])).toBe('live');
    expect(judgePace([PACE.slowMs])).toBe('live');
  });

  it('one slow frame is not a verdict — something else may have been in the way: it is timed again', () => {
    expect(judgePace([PACE.slowMs + 1])).toBe('probing');
    expect(judgePace([900, 12])).toBe('live');
  });

  it('slow every time, the stage stays still', () => {
    const slow = Array.from({ length: PACE.probes }, () => 3500);
    expect(judgePace(slow)).toBe('still');
    expect(judgePace(slow.slice(1))).toBe('probing');
  });
});
