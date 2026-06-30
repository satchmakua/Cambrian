/**
 * Shareable genome strings (DESIGN §4.6).
 *
 *   encode(genome) → "CAM1:" + base64url( JSON(canonicalize(genome)) )
 *   decode("CAM1:…") → validate( JSON.parse( … ) )
 *
 * A randomly-seeded creature could be shared as just its seed, but an *evolved* one
 * has a mutated structure, so we serialize the whole (small) genome. `canonicalize`
 * sorts keys so the same creature always yields the same string. Decode validates the
 * version and the full shape, rejecting corrupt input gracefully.
 *
 * Deviation from DESIGN §4.6: no deflate step — genomes are tiny and keeping the
 * engine dependency-free (no pako / no async CompressionStream) is worth more than a
 * few hundred bytes. Revisit if strings ever get unwieldy.
 */
import {
  GENOME_VERSION,
  type Genome,
  type SegmentGene,
  type AppendageGene,
  type Symmetry,
  type Terminal,
  type PartKind,
  type CoveringType,
  type PatternType,
} from './genome';

export const SHARE_PREFIX = 'CAM2:'; // bumped for genome v2 (spherical aim + part kinds)

const SYMMETRIES: readonly Symmetry[] = ['bilateral', 'radial', 'none'];
const TERMINALS: readonly Terminal[] = [
  'none', 'foot', 'fin', 'claw', 'eye', 'mouth', 'pincer', 'paw', 'hoof', 'hand',
  'club', 'barb', 'ear', 'gill', 'crest', 'carapace', 'whisker',
];
const KINDS: readonly PartKind[] = [
  'leg', 'arm', 'wing', 'fin', 'tail', 'horn', 'spine', 'frill', 'antenna', 'tentacle', 'eyestalk', 'maw',
  'plate', 'ear', 'gill', 'crest', 'whisker',
];
const COVERING_TYPES: readonly CoveringType[] = ['skin', 'scales', 'fur', 'feathers', 'chitin', 'slime', 'plates'];
const PATTERN_TYPES: readonly PatternType[] = [
  'plain', 'stripes', 'bands', 'spots', 'ocelli', 'reticulate', 'mottle', 'gradient',
];

export function encodeGenome(g: Genome): string {
  return SHARE_PREFIX + toBase64Url(JSON.stringify(canonicalize(g)));
}

export function decodeGenome(input: string): Genome {
  const s = input.trim();
  if (!s.startsWith(SHARE_PREFIX)) {
    throw new Error('Not a Cambrian v2 creature string (missing "CAM2:" prefix).');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(s.slice(SHARE_PREFIX.length)));
  } catch {
    throw new Error('Corrupt creature string — could not decode.');
  }
  return validateGenome(parsed);
}

// --- canonical JSON (stable key order) --------------------------------------

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize); // preserve array order
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = canonicalize(v);
    }
    return out;
  }
  return value;
}

// --- validation (reject corrupt input) --------------------------------------

function validateGenome(o: unknown): Genome {
  const g = obj(o, 'genome');
  if (g.version !== GENOME_VERSION) {
    throw new Error(`Unsupported creature version ${String(g.version)} (expected ${GENOME_VERSION}).`);
  }
  return {
    version: GENOME_VERSION,
    seed: u32(g.seed, 'seed'),
    symmetry: oneOf(g.symmetry, SYMMETRIES, 'symmetry'),
    radialCount: num(g.radialCount, 'radialCount'),
    // coherence is optional (M24); absent ⇒ fully coherent. Clamp anything present into [0,1].
    coherence: typeof g.coherence === 'number' && Number.isFinite(g.coherence) ? Math.min(1, Math.max(0, g.coherence)) : 1,
    covering: validateCovering(g.covering),
    palette: validatePalette(g.palette),
    body: validateSegment(g.body),
  };
}

function validateCovering(o: unknown): Genome['covering'] {
  const c = obj(o, 'covering');
  return {
    type: oneOf(c.type, COVERING_TYPES, 'covering.type'),
    pattern: oneOf(c.pattern, PATTERN_TYPES, 'covering.pattern'),
    patternScale: num(c.patternScale, 'patternScale'),
    patternContrast: num(c.patternContrast, 'patternContrast'),
    sheen: num(c.sheen, 'sheen'),
  };
}

function validatePalette(o: unknown): Genome['palette'] {
  const p = obj(o, 'palette');
  return { hueA: num(p.hueA, 'hueA'), hueB: num(p.hueB, 'hueB'), sat: num(p.sat, 'sat'), light: num(p.light, 'light') };
}

function validateSegment(o: unknown): SegmentGene {
  const s = obj(o, 'segment');
  const seg: SegmentGene = {
    size: vec3(s.size, 'size'),
    repeat: num(s.repeat, 'repeat'),
    taper: num(s.taper, 'taper'),
    curve: vec2(s.curve, 'curve'),
    appendages: arr(s.appendages, 'appendages').map(validateAppendage),
  };
  if (s.child !== undefined) seg.child = validateSegment(s.child);
  return seg;
}

function validateAppendage(o: unknown): AppendageGene {
  const a = obj(o, 'appendage');
  return {
    kind: oneOf(a.kind, KINDS, 'kind'),
    style: num(a.style, 'style'),
    attachT: num(a.attachT, 'attachT'),
    attachAzimuth: num(a.attachAzimuth, 'attachAzimuth'),
    attachElevation: num(a.attachElevation, 'attachElevation'),
    roll: num(a.roll, 'roll'),
    segments: num(a.segments, 'segments'),
    length: num(a.length, 'length'),
    thickness: num(a.thickness, 'thickness'),
    taper: num(a.taper, 'taper'),
    curl: vec2(a.curl, 'curl'),
    terminal: oneOf(a.terminal, TERMINALS, 'terminal'),
    pair: bool(a.pair, 'pair'),
  };
}

// --- small validators --------------------------------------------------------

function fail(field: string): never {
  throw new Error(`Corrupt creature string — bad "${field}".`);
}
function obj(v: unknown, field: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(field);
  return v as Record<string, unknown>;
}
function num(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(field);
  return v;
}
function u32(v: unknown, field: string): number {
  return num(v, field) >>> 0;
}
function bool(v: unknown, field: string): boolean {
  if (typeof v !== 'boolean') fail(field);
  return v;
}
function arr(v: unknown, field: string): unknown[] {
  if (!Array.isArray(v)) fail(field);
  return v;
}
function vec2(v: unknown, field: string): [number, number] {
  const a = arr(v, field);
  if (a.length !== 2) fail(field);
  return [num(a[0], field), num(a[1], field)];
}
function vec3(v: unknown, field: string): [number, number, number] {
  const a = arr(v, field);
  if (a.length !== 3) fail(field);
  return [num(a[0], field), num(a[1], field), num(a[2], field)];
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) fail(field);
  return v as T;
}

// --- UTF-8-safe base64url ----------------------------------------------------

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
