import type { PlayerInput } from "./input";
import type { Snapshot } from "./snapshot";

/** Événements envoyés PAR le serveur VERS le client. */
export interface ServerToClientEvents {
  /** Envoyé une seule fois, juste après la connexion. */
  welcome: (payload: { playerId: string; serverTime: number }) => void;
  /** État de toutes les voitures, 20 fois par seconde. */
  snapshot: (snapshot: Snapshot) => void;
}

/** Événements envoyés PAR le client VERS le serveur. */
export interface ClientToServerEvents {
  /** Mesure de latence : le serveur répond en appelant `ack` avec son heure. */
  ping: (ack: (serverTime: number) => void) => void;
  /** Les touches du joueur. Jamais une position. */
  input: (input: PlayerInput) => void;
}
