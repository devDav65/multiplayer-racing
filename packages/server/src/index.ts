import { createServer } from "node:http";
import {
  buildTrack,
  CIRCUIT_1,
  type ClientToServerEvents,
  type JoinRoomResult,
  type ServerToClientEvents,
} from "@racing/shared";
import express from "express";
import { Server } from "socket.io";
import { playerInputSchema } from "./network/inputSchema";
import { RateLimiter } from "./network/RateLimiter";
import { createRoomSchema, joinRoomSchema } from "./network/roomSchemas";
import { Room } from "./rooms/Room";
import { RoomManager } from "./rooms/RoomManager";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
/** Nombre de tours (1 à 10), surtout utile en développement pour des courses courtes. */
const lapsEnv = Number(process.env.RACE_LAPS);
const LAPS = Number.isInteger(lapsEnv) && lapsEnv >= 1 && lapsEnv <= 10 ? lapsEnv : undefined;

/** Inputs : 60/s attendus, rafales tolérées (gigue réseau). Au-delà : ignorés. */
const INPUT_BURST = 30;
const INPUT_PER_SECOND = 75;
/** Messages de contrôle (salons, départ, ping) : quelques-uns par seconde suffisent. */
const CONTROL_BURST = 5;
const CONTROL_PER_SECOND = 2;

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: Date.now() });
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
  // Nos messages font quelques centaines d'octets : inutile d'accepter 1 Mo (défaut).
  maxHttpBufferSize: 16 * 1024,
});

const track = buildTrack(CIRCUIT_1);
/** Canal Socket.IO d'un salon. */
const channel = (code: string) => `room:${code}`;

// Les Room ignorent Socket.IO : la diffusion passe par ces callbacks.
const rooms = new RoomManager(
  (code) =>
    new Room({
      code,
      track,
      laps: LAPS,
      // volatile : si un client est en retard, ce snapshot est abandonné plutôt qu'empilé.
      onSnapshot: (snapshot) => io.to(channel(code)).volatile.emit("snapshot", snapshot),
      onRoomState: (state) => io.to(channel(code)).emit("roomState", state),
    }),
);

io.on("connection", (socket) => {
  console.log(`[+] ${socket.id} connecté`);
  socket.emit("welcome", { playerId: socket.id, serverTime: Date.now() });

  const inputLimiter = new RateLimiter(INPUT_BURST, INPUT_PER_SECOND);
  const controlLimiter = new RateLimiter(CONTROL_BURST, CONTROL_PER_SECOND);

  /** Réponse commune à createRoom / joinRoom. */
  const afterJoin = (result: JoinRoomResult, ack: unknown) => {
    if (result.ok) {
      // Les canaux Socket.IO suivent le salon du joueur.
      for (const name of socket.rooms) if (name !== socket.id) void socket.leave(name);
      void socket.join(channel(result.code));
      // L'état initial du salon voyage dans la réponse (result.state) : pas de course
      // entre un roomState et l'ack.
      console.log(`[>] ${socket.id} dans le salon ${result.code}`);
    }
    if (typeof ack === "function") ack(result);
  };

  socket.on("createRoom", (raw, ack) => {
    if (!controlLimiter.tryConsume()) return;
    const parsed = createRoomSchema.safeParse(raw);
    if (!parsed.success) return afterJoin({ ok: false, error: "Pseudo invalide." }, ack);
    afterJoin(rooms.create(socket.id, parsed.data.name), ack);
  });

  socket.on("joinRoom", (raw, ack) => {
    if (!controlLimiter.tryConsume()) return;
    const parsed = joinRoomSchema.safeParse(raw);
    if (!parsed.success) return afterJoin({ ok: false, error: "Pseudo ou code invalide." }, ack);
    afterJoin(rooms.join(socket.id, parsed.data.code, parsed.data.name), ack);
  });

  socket.on("leaveRoom", () => {
    if (!controlLimiter.tryConsume()) return;
    const room = rooms.leave(socket.id);
    if (room) void socket.leave(channel(room.code));
  });

  socket.on("startRace", () => {
    if (!controlLimiter.tryConsume()) return;
    rooms.roomOf(socket.id)?.startRace(socket.id);
  });

  socket.on("ping", (ack) => {
    if (!controlLimiter.tryConsume()) return;
    if (typeof ack === "function") ack(Date.now());
  });

  socket.on("input", (raw) => {
    if (!inputLimiter.tryConsume()) return;
    // `raw` est typé PlayerInput, mais ce n'est qu'une promesse de TypeScript :
    // à l'exécution, c'est ce que le client a décidé d'envoyer.
    const parsed = playerInputSchema.safeParse(raw);
    if (!parsed.success) return;
    rooms.roomOf(socket.id)?.applyInput(socket.id, parsed.data);
  });

  socket.on("disconnect", (reason) => {
    rooms.leave(socket.id);
    console.log(`[-] ${socket.id} déconnecté (${reason}, ${rooms.roomCount} salon(s))`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
