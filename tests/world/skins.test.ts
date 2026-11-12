/**
 * The World's skins: which one a creature wears at a distance, and that what has been built is kept
 * (and found ready) rather than built again.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as THREE from 'three';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { builtShell, prebuildSkin, shellKey, skinKey } from '../../src/viewer/CreatureMesh';
import { bestBuilt, buildNext, buildSkins, plainSkin, requestSkin, SKIN_KEY, skinOrder } from '../../src/world/skinQueue';
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

describe('skins are built to order, off the render', () => {
  const fresh = (seed: number, id = 'rodent') => grow(genomeOfMorphotype(seed, id));
  // (the queues are the module's: nothing a failed test left waiting may answer the next one's order)
  beforeEach(() => {
    while (buildNext('far') || buildNext('low') || buildNext('high'));
  });

  it('a request is answered when the scheduler builds it — at once if it is built already — and a withdrawn one is never built', () => {
    const p = fresh(21);
    const ready = vi.fn();
    requestSkin(p, 'far', ready);
    expect(ready).not.toHaveBeenCalled();
    expect(hasGeometry(p, SKIN_KEY.far)).toBe(false); // (asking builds nothing)
    expect(buildNext('far')).toBe(true);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(hasGeometry(p, SKIN_KEY.far)).toBe(true);
    const again = vi.fn();
    requestSkin(p, 'far', again);
    expect(again).toHaveBeenCalledTimes(1);

    const q = fresh(22);
    const never = vi.fn();
    requestSkin(q, 'far', never)();
    expect(buildNext('far')).toBe(false);
    expect(never).not.toHaveBeenCalled();
    expect(hasGeometry(q, SKIN_KEY.far)).toBe(false);
  });

  it('a frame builds the distant and plain skins first, and a fine one only when there was nothing else', () => {
    const a = fresh(23), b = fresh(24);
    const fine = vi.fn(), far = vi.fn();
    requestSkin(a, 'high', fine);
    requestSkin(b, 'far', far);
    buildSkins();
    expect(far).toHaveBeenCalledTimes(1);
    expect(fine).not.toHaveBeenCalled(); // (a far skin was built this frame)
    buildSkins();
    expect(fine).toHaveBeenCalledTimes(1);
    // …and a frame's budget is spent on as many cheap skins as fit, but always at least one
    const c = fresh(25), d = fresh(26);
    const one = vi.fn(), two = vi.fn();
    requestSkin(c, 'far', one);
    requestSkin(d, 'far', two);
    let now = 0;
    buildSkins(6, () => (now += 4)); // (a clock on which the first build uses up the budget)
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).not.toHaveBeenCalled();
    buildSkins();
    expect(two).toHaveBeenCalledTimes(1);
  });

  it("a youngster's adult body is ordered at what the camera calls for NOW — not what it called for when the order was made", () => {
    // (the request was pinned to the fineness wanted at the moment of maturity: asked for fine while
    // the camera sat on the youngster, the fine skin was still built — a tenth of a second in one frame —
    // after the camera had left, and the grown animal then wore it, thirty thousand triangles, a field away)
    expect(plainSkin(false)).toBe('low');
    expect(plainSkin(true)).toBe('far');
    const p = fresh(27);
    const grown = vi.fn();
    const order = skinOrder(p, grown);
    order.ask('low');
    order.ask('low');
    order.ask('far'); // the camera has moved off: the plain skin is no longer wanted
    expect(buildNext('low')).toBe(false); // …so it is not built
    expect(hasGeometry(p, SKIN_KEY.low)).toBe(false);
    expect(buildNext('far')).toBe(true);
    expect(grown).toHaveBeenCalledTimes(1);
    order.ask('low'); // (answered: asking again does nothing)
    expect(buildNext('low')).toBe(false);
    expect(grown).toHaveBeenCalledTimes(1);
  });

  it('…it is answered as soon as the body has any skin at all, and a cancelled order is never answered', () => {
    const p = fresh(28);
    prebuildSkin(p, 'hybrid', 'high', false, true); // (a sibling of the same genome, under the camera)
    expect(bestBuilt(p, 'far')).toBe('high');
    const grown = vi.fn();
    skinOrder(p, grown).ask('far');
    expect(grown).toHaveBeenCalledTimes(1); // it can be mounted without building: no need to wait for 'far'
    expect(buildNext('far')).toBe(false);

    const q = fresh(29);
    const never = vi.fn();
    const order = skinOrder(q, never);
    order.ask('far');
    order.cancel(); // the animal died, or left
    expect(buildNext('far')).toBe(false);
    order.ask('low');
    expect(buildNext('low')).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });

  it("a body waiting for its first skin draws a shell only if one is built: the stand-in kit builds none", () => {
    // (the kit built a plain shell inside the render that mounted it — 7 ms, 27 at the worst — and where
    // the skin then arrived at the distant fineness that shell was thrown away, to be built again later)
    const turtle = fresh(31, 'chelonian');
    expect(turtle.nodes.some((n) => n.terminal === 'carapace')).toBe(true);
    expect(builtShell(turtle, 'low')).toBe(null);
    expect(hasGeometry(turtle, shellKey('low'))).toBe(false); // (asking built nothing)
    prebuildSkin(turtle, 'hybrid', 'far', false, true);
    expect(builtShell(turtle, 'far')).toBe('far');
    expect(builtShell(turtle, 'low')).toBe('far'); // the one that exists, whichever was asked for
    expect(hasGeometry(turtle, shellKey('low'))).toBe(false);
  });
});
