import { useEffect } from "react";
import { INPUT_SEND_RATE, type CarControls, type Snapshot } from "@racing/shared";
import { gameState } from "../network/gameState";
import { socket } from "../network/socket";

/** Envoie les touches au serveur et mémorise les snapshots reçus. */
export function useGameNetwork(readControls: () => CarControls): void {
  useEffect(() => {
    let seq = 0;

    const onSnapshot = (snapshot: Snapshot) => {
      gameState.snapshot = snapshot;
    };
    socket.on("snapshot", onSnapshot);

    const interval = setInterval(() => {
      if (!socket.connected) return;
      seq += 1;
      socket.emit("input", { seq, ...readControls() });
    }, 1000 / INPUT_SEND_RATE);

    return () => {
      clearInterval(interval);
      socket.off("snapshot", onSnapshot);
      gameState.snapshot = null;
    };
  }, [readControls]);
}