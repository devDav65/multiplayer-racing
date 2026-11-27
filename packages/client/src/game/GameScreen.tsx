import { buildTrack, CIRCUIT_1 } from "@racing/shared";
import { Canvas } from "@react-three/fiber";
import { useRef } from "react";
import { useGameStore } from "../store/gameStore";
import { RoomOverlay } from "../ui/RoomOverlay";
import { NetworkedGame } from "./NetworkedGame";
import { StartLine } from "./tracks/StartLine";
import { TrackMesh } from "./tracks/TrackMesh";

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

/** La course : scène 3D, HUD et surcouche du salon. Monté seulement dans un salon. */
export default function GameScreen() {
  const pingMs = useGameStore((s) => s.pingMs);
  const speedRef = useRef<HTMLDivElement>(null);
  const correctionRef = useRef<HTMLDivElement>(null);

  return (
    <>
      {/* "percentage" = PCFShadowMap : three 0.187 a retiré PCFSoftShadowMap (défaut de R3F). */}
      <Canvas shadows="percentage" camera={{ position: [0, 3.5, 8], fov: 60 }}>
        <fog attach="fog" args={["#101820", 80, 400]} />
        <ambientLight intensity={0.5} />
        <Ground />
        <TrackMesh track={track} />
        <StartLine track={track} />
        <NetworkedGame track={track} speedRef={speedRef} correctionRef={correctionRef} />
      </Canvas>
      <div className="hud">
        <div ref={speedRef} className="speed">
          0 km/h
        </div>
        <div className="debug">
          <div>Ping : {pingMs !== null ? `${pingMs} ms` : "-"}</div>
          <div ref={correctionRef}>Correction : -</div>
        </div>
      </div>
      <RoomOverlay />
    </>
  );
}
