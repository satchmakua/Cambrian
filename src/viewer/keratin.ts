/**
 * A bird's keratin colour — shared by its bill, its scaly shanks and its toes (a heron's yellow
 * legs match its yellow bill; a crow is slate from beak to claw). Per creature, from its seed.
 */
import { hash01 } from './mouthLine';

export function billColor(seed: number): number {
  const h = hash01(seed, 0xb111);
  return h < 0.4 ? 0xd99a2b : h < 0.75 ? 0x34373c : 0xcbb98d;
}

/** The shanks and feet a shade duller than the bill (horn sheath vs. scaly skin) — and a slate bill's
 *  legs a mid grey: as dark as the bill, under a pale bird they were black stockings. */
export function shankColor(seed: number): number {
  const c = billColor(seed);
  return c === 0xd99a2b ? 0xc08a3a : c === 0x34373c ? 0x66686d : 0xa89a80;
}
