import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
type Node = Phenotype['nodes'][number];
const rx = (n: Node) => n.radius * (n.scale?.[0] ?? 1);
const ry = (n: Node) => n.radius * (n.scale?.[1] ?? 1);
const snake = (seed: number) => {
  const p = grow(genomeOfMorphotype(seed, 'serpent'));
  return {
    p,
    trunk: p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0),
    head: p.nodes.filter((n) => n.kind === 'spine' && n.segment === 1),
    tail: p.nodes.filter((n) => n.part?.kind === 'tail'),
  };
};

describe('serpent', () => {
  it('its tail tapers gradually over a long run to a fine point: no step, no knob', () => {
    // (it kept its girth nearly to the end and stepped down into a short nub: a pencil tip, a stopper)
    for (const seed of SEEDS) {
      const { trunk, tail } = snake(seed);
      const girth = Math.max(...trunk.map((n) => n.radius));
      const len = tail.slice(1).reduce((t, n, i) => t + Math.hypot(n.pos[0] - tail[i].pos[0], n.pos[1] - tail[i].pos[1], n.pos[2] - tail[i].pos[2]), 0);
      expect(len / girth, `#${seed} a long taper`).toBeGreaterThan(5.5); // (3.3–4.2 before)
      expect(tail[tail.length - 1].radius / girth, `#${seed} a point`).toBeLessThan(0.36);
      for (let i = 1; i < tail.length; i++) {
        expect(tail[i].radius / tail[i - 1].radius, `#${seed} link ${i}: no step`).toBeGreaterThan(0.77);
        expect(tail[i].radius, `#${seed} link ${i}: no knob`).toBeLessThanOrEqual(tail[i - 1].radius);
      }
    }
  });

  it('its head is a flat spade, wider than it is tall, no narrower than the neck behind it', () => {
    // (a 'wedge' skull drawn tall and narrow — half as wide as tall, narrower than the neck: a fin on
    // edge at the end of a tube, and a worm)
    for (const seed of SEEDS) {
      const { trunk, head } = snake(seed);
      expect(rx(head[0]) / ry(head[0]), `#${seed} flat`).toBeGreaterThan(1.35);
      // (barely wider than its neck, the front of a snake was the blunt end of a worm)
      expect(rx(head[0]) / rx(trunk[trunk.length - 1]), `#${seed} a head, wider than the neck`).toBeGreaterThan(1.12);
    }
  });

  it('its eyes are on the sides of its head, halfway back — not crammed on the tip of its snout', () => {
    for (const seed of SEEDS) {
      const { p, head } = snake(seed);
      const eye = p.nodes.find((n) => n.terminal === 'eye')!;
      const along = (eye.pos[2] - head[0].pos[2]) / (head[head.length - 1].pos[2] - head[0].pos[2]);
      expect(along, `#${seed} halfway back`).toBeGreaterThan(0.35); // (it was past the snout's tip, 1.3–1.4)
      expect(along, `#${seed} halfway back`).toBeLessThan(0.8);
      expect(Math.abs(eye.pos[0]) / rx(head[0]), `#${seed} on the sides`).toBeGreaterThan(0.6);
    }
  });
});
