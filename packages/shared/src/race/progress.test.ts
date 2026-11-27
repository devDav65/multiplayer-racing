import { describe, expect, it } from "vitest";
import { RACE_LAPS, SIM_TICK_RATE } from "../constants";
import { autopilot } from "../sim/autopilot";
import { type CarState, createCarState } from "../sim/car";
import { stepCarOnTrack } from "../sim/collision";
import { CIRCUIT_1 } from "../tracks/circuit1";
import { buildTrack, type Gate } from "../tracks/track";
import { gridPosition } from "./grid";
import {
  createProgress,
  crossedGate,
  currentLap,
  type RaceProgress,
  rankCars,
  updateProgress,
} from "./progress";

const track = buildTrack(CIRCUIT_1);

/** Position à `ahead` mètres de la porte, dans le sens de la course. */
function around(gate: Gate, ahead: number, lateral = 0): CarState {
  return createCarState(
    gate.x + gate.tx * ahead - gate.tz * lateral,
    gate.z + gate.tz * ahead + gate.tx * lateral,
  );
}

describe("crossedGate", () => {
  const gate = track.gates[0] as Gate;

  it("compte un passage dans le sens de la course", () => {
    expect(crossedGate(gate, around(gate, -1), around(gate, 1), track.halfWidth)).toBe(true);
  });

  it("ne compte pas un passage à contresens", () => {
    expect(crossedGate(gate, around(gate, 1), around(gate, -1), track.halfWidth)).toBe(false);
  });

  it("ne compte pas un passage loin à côté de la piste", () => {
    const far = track.halfWidth + 10;
    expect(crossedGate(gate, around(gate, -1, far), around(gate, 1, far), track.halfWidth)).toBe(
      false,
    );
  });
});

describe("updateProgress", () => {
  const gates = track.gates;
  const cross = (p: RaceProgress, index: number, tick = 0) => {
    const g = gates[index] as Gate;
    return updateProgress(p, around(g, -1), around(g, 1), track, 2, tick);
  };

  it("place toute la grille derrière la ligne de départ", () => {
    const g = gates[0] as Gate;
    for (let slot = 0; slot < 20; slot++) {
      const car = gridPosition(track, slot);
      expect((car.x - g.x) * g.tx + (car.z - g.z) * g.tz).toBeLessThan(0);
    }
  });

  it("le premier passage de la ligne lance le tour 1 sans le compter", () => {
    const p = cross(createProgress(), 0);
    expect(p).toEqual({ lapsCompleted: 0, nextGate: 1, gatesPassed: 1, finishTick: null });
  });

  it("ignore une porte franchie dans le désordre", () => {
    const p = cross(cross(createProgress(), 0), 3);
    expect(p.nextGate).toBe(1);
    expect(p.gatesPassed).toBe(1);
  });

  it("compte un tour après toutes les portes, et termine la course au dernier tour", () => {
    let p = cross(createProgress(), 0);
    for (let lap = 1; lap <= 2; lap++) {
      for (let g = 1; g < gates.length; g++) p = cross(p, g);
      p = cross(p, 0, 1000 * lap);
      expect(p.lapsCompleted).toBe(lap);
    }
    expect(p.finishTick).toBe(2000);
    // Une fois fini, plus rien ne change.
    expect(cross(p, 1)).toBe(p);
  });

  it("affiche un tour entre 1 et le nombre de tours", () => {
    expect(currentLap(createProgress(), 3)).toBe(1);
    expect(currentLap({ ...createProgress(), lapsCompleted: 3 }, 3)).toBe(3);
  });
});

describe("course complète au pilote automatique", () => {
  it(`termine ${RACE_LAPS} tours en un temps raisonnable, portes dans l'ordre`, () => {
    let car = gridPosition(track, 0);
    let progress = createProgress();
    let tick = 0;
    const maxTicks = 10 * 60 * SIM_TICK_RATE; // 10 min : largement assez
    while (progress.finishTick === null && tick < maxTicks) {
      tick++;
      const next = stepCarOnTrack(car, autopilot(track, car), track);
      progress = updateProgress(progress, car, next, track, RACE_LAPS, tick);
      car = next;
    }
    expect(progress.finishTick).not.toBeNull();
    expect(progress.lapsCompleted).toBe(RACE_LAPS);
    expect(progress.gatesPassed).toBe(1 + RACE_LAPS * track.gates.length);
    // Ordre de grandeur : un tour en moins de 2 minutes.
    expect(tick / SIM_TICK_RATE).toBeLessThan(RACE_LAPS * 120);
  });
});

describe("rankCars", () => {
  const base = createProgress();
  const g1 = track.gates[1] as Gate;

  it("classe arrivés > portes franchies > distance à la prochaine porte", () => {
    const ranking = rankCars(
      [
        { id: "lent", car: around(g1, -50), progress: { ...base, nextGate: 1, gatesPassed: 1 } },
        { id: "proche", car: around(g1, -5), progress: { ...base, nextGate: 1, gatesPassed: 1 } },
        { id: "fini2", car: around(g1, 0), progress: { ...base, finishTick: 900 } },
        { id: "fini1", car: around(g1, 0), progress: { ...base, finishTick: 800 } },
        { id: "devant", car: around(g1, 0), progress: { ...base, nextGate: 2, gatesPassed: 2 } },
      ],
      track,
    );
    expect(ranking).toEqual(["fini1", "fini2", "devant", "proche", "lent"]);
  });
});
