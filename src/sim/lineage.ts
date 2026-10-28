/**
 * How a lineage has changed — in words. Compares a descendant's body with its ancestor's (a species'
 * founder, a parent species') on the things you can see and the things that matter in the valley:
 * size, build, limbs, wings, tail, coat, colour, diet, speed. For the creature card and the chronicle.
 */
import type { Genome } from '../engine/genome';
import { describe } from '../engine/morphospace';
import { bodyOf } from './world';

const COAT: Record<string, string> = { skin: 'bare skin', scales: 'scales', fur: 'fur', feathers: 'feathers', chitin: 'chitin', slime: 'slime', plates: 'plates' };

/** Up to `max` short phrases ("bigger", "six legs, not four", "scales instead of fur"…); [] when it
 *  is, to the eye, the same animal. */
export function howItDiffers(ancestor: Genome, now: Genome, max = 4): string[] {
  if (ancestor === now) return [];
  const a = bodyOf(ancestor), b = bodyOf(now);
  const ta = a.traits, tb = b.traits;
  const da = describe(a.phenotype), db = describe(b.phenotype);
  const out: { w: number; s: string }[] = [];
  const add = (w: number, s: string) => out.push({ w, s });

  if (tb.diet !== ta.diet) add(10, `now ${tb.diet === 'carnivore' ? 'a hunter' : tb.diet === 'omnivore' ? 'an omnivore' : tb.diet === 'herbivore' ? 'a grazer' : `a ${tb.diet} feeder`}`);
  if (tb.legs !== ta.legs) add(9, tb.legs === 0 ? 'legless' : `${tb.legs} legs, not ${ta.legs}`);
  if (tb.winged !== ta.winged) add(9, tb.winged ? 'has grown wings' : 'has lost its wings');
  const ga = ancestor.covering, gb = now.covering;
  if (gb.type !== ga.type) add(8, `${COAT[gb.type]} instead of ${COAT[ga.type]}`);
  const m = tb.mass / ta.mass;
  if (m > 1.15 || m < 0.87) add(6 + Math.abs(Math.log(m)) * 4, m > 1 ? (m > 1.6 ? 'much bigger' : 'bigger') : m < 0.6 ? 'much smaller' : 'smaller');
  const tailA = da[6] > 0.5, tailB = db[6] > 0.5;
  if (tailA !== tailB) add(6, tailB ? 'has a tail' : 'lost its tail');
  const el = db[0] - da[0];
  if (Math.abs(el) > 0.07) add(5 + Math.abs(el) * 10, el > 0 ? 'longer-bodied' : 'shorter, stockier');
  const neck = db[8] - da[8];
  if (Math.abs(neck) > 0.12) add(4 + Math.abs(neck) * 6, neck > 0 ? 'a longer neck' : 'a shorter neck');
  const sp = tb.sprint / ta.sprint;
  if (sp > 1.12 || sp < 0.89) add(4 + Math.abs(Math.log(sp)) * 6, sp > 1 ? 'faster' : 'slower');
  if (gb.pattern !== ga.pattern && gb.pattern !== 'plain') add(3, `${gb.pattern === 'stripes' || gb.pattern === 'bands' ? 'striped' : gb.pattern === 'spots' || gb.pattern === 'ocelli' ? 'spotted' : gb.pattern === 'mottle' ? 'mottled' : gb.pattern} now`);
  const dh = Math.abs(((now.palette.hueA - ancestor.palette.hueA + 1.5) % 1) - 0.5);
  if (dh > 0.07) add(2 + dh * 8, 'a new colour');
  return out
    .sort((x, y) => y.w - x.w)
    .slice(0, max)
    .map((o) => o.s);
}
