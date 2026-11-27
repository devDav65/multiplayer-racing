import type { RaceInfo, RoomState } from "@racing/shared";
import { create } from "zustand";

/** Ce que le HUD affiche de MA voiture. Mis à jour seulement quand ça change. */
export interface MyRaceStatus {
  lap: number;
  rank: number;
  finished: boolean;
  spectator: boolean;
}

/**
 * État « lent » de l'interface : connexion, salon, phase, tour, position...
 * Ce qui change à chaque image (positions des voitures, vitesse) n'y est PAS :
 * le mettre dans React provoquerait 60 rendus par seconde. Ça reste dans des refs.
 */
interface GameStore {
  connected: boolean;
  playerId: string | null;
  pingMs: number | null;
  /** Salon actuel, ou null si on est sur l'écran d'accueil. */
  room: RoomState | null;
  race: RaceInfo | null;
  me: MyRaceStatus | null;
  /** Nombre de coureurs (pour « position 3/8 »). */
  racerCount: number;
}

export const useGameStore = create<GameStore>(() => ({
  connected: false,
  playerId: null,
  pingMs: null,
  room: null,
  race: null,
  me: null,
  racerCount: 0,
}));

const sameRace = (a: RaceInfo | null, b: RaceInfo | null) =>
  a === b ||
  (!!a && !!b && a.phase === b.phase && a.ticksLeft === b.ticksLeft && a.totalLaps === b.totalLaps);

const sameMe = (a: MyRaceStatus | null, b: MyRaceStatus | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.lap === b.lap &&
    a.rank === b.rank &&
    a.finished === b.finished &&
    a.spectator === b.spectator);

/**
 * Met à jour les infos de course à partir d'un snapshot (20 Hz), sans provoquer
 * de rendu React quand rien de visible n'a changé.
 */
export function updateRaceStatus(race: RaceInfo, me: MyRaceStatus | null, racerCount: number) {
  const s = useGameStore.getState();
  const next: Partial<GameStore> = {};
  if (!sameRace(s.race, race)) next.race = race;
  if (!sameMe(s.me, me)) next.me = me;
  if (s.racerCount !== racerCount) next.racerCount = racerCount;
  if (Object.keys(next).length > 0) useGameStore.setState(next);
}
