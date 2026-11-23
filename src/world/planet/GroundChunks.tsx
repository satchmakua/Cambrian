/**
 * A planet's ground drawn in chunks (planetMesh.ts's chunkGeometry: eight a face's edge): each at the
 * detail its distance from the camera asks for — the single mesh's 256 cells a face near, half that and a
 * quarter farther off — and none past the horizon, so the half of the planet turned away, and most of it
 * from the ground, is never drawn. A chunk's finer levels are made as the camera first comes near it, a
 * few a frame, and kept; until then it is drawn at the finest it has.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CHUNK_CELLS, CHUNKS, chunkBounds, chunkGeometry } from './planetMesh';
import type { PlanetGround } from '../../sim/planetGround';

/** how near (bu, from the camera to a chunk's nearest ground) its finer levels come in */
const NEAR = [170, 1100];
/** the most chunks made in a frame */
const MAKE_EACH_FRAME = 3;
/** how often (s) the levels are judged again */
const JUDGE = 0.15;

/** what was drawn at the last judgement, for the HUD */
export const GROUND_DRAWN = { chunks: 0, cells: 0 };

interface Chunk {
  face: number;
  ci: number;
  cj: number;
  at: [number, number, number];
  reach: number;
  geos: (THREE.BufferGeometry | null)[];
  level: number;
  mesh: THREE.Mesh | null;
}

export function GroundChunks({ ground, material }: { ground: PlanetGround; material: THREE.Material }) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  // every chunk, at once at its coarsest (some 30 thousand points in all)
  const chunks = useMemo(() => {
    const out: Chunk[] = [];
    for (let f = 0; f < 6; f++)
      for (let cj = 0; cj < CHUNKS; cj++)
        for (let ci = 0; ci < CHUNKS; ci++) {
          const b = chunkBounds(f, ci, cj);
          const geos: (THREE.BufferGeometry | null)[] = CHUNK_CELLS.map(() => null);
          geos[CHUNK_CELLS.length - 1] = chunkGeometry(ground, f, ci, cj, CHUNK_CELLS[CHUNK_CELLS.length - 1]);
          out.push({ face: f, ci, cj, at: b.at, reach: b.reach, geos, level: -1, mesh: null });
        }
    return out;
  }, [ground]);
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const last = CHUNK_CELLS.length - 1;
    for (const c of chunks) {
      const m = new THREE.Mesh(c.geos[last]!, material);
      m.matrixAutoUpdate = false;
      c.mesh = m;
      c.level = last;
      g.add(m);
    }
    return () => {
      for (const c of chunks) {
        if (c.mesh) g.remove(c.mesh);
        c.geos.forEach((x) => x?.dispose());
      }
    };
  }, [chunks, material]);
  const judged = useRef(0);
  useFrame((_, dt) => {
    judged.current -= dt;
    if (judged.current > 0) return;
    judged.current = JUDGE;
    const R = ground.radius;
    const p = camera.position, rc = p.length();
    const cx = p.x / rc, cy = p.y / rc, cz = p.z / rc;
    // (the horizon from the camera, and as far again as the highest ground can be seen over it)
    const horizon = Math.acos(Math.min(1, R / rc)) + Math.acos(Math.min(1, R / (R + ground.relief * 1.2)));
    let made = 0, drawn = 0, cells = 0;
    for (const c of chunks) {
      if (!c.mesh) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, cx * c.at[0] + cy * c.at[1] + cz * c.at[2])));
      const visible = ang - c.reach < horizon;
      c.mesh.visible = visible;
      if (!visible) continue;
      // the camera's distance to the chunk's nearest ground, about
      const near = Math.max(0, ang - c.reach);
      const d = Math.sqrt(Math.max(0, rc * rc + R * R - 2 * rc * R * Math.cos(near)));
      const want = d < NEAR[0] ? 0 : d < NEAR[1] ? 1 : 2;
      if (!c.geos[want] && made < MAKE_EACH_FRAME) {
        c.geos[want] = chunkGeometry(ground, c.face, c.ci, c.cj, CHUNK_CELLS[want]);
        made++;
      }
      let level = want;
      while (!c.geos[level]) level++;
      if (c.level !== level) {
        c.mesh.geometry = c.geos[level]!;
        c.level = level;
      }
      drawn++;
      cells += CHUNK_CELLS[level] * CHUNK_CELLS[level];
    }
    // (a finer level still owed: judged again next frame, not in a sixth of a second)
    if (made === MAKE_EACH_FRAME) judged.current = 0;
    GROUND_DRAWN.chunks = drawn;
    GROUND_DRAWN.cells = cells;
  });
  return <group ref={group} />;
}
