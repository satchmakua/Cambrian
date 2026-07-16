/**
 * Shared mouth colors + jitter (mouth overhaul) — one place for the flesh-tone house rules, so
 * every variant module (jawed, ring, baleen, beak, mandibles, probe) reads the same palette and
 * none imports the dispatcher (no cycles).
 */

// Teeth are ivory/bone, faintly grimy — never the bright picket-fence white that read as cartoon.
export const TOOTH = 0xe0d3b2;
// A darker, wetter tongue/flesh than the old bubblegum pink.
export const TONGUE = 0x6e2b33;
// Wet gum-flesh at the tooth roots.
export const GUM = 0x451317;
// The dark lip-flesh every variant lerps its skin color toward.
export const LIP = 0x4a2026;
// The near-black warm dark of a mouth interior — depth reads through darkness.
export const INTERIOR = 0x150405;
// Keratin for beaks/plates — bone-dark, never toy-bright.
export const KERATIN = 0x8a7d5e;

/** deterministic per-index jitter in [-1,1] — stable across renders (no Math.random flicker). */
export function jig(i: number, salt = 0): number {
  const s = Math.sin((i + 1) * 12.9898 + salt * 4.137) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
