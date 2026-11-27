import type { JoinRoomResult } from "@racing/shared";
import { useGameStore } from "../store/gameStore";
import { socket } from "./socket";

/** Code du salon où l'on est (ou qu'on vient de rejoindre). */
let currentCode: string | null = null;

/** Un roomState concerne-t-il notre salon ? (sinon : message en retard d'un salon quitté) */
export function isCurrentRoom(code: string): boolean {
  return code === currentCode;
}

/** Délai max d'attente d'une réponse du serveur. */
const ACK_TIMEOUT_MS = 5000;

async function request(send: () => Promise<JoinRoomResult>): Promise<JoinRoomResult> {
  if (!socket.connected) return { ok: false, error: "Pas de connexion au serveur." };
  try {
    const result = await send();
    if (result.ok) {
      currentCode = result.code;
      useGameStore.setState({ room: result.state });
    }
    return result;
  } catch {
    return { ok: false, error: "Le serveur ne répond pas." };
  }
}

export function createRoom(name: string): Promise<JoinRoomResult> {
  return request(() => socket.timeout(ACK_TIMEOUT_MS).emitWithAck("createRoom", { name }));
}

export function joinRoom(code: string, name: string): Promise<JoinRoomResult> {
  return request(() => socket.timeout(ACK_TIMEOUT_MS).emitWithAck("joinRoom", { code, name }));
}

export function leaveRoom(): void {
  currentCode = null;
  socket.emit("leaveRoom");
  useGameStore.setState({ room: null, race: null, me: null, racerCount: 0 });
}

export function startRace(): void {
  socket.emit("startRace");
}
