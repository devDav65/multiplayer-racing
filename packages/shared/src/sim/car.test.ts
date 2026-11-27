import { describe, expect, it } from "vitest";
import { SIM_DT } from "../constants";
import { CAR_PARAMS, type CarControls, createCarState, stepCar } from "./car";

const IDLE: CarControls = { throttle: 0, steer: 0, brake: 0, handbrake: false };
const GAS: CarControls = { ...IDLE, throttle: 1 };

function run(controls: (i: number) => CarControls, steps: number) {
  let state = createCarState();
  for (let i = 0; i < steps; i++) state = stepCar(state, controls(i));
  return state;
}

/** Suite d'inputs variée mais reproductible (pas de Math.random). */
const scripted = (i: number): CarControls => ({
  throttle: i % 200 < 150 ? 1 : -1,
  steer: Math.sin(i / 30),
  brake: 0,
  handbrake: i % 97 < 10,
});

describe("stepCar", () => {
  it("est pure : ne modifie pas l'état reçu", () => {
    const state = createCarState(1, 2, 0.5);
    const copy = { ...state };
    stepCar(state, GAS);
    expect(state).toEqual(copy);
  });

  it("est déterministe : mêmes inputs, même état, au bit près", () => {
    expect(run(scripted, 1200)).toEqual(run(scripted, 1200));
  });

  it("avance vers -Z avec un cap de 0", () => {
    const state = run(() => GAS, 60);
    expect(state.z).toBeLessThan(-5);
    expect(Math.abs(state.x)).toBeLessThan(1e-9);
  });

  it("ne tourne pas à l'arrêt", () => {
    const state = run(() => ({ ...IDLE, steer: 1 }), 60);
    expect(state.heading).toBe(0);
  });

  it("ignore NaN et Infinity dans les contrôles", () => {
    const state = run(
      () => ({ throttle: Number.NaN, steer: Infinity, brake: -Infinity, handbrake: false }),
      60,
    );
    for (const value of Object.values(state)) expect(Number.isFinite(value)).toBe(true);
  });

  it("borne la vitesse en marche arrière (dépassement d'au plus un pas)", () => {
    const state = run(() => ({ ...IDLE, throttle: -1 }), 600);
    // Le plafond est testé AVANT d'ajouter la poussée : on peut le dépasser d'un pas.
    const limit = CAR_PARAMS.maxReverseSpeed + CAR_PARAMS.reverseAccel * SIM_DT;
    expect(Math.hypot(state.vx, state.vz)).toBeLessThanOrEqual(limit);
  });

  it("finit par s'arrêter quand on lâche le gaz", () => {
    let state = run(() => GAS, 120);
    for (let i = 0; i < 60 * 30; i++) state = stepCar(state, IDLE);
    expect(Math.hypot(state.vx, state.vz)).toBe(0);
  });
});
