/**
 * The World's skins: which one a creature wears at a distance, and that what has been built is kept
 * (and found ready) rather than built again.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { prebuildSkin, shellKey, skinKey } from '../../src/viewer/CreatureMesh';
import { getGeometry, hasGeometry, releaseGeometry, retainGeometry } from '../../src/viewer/geometryCache';
import { PRESETS, qualityOf } from '../../src/ui/settings';
import { FAR_SKIN_K, LOD_FULL, LOD_LITE, lodAt } from '../../src/world/lod';

afterEach(() => vi.useRealTimers());

describe('level of detail by distance', () => {
  it('full detail up close, simplified features further off, a silhouette in the distant skin beyond', () => {
    expect(lodAt(5, 1, null)).toEqual({ detail: 'full', distant: false });
    expect(lodAt(LOD_FULL + 1, 1, null)).toEqual({ detail: 'lite', distant: false });
    expect(lodAt(LOD_LITE + 1, 1, null)).toEqual({ detail: 'none', distant: true });
  });

  it('a level is held a little past its edge, so an actor at an edge does not flicker — or order skins', () => {
    const lite = lodAt(LOD_LITE - 1, 1, null);
    expect(lodAt(LOD_LITE * 1.1, 1, lite)).toEqual(lite); // just past: still as it was
    expect(lodAt(LOD_LITE * 1.2, 1, lite)).toEqual({ detail: 'none', distant: true });
    const far = lodAt(LOD_LITE * 1.2, 1, null);
    expect(lodAt(LOD_LITE * 1.1, 1, far)).toEqual(far); // coming back: it changes at the edge itself
    expect(lodAt(LOD_LITE - 1, 1, far)).toEqual({ detail: 'lite', distant: false });
    const full = lodAt(LOD_FULL - 1, 1, null);
    expect(lodAt(LOD_FULL * 1.1, 1, full).detail).toBe('full');
    expect(lodAt(LOD_FULL * 1.2, 1, full).detail).toBe('lite');
  });

  it('a lower creature-detail option pulls the features in, but not the coarse skin: that keeps its distance', () => {
    for (const preset of ['low', 'medium'] as const) {
      const k = qualityOf(PRESETS[preset]).lod;
      expect(k).toBeLessThan(FAR_SKIN_K);
      const edge = LOD_LITE * k; // where the features drop to a silhouette on this setting
      expect(lodAt(edge + 1, k, null)).toEqual({ detail: 'none', distant: false }); // …still in the plain skin
      // (with the bands at 55% a cat 34 bu off — 250 px long on a 1080p screen — wore limbs two-thirds thicker)
      expect(lodAt(LOD_LITE * FAR_SKIN_K - 1, k, null).distant).toBe(false);
      expect(lodAt(LOD_LITE * FAR_SKIN_K + 1, k, null).distant).toBe(true);
    }
    // at full detail the two edges are one (nothing changes there)
    const k = qualityOf(PRESETS.high).lod;
    expect(k).toBe(1);
    for (const d of [10, 30, 61, 63, 100]) expect(lodAt(d, k, null).distant).toBe(lodAt(d, k, null).detail === 'none');
  });
});

describe('a skin built once is kept', () => {
  const KEY = skinKey(true, 'far', false);

  it('a surface nobody uses is swept after a moment; one that is held is not, however long', () => {
    vi.useFakeTimers();
    const p = grow(genomeOfMorphotype(11, 'rodent'));
    const build = vi.fn(() => new THREE.BufferGeometry());
    getGeometry(p, 'test:a', build);
    expect(hasGeometry(p, 'test:a')).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(hasGeometry(p, 'test:a')).toBe(false); // never retained: gone

    getGeometry(p, 'test:a', build);
    expect(retainGeometry(p, 'test:a')).toBe(true); // the mesh wearing it
    expect(retainGeometry(p, 'test:a')).toBe(true); // the actor keeping it
    releaseGeometry(p, 'test:a'); // the mesh swaps to another skin
    vi.advanceTimersByTime(60_000);
    expect(hasGeometry(p, 'test:a')).toBe(true); // still there for the next crossing
    getGeometry(p, 'test:a', build);
    expect(build).toHaveBeenCalledTimes(2); // (not built a third time)
    releaseGeometry(p, 'test:a'); // the creature is gone
    vi.advanceTimersByTime(2000);
    expect(hasGeometry(p, 'test:a')).toBe(false);
  });

  it('retaining what is not built says so (a keeper must not release what it never held)', () => {
    const p = grow(genomeOfMorphotype(12, 'rodent'));
    expect(retainGeometry(p, 'test:none')).toBe(false);
    expect(() => releaseGeometry(p, 'test:none')).not.toThrow();
  });

  it('a release can ask for longer: a fine skin outlives the camera moving off, and is reclaimed if it comes back', () => {
    vi.useFakeTimers();
    const p = grow(genomeOfMorphotype(13, 'rodent'));
    getGeometry(p, 'test:fine', () => new THREE.BufferGeometry());
    retainGeometry(p, 'test:fine');
    releaseGeometry(p, 'test:fine', 20_000);
    vi.advanceTimersByTime(15_000);
    expect(hasGeometry(p, 'test:fine')).toBe(true);
    expect(retainGeometry(p, 'test:fine')).toBe(true); // back within the grace: the sweep is called off
    vi.advanceTimersByTime(60_000);
    expect(hasGeometry(p, 'test:fine')).toBe(true);
    releaseGeometry(p, 'test:fine', 20_000);
    vi.advanceTimersByTime(21_000);
    expect(hasGeometry(p, 'test:fine')).toBe(false);
  });

  it('building ahead leaves nothing for the render: the surface, its skin weights, and a shelled body’s shell', () => {
    const turtle = grow(genomeOfMorphotype(5, 'chelonian'));
    expect(turtle.nodes.some((n) => n.terminal === 'carapace')).toBe(true);
    prebuildSkin(turtle, 'hybrid', 'far', false, true);
    expect(hasGeometry(turtle, KEY)).toBe(true);
    expect(hasGeometry(turtle, shellKey('far'))).toBe(true);
    const skin = getGeometry(turtle, KEY, () => {
      throw new Error('the skin should have been built ahead');
    });
    expect(skin.getAttribute('skinIndex')).toBeTruthy();
    expect(skin.getAttribute('skinWeight')).toBeTruthy();
    const shell = getGeometry(turtle, shellKey('far'), () => {
      throw new Error('the shell should have been built ahead');
    });
    expect(shell.getAttribute('position').count).toBeGreaterThan(0);
    // a body with no shell gets none
    const mouse = grow(genomeOfMorphotype(5, 'rodent'));
    prebuildSkin(mouse, 'hybrid', 'far', false, true);
    expect(hasGeometry(mouse, KEY)).toBe(true);
    expect(hasGeometry(mouse, shellKey('far'))).toBe(false);
  });
});
