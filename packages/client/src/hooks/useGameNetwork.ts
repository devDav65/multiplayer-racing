import { useEffect } from "react";
import { INPUT_SEND_RATE, type CarControls, type Snapshot } from "@racing/shared";
import { socket } from "../network/socket";
import { clearSnapshots, pushSnapshot } from "../network/snapshotBuffer";

/** Envoie les touches au serveur et mémorise les snapshots reçus. */
export function useGameNetwork(readControls: () => CarControls): void {
  useEffect(() => {
    let seq = 0;

    const onSnapshot = (snapshot: Snapshot) => {
      pushSnapshot(snapshot);
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
      clearSnapshots();
    };
  }, [readControls]);
}