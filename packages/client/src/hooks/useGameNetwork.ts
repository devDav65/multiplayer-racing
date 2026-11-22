import { useEffect } from "react";
import type { Snapshot } from "@racing/shared";
import { socket } from "../network/socket";
import { clearSnapshots, pushSnapshot } from "../network/snapshotBuffer";

/** Mémorise les snapshots reçus du serveur. */
export function useGameNetwork(): void {
  useEffect(() => {
    const onSnapshot = (snapshot: Snapshot) => {
      pushSnapshot(snapshot);
    };
    socket.on("snapshot", onSnapshot);

    return () => {
      socket.off("snapshot", onSnapshot);
      clearSnapshots();
    };
  }, []);
}