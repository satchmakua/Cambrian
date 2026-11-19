import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as THREE from 'three';
import { guardDraws, shadersSettled } from '../../src/viewer/programs';

const DONE = 0x91b1;
interface Prog {
  built: boolean;
}
interface Obj {
  name: string;
  parent: Obj | null;
  userData: Record<string, unknown>;
}

/** A renderer whose every draw first asks the driver about its program, as three's first use of one
 *  does — and counts each question asked of a program that is still building (the driver would wait). */
function fake(parallel = true) {
  const waited: string[] = [];
  const drawn: string[] = [];
  const ctx = {
    getExtension: (n: string) => (parallel && n === 'KHR_parallel_shader_compile' ? { COMPLETION_STATUS_KHR: DONE } : null),
    getProgramParameter(p: Prog, name: number) {
      if (name === DONE) return p.built;
      if (!p.built) waited.push('parameter');
      return true;
    },
    getProgramInfoLog(p: Prog) {
      if (!p.built) waited.push('log');
      return '';
    },
  };
  const gl = {
    getContext: () => ctx,
    info: { programs: [] },
    properties: { get: () => ({}) },
    compile: () => new Set(),
    renderBufferDirect(_c: unknown, _s: unknown, _g: unknown, material: { program: Prog; fail?: boolean }, object: Obj) {
      if (material.fail) throw new Error('a real error');
      ctx.getProgramInfoLog(material.program);
      ctx.getProgramParameter(material.program, 0x8b82);
      drawn.push(object.name);
    },
  };
  const draw = (object: Obj, program: Prog, fail = false) => gl.renderBufferDirect(null, null, null, { program, fail }, object);
  return { gl: gl as unknown as THREE.WebGLRenderer, waited, drawn, draw };
}
const obj = (name: string, parent: Obj | null = null, userData: Record<string, unknown> = {}): Obj => ({ name, parent, userData });

describe('never wait for a shader program inside a draw', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('skips a draw whose program is still building, asks the driver nothing that would wait, and draws it once built', () => {
    // (three's first use of a program asks for its link status, which waits for the build: 32 s on the
    // owner's laptop, the page locked for all of it)
    const f = fake();
    const guard = guardDraws(f.gl)!;
    expect(guard).not.toBeNull();
    const p: Prog = { built: false };
    const a = obj('a');
    f.draw(a, p);
    expect(f.drawn).toEqual([]);
    expect(f.waited).toEqual([]);
    expect(guard.held).toBe(1);
    expect(guard.waiting.size).toBe(1);
    p.built = true;
    f.draw(a, p);
    expect(f.drawn).toEqual(['a']);
    expect(f.waited).toEqual([]);
  });

  it('holds a whole creature back while any of its programs is building, then draws all of it', () => {
    // (its eyes and claws, whose small programs are ready, do not hang in the air where its skin will be)
    const f = fake();
    guardDraws(f.gl);
    const root = obj('root', null, { drawWhole: true });
    const skin = obj('skin', root), eye = obj('eye', obj('socket', root));
    const big: Prog = { built: false }, small: Prog = { built: true };
    f.draw(skin, big);
    f.draw(eye, small);
    expect(f.drawn).toEqual([]);
    // (another creature beside it is drawn as usual)
    f.draw(obj('other', obj('root2', null, { drawWhole: true })), small);
    expect(f.drawn).toEqual(['other']);
    big.built = true;
    f.draw(skin, big);
    f.draw(eye, small);
    expect(f.drawn).toEqual(['other', 'skin', 'eye']);
    expect(f.waited).toEqual([]);
  });

  it('wakes whoever waits for the finished picture when the last program is built', async () => {
    const f = fake();
    const guard = guardDraws(f.gl)!;
    const woke = vi.fn();
    guard.wake.add(woke);
    const p: Prog = { built: false };
    f.draw(obj('a'), p);
    let settled = false;
    void shadersSettled(f.gl).then((waited) => (settled = waited));
    await vi.advanceTimersByTimeAsync(200);
    expect(woke).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    p.built = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(woke).toHaveBeenCalled();
    expect(settled).toBe(true);
    expect(guard.waiting.size).toBe(0);
    // (nothing held back: no wait)
    expect(await shadersSettled(f.gl)).toBe(false);
  });

  it('lets a real error through, and changes nothing where programs are built on the spot', () => {
    const f = fake();
    guardDraws(f.gl);
    expect(() => f.draw(obj('a'), { built: true }, true)).toThrow('a real error');
    // (no KHR_parallel_shader_compile: the first use waits, as it always did)
    const g = fake(false);
    expect(guardDraws(g.gl)).toBeNull();
    g.draw(obj('a'), { built: false });
    expect(g.drawn).toEqual(['a']);
    expect(g.waited).toEqual(['log', 'parameter']);
  });
});
