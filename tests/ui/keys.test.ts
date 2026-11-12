import { describe, it, expect } from 'vitest';
import { typingIn } from '../../src/ui/keys';
import { failureWords, fetching, isLoadFailure } from '../../src/ui/ScreenBoundary';

describe('Esc opens the game menu from anywhere but a place text is typed', () => {
  const el = (tagName: string, type?: string, isContentEditable = false) => ({ tagName, type, isContentEditable });

  it('sliders, tick boxes and buttons keep the focus after a click — Esc still opens the menu', () => {
    expect(typingIn(el('INPUT', 'range'))).toBe(false); // the breeder's dials
    expect(typingIn(el('INPUT', 'checkbox'))).toBe(false); // the Studio's skeleton / grid
    expect(typingIn(el('INPUT', 'radio'))).toBe(false);
    expect(typingIn(el('INPUT', 'file'))).toBe(false);
    expect(typingIn(el('BUTTON'))).toBe(false);
    expect(typingIn(el('SELECT'))).toBe(false);
    expect(typingIn(el('CANVAS'))).toBe(false);
    expect(typingIn(null)).toBe(false);
    expect(typingIn({})).toBe(false);
  });

  it('a field being typed in keeps its Esc', () => {
    expect(typingIn(el('INPUT', 'text'))).toBe(true);
    expect(typingIn(el('INPUT', 'number'))).toBe(true); // the "gens" boxes
    expect(typingIn(el('INPUT', ''))).toBe(true); // (no type is a text field)
    expect(typingIn(el('INPUT'))).toBe(true);
    expect(typingIn(el('input', 'TEXT'))).toBe(true);
    expect(typingIn(el('TEXTAREA'))).toBe(true); // the share string
    expect(typingIn(el('DIV', undefined, true))).toBe(true);
  });
});

describe('a screen that fails', () => {
  it('tells a failed fetch of a screen’s code from a fault in it', () => {
    const fetchFail = new TypeError('Failed to fetch dynamically imported module: https://x/assets/WorldView-abc.js');
    expect(isLoadFailure(fetchFail)).toBe(true);
    expect(isLoadFailure(new TypeError('Importing a module script failed.'))).toBe(true); // Safari's words
    expect(isLoadFailure(new TypeError('error loading dynamically imported module'))).toBe(true); // Firefox's
    expect(isLoadFailure(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(failureWords(fetchFail).title).toMatch(/could not be loaded/);
    expect(failureWords(fetchFail).advice).toMatch(/Reload/);
    const fault = failureWords(new Error('boom'));
    expect(fault.title).toMatch(/went wrong/);
    expect(fault.advice).toMatch(/game is kept/);
    expect(fault.detail).toBe('boom');
    expect(failureWords('plain words').detail).toBe('plain words');
  });

  it('a fetch that fails once is tried again; one that keeps failing fails', async () => {
    let calls = 0;
    const flaky = fetching(async () => {
      calls++;
      if (calls === 1) throw new Error('blip');
      return 'screen';
    }, 1);
    expect(await flaky()).toBe('screen');
    expect(calls).toBe(2);
    const dead = fetching(async () => {
      throw new Error('gone');
    }, 1);
    await expect(dead()).rejects.toThrow('gone');
    // …and a fetch that works is not made twice
    let once = 0;
    await fetching(async () => ++once, 1)();
    expect(once).toBe(1);
  });
});
