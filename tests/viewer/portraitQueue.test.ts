import { describe, it, expect } from 'vitest';
import { createRenderQueue } from '../../src/viewer/portrait';

/** a queue whose idle waits are counted and let through one tick later */
function harness() {
  const ran: string[] = [];
  let idles = 0;
  const q = createRenderQueue<string>(async () => {
    idles++;
    await Promise.resolve();
  });
  const job = (k: string) => async () => {
    ran.push(k);
    return `url:${k}`;
  };
  return { q, ran, job, idles: () => idles };
}

describe('the portrait queue', () => {
  it('draws the card being looked at ahead of every icon still waiting', async () => {
    // (first come first served, a clicked animal's portrait waited behind every census icon)
    const { q, ran, job } = harness();
    const icons = ['a', 'b', 'c', 'd'].map((k) => q.add(k, job(k), false));
    const card = q.add('card', job('card'), true);
    await Promise.all([...icons, card]);
    // the first icon may already be drawing when the card arrives; the card comes right after it
    expect(ran.indexOf('card')).toBeLessThanOrEqual(1);
    expect(ran.sort()).toEqual(['a', 'b', 'c', 'card', 'd']);
  });

  it('draws each portrait once, and moves a waiting one up when it is asked for urgently', async () => {
    const { q, ran, job } = harness();
    const first = q.add('a', job('a'), false);
    q.add('b', job('b'), false);
    q.add('c', job('c'), false);
    const again = q.add('c', job('c'), true);
    expect(await again).toBe('url:c');
    await first;
    await q.add('b', job('b'), false);
    expect(ran.filter((k) => k === 'c').length).toBe(1);
    expect(ran.indexOf('c')).toBeLessThan(ran.indexOf('b'));
  });

  it('waits for the page to be idle only for the jobs that are not urgent', async () => {
    const { q, job, idles } = harness();
    await q.add('x', job('x'), true);
    expect(idles()).toBe(0);
    await q.add('y', job('y'), false);
    expect(idles()).toBe(1);
  });

  it('a failed drawing fails its own request only', async () => {
    const q = createRenderQueue<string>(async () => undefined);
    const bad = q.add('bad', async () => {
      throw new Error('no context');
    }, false);
    const good = q.add('good', async () => 'url:good', false);
    await expect(bad).rejects.toThrow('no context');
    expect(await good).toBe('url:good');
  });
});
