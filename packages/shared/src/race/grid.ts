import { type CarState, createCarState } from "../sim/car";
import { quantizeCarState } from "../sim/quantize";
import type { Track } from "../tracks/track";

const GRID_ROW_SPACING = 8; // mètres entre deux rangées
const GRID_LANE_OFFSET = 3.5; // mètres entre l'axe de la piste et chaque colonne

/** Position de départ n° `slot` : grille de 2 colonnes, derrière la ligne de départ. */
export function gridPosition(track: Track, slot: number): CarState {
  const { x, z, heading } = track.spawn;
  const forwardX = -Math.sin(heading);
  const forwardZ = -Math.cos(heading);
  const rightX = Math.cos(heading);
  const rightZ = -Math.sin(heading);
  const row = Math.floor(slot / 2);
  const side = slot % 2 === 0 ? -1 : 1;
  return quantizeCarState(
    createCarState(
      x - forwardX * row * GRID_ROW_SPACING + rightX * side * GRID_LANE_OFFSET,
      z - forwardZ * row * GRID_ROW_SPACING + rightZ * side * GRID_LANE_OFFSET,
      heading,
    ),
  );
}
