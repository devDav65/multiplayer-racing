import {
  autopilot,
  buildTrack,
  CIRCUIT_1,
  COUNTDOWN_TICKS,
  FINISH_GRACE_TICKS,
  gridPosition,
  RESULTS_TICKS,
  type RoomState,
  type Snapshot,
} from "@racing/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Room } from "./Room";

const track = buildTrack(CIRCUIT_1);

/** Un salon d'une course à 1 tour, avec des « clients » simulés qui envoient un input par pas. */
function setup() {
  const states: RoomState[] = [];
  let snapshot: Snapshot | null = null;
  const room = new Room({
    code: "TEST",
    track,
    laps: 1,
    onSnapshot: (s) => {
      snapshot = s;
    },
    onRoomState: (s) => states.push(s),
  });
  const seqs = new Map<string, number>();
  /** Joueurs pilotés par l'autopilote ; les autres n'envoient rien. */
  const drivers = new Set<string>();

  const add = (id: string, drive = true) => {
    room.addPlayer(id, id.toUpperCase());
    if (drive) drivers.add(id);
  };
  /** Un pas serveur, chaque pilote ayant envoyé un input avant. */
  const tick = (count = 1) => {
    for (let n = 0; n < count; n++) {
      for (const id of drivers) {
        const state = room.getPlayerState(id);
        if (!state) continue;
        const seq = (seqs.get(id) ?? 0) + 1;
        seqs.set(id, seq);
        room.applyInput(id, { seq, ...autopilot(track, state.car) });
      }
      room.step();
    }
  };
  /** Avance jusqu'à la phase demandée (ou échoue après `max` pas). */
  const until = (phase: string, max = 60 * 60 * 3) => {
    for (let n = 0; n < max && room.currentPhase !== phase; n++) tick();
    expect(room.currentPhase).toBe(phase);
  };
  return {
    room,
    states,
    add,
    tick,
    until,
    drivers,
    lastSnapshot: () => snapshot as Snapshot | null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("hôte et départ", () => {
  it("seul l'hôte peut lancer, et seulement depuis le lobby", () => {
    const { room, add } = setup();
    add("a");
    add("b");
    expect(room.startRace("b")).toBe(false);
    expect(room.startRace("a")).toBe(true);
    expect(room.currentPhase).toBe("countdown");
    expect(room.startRace("a")).toBe(false);
  });

  it("transmet le rôle d'hôte au plus ancien joueur quand l'hôte part", () => {
    const { room, add, states } = setup();
    add("a");
    add("b");
    add("c");
    room.removePlayer("a");
    expect(states.at(-1)?.hostId).toBe("b");
    expect(room.startRace("b")).toBe(true);
  });

  it("replace tout le monde sur une grille compacte au lancement", () => {
    const { room, add, tick } = setup();
    add("a");
    add("b");
    add("c");
    room.removePlayer("b");
    tick(120); // conduite libre dans le lobby
    room.startRace("a");
    expect(room.getPlayerState("a")?.car).toEqual(gridPosition(track, 0));
    expect(room.getPlayerState("c")?.car).toEqual(gridPosition(track, 1));
  });
});

describe("décompte", () => {
  it("bloque les voitures mais consomme les inputs, puis lance la course", () => {
    const { room, add, tick } = setup();
    add("a");
    room.startRace("a");
    const grid = room.getPlayerState("a")?.car;
    tick(COUNTDOWN_TICKS - 1);
    expect(room.currentPhase).toBe("countdown");
    expect(room.getPlayerState("a")?.car).toEqual(grid);
    expect(room.getPlayerState("a")?.lastInputSeq).toBe(COUNTDOWN_TICKS - 1);
    tick();
    expect(room.currentPhase).toBe("racing");
    tick(30);
    expect(room.getPlayerState("a")?.car).not.toEqual(grid);
  });

  it("annonce le temps restant dans les snapshots", () => {
    const { room, add, tick, lastSnapshot } = setup();
    add("a");
    room.startRace("a");
    tick(3);
    expect(lastSnapshot()?.race).toEqual({
      phase: "countdown",
      ticksLeft: COUNTDOWN_TICKS - 3,
      totalLaps: 1,
    });
  });
});

describe("course complète", () => {
  it("course à 2 : arrivée, classement, résultats puis retour au lobby", () => {
    const { room, add, until, tick, states, lastSnapshot } = setup();
    add("a");
    add("b");
    room.startRace("a");
    until("racing");
    tick(60);
    const ranked = lastSnapshot()
      ?.cars.map((c) => c.rank)
      .sort();
    expect(ranked).toEqual([1, 2]);

    until("results");
    const results = states.at(-1)?.results;
    expect(results).toHaveLength(2);
    expect(results?.map((r) => r.rank)).toEqual([1, 2]);
    for (const r of results ?? []) expect(r.timeMs).toBeGreaterThan(10_000);
    expect(results?.[0]?.timeMs).toBeLessThanOrEqual(results?.[1]?.timeMs ?? 0);
    expect(results?.[0]?.name).toMatch(/^[AB]$/);

    tick(RESULTS_TICKS);
    expect(room.currentPhase).toBe("lobby");
    expect(room.getPlayerState("a")?.progress.gatesPassed).toBe(0);
  });

  it("ne attend pas indéfiniment un joueur arrêté : délai après le premier arrivé", () => {
    const { room, add, until, tick, states, lastSnapshot } = setup();
    add("a");
    add("idle", false); // n'envoie jamais d'input
    room.startRace("a");
    until("racing");
    // On attend l'arrivée du premier...
    for (let n = 0; n < 60 * 120 && !room.getPlayerState("a")?.progress.finishTick; n++) tick();
    tick();
    expect(room.currentPhase).toBe("racing");
    expect(lastSnapshot()?.race.ticksLeft).not.toBeNull();
    // ...puis le délai de grâce.
    tick(FINISH_GRACE_TICKS);
    expect(room.currentPhase).toBe("results");
    const results = states.at(-1)?.results ?? [];
    expect(results.map((r) => [r.id, r.rank, r.timeMs === null])).toEqual([
      ["a", 1, false],
      ["idle", 2, true],
    ]);
  });

  it("passe aux résultats si tous les coureurs partent", () => {
    const { room, add, until } = setup();
    add("a");
    add("b");
    room.startRace("a");
    until("racing");
    room.removePlayer("a");
    room.removePlayer("b");
    room.addPlayer("c", "C"); // arrive après : spectateur, le salon n'est pas vide
    room.step();
    expect(room.currentPhase).toBe("results");
  });
});

describe("spectateurs", () => {
  it("un joueur arrivé pendant la course regarde, puis joue la suivante", () => {
    const { room, add, until, tick, lastSnapshot, states } = setup();
    add("a");
    room.startRace("a");
    until("racing");
    add("late");
    expect(states.at(-1)?.players.find((p) => p.id === "late")?.spectator).toBe(true);
    const parked = room.getPlayerState("late")?.car;
    tick(120);
    expect(room.getPlayerState("late")?.car).toEqual(parked); // bloqué
    const late = lastSnapshot()?.cars.find((c) => c.id === "late");
    expect(late?.spectator).toBe(true);
    expect(late?.rank).toBe(0); // non classé

    until("results");
    expect(states.at(-1)?.results?.map((r) => r.id)).toEqual(["a"]);
    until("lobby");
    expect(room.getPlayerState("late")?.spectator).toBe(false);
  });
});
