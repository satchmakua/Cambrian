import { describe, it, expect } from 'vitest';
import { typingIn } from '../../src/ui/keys';
import { failureWords, fetching, isLoadFailure, PartBoundary } from '../../src/ui/ScreenBoundary';

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

describe('a part of a screen that fails', () => {
  // (no DOM here: the boundary's own logic, driven the way React drives it)
  const boundary = (props: ConstructorParameters<typeof PartBoundary>[0]) => {
    const b = new PartBoundary(props);
    b.setState = ((s: { failed: boolean }) => void (b.state = { ...b.state, ...s })) as typeof b.setState;
    return b;
  };

  it('is left out — the rest of the screen is drawn — and is tried again for another creature', () => {
    // (the main menu's stage: the menu is where a player lands when a screen has failed, and when the
    // failure was the creature being bred the menu drew that same creature — and failed too, with no
    // way left to a new game or a saved one)
    const b = boundary({ children: 'the stage', resetKey: 'fox' });
    expect(b.render()).toBe('the stage');
    b.state = PartBoundary.getDerivedStateFromError();
    expect(b.render()).toBe(null); // nothing where the stage was; the menu around it stands
    b.componentDidUpdate({ resetKey: 'fox' }); // an update for the same creature: still failed
    expect(b.render()).toBe(null);
    // another creature (a founder being chosen, a game loaded): tried afresh
    const next = boundary({ children: 'the stage', resetKey: 'cat' });
    next.state = PartBoundary.getDerivedStateFromError();
    next.componentDidUpdate({ resetKey: 'fox' });
    expect(next.render()).toBe('the stage');
  });

  it('shows what it is given to show instead, if anything', () => {
    const b = boundary({ children: 'the stage', fallback: 'no picture', resetKey: 1 });
    b.state = PartBoundary.getDerivedStateFromError();
    expect(b.render()).toBe('no picture');
  });
});
