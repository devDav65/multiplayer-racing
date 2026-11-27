import { describe, expect, it } from "vitest";
import { KeyedRateLimiter } from "./KeyedRateLimiter";

describe("KeyedRateLimiter", () => {
  it("limite chaque clé indépendamment", () => {
    const now = 0;
    const limiter = new KeyedRateLimiter(2, 1, () => now);
    expect([1, 2, 3].map(() => limiter.tryConsume("a"))).toEqual([true, true, false]);
    expect(limiter.tryConsume("b")).toBe(true);
  });

  it("ne garde pas plus de maxKeys clés en mémoire", () => {
    let now = 0;
    const limiter = new KeyedRateLimiter(2, 1, () => now, 100);
    for (let i = 0; i < 1000; i++) {
      now += 10;
      limiter.tryConsume(`ip-${i}`);
    }
    expect(limiter.size).toBeLessThanOrEqual(100);
  });
});
