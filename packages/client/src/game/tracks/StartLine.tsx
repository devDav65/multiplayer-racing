import type { Track } from "@racing/shared";
import { useMemo } from "react";
import { DataTexture, NearestFilter, RGBAFormat } from "three";

const SQUARES_ACROSS = 16;
const SQUARES_ALONG = 2;
const LINE_DEPTH = 2; // m, dans le sens de la course

/** Texture en damier, générée en mémoire (pas d'image à charger). */
function checkerTexture(): DataTexture {
  const data = new Uint8Array(SQUARES_ACROSS * SQUARES_ALONG * 4);
  for (let y = 0; y < SQUARES_ALONG; y++) {
    for (let x = 0; x < SQUARES_ACROSS; x++) {
      const v = (x + y) % 2 === 0 ? 240 : 20;
      data.set([v, v, v, 255], (y * SQUARES_ACROSS + x) * 4);
    }
  }
  const texture = new DataTexture(data, SQUARES_ACROSS, SQUARES_ALONG, RGBAFormat);
  // NearestFilter : carrés nets au lieu d'un dégradé flou entre les pixels.
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Ligne de départ/arrivée en damier, posée sur la porte 0 du circuit. */
export function StartLine({ track }: { track: Track }) {
  const texture = useMemo(checkerTexture, []);
  const gate = track.gates[0];
  if (!gate) return null;
  // Même convention que la voiture : la direction (tx, tz) correspond au cap atan2(-tx, -tz).
  const heading = Math.atan2(-gate.tx, -gate.tz);
  return (
    <group position={[gate.x, 0.03, gate.z]} rotation={[0, heading, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[track.halfWidth * 2, LINE_DEPTH]} />
        <meshStandardMaterial map={texture} />
      </mesh>
    </group>
  );
}
