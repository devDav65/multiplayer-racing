import type { TrackDefinition } from "./track";

/** Premier circuit : une grande boucle avec une longue ligne droite de départ. */
export const CIRCUIT_1: TrackDefinition = {
  id: "circuit-1",
  name: "Circuit de démarrage",
  halfWidth: 8,
  startControlIndex: 1,
  controlPoints: [
    [0, 110],
    [0, 20], // départ : on roule vers -Z (le nord)
    [0, -60],
    [15, -120],
    [70, -155],
    [140, -150],
    [185, -110],
    [190, -50],
    [150, -10],
    [110, 20],
    [120, 70],
    [165, 105],
    [155, 165],
    [90, 195],
    [30, 170],
  ],
};
