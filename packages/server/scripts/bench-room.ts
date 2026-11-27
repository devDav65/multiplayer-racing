/**
 * Coût CPU d'un salon plein : 20 joueurs à l'autopilote, en mémoire (sans réseau).
 *   pnpm --filter @racing/server bench
 */
import {
  autopilot,
  buildTrack,
  CIRCUIT_1,
  MAX_PLAYERS_PER_ROOM,
  SIM_TICK_RATE,
  type Snapshot,
} from "@racing/shared";
import { Room } from "../src/rooms/Room";

const track = buildTrack(CIRCUIT_1);
let last: Snapshot | null = null;
const room = new Room({
  code: "BENC",
  track,
  onSnapshot: (s) => {
    last = s;
  },
  onRoomState: () => {},
});
const ids = Array.from({ length: MAX_PLAYERS_PER_ROOM }, (_, i) => `player-${i}`);
for (const id of ids) room.addPlayer(id, id);
room.startRace(ids[0] ?? "");

const seqs = new Map<string, number>();
const STEPS = SIM_TICK_RATE * 60; // une minute de jeu
let simMs = 0;
let serializeMs = 0;
let snapshots = 0;
for (let n = 0; n < STEPS; n++) {
  for (const id of ids) {
    const state = room.getPlayerState(id);
    if (!state) continue;
    const seq = (seqs.get(id) ?? 0) + 1;
    seqs.set(id, seq);
    room.applyInput(id, { seq, ...autopilot(track, state.car) });
  }
  const t = performance.now();
  last = null;
  room.step();
  simMs += performance.now() - t;
  if (last) {
    const s = performance.now();
    JSON.stringify(last);
    serializeMs += performance.now() - s;
    snapshots++;
  }
}
const budgetMs = 1000 / SIM_TICK_RATE;
const perStep = simMs / STEPS;
console.log({
  players: ids.length,
  msPerStep: +perStep.toFixed(3),
  stepBudgetUsedPct: +((perStep / budgetMs) * 100).toFixed(1),
  msPerSnapshotSerialize: +(serializeMs / snapshots).toFixed(3),
  roomsPerCoreEstimate: Math.floor(budgetMs / perStep),
});
process.exit(0);
