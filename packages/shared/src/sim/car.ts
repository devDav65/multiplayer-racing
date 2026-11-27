import { SIM_DT } from "../constants";
import type { PlayerInput } from "../types/input";

/** Les contrôles qui influencent la voiture (un PlayerInput sans le numéro d'ordre). */
export type CarControls = Pick<PlayerInput, "throttle" | "steer" | "brake" | "handbrake">;

/** État complet d'une voiture. Unités : mètres, secondes, radians. */
export interface CarState {
  x: number;
  z: number;
  /** Direction du nez de la voiture. 0 = vers -Z. Augmente en tournant à gauche. */
  heading: number;
  /** Vitesse dans le repère du monde, en m/s. */
  vx: number;
  vz: number;
}

/** Réglages de conduite. Ce sont les « boutons » à tourner pour changer la sensation. */
export const CAR_PARAMS = {
  engineAccel: 24, // poussée du moteur (m/s²)
  reverseAccel: 10, // poussée en marche arrière
  maxReverseSpeed: 12, // vitesse max en marche arrière (m/s)
  maxSpeed: 55, // sert à réduire la poussée quand on approche de la limite
  brakeDecel: 35, // force de freinage (m/s²)
  handbrakeDecel: 6, // ralentissement du frein à main
  drag: 0.15, // résistance de l'air (proportionnelle à la vitesse)
  rollingResistance: 2, // ralentissement quand on lâche le gaz (m/s²)
  grip: 9, // adhérence latérale normale (plus haut = colle à la route)
  handbrakeGrip: 1.2, // adhérence avec le frein à main (la voiture glisse)
  maxTurnRate: 2.2, // vitesse de rotation max du volant (rad/s)
  handbrakeTurnBoost: 1.35, // la voiture pivote plus facilement frein à main tiré
} as const;

export function createCarState(x = 0, z = 0, heading = 0): CarState {
  return { x, z, heading, vx: 0, vz: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Remplace NaN et Infinity par 0 : une valeur invalide corromprait l'état pour toujours. */
function safe(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Rapproche `value` de `target` d'au plus `maxDelta`, sans jamais dépasser la cible. */
function moveToward(value: number, target: number, maxDelta: number): number {
  if (Math.abs(target - value) <= maxDelta) return target;
  return value + Math.sign(target - value) * maxDelta;
}

/**
 * Avance la voiture d'un pas de temps `dt`.
 * Fonction PURE : ne modifie pas `state`, renvoie un nouvel état.
 */
export function stepCar(state: CarState, controls: CarControls, dt: number = SIM_DT): CarState {
  const p = CAR_PARAMS;

  // On ne fait jamais confiance aux valeurs reçues : on les borne.
  const throttle = clamp(safe(controls.throttle), -1, 1);
  const steer = clamp(safe(controls.steer), -1, 1);
  const brake = clamp(safe(controls.brake), 0, 1);
  const handbrake = controls.handbrake === true;

  // 1) Vitesse avant actuelle, avec l'ancien cap.
  const f0x = -Math.sin(state.heading);
  const f0z = -Math.cos(state.heading);
  const forwardSpeed0 = state.vx * f0x + state.vz * f0z;

  // 2) Rotation : impossible de tourner à l'arrêt, plus dur à haute vitesse,
  //    et le volant s'inverse en marche arrière.
  const speedFactor = clamp(Math.abs(forwardSpeed0) / 3, 0, 1);
  const highSpeedFactor = 1 - 0.55 * clamp(Math.abs(forwardSpeed0) / p.maxSpeed, 0, 1);
  const direction = forwardSpeed0 >= 0 ? 1 : -1;
  const turnRate = p.maxTurnRate * (handbrake ? p.handbrakeTurnBoost : 1);
  const heading = state.heading - steer * turnRate * speedFactor * highSpeedFactor * direction * dt;

  // 3) Nouveau repère de la voiture : f = « devant », r = « à droite ».
  const fx = -Math.sin(heading);
  const fz = -Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);

  // La vitesse (qui n'a pas encore tourné) se décompose maintenant avec le nouveau cap :
  // si la voiture a pivoté, une partie de sa vitesse devient latérale (= elle dérape).
  let vF = state.vx * fx + state.vz * fz;
  let vL = state.vx * rx + state.vz * rz;

  // 4) Forces longitudinales.
  let brakeAmount = brake;
  if (throttle > 0) {
    vF += throttle * p.engineAccel * (1 - clamp(vF / p.maxSpeed, 0, 1)) * dt;
  } else if (throttle < 0) {
    if (vF > 0.5) {
      brakeAmount = Math.max(brakeAmount, -throttle); // « S » en avançant = freiner
    } else if (vF > -p.maxReverseSpeed) {
      vF += throttle * p.reverseAccel * dt; // throttle est négatif : on recule
    }
  } else {
    vF = moveToward(vF, 0, p.rollingResistance * dt);
  }
  if (brakeAmount > 0) vF = moveToward(vF, 0, p.brakeDecel * brakeAmount * dt);
  if (handbrake) vF = moveToward(vF, 0, p.handbrakeDecel * dt);
  vF -= vF * p.drag * dt;

  // 5) Adhérence latérale : la vitesse de glissement décroît exponentiellement.
  //    exp(-k·dt) donne le même résultat quel que soit dt (contrairement à vL *= 0.9).
  vL *= Math.exp(-(handbrake ? p.handbrakeGrip : p.grip) * dt);

  // 6) Retour au repère du monde, puis déplacement.
  const vx = fx * vF + rx * vL;
  const vz = fz * vF + rz * vL;

  return { x: state.x + vx * dt, z: state.z + vz * dt, heading, vx, vz };
}
