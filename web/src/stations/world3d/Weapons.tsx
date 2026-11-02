import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/** The weapon in your hands: a blocky rifle with arms, recoil and a muzzle flash, held in front of the first-person camera. */
export function Gun({
  fireAt,
  sleeve,
}: {
  fireAt: { current: number };
  sleeve: string;
}) {
  const { camera, scene } = useThree();
  const group = useRef<THREE.Group>(null),
    flash = useRef<THREE.Mesh>(null),
    sway = useRef(0);
  // the rifle is a child of the camera, so it moves exactly with your view and can never lag behind it
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    scene.add(camera);
    camera.add(g);
    g.rotation.y = 0.09;
    g.scale.setScalar(0.8);
    return () => {
      camera.remove(g);
    };
  }, [camera, scene]);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const since = (performance.now() - fireAt.current) / 1000,
      kick = Math.exp(-since * 16);
    sway.current += dt;
    g.position.set(
      0.19 + Math.sin(sway.current * 1.4) * 0.004,
      -0.24 + Math.cos(sway.current * 2.1) * 0.004 + kick * 0.01,
      -0.5 + kick * 0.11,
    );
    g.rotation.x = kick * 0.12;
    if (flash.current) flash.current.visible = since < 0.06;
  });
  const dark = "#2b2f38",
    metal = "#4a505c",
    skin = "#e0b08a";
  return (
    <group ref={group} renderOrder={999}>
      <mesh position={[0, 0, -0.1]}>
        <boxGeometry args={[0.07, 0.1, 0.55]} />
        <meshStandardMaterial color={dark} depthTest={false} />
      </mesh>
      <mesh position={[0, 0.015, -0.45]}>
        <boxGeometry args={[0.035, 0.035, 0.34]} />
        <meshStandardMaterial color={metal} depthTest={false} />
      </mesh>
      <mesh position={[0, 0.075, -0.18]}>
        <boxGeometry args={[0.02, 0.04, 0.05]} />
        <meshStandardMaterial color={metal} depthTest={false} />
      </mesh>
      <mesh position={[0, -0.1, 0.02]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[0.055, 0.15, 0.07]} />
        <meshStandardMaterial color={dark} depthTest={false} />
      </mesh>
      <mesh position={[0, -0.08, -0.2]}>
        <boxGeometry args={[0.05, 0.1, 0.09]} />
        <meshStandardMaterial color={metal} depthTest={false} />
      </mesh>
      <mesh position={[0.02, -0.13, 0.02]}>
        <boxGeometry args={[0.09, 0.09, 0.1]} />
        <meshStandardMaterial color={skin} depthTest={false} />
      </mesh>
      <mesh position={[0.06, -0.2, 0.12]} rotation={[0.45, 0, 0]}>
        <boxGeometry args={[0.1, 0.1, 0.4]} />
        <meshStandardMaterial color={sleeve} depthTest={false} />
      </mesh>
      <mesh position={[-0.02, -0.12, -0.22]}>
        <boxGeometry args={[0.08, 0.08, 0.1]} />
        <meshStandardMaterial color={skin} depthTest={false} />
      </mesh>
      <mesh ref={flash} position={[0, 0.015, -0.66]} visible={false}>
        <boxGeometry args={[0.11, 0.11, 0.1]} />
        <meshBasicMaterial color="#ffd96b" depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Bullets in flight, drawn as short glowing tracers and moved forward between server updates. */
export function Projectiles({
  shots,
  stamp,
}: {
  shots: number[][];
  stamp: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null),
    data = useRef({ shots, stamp });
  data.current = { shots, stamp };
  const m = useMemo(() => new THREE.Matrix4(), []),
    q = useMemo(() => new THREE.Quaternion(), []),
    v = useMemo(() => new THREE.Vector3(), []),
    p = useMemo(() => new THREE.Vector3(), []),
    one = useMemo(() => new THREE.Vector3(1, 1, 1), []),
    zero = useMemo(() => new THREE.Vector3(0, 0, 0), []),
    forward = useMemo(() => new THREE.Vector3(0, 0, -1), []);
  useEffect(() => {
    if (mesh.current) mesh.current.frustumCulled = false;
  }, []);
  useFrame(() => {
    const im = mesh.current;
    if (!im) return;
    const age = Math.min(0.12, (performance.now() - data.current.stamp) / 1000);
    for (let i = 0; i < 240; i++) {
      const s = data.current.shots[i];
      if (!s) {
        m.compose(p.set(0, -999, 0), q.identity(), zero);
      } else {
        v.set(s[3], s[4], s[5]);
        p.set(s[0] + s[3] * age, s[1] + s[4] * age, s[2] + s[5] * age);
        q.setFromUnitVectors(forward, v.clone().normalize());
        m.compose(p, q, one);
      }
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, 240]}>
      <boxGeometry args={[0.07, 0.07, 0.9]} />
      <meshBasicMaterial color="#ffd96b" toneMapped={false} />
    </instancedMesh>
  );
}
