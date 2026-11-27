import { describe, expect, it } from "vitest";
import { RateLimiter } from "./RateLimiter";

describe("RateLimiter", () => {
  it("accepte une rafale jusqu'à la capacité, puis refuse", () => {
    let now = 0;
    const limiter = new RateLimiter(3, 1, () => now);
    expect([1, 2, 3, 4].map(() => limiter.tryConsume())).toEqual([true, true, true, false]);
    now = 500;
    expect(limiter.tryConsume()).toBe(false); // un demi-jeton seulement
    now = 1000;
    expect(limiter.tryConsume()).toBe(true);
  });

  it("laisse passer 60 inputs/s réguliers avec la config du serveur, pas 120", () => {
    let now = 0;
    const limiter = new RateLimiter(30, 75, () => now);
    let accepted = 0;
    for (let i = 0; i < 120 * 10; i++) {
      now = (i * 1000) / 120; // un client qui envoie 2 fois trop vite pendant 10 s
      if (limiter.tryConsume()) accepted++;
    }
    expect(accepted).toBeLessThanOrEqual(30 + 75 * 10);
    const honest = new RateLimiter(30, 75, () => now);
    let refused = 0;
    for (let i = 0; i < 60 * 10; i++) {
      now = 20_000 + (i * 1000) / 60;
      if (!honest.tryConsume()) refused++;
    }
    expect(refused).toBe(0);
  });
});
