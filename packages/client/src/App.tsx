import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { SIM_TICK_RATE } from "@racing/shared";
import { useConnection } from "./hooks/useConnection";

function SpinningCube() {
  const meshRef = useRef<Mesh>(null);

  useFrame((_state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 1, 0]} castShadow>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#ff5533" />
    </mesh>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial color="#2a3a2a" />
    </mesh>
  );
}

export default function App() {
  const { connected, playerId, pingMs } = useConnection();

  return (
    <>
      <Canvas shadows camera={{ position: [6, 5, 8], fov: 60 }}>
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[10, 15, 5]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <SpinningCube />
        <Ground />
      </Canvas>
      <div className="hud">
        <div>Simulation : {SIM_TICK_RATE} Hz (depuis @racing/shared)</div>
        <div>Serveur : {connected ? "connecté" : "déconnecté"}</div>
        <div>Joueur : {playerId ?? "-"}</div>
        <div>Ping : {pingMs !== null ? `${pingMs} ms` : "-"}</div>
      </div>
    </>
  );
}