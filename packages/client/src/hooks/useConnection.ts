import type { RoomState } from "@racing/shared";
import { useEffect } from "react";
import { loadAccount } from "../network/accountApi";
import { isCurrentRoom } from "../network/roomApi";
import { socket } from "../network/socket";
import { useGameStore } from "../store/gameStore";

const PING_INTERVAL_MS = 2000;

/**
 * Connexion au serveur, ping et état du salon, recopiés dans le store.
 * À monter une seule fois, en haut de l'application.
 */
export function useConnection(): void {
  useEffect(() => {
    const onConnect = () => useGameStore.setState({ connected: true });
    // Déconnecté = le serveur nous a retirés du salon : retour à l'accueil.
    const onDisconnect = () =>
      useGameStore.setState({
        connected: false,
        playerId: null,
        pingMs: null,
        room: null,
        race: null,
        me: null,
      });
    const onWelcome = ({ playerId }: { playerId: string }) => useGameStore.setState({ playerId });
    const onRoomState = (state: RoomState) => {
      // Ignore un état arrivé après qu'on a quitté ce salon.
      if (isCurrentRoom(state.code)) useGameStore.setState({ room: state });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("welcome", onWelcome);
    socket.on("roomState", onRoomState);
    socket.connect();
    void loadAccount();

    const interval = setInterval(() => {
      if (!socket.connected) return;
      const start = performance.now();
      socket.emit("ping", () => {
        useGameStore.setState({ pingMs: Math.round(performance.now() - start) });
      });
    }, PING_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("welcome", onWelcome);
      socket.off("roomState", onRoomState);
      socket.disconnect();
    };
  }, []);
}
