import { decodeSnapshot, type WireSnapshot } from "@racing/shared";
import { useEffect } from "react";
import { clearSnapshots, pushSnapshot } from "../network/snapshotBuffer";
import { socket } from "../network/socket";
import { updateRaceStatus, useGameStore } from "../store/gameStore";

/** Mémorise les snapshots reçus et en extrait les infos de course pour le HUD. */
export function useGameNetwork(): void {
  useEffect(() => {
    const onSnapshot = (wire: WireSnapshot) => {
      // netId → identifiant du joueur, grâce à la liste des joueurs du salon.
      const players = useGameStore.getState().room?.players ?? [];
      const snapshot = decodeSnapshot(wire, (netId) => players.find((p) => p.netId === netId)?.id);
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
