import { describe, expect, it } from "vitest";
import { formatRaceTime, ordinal, ticksToSeconds } from "./format";

describe("format", () => {
  it("formate un temps de course", () => {
    expect(formatRaceTime(83_456)).toBe("1:23.456");
    expect(formatRaceTime(5_007)).toBe("0:05.007");
    expect(formatRaceTime(null)).toBe("DNF");
  });

  it("convertit des ticks en secondes de décompte", () => {
    expect(ticksToSeconds(180)).toBe(3);
    expect(ticksToSeconds(179)).toBe(3);
    expect(ticksToSeconds(120)).toBe(2);
    expect(ticksToSeconds(1)).toBe(1);
    expect(ticksToSeconds(0)).toBe(0);
  });

  it("écrit les positions en français", () => {
    expect(ordinal(1)).toBe("1er");
    expect(ordinal(2)).toBe("2e");
  });
});
