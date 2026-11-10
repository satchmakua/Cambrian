import { describe, it, expect } from 'vitest';
import { scissorRect } from '../../src/viewer/scissor';

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });

describe('scissored sub-views of a shared canvas', () => {
  // the breeder's gallery canvas sits in the right-hand rail of a 1400-wide window
  const canvas = rect(1076, 60, 308, 364);

  it('a thumbnail inside a canvas that is NOT at the window origin is drawn, at its place in the canvas', () => {
    // (drei's View compared the thumb's window position with the canvas's size: 1088 > 308, offscreen)
    const thumb = rect(1088, 140, 96, 96);
    expect(scissorRect(thumb, canvas)).toEqual({ left: 12, bottom: 424 - 236, width: 96, height: 96 });
  });

  it("measures from the canvas bottom, as three's setViewport/setScissor do", () => {
    const top = scissorRect(rect(1076, 60, 100, 100), canvas)!;
    const bottomRow = scissorRect(rect(1076, 324, 100, 100), canvas)!;
    expect(top.bottom).toBe(264);
    expect(bottomRow.bottom).toBe(0);
  });

  it('skips a thumbnail wholly outside the canvas, or with no size', () => {
    expect(scissorRect(rect(1076, 430, 96, 96), canvas)).toBeNull(); // scrolled below
    expect(scissorRect(rect(900, 140, 96, 96), canvas)).toBeNull(); // left of it
    expect(scissorRect(rect(1088, 140, 0, 96), canvas)).toBeNull();
  });

  it('keeps a thumbnail that is only partly inside (the scissor clips the rest)', () => {
    expect(scissorRect(rect(1088, 380, 96, 96), canvas)).not.toBeNull();
  });
});
