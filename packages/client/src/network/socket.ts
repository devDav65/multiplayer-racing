import type { ClientToServerEvents, ServerToClientEvents } from "@racing/shared";
import { io, type Socket } from "socket.io-client";

/**
 * Par défaut, même origine que la page : le proxy de Vite (développement) ou Caddy
 * (production) transmet /socket.io au serveur. VITE_SERVER_URL permet de forcer une URL.
 */
const SERVER_URL = import.meta.env.VITE_SERVER_URL as string | undefined;

const options = { autoConnect: false } as const;

/** Instance unique de connexion. `autoConnect: false` : on se connecte nous-mêmes. */
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = SERVER_URL
  ? io(SERVER_URL, options)
  : io(options);

/**
 * Reconnecte le socket, pour que le serveur relise le cookie de session après une
 * connexion ou une déconnexion du compte.
 */
export function reconnectSocket(): void {
  socket.disconnect();
  socket.connect();
}
