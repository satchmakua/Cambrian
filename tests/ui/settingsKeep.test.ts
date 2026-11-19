/**
 * What the settings write to the browser, and what they do not: the game's own lowering of the
 * graphics is kept (with its notice), safe mode is not. (A storage in memory stands in for the
 * browser's; node has none.)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const kept = vi.hoisted(() => {
  const kept = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (kept.has(k) ? kept.get(k)! : null),
    setItem: (k: string, v: string) => void kept.set(k, String(v)),
    removeItem: (k: string) => void kept.delete(k),
  };
  return kept;
});

import { DEFAULT_SETTINGS, PRESETS, SAFE_GRAPHICS, SETTINGS_KEY, createSettingsStore, isSafeUrl, qualityOf, sanitize } from '../../src/ui/settings';

const stored = () => (kept.has(SETTINGS_KEY) ? sanitize(JSON.parse(kept.get(SETTINGS_KEY)!)) : null);

beforeEach(() => kept.clear());

describe('settings kept in the browser', () => {
  it('the game lowering the graphics is kept, with the notice — and comes back on the next visit', () => {
    const first = createSettingsStore();
    expect(first.getState().autoLower('software')).toBe(true);
    expect(stored()?.graphics).toEqual({ preset: 'low', ...PRESETS.low, auto: true });
    expect(stored()?.notice).toEqual({ lowered: 'software', seen: false });
    first.getState().dismissNotice();
    const next = createSettingsStore();
    expect(next.getState().graphics.preset).toBe('low');
    expect(next.getState().notice).toEqual({ lowered: 'software', seen: true });
    // already low: nothing to do, and the notice is not raised again
    expect(next.getState().autoLower('software')).toBe(false);
    expect(next.getState().notice.seen).toBe(true);
  });

  it('safe mode is asked for by the address alone', () => {
    expect(isSafeUrl('?safe=1')).toBe(true);
    expect(isSafeUrl('?menu=1&safe=1')).toBe(true);
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('?safe=0')).toBe(false);
    expect(isSafeUrl('?unsafe=1')).toBe(false);
  });

  it('safe mode draws the least, whatever is kept — and leaves what is kept as it found it', () => {
    const mine = { ...DEFAULT_SETTINGS, graphics: { preset: 'medium' as const, ...PRESETS.medium, auto: false }, audio: { sound: true, volume: 0.4, narration: false } };
    kept.set(SETTINGS_KEY, JSON.stringify(mine));
    const before = kept.get(SETTINGS_KEY);
    const safe = createSettingsStore(true);
    expect(safe.getState().quality).toEqual(qualityOf(SAFE_GRAPHICS));
    expect(safe.getState().quality.furShells).toBe(0);
    expect(safe.getState().quality.shadows).toBe(false);
    expect(safe.getState().quality.dprMax).toBe(0.75);
    // (the options that are not graphics are the player's own, as kept)
    expect(safe.getState().audio).toEqual(mine.audio);
    // nothing done in safe mode is written: not a change of option, not the game's own adjusting
    expect(safe.getState().autoLower('slow')).toBe(false);
    safe.getState().setPreset('high');
    safe.getState().setGraphics({ shadows: true });
    safe.getState().setAudio({ volume: 1 });
    safe.getState().dismissNotice();
    safe.getState().resetDefaults();
    expect(kept.get(SETTINGS_KEY)).toBe(before);
    // (within the visit the options still answer)
    safe.getState().setPreset('medium');
    expect(safe.getState().quality).toEqual(qualityOf(PRESETS.medium));
    // and the next visit, without the flag, is as it was
    const next = createSettingsStore();
    expect(next.getState().graphics).toEqual(mine.graphics);
  });

  it('safe mode with nothing kept writes nothing either', () => {
    const safe = createSettingsStore(true);
    safe.getState().setPreset('low');
    expect(kept.has(SETTINGS_KEY)).toBe(false);
    expect(createSettingsStore().getState().graphics).toEqual(DEFAULT_SETTINGS.graphics);
  });
});
