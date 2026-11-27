import type { RaceInfo } from "./race";

/** État d'une voiture tel que le serveur le communique aux clients. */
export interface CarSnapshot {
  id: string;
  /** Petit numéro du joueur dans son salon : c'est lui qui circule sur le réseau (voir net/). */
  netId: number;
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  /** Numéro du dernier input de CE joueur déjà exécuté par le serveur (réconciliation). */
  lastInputSeq: number;
  /** Tour en cours (1 à totalLaps). */
  lap: number;
  /** Position dans la course (1 = premier), 0 hors course (lobby, spectateur). */
  rank: number;
  /** A franchi la ligne d'arrivée du dernier tour. */
  finished: boolean;
  /** Spectateur : voiture bloquée et cachée jusqu'à la prochaine course. */
  spectator: boolean;
}

/** Photo de l'état du jeu à un instant donné, envoyée à 20 Hz. */
export interface Snapshot {
  /** Numéro du pas de simulation du serveur. */
  tick: number;
  /** Heure du serveur au moment de la photo (ms). */
  serverTime: number;
  race: RaceInfo;
  cars: CarSnapshot[];
}
