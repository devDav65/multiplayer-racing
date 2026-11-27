/**
 * Test de charge : N bots dans un même salon, qui conduisent à l'autopilote avec la même
 * prédiction/réconciliation que le vrai client.
 *
 *   pnpm --filter @racing/client loadtest -- --bots 20 --seconds 40 --url http://localhost:3001
 *
 * Mesure : octets reçus par client et par seconde, corrections de prédiction, latence (ping).
 */
import { parseArgs } from "node:util";
import {
  autopilot,
  buildTrack,
  CIRCUIT_1,
  decodeSnapshot,
  isCarFrozen,
  type JoinRoomResult,
  type RoomPlayerInfo,
  type RoomState,
  SIM_DT,
  type Snapshot,
  type WireSnapshot,
} from "@racing/shared";
import { io, type Socket } from "socket.io-client";
import { Predictor } from "../src/network/prediction";

const { values } = parseArgs({
  options: {
    bots: { type: "string", default: "20" },
    seconds: { type: "string", default: "30" },
    url: { type: "string", default: "http://localhost:3001" },
  },
});
const BOTS = Number(values.bots);
const SECONDS = Number(values.seconds);
const URL = values.url;
const track = buildTrack(CIRCUIT_1);

interface BotStats {
  bytes: number;
  snapshots: number;
  corrections: number;
  maxCorrectionCm: number;
  pings: number[];
}

function startBot(index: number) {
  const socket: Socket = io(URL, { transports: ["websocket"], forceNew: true });
  const predictor = new Predictor(track);
  const stats: BotStats = { bytes: 0, snapshots: 0, corrections: 0, maxCorrectionCm: 0, pings: [] };
  let latest: Snapshot | null = null;
  let reconciled: Snapshot | null = null;
  let seq = 0;
  let start = 0;

  // Taille réelle des messages reçus (trame WebSocket), pas une estimation.
  socket.io.on("open", () => {
    socket.io.engine.on("packet", (packet: { data?: unknown }) => {
      if (typeof packet.data === "string") stats.bytes += packet.data.length;
    });
  });
  let players: RoomPlayerInfo[] = [];
  socket.on("roomState", (state: RoomState) => {
    players = state.players;
  });
  socket.on("snapshot", (wire: WireSnapshot) => {
    latest = decodeSnapshot(wire, (n) => players.find((p) => p.netId === n)?.id);
    stats.snapshots++;
  });

  const loop = setInterval(() => {
    if (!start) return;
    if (latest && latest !== reconciled) {
      reconciled = latest;
      const me = latest.cars.find((c) => c.id === socket.id);
      predictor.setFrozen(isCarFrozen(latest.race.phase, me?.spectator ?? false));
      const c = me && predictor.reconcile(me, me.lastInputSeq);
      if (c && c.distance > 0) {
        stats.corrections++;
        stats.maxCorrectionCm = Math.max(stats.maxCorrectionCm, Math.round(c.distance * 100));
      }
    }
    // Un input par pas de 1/60 s écoulé en temps réel (accumulateur, comme le client).
    const due = Math.floor((performance.now() - start) / (SIM_DT * 1000));
    while (seq < due) {
      seq++;
      const car = predictor.state;
      const controls = car
        ? autopilot(track, car)
        : { throttle: 0, steer: 0, brake: 0, handbrake: false };
      const input = { seq, ...controls };
      predictor.applyInput(input);
      socket.emit("input", input);
    }
  }, 4);

  const ping = setInterval(() => {
    const t = performance.now();
    socket.emit("ping", () => stats.pings.push(performance.now() - t));
  }, 1000);

  return {
    index,
    socket,
    stats,
    ready: new Promise<void>((resolve) => socket.on("connect", () => resolve())),
    begin: () => {
      start = performance.now();
    },
    ask: async (event: "createRoom" | "joinRoom", payload: object) => {
      const result = (await socket
        .timeout(5000)
        .emitWithAck(event, payload as never)) as JoinRoomResult;
      if (result.ok) players = result.state.players;
      return result;
    },
    stop: () => {
      clearInterval(loop);
      clearInterval(ping);
      socket.close();
    },
  };
}

const bots = Array.from({ length: BOTS }, (_, i) => startBot(i));
await Promise.all(bots.map((b) => b.ready));
const [host, ...others] = bots;
if (!host) throw new Error("au moins 1 bot");
const created = await host.ask("createRoom", { name: "Bot0" });
if (!created.ok) throw new Error(created.error);
for (const bot of others) {
  const joined = await bot.ask("joinRoom", { code: created.code, name: `Bot${bot.index}` });
  if (!joined.ok) throw new Error(joined.error);
}
for (const bot of bots) bot.begin();
host.socket.emit("startRace");
console.log(
  `${BOTS} bots dans le salon ${created.code}, course lancée, mesure pendant ${SECONDS} s…`,
);

const t0 = performance.now();
await new Promise((r) => setTimeout(r, SECONDS * 1000));
const elapsed = (performance.now() - t0) / 1000;
for (const bot of bots) bot.stop();

const all = bots.map((b) => b.stats);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pings = all.flatMap((s) => s.pings).sort((a, b) => a - b);
const kbPerClient = avg(all.map((s) => s.bytes)) / elapsed / 1024;
console.log({
  bots: BOTS,
  snapshotsPerClientPerSec: +(avg(all.map((s) => s.snapshots)) / elapsed).toFixed(1),
  kBPerClientPerSec: +kbPerClient.toFixed(1),
  serverUploadMbps: +((kbPerClient * BOTS * 8 * 1024) / 1e6).toFixed(2),
  bytesPerSnapshot: Math.round(avg(all.map((s) => s.bytes / Math.max(1, s.snapshots)))),
  correctionsTotal: all.reduce((a, s) => a + s.corrections, 0),
  maxCorrectionCm: Math.max(...all.map((s) => s.maxCorrectionCm)),
  pingMedianMs: +(pings[Math.floor(pings.length / 2)] ?? 0).toFixed(1),
  pingP99Ms: +(pings[Math.floor(pings.length * 0.99)] ?? 0).toFixed(1),
});
process.exit(0);
