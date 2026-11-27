import type { Track } from "../tracks/track";
import { wrapAt } from "../utils";
import type { CarControls, CarState } from "./car";

/** Nombre d'échantillons de ligne centrale visés devant la voiture. */
const LOOKAHEAD = 5;

/**
 * Pilote automatique très simple : vise un point de la ligne centrale un peu devant
 * et ralentit dans les virages serrés. Sert aux tests (faire de vrais tours) et
 * plus tard aux bots de test de charge. Ce n'est PAS une IA de course.
 */
export function autopilot(track: Track, car: CarState): CarControls {
  // Échantillon le plus proche de la voiture.
  let nearest = 0;
  let best = Infinity;
  for (let i = 0; i < track.points.length; i++) {
    const p = wrapAt(track.points, i);
    const d = (p.x - car.x) ** 2 + (p.z - car.z) ** 2;
    if (d < best) {
      best = d;
      nearest = i;
    }
  }
  const target = wrapAt(track.points, nearest + LOOKAHEAD);
  // Cap qui pointerait vers la cible (même convention que la voiture : forward = (-sin, -cos)).
  const wanted = Math.atan2(-(target.x - car.x), -(target.z - car.z));
  const diff = Math.atan2(Math.sin(wanted - car.heading), Math.cos(wanted - car.heading));
  // diff > 0 : il faut tourner à gauche, donc steer négatif.
  const steer = Math.max(-1, Math.min(1, -diff * 3));
  const speed = Math.hypot(car.vx, car.vz);
  const sharp = Math.abs(diff) > 0.25 && speed > 18;
  return { throttle: sharp ? -0.4 : 1, steer, brake: 0, handbrake: false };
}
