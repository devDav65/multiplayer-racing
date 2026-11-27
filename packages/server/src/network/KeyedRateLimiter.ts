import { RateLimiter } from "./RateLimiter";

/**
 * Un RateLimiter par clé (par exemple par adresse IP). Les clés inactives sont oubliées
 * pour que la mémoire ne grossisse pas indéfiniment.
 */
export class KeyedRateLimiter {
  private readonly limiters = new Map<string, { limiter: RateLimiter; lastUsed: number }>();
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly now: () => number;
  private readonly maxKeys: number;

  constructor(
    capacity: number,
    refillPerSecond: number,
    now: () => number = performance.now.bind(performance),
    maxKeys = 10_000,
  ) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.now = now;
    this.maxKeys = maxKeys;
  }

  tryConsume(key: string): boolean {
    let entry = this.limiters.get(key);
    if (!entry) {
      if (this.limiters.size >= this.maxKeys) this.evictIdle();
      entry = {
        limiter: new RateLimiter(this.capacity, this.refillPerSecond, this.now),
        lastUsed: 0,
      };
      this.limiters.set(key, entry);
    }
    entry.lastUsed = this.now();
    return entry.limiter.tryConsume();
  }

  get size(): number {
    return this.limiters.size;
  }

  /** Oublie les clés dont le seau est forcément plein à nouveau (inactives assez longtemps). */
  private evictIdle(): void {
    const refillMs = (this.capacity / this.refillPerSecond) * 1000;
    const t = this.now();
    for (const [key, entry] of this.limiters) {
      if (t - entry.lastUsed >= refillMs) this.limiters.delete(key);
    }
    // Toujours plein : on retire les plus anciennes (une Map garde l'ordre d'insertion).
    for (const key of this.limiters.keys()) {
      if (this.limiters.size < this.maxKeys) break;
      this.limiters.delete(key);
    }
  }
}
