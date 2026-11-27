import {
  buildTrack,
  type CarState,
  CIRCUIT_1,
  MAX_PLAYERS_PER_ROOM,
  type PlayerInput,
  type Snapshot,
  stepCarOnTrack,
} from "@racing/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Room, type RoomOptions } from "./Room";

const track = buildTrack(CIRCUIT_1);

function makeRoom(options: Partial<RoomOptions> = {}): Room {
  return new Room({ code: "TEST", track, onSnapshot: () => {}, onRoomState: () => {}, ...options });
}

function gas(seq: number): PlayerInput {
  return { seq, throttle: 1, steer: 0, brake: 0, handbrake: false };
}

function stateOf(room: Room, id: string) {
  const state = room.getPlayerState(id);
  if (!state) throw new Error(`joueur ${id} absent`);
  return state;
}

// Les fake timers empêchent le setInterval de la Room de tourner : seuls nos appels
// à room.step() font avancer la simulation.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Room : joueurs", () => {
  it("refuse un doublon et un salon plein", () => {
    const room = makeRoom();
    expect(room.addPlayer("a", "pilote")).toBe(true);
    expect(room.addPlayer("a", "pilote")).toBe(false);
    for (let i = 1; i < MAX_PLAYERS_PER_ROOM; i++)
      expect(room.addPlayer(`p${i}`, "pilote")).toBe(true);
    expect(room.addPlayer("de-trop", "pilote")).toBe(false);
    expect(room.playerCount).toBe(MAX_PLAYERS_PER_ROOM);
  });

  it("place chaque joueur sur un emplacement de grille différent", () => {
    const room = makeRoom();
    const ids = ["a", "b", "c", "d", "e", "f"];
    for (const id of ids) room.addPlayer(id, "pilote");
    const positions = ids.map((id) => {
      const { x, z } = stateOf(room, id).car;
      return `${x.toFixed(2)},${z.toFixed(2)}`;
    });
    expect(new Set(positions).size).toBe(ids.length);
  });

  it("réutilise l'emplacement d'un joueur parti", () => {
    const room = makeRoom();
    room.addPlayer("a", "pilote");
    room.addPlayer("b", "pilote");
    const b = stateOf(room, "b").car;
    room.removePlayer("b");
    room.addPlayer("c", "pilote");
    expect(stateOf(room, "c").car).toEqual(b);
  });
});

describe("Room : un input = un pas", () => {
  it("ne bouge pas la voiture sans input", () => {
    const room = makeRoom();
    room.addPlayer("a", "pilote");
    const before = stateOf(room, "a").car;
    for (let i = 0; i < 30; i++) room.step();
    expect(stateOf(room, "a").car).toEqual(before);
  });

  it("donne exactement le même état que stepCarOnTrack appliqué à chaque input", () => {
    const room = makeRoom();
    room.addPlayer("a", "pilote");
    let expected: CarState = stateOf(room, "a").car;
    for (let seq = 1; seq <= 90; seq++) {
      const input = { ...gas(seq), steer: Math.sin(seq / 10) };
      room.applyInput("a", input);
      room.step();
      expected = stepCarOnTrack(expected, input, track);
    }
    const state = stateOf(room, "a");
    expect(state.lastInputSeq).toBe(90);
    expect(state.car).toEqual(expected);
  });

  it("rattrape au plus 3 inputs par pas, dans la limite du budget de 6", () => {
    const room = makeRoom();
    room.addPlayer("a", "pilote");
    for (let seq = 1; seq <= 8; seq++) room.applyInput("a", gas(seq));
    room.step(); // budget 6 → 3 exécutés
    expect(stateOf(room, "a").lastInputSeq).toBe(3);
    room.step(); // budget 3 + 1 = 4 → 3 exécutés
    expect(stateOf(room, "a").lastInputSeq).toBe(6);
    room.step(); // budget 1 + 1 = 2 → les 2 derniers
    expect(stateOf(room, "a").lastInputSeq).toBe(8);
  });

  it("ne laisse pas un client qui inonde aller plus vite qu'un client honnête", () => {
    const room = makeRoom();
    room.addPlayer("a", "pilote");
    const start = stateOf(room, "a").car;
    const steps = 120; // 2 s : on reste dans la ligne droite de départ
    let seq = 0;
    for (let i = 0; i < steps; i++) {
      for (let k = 0; k < 5; k++) room.applyInput("a", gas(++seq)); // 5 fois trop d'inputs
      room.step();
    }
    // Au mieux, il obtient `steps` pas plus les 6 du budget initial.
    let honest = start;
    for (let i = 0; i < steps + 6; i++) honest = stepCarOnTrack(honest, gas(0), track);
    const cheater = stateOf(room, "a").car;
    // On roule vers -Z : un z plus petit signifie plus loin.
    expect(cheater.z).toBeGreaterThanOrEqual(honest.z - 1e-9);
  });

  it("garde au plus 8 inputs en file, en jetant les plus anciens", () => {
    const room = makeRoom();
    room.addPlayer("a", "pilote");
    for (let seq = 1; seq <= 20; seq++) room.applyInput("a", gas(seq));
    const executed: number[] = [];
    for (let i = 0; i < 10; i++) {
      room.step();
      executed.push(stateOf(room, "a").lastInputSeq);
    }
    expect(executed[0]).toBe(15); // 13, 14, 15 : les 12 premiers ont été jetés
    expect(executed.at(-1)).toBe(20);
  });
});

describe("Room : numéros d'input", () => {
  it("ignore un input en double ou plus ancien que le dernier reçu", () => {
    const room = makeRoom();
    room.addPlayer("a", "pilote");
    room.applyInput("a", gas(5));
    room.applyInput("a", gas(5)); // doublon
    room.applyInput("a", gas(3)); // rejoué / en retard
    room.applyInput("a", gas(6));
    let expected: CarState = stateOf(room, "a").car;
    for (const seq of [5, 6]) expected = stepCarOnTrack(expected, gas(seq), track);
    room.step();
    room.step();
    expect(stateOf(room, "a").lastInputSeq).toBe(6);
    expect(stateOf(room, "a").car).toEqual(expected);
  });
});

describe("Room : snapshots", () => {
  it("envoie un snapshot tous les 3 pas avec toutes les voitures", () => {
    const snapshots: Snapshot[] = [];
    const room = makeRoom({ onSnapshot: (s) => snapshots.push(s) });
    room.addPlayer("a", "pilote");
    room.addPlayer("b", "pilote");
    for (let i = 0; i < 9; i++) room.step();
    expect(snapshots.map((s) => s.tick)).toEqual([3, 6, 9]);
    expect(snapshots[0]?.cars.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });
});
