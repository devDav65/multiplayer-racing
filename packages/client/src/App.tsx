import { buildTrack, CIRCUIT_1, SIM_TICK_RATE } from "@racing/shared";
import { Canvas } from "@react-three/fiber";
import { useRef } from "react";
import { NetworkedGame } from "./game/NetworkedGame";
import { TrackMesh } from "./game/tracks/TrackMesh";
import { useConnection } from "./hooks/useConnection";

// Construit une seule fois, au chargement du module (pas à chaque rendu).
const track = buildTrack(CIRCUIT_1);

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[1000, 1000]} />
      <meshStandardMaterial color="#2a3a2a" />
    </mesh>
  );
}

export default function App() {
  const { connected, playerId, pingMs } = useConnection();
  const speedRef = useRef<HTMLDivElement>(null);
  const correctionRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <Canvas shadows camera={{ position: [0, 3.5, 8], fov: 60 }}>
        <fog attach="fog" args={["#101820", 80, 400]} />
        <ambientLight intensity={0.5} />
        <Ground />
        <TrackMesh track={track} />
        <NetworkedGame track={track} speedRef={speedRef} correctionRef={correctionRef} />
      </Canvas>
      <div className="hud">
        <div ref={speedRef}>0 km/h</div>
        <div>Simulation : {SIM_TICK_RATE} Hz</div>
        <div>Serveur : {connected ? "connecté" : "déconnecté"}</div>
        <div>Joueur : {playerId ?? "-"}</div>
        <div>Ping : {pingMs !== null ? `${pingMs} ms` : "-"}</div>
        <div ref={correctionRef}>Correction : -</div>
      </div>
    </>
  );
}
