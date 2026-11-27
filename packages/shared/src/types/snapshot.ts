/** État d'une voiture tel que le serveur le communique aux clients. */
export interface CarSnapshot {
  id: string;
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  /**
   * Numéro du dernier input de CE joueur déjà pris en compte par le serveur.
   * Inutile pour l'instant : il servira à la prédiction côté client (étape 4C).
   */
  lastInputSeq: number;
}

/** Photo de l'état du jeu à un instant donné, envoyée à 20 Hz. */
export interface Snapshot {
  /** Numéro du pas de simulation du serveur. */
  tick: number;
  /** Heure du serveur au moment de la photo (ms). */
  serverTime: number;
  cars: CarSnapshot[];
}
