/**
 * A procedural studio environment map — image-based lighting with no network fetch.
 *
 * drei's `<Environment preset=…>` downloads an HDR from a CDN; when that fetch fails (offline, a
 * firewall, a headless capture) the loader *throws*, and a Suspense boundary does not catch throws,
 * so the whole canvas unmounted. Here the env map is rendered once into a cube target from a handful
 * of emissive `Lightformer` panels — a soft key, a cool rim, a warm ground bounce — so the creature's
 * PBR skin gets real reflections and wet highlights deterministically, on any machine, instantly.
 */
import { Environment, Lightformer } from '@react-three/drei';

export function StudioEnvironment({ resolution = 256 }: { resolution?: number }) {
  return (
    <Environment resolution={resolution} frames={1}>
      {/* dim backdrop so reflections aren't pitch black */}
      <color attach="background" args={['#14161c']} />
      {/* big overhead softbox — the main specular highlight along backs and heads */}
      <Lightformer form="rect" intensity={2.2} color="#fff6ea" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 6, 1]} />
      {/* key from front-right */}
      <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[5, 2.5, 4]} target={[0, 0, 0]} scale={[4, 3, 1]} />
      {/* cool rim from behind-left — separates the silhouette */}
      <Lightformer form="rect" intensity={1.4} color="#a9c4ff" position={[-5, 2, -4]} target={[0, 0, 0]} scale={[5, 2.5, 1]} />
      {/* warm ground bounce — under-chin / belly fill */}
      <Lightformer form="rect" intensity={0.5} color="#c9a37a" position={[0, -4, 0]} rotation-x={-Math.PI / 2} scale={[12, 12, 1]} />
      {/* thin strip lights — the crisp catch-light in eyes and wet skin */}
      <Lightformer form="rect" intensity={2.5} color="#ffffff" position={[-3, 3.5, 5]} target={[0, 0, 0]} scale={[0.4, 3, 1]} />
      <Lightformer form="ring" intensity={1.2} color="#ffe2c0" position={[3, 1, -5]} target={[0, 0, 0]} scale={1.5} />
    </Environment>
  );
}
