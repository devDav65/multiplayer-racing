import { createServer } from "node:http";
import express from "express";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@racing/shared";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: Date.now() });
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

io.on("connection", (socket) => {
  console.log(`[+] ${socket.id} connecté (${io.engine.clientsCount} connexion(s))`);

  socket.emit("welcome", { playerId: socket.id, serverTime: Date.now() });

  socket.on("ping", (ack) => {
    // Les types TypeScript n'existent plus à l'exécution : un client modifié
    // peut envoyer "ping" sans callback. On vérifie donc avant d'appeler.
    if (typeof ack === "function") {
      ack(Date.now());
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[-] ${socket.id} déconnecté (${reason})`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});