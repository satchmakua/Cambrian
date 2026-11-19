import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as THREE from 'three';
import { LOSE_WAIT_MS, buildingPrograms, guardDraws, heldDraws, onProgramsBuilt, shadersSettled } from '../../src/viewer/programs';

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
    // (a deleted program never finishes building, as far as asking after it goes: the browser answers
    // with an error)
    deleteProgram(_p: Prog) {},
  };
  const gl = {
    getContext: () => ctx,
    info: { programs: [] as { program: Prog }[] },
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

  it('counts a program deleted while it was waited for as built — asking after it is an error', async () => {
    // (a thumbnail's kit swapped for its skin before the kit's programs were pinned)
    const f = fake();
    const ctx = f.gl.getContext() as unknown as { deleteProgram: (p: Prog) => void };
    const guard = guardDraws(f.gl)!;
    const p: Prog = { built: false };
    f.draw(obj('a'), p);
    expect(buildingPrograms(f.gl)).toBe(1);
    expect(heldDraws(f.gl)).toBe(1);
    const woke = vi.fn();
    const stop = onProgramsBuilt(f.gl, woke);
    ctx.deleteProgram(p);
    await vi.advanceTimersByTimeAsync(100);
    expect(guard.waiting.size).toBe(0);
    expect(woke).toHaveBeenCalledTimes(1);
    stop();
  });

  it('gives a context up only once its programs are built: losing it sooner holds the page until they are', async () => {
    // (9 s, measured: the menu's stage taken down on "Start game" while it was building the creature's shader)
    const f = fake();
    const lose = vi.fn();
    const p: Prog = { built: false };
    const gl = f.gl as unknown as { forceContextLoss: () => void; info: { programs: { program: Prog }[] } };
    gl.forceContextLoss = lose;
    gl.info.programs = [{ program: p }];
    guardDraws(f.gl);
    gl.forceContextLoss();
    await vi.advanceTimersByTimeAsync(1000);
    expect(lose).not.toHaveBeenCalled();
    p.built = true;
    await vi.advanceTimersByTimeAsync(150);
    expect(lose).toHaveBeenCalledTimes(1);
  });

  it('gives it up after a while whatever: a context kept holds graphics memory a built-in chip has little of', async () => {
    const f = fake();
    const lose = vi.fn();
    const gl = f.gl as unknown as { forceContextLoss: () => void; info: { programs: { program: Prog }[] } };
    gl.forceContextLoss = lose;
    gl.info.programs = [{ program: { built: false } }];
    guardDraws(f.gl);
    gl.forceContextLoss();
    await vi.advanceTimersByTimeAsync(LOSE_WAIT_MS - 200);
    expect(lose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(lose).toHaveBeenCalledTimes(1);
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
