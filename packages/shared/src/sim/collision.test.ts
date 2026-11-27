import { describe, expect, it } from "vitest";
import { CIRCUIT_1 } from "../tracks/circuit1";
import { buildTrack, nearestOnTrack } from "../tracks/track";
import { createCarState } from "./car";
import { stepCarOnTrack } from "./collision";

const track = buildTrack(CIRCUIT_1);

describe("stepCarOnTrack", () => {
  it("garde la voiture sur la piste, même en fonçant dans les murs", () => {
    let state = createCarState(track.spawn.x, track.spawn.z, track.spawn.heading);
    // 30 s plein gaz en braquant à fond par moments : la voiture tape forcément les murs.
    for (let i = 0; i < 60 * 30; i++) {
      const steer = i % 240 < 60 ? 1 : i % 240 < 120 ? -1 : 0;
      state = stepCarOnTrack(state, { throttle: 1, steer, brake: 0, handbrake: false }, track);
      const { distance } = nearestOnTrack(track, state.x, state.z);
      expect(distance).toBeLessThanOrEqual(track.halfWidth);
    }
  });

  it("repousse une voiture placée dans un mur vers la piste", () => {
    const p = track.points[0];
    const n = track.normals[0];
    if (!p || !n) throw new Error("piste vide");
    const outside = createCarState(
      p.x + n.x * (track.halfWidth + 0.5),
      p.z + n.z * (track.halfWidth + 0.5),
    );
    const after = stepCarOnTrack(
      outside,
      { throttle: 0, steer: 0, brake: 0, handbrake: false },
      track,
    );
    expect(nearestOnTrack(track, after.x, after.z).distance).toBeLessThan(track.halfWidth);
  });
});
