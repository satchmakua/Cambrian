import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, PRESETS, dprOf, presetOf, qualityOf, sanitize, useSettings } from '../../src/ui/settings';

describe('settings', () => {
  it('whatever was stored comes back as valid options: missing fields default, numbers clamp to a choice', () => {
    expect(sanitize(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitize('nonsense')).toEqual(DEFAULT_SETTINGS);
    const s = sanitize({ graphics: { renderScale: 9, shadows: 'yes', vegetation: 0.6, creatureDetail: 'ultra' }, audio: { volume: -3, sound: true }, gameplay: { autosaveMinutes: 4 } });
    expect(s.graphics.renderScale).toBe(2); // clamped to the largest choice
    expect(s.graphics.shadows).toBe(DEFAULT_SETTINGS.graphics.shadows); // not a boolean: the default
    expect(s.graphics.vegetation).toBe(0.5); // the nearest choice
    expect(s.graphics.creatureDetail).toBe(DEFAULT_SETTINGS.graphics.creatureDetail);
    expect(s.audio.volume).toBe(0);
    expect(s.audio.sound).toBe(true);
    expect(s.gameplay.autosaveMinutes).toBe(5);
    // a round trip through storage changes nothing
    expect(sanitize(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('names the level a set of options matches — and "custom" once one is changed by hand', () => {
    for (const name of ['low', 'medium', 'high'] as const) expect(presetOf(PRESETS[name])).toBe(name);
    expect(presetOf({ ...PRESETS.high, shadows: false })).toBe('custom');
    // the stored preset name is never trusted over the options themselves
    expect(sanitize({ graphics: { preset: 'low', ...PRESETS.high } }).graphics.preset).toBe('high');
  });

  it('each level draws no more than the one above it, and high is the full game', () => {
    const [lo, mid, hi] = (['low', 'medium', 'high'] as const).map((n) => qualityOf(PRESETS[n]));
    for (const [a, b] of [[lo, mid], [mid, hi]] as const) {
      expect(a.dprMax).toBeLessThanOrEqual(b.dprMax);
      expect(a.grass).toBeLessThanOrEqual(b.grass);
      expect(a.flowers).toBeLessThanOrEqual(b.flowers);
      expect(a.precipitation).toBeLessThanOrEqual(b.precipitation);
      expect(a.stars).toBeLessThanOrEqual(b.stars);
      expect(a.lod).toBeLessThanOrEqual(b.lod);
      expect(a.shadowMap).toBeLessThanOrEqual(b.shadowMap);
    }
    expect(hi).toMatchObject({ dprMax: 2, shadows: true, shadowMap: 2048, grass: 17000, flowers: 900, precipitation: 9000, stars: 2500, lod: 1, fineSkins: true, heroSkin: 'high' });
    // low is a different order of work: a quarter of the grass, no shadow pass, no fine skins
    expect(lo.grass).toBeLessThanOrEqual(hi.grass / 4);
    expect(lo.shadows).toBe(false);
    expect(lo.shadowMap).toBe(0);
    expect(lo.contactShadow).toBe(0);
    expect(lo.fineSkins).toBe(false);
    expect(lo.heroSkin).toBe('low');
  });

  it("a canvas's pixel ratio follows the display up to the cap — and its own ceiling", () => {
    const q = qualityOf(PRESETS.high);
    expect(dprOf(q)).toEqual([1, 2]);
    expect(dprOf(q, 1.75)).toEqual([1, 1.75]);
    expect(dprOf(qualityOf(PRESETS.low))).toEqual([1, 1]);
    // under 1 it is a fixed, coarser buffer
    expect(dprOf(qualityOf({ ...PRESETS.low, renderScale: 0.75 }))).toBe(0.75);
  });

  it('the store: a preset sets every option; changing one by hand makes it custom; reset restores', () => {
    const S = useSettings.getState();
    S.setPreset('low');
    expect(useSettings.getState().graphics).toEqual({ preset: 'low', ...PRESETS.low });
    expect(useSettings.getState().quality).toEqual(qualityOf(PRESETS.low));
    S.setGraphics({ shadows: true });
    expect(useSettings.getState().graphics.preset).toBe('custom');
    expect(useSettings.getState().quality.shadows).toBe(true);
    S.setAudio({ volume: 0.25 });
    S.setGameplay({ spin: false });
    expect(useSettings.getState().audio.volume).toBe(0.25);
    expect(useSettings.getState().gameplay.spin).toBe(false);
    S.resetDefaults();
    const { graphics, audio, gameplay } = useSettings.getState();
    expect({ graphics, audio, gameplay }).toEqual(DEFAULT_SETTINGS);
  });
});
