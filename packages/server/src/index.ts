import { createServer } from "node:http";
import {
  buildTrack,
  CIRCUIT_1,
  type ClientToServerEvents,
  type JoinRoomResult,
  type ServerToClientEvents,
} from "@racing/shared";
import { Server } from "socket.io";
import { AuthService } from "./auth/AuthService";
import { loadConfig, loadEnvFile } from "./config";
import { runMigrations } from "./db/migrate";
import { createPool } from "./db/pool";
import { createHttpApp } from "./http/app";
import { playerInputSchema } from "./network/inputSchema";
import { RateLimiter } from "./network/RateLimiter";
import { createRoomSchema, joinRoomSchema } from "./network/roomSchemas";
import { Room } from "./rooms/Room";
import { RoomManager } from "./rooms/RoomManager";

loadEnvFile();
const config = loadConfig();

// Base de données optionnelle : sans elle, le jeu marche en mode invité.
const pool = config.DATABASE_URL ? createPool(config.DATABASE_URL) : null;
if (pool) {
  const applied = await runMigrations(pool);
  console.log(
    `[db] connectée${applied.length ? `, migrations appliquées : ${applied.join(", ")}` : ""}`,
  );
} else {
  console.warn("[db] DATABASE_URL absent : comptes et statistiques désactivés");
}

/** Inputs : 60/s attendus, rafales tolérées (gigue réseau). Au-delà : ignorés. */
const INPUT_BURST = 30;
const INPUT_PER_SECOND = 75;
/** Messages de contrôle (salons, départ, ping) : quelques-uns par seconde suffisent. */
const CONTROL_BURST = 5;
const CONTROL_PER_SECOND = 2;

const auth = pool ? new AuthService(pool) : null;
if (auth) {
  // Ménage régulier des sessions expirées (elles sont de toute façon refusées).
  const purge = () =>
    auth.purgeExpiredSessions().catch((e: Error) => console.error("[db] purge :", e.message));
  void purge();
  setInterval(purge, 60 * 60 * 1000).unref();
}

const app = createHttpApp({
  auth,
  clientOrigin: config.CLIENT_ORIGIN,
  secureCookies: config.NODE_ENV === "production",
  trustProxy: config.TRUST_PROXY,
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: config.CLIENT_ORIGIN },
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
      laps: config.RACE_LAPS,
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

httpServer.listen(config.PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${config.PORT}`);
});
