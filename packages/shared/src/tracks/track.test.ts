import { describe, expect, it } from "vitest";
import { CIRCUIT_1 } from "./circuit1";
import { buildTrack, nearestOnTrack } from "./track";

describe("buildTrack", () => {
  const track = buildTrack(CIRCUIT_1, 16);

  it("échantillonne 16 points par segment", () => {
    expect(track.points).toHaveLength(CIRCUIT_1.controlPoints.length * 16);
    expect(track.normals).toHaveLength(track.points.length);
  });

  it("produit des normales unitaires", () => {
    for (const n of track.normals) expect(Math.hypot(n.x, n.z)).toBeCloseTo(1, 9);
  });

  it("place le départ sur le point de contrôle prévu, tourné vers -Z", () => {
    expect(track.spawn.x).toBeCloseTo(0, 9);
    expect(track.spawn.z).toBeCloseTo(20, 9);
    // Ligne droite vers -Z : cap proche de 0.
    expect(Math.abs(track.spawn.heading)).toBeLessThan(0.05);
  });

  it("refuse un circuit de moins de 4 points", () => {
    expect(() =>
      buildTrack({ ...CIRCUIT_1, controlPoints: CIRCUIT_1.controlPoints.slice(0, 3) }),
    ).toThrow();
  });
});

describe("nearestOnTrack", () => {
  const track = buildTrack(CIRCUIT_1);

  it("donne une distance nulle sur la ligne centrale", () => {
    expect(nearestOnTrack(track, track.spawn.x, track.spawn.z).distance).toBeCloseTo(0, 9);
  });

  it("mesure l'écart latéral", () => {
    // Au départ la piste est orientée selon Z : se décaler de 5 m en X éloigne de 5 m.
    expect(nearestOnTrack(track, track.spawn.x + 5, track.spawn.z).distance).toBeCloseTo(5, 6);
  });
});
