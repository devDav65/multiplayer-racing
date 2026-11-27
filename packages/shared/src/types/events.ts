import type { PlayerInput } from "./input";
import type { RoomState } from "./race";
import type { Snapshot } from "./snapshot";

/** Réponse à une demande de création ou d'entrée dans un salon. */
export type JoinRoomResult =
  | { ok: true; code: string; state: RoomState }
  | { ok: false; error: string };

/** Événements envoyés PAR le serveur VERS le client. */
export interface ServerToClientEvents {
  /** Envoyé une seule fois, juste après la connexion. */
  welcome: (payload: { playerId: string; serverTime: number }) => void;
  /** État de toutes les voitures du salon, 20 fois par seconde. */
  snapshot: (snapshot: Snapshot) => void;
  /** État du salon (joueurs, hôte, phase, résultats), à chaque changement. */
  roomState: (state: RoomState) => void;
}

/** Événements envoyés PAR le client VERS le serveur. */
export interface ClientToServerEvents {
  /** Mesure de latence : le serveur répond en appelant `ack` avec son heure. */
  ping: (ack: (serverTime: number) => void) => void;
  /** Crée un salon et y entre comme hôte. */
  createRoom: (payload: { name: string }, ack: (result: JoinRoomResult) => void) => void;
  /** Entre dans un salon existant grâce à son code. */
  joinRoom: (
    payload: { code: string; name: string },
    ack: (result: JoinRoomResult) => void,
  ) => void;
  /** Quitte le salon actuel. */
  leaveRoom: () => void;
  /** Lance la course (hôte uniquement, depuis le lobby). */
  startRace: () => void;
  /** Les touches du joueur. Jamais une position. */
  input: (input: PlayerInput) => void;
}
