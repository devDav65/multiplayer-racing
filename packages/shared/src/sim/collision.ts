import { SIM_DT } from "../constants";
import { nearestOnTrack, type Track } from "../tracks/track";
import { type CarControls, type CarState, stepCar } from "./car";
import { quantizeCarState } from "./quantize";

export const COLLISION_PARAMS = {
  /** Positions des cercles le long de l'axe de la voiture (m). Positif = vers l'avant. */
  circleOffsets: [-1.2, 0, 1.2],
  circleRadius: 0.95,
  /** Rebond sur un mur : 0 = aucun, 1 = rebond parfait. */
  wallRestitution: 0.2,
  /** Ralentissement quand on frotte un mur (par seconde). */
  wallFriction: 1.5,
} as const;

/** Repousse la voiture hors des murs et ajuste sa vitesse. Renvoie un nouvel état. */
export function collideWithTrack(state: CarState, track: Track, dt: number = SIM_DT): CarState {
  const p = COLLISION_PARAMS;
  let { x, z, vx, vz } = state;
  const forwardX = -Math.sin(state.heading);
  const forwardZ = -Math.cos(state.heading);
  const limit = track.halfWidth - p.circleRadius;
  let touched = false;

  for (const offset of p.circleOffsets) {
    const cx = x + forwardX * offset;
    const cz = z + forwardZ * offset;
    const { px, pz, distance } = nearestOnTrack(track, cx, cz);
    if (distance <= limit) continue;

    // Normale du mur : du cercle vers la ligne centrale (donc vers l'intérieur de la piste).
    const nx = (px - cx) / distance;
    const nz = (pz - cz) / distance;

    // 1) Corriger la pénétration.
    const penetration = distance - limit;
    x += nx * penetration;
    z += nz * penetration;

    // 2) Annuler (avec rebond) la vitesse qui fonce vers le mur.
    const speedAlongNormal = vx * nx + vz * nz;
    if (speedAlongNormal < 0) {
      vx -= (1 + p.wallRestitution) * speedAlongNormal * nx;
      vz -= (1 + p.wallRestitution) * speedAlongNormal * nz;
    }
    touched = true;
  }

  // 3) Frotter un mur ralentit.
  if (touched) {
    const damping = Math.exp(-p.wallFriction * dt);
    vx *= damping;
    vz *= damping;
  }

  return { x, z, heading: state.heading, vx, vz };
}

/**
 * Un pas complet de simulation : conduite, collisions, puis quantification (voir quantize.ts).
 * C'est LA fonction que le client (prédiction) et le serveur (vérité) appellent,
 * pour être certains d'exécuter exactement la même chose.
 */
export function stepCarOnTrack(
  state: CarState,
  controls: CarControls,
  track: Track,
  dt: number = SIM_DT,
): CarState {
  return quantizeCarState(collideWithTrack(stepCar(state, controls, dt), track, dt));
}
