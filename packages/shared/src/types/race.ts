/**
 * Phases d'un salon :
 * lobby → (l'hôte lance) → countdown → racing → results → lobby...
 */
export type RacePhase = "lobby" | "countdown" | "racing" | "results";

/** Infos de course envoyées dans chaque snapshot (elles changent souvent : décompte...). */
export interface RaceInfo {
  phase: RacePhase;
  /** Pas de simulation restants avant la fin de la phase, ou null si elle n'a pas de durée. */
  ticksLeft: number | null;
  totalLaps: number;
}

/** Une ligne du classement final. */
export interface ResultEntry {
  id: string;
  name: string;
  rank: number;
  /** Temps de course en ms, ou null si le joueur n'a pas fini (DNF). */
  timeMs: number | null;
}

export interface RoomPlayerInfo {
  id: string;
  name: string;
  /** Arrivé pendant une course : il regarde et jouera à la suivante. */
  spectator: boolean;
}

/** État du salon, envoyé seulement quand il change (arrivée, départ, changement de phase). */
export interface RoomState {
  code: string;
  hostId: string | null;
  phase: RacePhase;
  totalLaps: number;
  players: RoomPlayerInfo[];
  /** Classement de la dernière course (rempli pendant la phase results). */
  results: ResultEntry[] | null;
}

/**
 * La voiture est-elle bloquée ? Règle PARTAGÉE : le client doit la connaître pour
 * prédire exactement comme le serveur (une voiture bloquée ne bouge pas).
 */
export function isCarFrozen(phase: RacePhase, spectator: boolean): boolean {
  return phase === "countdown" || (spectator && phase === "racing");
}
