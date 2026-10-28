/**
 * A genome's palette as colours.
 *
 * The palette's hue / saturation / lightness are read as sRGB HSL, the space people pick colours in
 * (and the one the UI's swatches already used). THREE's `setHSL` defaults to its LINEAR working
 * space, where a mid lightness renders as a pale pastel: every coat came out bleached.
 */
import * as THREE from 'three';
import type { Palette } from '../engine/genome';

export function srgbHSL(h: number, s: number, l: number): THREE.Color {
  return new THREE.Color().setHSL(((h % 1) + 1) % 1, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l)), THREE.SRGBColorSpace);
}

/** Saturation as skin wears it: true sRGB saturation climbs fast, and a palette's top end (0.9)
 *  read as dyed plastic — real coats and scales stay under ~0.55 even when vivid. */
function wornSat(s: number): number {
  return s * (0.85 - 0.3 * s);
}

/** The coat's own tone — flanks, lids, plumage: a lion's tawny, not a pastel of it. */
export function coatMain(pal: Palette): THREE.Color {
  return srgbHSL(pal.hueA, wornSat(pal.sat), 0.18 + pal.light * 0.72);
}

/** The pale underside: the coat's OWN hue, lighter and a little greyer (a fawn's cream belly). */
export function coatBelly(pal: Palette): THREE.Color {
  return srgbHSL(pal.hueA, wornSat(pal.sat) * 0.7, Math.min(0.85, (0.18 + pal.light * 0.72) * 1.2 + 0.1));
}

/** Markings: the harmonised second hue, deep. */
export function coatPattern(pal: Palette): THREE.Color {
  return srgbHSL(pal.hueB, wornSat(pal.sat) * 1.25, 0.08 + pal.light * 0.42);
}

/** The darker accent in the cores of strong markings, shifted a touch toward umber. */
export function coatAccent(pal: Palette): THREE.Color {
  return srgbHSL(pal.hueB - 0.02, wornSat(pal.sat) * 1.1, 0.05 + pal.light * 0.28);
}

/** Feet, claws, hooves, the eye socket: the coat's hue, dark. */
export function coatDark(pal: Palette): THREE.Color {
  return srgbHSL(pal.hueA, wornSat(pal.sat), Math.max(0.12, pal.light * 0.45));
}

/** Fins, crests and other bare membranes: the palette at full strength. */
export function coatFin(pal: Palette): THREE.Color {
  return srgbHSL(pal.hueA, wornSat(pal.sat) * 1.15, pal.light);
}
