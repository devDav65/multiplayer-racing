import {
  buildTrack,
  type CarState,
  CIRCUIT_1,
  createCarState,
  type PlayerInput,
  stepCarOnTrack,
} from "@racing/shared";
import { describe, expect, it } from "vitest";
import { lerpCarState, MAX_PENDING_INPUTS, Predictor } from "./prediction";

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
    p.resetFromServer(server, 4);
    expect(p.pendingCount).toBe(6);
    expect(p.state).toEqual(simulate(spawn, range(1, 10)));
  });

  it("applique ensuite chaque input immédiatement, comme le ferait le serveur", () => {
    const p = new Predictor(track);
    p.resetFromServer(spawn, 0);
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
    p.resetFromServer(spawn, 0);
    p.applyInput(input(1));
    p.reset();
    expect(p.state).toBeNull();
    expect(p.pendingCount).toBe(0);
  });
});

describe("Predictor : renderState", () => {
  it("interpole entre le pas précédent (alpha 0) et le pas actuel (alpha 1)", () => {
    const p = new Predictor(track);
    p.resetFromServer(spawn, 0);
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
