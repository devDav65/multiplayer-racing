import { describe, expect, it } from "vitest";
import { quantizeCarState } from "../sim/quantize";
import type { Snapshot } from "../types/snapshot";
import { decodeSnapshot, encodeSnapshot } from "./snapshotCodec";

function sample(players: number): Snapshot {
  return {
    tick: 123_456,
    serverTime: 1_795_773_389_346,
    race: { phase: "racing", ticksLeft: null, totalLaps: 3 },
    cars: Array.from({ length: players }, (_, i) => ({
      id: `socket-id-${String(i).padStart(10, "0")}`,
      netId: i + 1,
      ...quantizeCarState({
        x: 100 * Math.sin(i),
        z: -150 * Math.cos(i * 1.3),
        heading: i * 0.37,
        vx: 30 * Math.sin(i * 2.1),
        vz: -40 * Math.cos(i * 0.7),
      }),
      lastInputSeq: 54_321 + i,
      lap: 2,
      rank: i + 1,
      finished: i === 0,
      spectator: i === players - 1,
    })),
  };
}

describe("snapshotCodec", () => {
  it("encode puis décode sans aucune perte (après passage par JSON)", () => {
    const snapshot = sample(20);
    const ids = new Map(snapshot.cars.map((c) => [c.netId, c.id]));
    const wire = JSON.parse(JSON.stringify(encodeSnapshot(snapshot)));
    expect(decodeSnapshot(wire, (n) => ids.get(n))).toStrictEqual(snapshot);
  });

  it("garde ticksLeft et toutes les phases", () => {
    for (const phase of ["lobby", "countdown", "racing", "results"] as const) {
      const snapshot = { ...sample(1), race: { phase, ticksLeft: 42, totalLaps: 1 } };
      const decoded = decodeSnapshot(encodeSnapshot(snapshot), () => "x");
      expect(decoded.race).toEqual(snapshot.race);
    }
  });

  it("ignore une voiture dont le joueur est inconnu", () => {
    const decoded = decodeSnapshot(encodeSnapshot(sample(3)), (n) => (n === 2 ? "b" : undefined));
    expect(decoded.cars.map((c) => c.id)).toEqual(["b"]);
  });

  it("est au moins 2,5 fois plus petit que le JSON d'origine (20 voitures)", () => {
    const snapshot = sample(20);
    const before = JSON.stringify(snapshot).length;
    const after = JSON.stringify(encodeSnapshot(snapshot)).length;
    expect(after * 2.5).toBeLessThan(before);
  });
});
