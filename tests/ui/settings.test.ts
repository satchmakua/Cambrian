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

  it('shell fur is a matter of creature detail: none at low, the full dozen above it', () => {
    expect(qualityOf(PRESETS.low).furShells).toBe(0);
    expect(qualityOf(PRESETS.medium).furShells).toBe(12);
    expect(qualityOf(PRESETS.high).furShells).toBe(12);
    // (the detail option alone decides it, whatever the rest are)
    expect(qualityOf({ ...PRESETS.high, creatureDetail: 'low' }).furShells).toBe(0);
    expect(qualityOf({ ...PRESETS.low, creatureDetail: 'medium' }).furShells).toBe(12);
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
    expect(useSettings.getState().graphics).toEqual({ preset: 'low', ...PRESETS.low, auto: false });
    expect(useSettings.getState().quality).toEqual(qualityOf(PRESETS.low));
    S.setGraphics({ shadows: true });
    expect(useSettings.getState().graphics.preset).toBe('custom');
    expect(useSettings.getState().quality.shadows).toBe(true);
    S.setAudio({ volume: 0.25 });
    S.setGameplay({ spin: false });
    expect(useSettings.getState().audio.volume).toBe(0.25);
    expect(useSettings.getState().gameplay.spin).toBe(false);
    S.resetDefaults();
    const { graphics, audio, gameplay, notice } = useSettings.getState();
    expect({ graphics, audio, gameplay, notice }).toEqual(DEFAULT_SETTINGS);
  });

  it('the new fields default: the game may adjust the graphics, and has nothing to say yet', () => {
    expect(DEFAULT_SETTINGS.graphics.auto).toBe(true);
    expect(DEFAULT_SETTINGS.notice).toEqual({ lowered: null, seen: false });
    expect(sanitize({}).graphics.auto).toBe(true);
    expect(sanitize({}).notice).toEqual({ lowered: null, seen: false });
    // malformed: the defaults
    expect(sanitize({ graphics: { auto: 'yes' }, notice: { lowered: 'because', seen: 1 } })).toEqual(DEFAULT_SETTINGS);
    expect(sanitize({ notice: 'slow' }).notice).toEqual({ lowered: null, seen: false });
    // well-formed: kept, through storage and back
    const s = sanitize({ graphics: { ...PRESETS.low, auto: true }, notice: { lowered: 'slow', seen: true } });
    expect(s.graphics).toEqual({ preset: 'low', ...PRESETS.low, auto: true });
    expect(s.notice).toEqual({ lowered: 'slow', seen: true });
    expect(sanitize(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(sanitize({ graphics: { ...PRESETS.high, auto: false } }).graphics.auto).toBe(false);
  });

  it('options kept before these fields existed still load — and a choice made then is left alone', () => {
    // (what an older version wrote: no `auto`, no `notice`)
    const untouched = sanitize({ graphics: { preset: 'high', ...PRESETS.high }, audio: { sound: true, volume: 0.5, narration: false }, gameplay: { autosaveMinutes: 5, moods: true, hints: false, spin: true } });
    expect(untouched.graphics).toEqual({ preset: 'high', ...PRESETS.high, auto: true });
    expect(untouched.audio.volume).toBe(0.5);
    expect(untouched.gameplay.hints).toBe(false);
    expect(untouched.notice).toEqual({ lowered: null, seen: false });
    // a level or an option the player had set by hand: not the game's to change
    expect(sanitize({ graphics: { preset: 'medium', ...PRESETS.medium } }).graphics.auto).toBe(false);
    expect(sanitize({ graphics: { ...PRESETS.high, shadows: false } }).graphics.auto).toBe(false);
  });

  it('the game lowers the graphics itself once: to Low, saying why — unless told not to, or already there', () => {
    const S = useSettings.getState();
    S.resetDefaults();
    expect(S.autoLower('software')).toBe(true);
    expect(useSettings.getState().graphics).toEqual({ preset: 'low', ...PRESETS.low, auto: true });
    expect(useSettings.getState().quality).toEqual(qualityOf(PRESETS.low));
    expect(useSettings.getState().notice).toEqual({ lowered: 'software', seen: false });
    // already low: nothing changes, and a notice that was read is not raised again
    S.dismissNotice();
    expect(useSettings.getState().notice).toEqual({ lowered: 'software', seen: true });
    expect(S.autoLower('slow')).toBe(false);
    expect(useSettings.getState().notice).toEqual({ lowered: 'software', seen: true });
    // switched off: the graphics are left where they are
    S.resetDefaults();
    S.setAuto(false);
    expect(useSettings.getState().graphics).toEqual({ preset: 'high', ...PRESETS.high, auto: false });
    expect(S.autoLower('slow')).toBe(false);
    expect(useSettings.getState().graphics.preset).toBe('high');
    expect(useSettings.getState().notice.lowered).toBe(null);
    // switched back on, it may again
    S.setAuto(true);
    expect(S.autoLower('slow')).toBe(true);
    expect(useSettings.getState().notice).toEqual({ lowered: 'slow', seen: false });
    S.resetDefaults();
  });

  it("a player's own choice — a level, or one option — ends the game's adjusting", () => {
    const S = useSettings.getState();
    S.resetDefaults();
    S.autoLower('slow');
    expect(useSettings.getState().notice.seen).toBe(false);
    S.setPreset('high');
    expect(useSettings.getState().graphics).toEqual({ preset: 'high', ...PRESETS.high, auto: false });
    // (what the game had set is no longer so: its notice is not shown after)
    expect(useSettings.getState().notice).toEqual({ lowered: 'slow', seen: true });
    expect(S.autoLower('slow')).toBe(false);
    expect(useSettings.getState().graphics.preset).toBe('high');
    S.resetDefaults();
    expect(useSettings.getState().graphics.auto).toBe(true);
    S.setGraphics({ shadows: false });
    expect(useSettings.getState().graphics.auto).toBe(false);
    expect(S.autoLower('software')).toBe(false);
    expect(useSettings.getState().graphics.creatureDetail).toBe('high');
    // (sound and game options are no such choice)
    S.resetDefaults();
    S.setAudio({ volume: 0.3 });
    S.setGameplay({ hints: false });
    expect(useSettings.getState().graphics.auto).toBe(true);
    S.resetDefaults();
    expect(useSettings.getState()).toMatchObject(DEFAULT_SETTINGS);
  });
});
