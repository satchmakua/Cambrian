/**
 * Clutches in the World: a nest of twigs holding its eggs on land, a cluster of glassy spawn in the
 * water. Each egg wears a pale tint of its species' colour (speckled for the birds), sized by the
 * species' body. Eggs vanish as they hatch (or are raided) — the cast re-renders on that change.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { bodyOf, type Egg, type World } from '../sim/world';

const EGG = new THREE.SphereGeometry(1, 14, 10);
const SPAWN = new THREE.SphereGeometry(1, 8, 6);
const TWIG = new THREE.TorusGeometry(1, 0.3, 6, 18);
const STICK = new THREE.CylinderGeometry(1, 0.7, 1, 5);
const TWIG_MAT = new THREE.MeshStandardMaterial({ color: 0x5e4630, roughness: 0.95 });
const SPAWN_MAT = new THREE.MeshPhysicalMaterial({ color: 0xd8e6dc, roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.7, thickness: 0.2 });
const SHELL = new Map<string, THREE.MeshStandardMaterial>();

function shellMaterial(e: Egg): THREE.MeshStandardMaterial {
  const pal = e.genome.palette;
  const key = `${Math.round(pal.hueA * 40)}`;
  let m = SHELL.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(pal.hueA, 0.28, 0.8), roughness: 0.55 });
    SHELL.set(key, m);
  }
  return m;
}

export function Nests({ world }: { world: World }) {
  // group the eggs into their clutches
  const clutches = useMemo(() => {
    const by = new Map<number, Egg[]>();
    for (const e of world.eggs) {
      let a = by.get(e.nest);
      if (!a) by.set(e.nest, (a = []));
      a.push(e);
    }
    return [...by.values()];
    // the cast re-renders this whenever the egg list changes shape
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.eggs.length, world.eggs[world.eggs.length - 1]?.id, world.eggs[0]?.id]);
  return (
    <>
      {clutches.map((eggs) => (
        <Clutch key={eggs[0].nest} eggs={eggs} />
      ))}
    </>
  );
}

function Clutch({ eggs }: { eggs: Egg[] }) {
  const first = eggs[0];
  const size = useMemo(() => 0.07 + 0.06 * Math.cbrt(bodyOf(first.genome).traits.mass), [first.genome]);
  // the nest sits at the clutch's centre
  let cx = 0, cz = 0, cy = 0;
  for (const e of eggs) {
    cx += e.x / eggs.length;
    cz += e.z / eggs.length;
    cy += e.y / eggs.length;
  }
  if (first.water) {
    return (
      <group>
        {eggs.map((e, i) =>
          [0, 1, 2, 3, 4].map((k) => (
            <mesh
              key={`${e.id}-${k}`}
              geometry={SPAWN}
              material={SPAWN_MAT}
              position={[e.x + Math.sin(k * 2.4 + i) * size * 1.4, Math.max(e.y, -0.55) + size * 0.6 + (k % 2) * size * 0.9, e.z + Math.cos(k * 2.4 + i) * size * 1.4]}
              scale={size * 0.7}
            />
          )),
        )}
      </group>
    );
  }
  // a compact bowl: a woven rim of crossed twigs, the eggs huddled in its hollow
  const ring = size * (2.0 + 0.35 * eggs.length);
  const mat = shellMaterial(first);
  const twigs = useMemo(() => {
    const out: { p: [number, number, number]; r: [number, number, number]; l: number }[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + (first.nest % 5) * 0.3;
      out.push({
        p: [Math.sin(a) * ring, size * (0.45 + 0.25 * (i % 3)), Math.cos(a) * ring],
        r: [0.35 * ((i % 2) * 2 - 1), a + Math.PI / 2 + 0.5 * ((i % 3) - 1), Math.PI / 2],
        l: ring * (0.7 + 0.25 * ((i * 7) % 3)),
      });
    }
    return out;
  }, [ring, size, first.nest]);
  return (
    <group position={[cx, cy, cz]}>
      <mesh geometry={TWIG} material={TWIG_MAT} rotation={[Math.PI / 2, 0, 0]} scale={[ring, ring, ring * 1.6]} position={[0, size * 0.4, 0]} castShadow receiveShadow />
      {twigs.map((t, i) => (
        <mesh key={i} geometry={STICK} material={TWIG_MAT} position={t.p} rotation={t.r} scale={[size * 0.12, t.l, size * 0.12]} castShadow />
      ))}
      {eggs.map((e, i) => {
        const a = (i / eggs.length) * Math.PI * 2 + 0.4;
        const rr = eggs.length > 1 ? size * 1.15 : 0;
        return (
          <mesh key={e.id} geometry={EGG} material={mat} position={[Math.sin(a) * rr, size * 1.15, Math.cos(a) * rr]} scale={[size, size * 1.3, size]} rotation={[0.35, a, 0.2]} castShadow />
        );
      })}
    </group>
  );
}
