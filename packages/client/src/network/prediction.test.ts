import {
  buildTrack,
  type CarState,
  CIRCUIT_1,
  createCarState,
  type PlayerInput,
  stepCarOnTrack,
} from "@racing/shared";
import { describe, expect, it } from "vitest";
import { lerpCarState, MAX_PENDING_INPUTS, Predictor, SNAP_DISTANCE } from "./prediction";

const track = buildTrack(CIRCUIT_1);
const spawn = createCarState(track.spawn.x, track.spawn.z, track.spawn.heading);

function input(seq: number): PlayerInput {
  return { seq, throttle: 1, steer: Math.sin(seq / 15), brake: 0, handbrake: seq % 50 < 5 };
}

/** Ce que ferait le serveur : appliquer les inputs un par un. */
function simulate(from: CarState, inputs: PlayerInput[]): CarState {
  return inputs.reduce((state, i) => stepCarOnTrack(state, i, track), from);
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, k) => input(from + k));

describe("Predictor : prédiction", () => {
  it("n'a pas d'état avant le premier snapshot, mais garde les inputs envoyés", () => {
    const p = new Predictor(track);
    for (const i of range(1, 5)) p.applyInput(i);
    expect(p.state).toBeNull();
    expect(p.pendingCount).toBe(5);
  });

  it("au premier snapshot, rejoue les inputs que le serveur n'a pas encore vus", () => {
    const p = new Predictor(track);
    for (const i of range(1, 10)) p.applyInput(i);
    // Le serveur a exécuté 1..4 au moment du snapshot.
    const server = simulate(spawn, range(1, 4));
    p.reconcile(server, 4);
    expect(p.pendingCount).toBe(6);
    expect(p.state).toEqual(simulate(spawn, range(1, 10)));
  });

  it("applique ensuite chaque input immédiatement, comme le ferait le serveur", () => {
    const p = new Predictor(track);
    p.reconcile(spawn, 0);
    for (const i of range(1, 120)) p.applyInput(i);
    expect(p.state).toEqual(simulate(spawn, range(1, 120)));
  });

  it("borne le nombre d'inputs en attente", () => {
    const p = new Predictor(track);
    for (const i of range(1, MAX_PENDING_INPUTS + 50)) p.applyInput(i);
    expect(p.pendingCount).toBe(MAX_PENDING_INPUTS);
  });

  it("reset() oublie l'état et les inputs", () => {
    const p = new Predictor(track);
    p.reconcile(spawn, 0);
    p.applyInput(input(1));
    p.reset();
    expect(p.state).toBeNull();
    expect(p.pendingCount).toBe(0);
  });
});

describe("Predictor : renderState", () => {
  it("interpole entre le pas précédent (alpha 0) et le pas actuel (alpha 1)", () => {
    const p = new Predictor(track);
    p.reconcile(spawn, 0);
    for (const i of range(1, 30)) p.applyInput(i);
    const before = simulate(spawn, range(1, 29));
    const after = simulate(spawn, range(1, 30));
    expect(p.renderState(0)?.z).toBeCloseTo(before.z, 9);
    expect(p.renderState(1)?.z).toBeCloseTo(after.z, 9);
    expect(p.renderState(0.5)?.z).toBeCloseTo((before.z + after.z) / 2, 9);
  });

  it("interpole le cap par le plus court chemin", () => {
    const a = { ...spawn, heading: Math.PI - 0.01 };
    const b = { ...spawn, heading: -Math.PI + 0.01 };
    // 0,02 rad d'écart en passant par ±π, et non presque un tour complet.
    const mid = lerpCarState(a, b, 0.5).heading;
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(1e-9);
  });
});

/**
 * Un faux serveur minimal : il exécute les inputs reçus, un par pas, comme Room.
 * `drop` permet de simuler un input perdu en route.
 */
class FakeServer {
  car: CarState = spawn;
  lastInputSeq = 0;
  receive(i: PlayerInput, drop = false) {
    if (drop) return;
    this.car = stepCarOnTrack(this.car, i, track);
    this.lastInputSeq = i.seq;
  }
}

describe("Predictor : réconciliation", () => {
  it("ne corrige rien quand le serveur calcule la même chose (latence de 6 inputs)", () => {
    const p = new Predictor(track);
    const server = new FakeServer();
    p.reconcile(server.car, 0);
    const LATENCY = 6; // le serveur a toujours 6 inputs de retard sur le client
    const sent: PlayerInput[] = [];
    for (let seq = 1; seq <= 600; seq++) {
      const i = input(seq);
      sent.push(i);
      p.applyInput(i);
      const arrived = sent[seq - 1 - LATENCY];
      if (arrived) server.receive(arrived);
      if (seq % 3 === 0) {
        const correction = p.reconcile(server.car, server.lastInputSeq);
        expect(correction?.distance).toBe(0);
      }
    }
    expect(p.pendingCount).toBe(LATENCY);
    expect(p.visualOffset).toBe(0);
  });

  it("corrige la prédiction quand le serveur a perdu un input", () => {
    const p = new Predictor(track);
    const server = new FakeServer();
    p.reconcile(server.car, 0);
    for (let seq = 1; seq <= 60; seq++) {
      p.applyInput(input(seq));
      server.receive(input(seq), seq === 30); // l'input 30 n'arrive jamais
    }
    const correction = p.reconcile(server.car, server.lastInputSeq);
    expect(correction?.distance).toBeGreaterThan(0);
    expect(correction?.snapped).toBe(false);
    // La simulation suit maintenant le serveur exactement...
    expect(p.state).toEqual(server.car);
    // ...mais l'affichage reste à l'ancienne position, puis rejoint la nouvelle.
    expect(p.visualOffset).toBeCloseTo(correction?.distance ?? 0, 9);
    for (let f = 0; f < 60; f++) p.decayOffset(1 / 60);
    expect(p.visualOffset).toBeLessThan(0.001);
  });

  it("recale d'un coup au-delà de SNAP_DISTANCE", () => {
    const p = new Predictor(track);
    p.reconcile(spawn, 0);
    const far = { ...spawn, x: spawn.x + SNAP_DISTANCE + 1 };
    const correction = p.reconcile(far, 0);
    expect(correction?.snapped).toBe(true);
    expect(p.visualOffset).toBe(0);
    expect(p.renderState(1)?.x).toBe(far.x);
  });

  it("ignore un snapshot plus ancien que le dernier traité", () => {
    const p = new Predictor(track);
    for (const i of range(1, 10)) p.applyInput(i);
    p.reconcile(simulate(spawn, range(1, 8)), 8);
    const state = p.state;
    expect(p.reconcile(spawn, 3)).toBeNull();
    expect(p.state).toBe(state);
  });

  it("ne garde pas les champs réseau du snapshot dans l'état simulé", () => {
    const p = new Predictor(track);
    p.reconcile({ ...spawn, id: "abc", lastInputSeq: 0 } as CarState, 0);
    expect(Object.keys(p.state ?? {}).sort()).toEqual(["heading", "vx", "vz", "x", "z"]);
  });
});

describe("Predictor : voiture bloquée", () => {
  it("garde les inputs en attente sans bouger, puis repart quand on la débloque", () => {
    const p = new Predictor(track);
    p.reconcile(spawn, 0);
    p.setFrozen(true);
    for (const i of range(1, 30)) p.applyInput(i);
    expect(p.state).toEqual(spawn);
    expect(p.pendingCount).toBe(30);
    // Le serveur confirme les 30 inputs (bloqués lui aussi) : aucune correction.
    expect(p.reconcile(spawn, 30)?.distance).toBe(0);
    p.setFrozen(false);
    p.applyInput(input(31));
    expect(p.state).toEqual(simulate(spawn, [input(31)]));
  });
});
