import { useMemo } from "react";
import { DoubleSide } from "three";
import type { Track } from "@racing/shared";
import { buildRoadGeometry, buildWallGeometries } from "./trackGeometry";

interface TrackMeshProps {
  track: Track;
}

export function TrackMesh({ track }: TrackMeshProps) {
  // useMemo : la géométrie n'est calculée qu'une fois, pas à chaque rendu React.
  const road = useMemo(() => buildRoadGeometry(track), [track]);
  const walls = useMemo(() => buildWallGeometries(track), [track]);

  // DoubleSide : visible des deux côtés, donc pas de souci d'orientation des triangles.
  return (
    <>
      <mesh geometry={road} receiveShadow>
        <meshStandardMaterial color="#3b3b44" side={DoubleSide} />
      </mesh>
      {walls.map((geometry, i) => (
        <mesh key={i} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial color="#d9d9e0" side={DoubleSide} />
        </mesh>
      ))}
    </>
  );
}