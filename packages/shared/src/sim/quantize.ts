import type { CarState } from "./car";

/**
 * QUANTIFICATION DE L'ÉTAT
 *
 * À la fin de chaque pas de simulation, l'état est arrondi : position et vitesse au
 * millimètre, cap au 1/100 000 de radian. Invisible à l'écran, mais :
 *
 * 1. les nombres deviennent courts (« 12.345 » au lieu de « 12.345678901234567 ») :
 *    les snapshots JSON sont beaucoup plus petits ;
 * 2. c'est fait DANS la fonction partagée, donc à l'identique côté client (prédiction)
 *    et côté serveur : l'état envoyé est exactement l'état simulé, et la réconciliation
 *    reste exacte.
 *
 * Arrondir k/1000 donne le double le plus proche de ce décimal ; JavaScript l'écrit
 * « 12.345 » et le relit à l'identique. Le « + 0 » transforme -0 en 0 (JSON écrit -0
 * comme « 0 » : sans ça, le client recevrait 0 alors que le serveur garde -0).
 */
const POSITION_SCALE = 1000; // 1 mm
const VELOCITY_SCALE = 1000; // 1 mm/s
const HEADING_SCALE = 100_000; // 0,00001 rad

function round(value: number, scale: number): number {
  return Math.round(value * scale) / scale + 0;
}

/** Ramène un angle dans ]-π, π] (sans toucher aux angles déjà dans l'intervalle). */
export function wrapAngle(angle: number): number {
  if (angle > Math.PI || angle <= -Math.PI) {
    return angle - 2 * Math.PI * Math.ceil((angle - Math.PI) / (2 * Math.PI));
  }
  return angle;
}

export function quantizeCarState(state: CarState): CarState {
  return {
    x: round(state.x, POSITION_SCALE),
    z: round(state.z, POSITION_SCALE),
    heading: round(wrapAngle(state.heading), HEADING_SCALE),
    vx: round(state.vx, VELOCITY_SCALE),
    vz: round(state.vz, VELOCITY_SCALE),
  };
}
