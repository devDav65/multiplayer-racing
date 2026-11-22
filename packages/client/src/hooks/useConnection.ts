import { useEffect, useState } from "react";
import { socket } from "../network/socket";

export interface ConnectionState {
  connected: boolean;
  playerId: string | null;
  pingMs: number | null;
}

const PING_INTERVAL_MS = 2000;

export function useConnection(): ConnectionState {
  const [state, setState] = useState<ConnectionState>({
    connected: false,
    playerId: null,
    pingMs: null,
  });

  useEffect(() => {
    const onConnect = () => setState((s) => ({ ...s, connected: true }));
    const onDisconnect = () =>
      setState({ connected: false, playerId: null, pingMs: null });
    const onWelcome = ({ playerId }: { playerId: string }) =>
      setState((s) => ({ ...s, playerId }));

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("welcome", onWelcome);
    socket.connect();

    const interval = setInterval(() => {
      if (!socket.connected) return;
      const start = performance.now();
      socket.emit("ping", () => {
        const rtt = Math.round(performance.now() - start);
        setState((s) => ({ ...s, pingMs: rtt }));
      });
    }, PING_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("welcome", onWelcome);
      socket.disconnect();
    };
  }, []);

  return state;
}