import { createServer } from "node:http";
import {
  buildTrack,
  CIRCUIT_1,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@racing/shared";
import express from "express";
import { Server } from "socket.io";
import { playerInputSchema } from "./network/inputSchema";
import { Room } from "./rooms/Room";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const ROOM_ID = "main";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: Date.now() });
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

// Un seul salon pour l'instant. La diffusion est un callback : Room ignore Socket.IO.
const room = new Room(buildTrack(CIRCUIT_1), (snapshot) => {
  // volatile : si un client est en retard, ce snapshot est abandonné plutôt qu'empilé.
  io.to(ROOM_ID).volatile.emit("snapshot", snapshot);
});

io.on("connection", (socket) => {
  if (!room.addPlayer(socket.id)) {
    console.log(`[x] ${socket.id} refusé : salon plein`);
    socket.disconnect(true);
    return;
  }
  void socket.join(ROOM_ID);
  console.log(`[+] ${socket.id} connecté (${room.playerCount} joueur(s))`);

  socket.emit("welcome", { playerId: socket.id, serverTime: Date.now() });

  socket.on("ping", (ack) => {
    if (typeof ack === "function") {
      ack(Date.now());
    }
  });

  socket.on("input", (raw) => {
    // `raw` est typé PlayerInput, mais ce n'est qu'une promesse de TypeScript :
    // à l'exécution, c'est ce que le client a décidé d'envoyer.
    const parsed = playerInputSchema.safeParse(raw);
    if (!parsed.success) return;
    room.applyInput(socket.id, parsed.data);
  });

  socket.on("disconnect", (reason) => {
    room.removePlayer(socket.id);
    console.log(`[-] ${socket.id} déconnecté (${reason}, ${room.playerCount} joueur(s))`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
