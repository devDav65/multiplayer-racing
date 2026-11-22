/** Événements envoyés PAR le serveur VERS le client. */
export interface ServerToClientEvents {
  /** Envoyé une seule fois, juste après la connexion. */
  welcome: (payload: { playerId: string; serverTime: number }) => void;
}

/** Événements envoyés PAR le client VERS le serveur. */
export interface ClientToServerEvents {
  /** Mesure de latence : le serveur répond en appelant `ack` avec son heure. */
  ping: (ack: (serverTime: number) => void) => void;
}