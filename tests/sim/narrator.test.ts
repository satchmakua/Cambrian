import { describe, it, expect } from 'vitest';
import { sentence, speakable } from '../../src/world/narrator';

describe('narrator', () => {
  it('spells Greek letters for the voice', () => {
    expect(speakable('rodent η2')).toBe('rodent eta 2');
  });
  it('makes a sentence, with an opening fixed per key', () => {
    const a = sentence('The canid α', 'stalks a rodent β', 3);
    expect(a).toBe(sentence('The canid α', 'stalks a rodent β', 3));
    expect(a.endsWith('stalks a rodent beta.')).toBe(true);
    expect(a.charAt(0)).toBe(a.charAt(0).toUpperCase());
  });
});
