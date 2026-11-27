import type { RacePhase } from "../types/race";
import type { CarSnapshot, Snapshot } from "../types/snapshot";

/**
 * FORMAT RÉSEAU COMPACT DES SNAPSHOTS
 *
 * En JSON, un objet répète le nom de chaque champ pour chaque voiture, 20 fois par
 * seconde, pour chaque joueur : la plus grosse partie du message. Ici, une voiture est
 * un simple tableau, et le joueur est désigné par un petit numéro (netId) au lieu de son
 * identifiant Socket.IO de 20 caractères. Le client retrouve l'identifiant grâce à la
 * liste des joueurs du salon (roomState).
 *
 * Les nombres, déjà quantifiés par la simulation (voir sim/quantize.ts), passent tels
 * quels : l'encodage est SANS PERTE.
 */

/** [netId, x, z, heading, vx, vz, lastInputSeq, lap, rank, drapeaux] */
export type WireCar = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface WireSnapshot {
  /** tick */
  t: number;
  /** heure serveur (ms) */
  s: number;
  /** phase (index dans PHASES) */
  p: number;
  /** ticks restants dans la phase, -1 si aucun */
  l: number;
  /** nombre de tours */
  n: number;
  c: WireCar[];
}

const PHASES: readonly RacePhase[] = ["lobby", "countdown", "racing", "results"];
const FINISHED = 1;
const SPECTATOR = 2;

export function encodeSnapshot(snapshot: Snapshot): WireSnapshot {
  return {
    t: snapshot.tick,
    s: snapshot.serverTime,
    p: PHASES.indexOf(snapshot.race.phase),
    l: snapshot.race.ticksLeft ?? -1,
    n: snapshot.race.totalLaps,
    c: snapshot.cars.map((car) => [
      car.netId,
      car.x,
      car.z,
      car.heading,
      car.vx,
      car.vz,
      car.lastInputSeq,
      car.lap,
      car.rank,
      (car.finished ? FINISHED : 0) | (car.spectator ? SPECTATOR : 0),
    ]),
  };
}

/**
 * Reconstruit un Snapshot. `idOf` traduit un netId en identifiant de joueur ; une voiture
 * dont le joueur est inconnu (roomState pas encore reçu) est ignorée pour ce snapshot.
 */
export function decodeSnapshot(
  wire: WireSnapshot,
  idOf: (netId: number) => string | undefined,
): Snapshot {
  const cars: CarSnapshot[] = [];
  for (const [netId, x, z, heading, vx, vz, lastInputSeq, lap, rank, flags] of wire.c) {
    const id = idOf(netId);
    if (id === undefined) continue;
    cars.push({
      id,
      netId,
      x,
      z,
      heading,
      vx,
      vz,
      lastInputSeq,
      lap,
      rank,
      finished: (flags & FINISHED) !== 0,
      spectator: (flags & SPECTATOR) !== 0,
    });
  }
  return {
    tick: wire.t,
    serverTime: wire.s,
    race: {
      phase: PHASES[wire.p] ?? "lobby",
      ticksLeft: wire.l < 0 ? null : wire.l,
      totalLaps: wire.n,
    },
    cars,
  };
}
