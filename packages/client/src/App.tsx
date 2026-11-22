import { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { SIM_TICK_RATE } from "@racing/shared";
import { PlayerCar } from "./game/vehicles/PlayerCar";
import { useConnection } from "./hooks/useConnection";

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1000, 1000]} />
        <meshStandardMaterial color="#2a3a2a" />
      </mesh>
      {/* Grille de cases de 4 m : sans repère visuel, on ne sent pas la vitesse. */}
      <gridHelper args={[1000, 250, "#6b8f6b", "#3d543d"]} position={[0, 0.01, 0]} />
    </>
  );
}

export default function App() {
  const { connected, playerId, pingMs } = useConnection();
  const speedRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <Canvas shadows camera={{ position: [0, 3.5, 8], fov: 60 }}>
        <fog attach="fog" args={["#101820", 80, 400]} />
        <ambientLight intensity={0.5} />
        <PlayerCar speedRef={speedRef} />
        <Ground />
      </Canvas>
      <div className="hud">
        <div ref={speedRef}>0 km/h</div>
        <div>Simulation : {SIM_TICK_RATE} Hz</div>
        <div>Serveur : {connected ? "connecté" : "déconnecté"}</div>
        <div>Joueur : {playerId ?? "-"}</div>
        <div>Ping : {pingMs !== null ? `${pingMs} ms` : "-"}</div>
      </div>
    </>
  );
}