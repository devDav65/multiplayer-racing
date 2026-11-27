import { describe, expect, it } from "vitest";
import { quantizeCarState, wrapAngle } from "./quantize";

describe("quantizeCarState", () => {
  it("arrondit au millimètre et au 1/100 000 de radian", () => {
    expect(
      quantizeCarState({ x: 1.23456, z: -7.0004, heading: 0.123456789, vx: 10.0005, vz: 0 }),
    ).toEqual({ x: 1.235, z: -7, heading: 0.12346, vx: 10.001, vz: 0 });
  });

  it("survit à un aller-retour JSON sans aucune perte, y compris le signe de zéro", () => {
    const state = quantizeCarState({
      x: -0.0001,
      z: 123.4567891,
      heading: -3.1,
      vx: 1e-9,
      vz: -55.5,
    });
    const back = JSON.parse(JSON.stringify(state));
    expect(back).toStrictEqual(state);
    expect(Object.is(state.x, 0)).toBe(true); // pas -0
  });

  it("est idempotente : quantifier deux fois ne change rien", () => {
    const once = quantizeCarState({ x: 3.21987, z: 2.65432, heading: 1.23456, vx: 0.5, vz: 0.25 });
    expect(quantizeCarState(once)).toEqual(once);
  });

  it("produit des nombres courts en JSON", () => {
    const json = JSON.stringify(
      quantizeCarState({
        x: Math.PI * 10,
        z: Math.E * -40,
        heading: 0.7,
        vx: Math.SQRT2,
        vz: 1 / 3,
      }),
    );
    expect(json.length).toBeLessThan(70);
  });
});

describe("wrapAngle", () => {
  it("ramène les angles dans ]-π, π]", () => {
    expect(wrapAngle(3.5)).toBeCloseTo(3.5 - 2 * Math.PI, 12);
    expect(wrapAngle(-3.5)).toBeCloseTo(-3.5 + 2 * Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(7 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(1)).toBe(1);
  });
});
