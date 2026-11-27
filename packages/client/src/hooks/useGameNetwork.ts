import type { Snapshot } from "@racing/shared";
import { useEffect } from "react";
import { clearSnapshots, pushSnapshot } from "../network/snapshotBuffer";
import { socket } from "../network/socket";
import { updateRaceStatus } from "../store/gameStore";

/** Mémorise les snapshots reçus et en extrait les infos de course pour le HUD. */
export function useGameNetwork(): void {
  useEffect(() => {
    const onSnapshot = (snapshot: Snapshot) => {
      pushSnapshot(snapshot);
      const mine = snapshot.cars.find((c) => c.id === socket.id);
      const me = mine
        ? { lap: mine.lap, rank: mine.rank, finished: mine.finished, spectator: mine.spectator }
        : null;
      updateRaceStatus(snapshot.race, me, snapshot.cars.filter((c) => !c.spectator).length);
    };
    socket.on("snapshot", onSnapshot);

    return () => {
      socket.off("snapshot", onSnapshot);
      clearSnapshots();
    };
  }, []);
}
