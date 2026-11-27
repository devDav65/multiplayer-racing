/**
 * Seau à jetons (« token bucket ») : le seau contient au plus `capacity` jetons et se
 * remplit de `refillPerSecond` jetons par seconde. Chaque message coûte un jeton ;
 * seau vide = message ignoré. On tolère ainsi de petites rafales (gigue réseau)
 * sans laisser un client inonder le serveur.
 */
export class RateLimiter {
  private tokens: number;
  private last: number;
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly now: () => number;

  constructor(
    capacity: number,
    refillPerSecond: number,
    now: () => number = performance.now.bind(performance),
  ) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.now = now;
    this.tokens = capacity;
    this.last = now();
  }

  /** true si le message est autorisé (et consomme un jeton). */
  tryConsume(): boolean {
    const t = this.now();
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((t - this.last) / 1000) * this.refillPerSecond,
    );
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
