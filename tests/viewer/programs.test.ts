import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { holdsUncompiled, pinPrograms, programsReady } from '../../src/viewer/programs';

describe('kept shader programs', () => {
  it('pins each program once, so disposing its last material no longer frees it', () => {
    // (three frees a program when --usedTimes reaches 0: swapping a breeder litter disposed the
    // materials before their replacements rendered, and every pick relinked the same shaders)
    const programs = [{ usedTimes: 1 }, { usedTimes: 3 }];
    const gl = { info: { programs } } as unknown as Parameters<typeof pinPrograms>[0];
    expect(pinPrograms(gl)).toBe(2);
    expect(programs.map((p) => p.usedTimes)).toEqual([2, 4]);
    expect(pinPrograms(gl)).toBe(0); // idempotent: a program is pinned once
    programs.push({ usedTimes: 1 });
    expect(pinPrograms(gl)).toBe(1);
    // its only material disposed: one release, and the program is still held
    programs[2].usedTimes--;
    expect(programs[2].usedTimes).toBeGreaterThan(0);
  });

  it('copes with a renderer that has compiled nothing yet', () => {
    const gl = { info: { programs: null } } as unknown as Parameters<typeof pinPrograms>[0];
    expect(pinPrograms(gl)).toBe(0);
  });

  it('waits for the programs still building — and not for a material disposed meanwhile', () => {
    // (three forgets a disposed material: asked again, it has no program — and three's own wait threw)
    const building = { ready: false };
    const programs = new Map<unknown, { currentProgram?: { isReady(): boolean } }>();
    const [built, slow, gone] = [{}, {}, {}] as unknown as THREE.Material[];
    programs.set(built, { currentProgram: { isReady: () => true } });
    programs.set(slow, { currentProgram: { isReady: () => building.ready } });
    const gl = { properties: { get: (m: unknown) => programs.get(m) ?? {} } } as unknown as Parameters<typeof programsReady>[0];
    const waiting = new Set([built, slow, gone]);
    expect(programsReady(gl, waiting)).toBe(false);
    expect([...waiting]).toEqual([slow]);
    building.ready = true;
    expect(programsReady(gl, waiting)).toBe(true);
    expect(programsReady(gl, new Set())).toBe(true);
  });

  it('sees a material that came into the scene after the compile (a creature swapped during warm-up)', () => {
    const [body, fur, next] = [{}, {}, {}] as unknown as THREE.Material[];
    const objects: unknown[] = [{ isMesh: true, material: body }, { isMesh: true, material: [body, fur] }, { isLight: true }, { isGroup: true, material: next }];
    const scene = { traverse: (f: (o: THREE.Object3D) => void) => objects.forEach((o) => f(o as THREE.Object3D)) };
    const compiled = new Set([body, fur]);
    // (only what three compiles for is looked at: meshes, points, lines, sprites)
    expect(holdsUncompiled(scene, compiled)).toBe(false);
    objects.push({ isPoints: true, material: next });
    expect(holdsUncompiled(scene, compiled)).toBe(true);
    compiled.add(next);
    expect(holdsUncompiled(scene, compiled)).toBe(false);
  });
});
