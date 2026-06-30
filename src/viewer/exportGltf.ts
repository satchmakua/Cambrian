/**
 * glTF export (ROADMAP M7, stretch) — bake the current creature to a `.glb`.
 *
 * `buildExportGroup` assembles a *static* THREE.Group of the creature in its base pose — the
 * capsule-union body (or the M15 smooth surface) plus simplified feature solids (eyes, mouths,
 * fins, claws, …) — using plain `MeshStandardMaterial`s (glTF can't carry the procedural covering
 * shader, so the export keeps the base colour + PBR, not the in-shader patterns/bump). That group
 * is pure three (no React/WebGL), so it's unit-testable headlessly. `exportCreatureGlb` then runs
 * three's `GLTFExporter` over it → a binary GLB (browser only — the exporter uses `FileReader`).
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { Phenotype } from '../engine/grow';
import type { Palette, Covering } from '../engine/genome';
import { buildMeshData } from './meshData';
import { buildSmoothGeometry } from './smoothSkin';

const UP = new THREE.Vector3(0, 1, 0);

const ROUGH: Record<Covering['type'], { rough: number; metal: number }> = {
  skin: { rough: 0.7, metal: 0 },
  scales: { rough: 0.5, metal: 0.08 },
  fur: { rough: 0.95, metal: 0 },
  feathers: { rough: 0.8, metal: 0 },
  chitin: { rough: 0.35, metal: 0.15 },
  slime: { rough: 0.16, metal: 0 },
  plates: { rough: 0.6, metal: 0 },
};

/** A static THREE.Group of the creature in base pose (capsule-union or smooth) + its features. */
export function buildExportGroup(phenotype: Phenotype, smooth: boolean): THREE.Group {
  const data = buildMeshData(phenotype);
  const pal: Palette = phenotype.genomeRef.palette;
  const cov: Covering = phenotype.genomeRef.covering;
  const group = new THREE.Group();
  group.name = 'cambrian-creature';

  const base = new THREE.Color().setHSL(pal.hueA, pal.sat, pal.light);
  const preset = ROUGH[cov.type];
  const bodyMat = new THREE.MeshStandardMaterial({ color: base, roughness: preset.rough, metalness: preset.metal });
  const footColor = new THREE.Color().setHSL(pal.hueA, pal.sat, Math.max(0.12, pal.light * 0.45));
  const finColor = base.clone();
  const featMat = new THREE.MeshStandardMaterial({ color: footColor, roughness: 0.6 });
  const finMat = new THREE.MeshStandardMaterial({ color: finColor, roughness: 0.55, side: THREE.DoubleSide });
  const eyeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xe8e6dc), roughness: 0.18 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x07070a), roughness: 0.1 });

  // --- body ---
  if (smooth) {
    group.add(new THREE.Mesh(buildSmoothGeometry(phenotype), bodyMat));
  } else {
    for (const i of data.bodySpheres) {
      const n = data.nodes[i];
      const m = new THREE.Mesh(new THREE.SphereGeometry(n.radius, 16, 12), bodyMat);
      m.position.fromArray(n.pos);
      group.add(m);
    }
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (const e of data.edges) {
      a.fromArray(data.nodes[e.a].pos);
      b.fromArray(data.nodes[e.b].pos);
      dir.subVectors(b, a);
      const len = Math.max(dir.length(), 1e-3);
      dir.divideScalar(len);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(e.radius, len, 6, 12), bodyMat);
      m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.quaternion.copy(q.setFromUnitVectors(UP, dir));
      group.add(m);
    }
  }

  // --- features (simplified solids; the on-screen variants are richer) ---
  for (const f of data.features) {
    const r = Math.max(f.radius, 0.06);
    const q = new THREE.Quaternion().fromArray(f.quat);
    const node = new THREE.Group();
    node.position.fromArray(data.nodes[f.idx].pos);
    if (f.type === 'eye') {
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), eyeMat);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 10, 8), pupilMat);
      pupil.position.z = r * 0.6;
      const e = new THREE.Group();
      e.quaternion.copy(q);
      e.add(sclera, pupil);
      node.add(e);
    } else if (f.type === 'mouth') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, r * 0.5, r * 0.7), pupilMat);
      node.add(m);
    } else if (f.type === 'fin') {
      // fin / wing / frill — a thin blade, wider for wings/frills
      const wide = f.kind === 'wing' ? 2.6 : f.kind === 'frill' ? 2.1 : 1.2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), finMat);
      m.scale.set(r * (f.kind === 'frill' ? 0.16 : 0.28), r * wide, r * (f.kind === 'wing' ? 3.0 : 1.6));
      m.quaternion.copy(q);
      node.add(m);
    } else if (f.type === 'pincer') {
      for (const side of [-1, 1]) {
        const prong = new THREE.Mesh(new THREE.ConeGeometry(r * 0.45, r * 1.8, 7), featMat);
        prong.position.set(side * r * 0.45, 0, r * 0.9);
        prong.quaternion.copy(q);
        node.add(prong);
      }
    } else if (f.type === 'claw') {
      // claw / horn — a tapered cone
      const m = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, r * (f.kind === 'horn' ? 3.2 : 1.6), 8), featMat);
      m.quaternion.copy(q);
      node.add(m);
    } else if (f.type === 'carapace') {
      // a domed shell over the body region (world-aligned, capping the back)
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), bodyMat);
      m.position.y = -r * 0.5;
      m.scale.set(r * 3.2, r * 2.2, r * 4.0);
      node.add(m);
    } else if (f.type === 'club') {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 1.5, 0), featMat);
      m.quaternion.copy(q);
      node.add(m);
    } else if (f.type === 'barb') {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5, r * 3.0, 8), featMat);
      m.quaternion.copy(q);
      node.add(m);
    } else if (f.type === 'ear' || f.type === 'crest') {
      // a thin upright plate (ear) / fan (crest)
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), f.type === 'crest' ? finMat : featMat);
      m.scale.set(r * 0.3, r * 1.6, r * (f.type === 'crest' ? 1.3 : 0.9));
      m.quaternion.copy(q);
      node.add(m);
    } else if (f.type === 'gill' || f.type === 'whisker') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(r * 0.8, r * 0.8, r * 0.3), featMat);
      m.quaternion.copy(q);
      node.add(m);
    } else {
      // foot / pad
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), featMat);
      m.scale.set(r * 1.1, r * 0.55, r * 1.4);
      node.add(m);
    }
    group.add(node);
  }

  return group;
}

/** Export the creature as a binary GLB. Browser-only (GLTFExporter uses FileReader). */
export async function exportCreatureGlb(phenotype: Phenotype, smooth: boolean): Promise<ArrayBuffer> {
  const group = buildExportGroup(phenotype, smooth);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(group, { binary: true });
  // dispose the throwaway geometries/materials
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
  return result as ArrayBuffer;
}

/** Trigger a browser download of the creature's GLB. */
export async function downloadCreatureGlb(phenotype: Phenotype, smooth: boolean, filename: string): Promise<void> {
  const glb = await exportCreatureGlb(phenotype, smooth);
  const blob = new Blob([glb], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
