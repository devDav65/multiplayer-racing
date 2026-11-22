import type { CarControls, PlayerInput } from "@racing/shared";
import { socket } from "./socket";

let nextSeq = 1;

/**
 * Envoie UN input au serveur. À appeler exactement une fois par pas de simulation (60 Hz).
 * Renvoie l'input numéroté, ou null si la connexion n'est pas prête. On ne passe PAS par
 * la file d'attente de Socket.IO hors connexion : elle renverrait une rafale à la reconnexion.
 */
export function sendInput(controls: CarControls): PlayerInput | null {
  if (!socket.connected) return null;
  const input: PlayerInput = { seq: nextSeq++, ...controls };
  socket.emit("input", input);
  return input;
}