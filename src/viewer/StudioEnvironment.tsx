/**
 * A procedural studio environment map — image-based lighting with no network fetch.
 *
 * drei's `<Environment preset=…>` downloads an HDR from a CDN; when that fetch fails (offline, a
 * firewall, a headless capture) the loader *throws*, and a Suspense boundary does not catch throws,
 * so the whole canvas unmounted. Here the env map is a tiny scene of emissive panels — a big overhead
 * softbox, a key from front-right, a cool rim from behind-left, a warm ground bounce, and thin strip
 * lights for crisp catch-lights in eyes and wet skin — prefiltered ONCE per renderer with PMREM and
 * shared by every scene that renders on it (the main stage, the Studio plates, the Bestiary, the
 * World). Deterministic, offline, and cheap to reuse across many viewports.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

const CACHE = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

function panel(
  scene: THREE.Scene,
  color: THREE.ColorRepresentation,
  intensity: number,
  size: [number, number],
  pos: [number, number, number],
  look: [number, number, number] = [0, 0, 0],
): void {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), mat);
  m.position.set(...pos);
  m.lookAt(...look);
  scene.add(m);
}

/** The prefiltered studio environment texture for this renderer (built on first use, then cached). */
export function studioEnvTexture(gl: THREE.WebGLRenderer): THREE.Texture {
  const hit = CACHE.get(gl);
  if (hit) return hit;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161c); // dim backdrop so reflections aren't pitch black
  panel(scene, 0xfff6ea, 2.2, [10, 6], [0, 6, 0]); // overhead softbox — the main highlight on backs
  panel(scene, 0xffffff, 1.6, [4, 3], [5, 2.5, 4]); // key, front-right
  panel(scene, 0xa9c4ff, 1.4, [5, 2.5], [-5, 2, -4]); // cool rim, behind-left
  panel(scene, 0xc9a37a, 0.5, [12, 12], [0, -4, 0]); // warm ground bounce — belly fill
  panel(scene, 0xffffff, 2.5, [0.4, 3], [-3, 3.5, 5]); // strip — eye catch-light
  panel(scene, 0xffe2c0, 1.2, [1.6, 1.6], [3, 1, -5]); // warm kicker
  const pmrem = new THREE.PMREMGenerator(gl);
  const tex = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  CACHE.set(gl, tex);
  return tex;
}

/** Light the enclosing scene (or View portal) with the shared studio environment. */
export function StudioEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const prev = scene.environment;
    scene.environment = studioEnvTexture(gl);
    invalidate();
    return () => {
      scene.environment = prev;
    };
  }, [gl, scene, invalidate]);
  return null;
}
