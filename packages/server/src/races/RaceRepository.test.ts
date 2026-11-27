import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthService } from "../auth/AuthService";
import { createTestDb, TEST_DATABASE_URL } from "../db/testDb";
import { type RaceRecord, RaceRepository } from "./RaceRepository";

describe.skipIf(!TEST_DATABASE_URL)("RaceRepository (PostgreSQL)", () => {
  let pool: Pool;
  let drop: () => Promise<void>;
  let races: RaceRepository;
  let alice = 0;
  let bob = 0;

  const race = (minute: number, results: RaceRecord["results"], laps = 3): RaceRecord => ({
    roomCode: "ABCD",
    trackId: "circuit-1",
    laps,
    startedAt: new Date(Date.UTC(2026, 0, 1, 12, minute)),
    finishedAt: new Date(Date.UTC(2026, 0, 1, 12, minute, 50)),
    results,
  });

  beforeAll(async () => {
    ({ pool, drop } = await createTestDb());
    races = new RaceRepository(pool);
    const auth = new AuthService(pool);
    const a = await auth.register("Alice", "motdepasse");
    const b = await auth.register("Bob", "motdepasse");
    if (!a.ok || !b.ok) throw new Error();
    alice = a.user.id;
    bob = b.user.id;

    await races.saveRace(
      race(0, [
        { rank: 1, userId: alice, displayName: "Alice", timeMs: 80_000 },
        { rank: 2, userId: null, displayName: "Invité", timeMs: 81_000 },
        { rank: 3, userId: bob, displayName: "Bob", timeMs: null },
      ]),
    );
    await races.saveRace(
      race(5, [
        { rank: 1, userId: bob, displayName: "Bob", timeMs: 79_000 },
        { rank: 2, userId: alice, displayName: "Alice", timeMs: 79_500 },
      ]),
    );
    await races.saveRace(
      race(10, [{ rank: 1, userId: alice, displayName: "Alice", timeMs: 27_000 }], 1),
    );
  });
  afterAll(async () => {
    await drop?.();
  });

  it("calcule les statistiques d'un joueur", async () => {
    const stats = await races.getUserStats("alice");
    expect(stats).toMatchObject({
      username: "Alice",
      races: 3,
      wins: 2,
      podiums: 3,
      finished: 3,
      bestTimes: [
        { trackId: "circuit-1", laps: 1, timeMs: 27_000 },
        { trackId: "circuit-1", laps: 3, timeMs: 79_500 },
      ],
    });
    // Bob : 3e mais DNF dans la 1re course (pas un podium), vainqueur de la 2e.
    expect(await races.getUserStats("Bob")).toMatchObject({
      races: 2,
      wins: 1,
      podiums: 1,
      finished: 1,
    });
    expect(await races.getUserStats("personne")).toBeNull();
  });

  it("liste l'historique, du plus récent au plus ancien, avec le nombre de participants", async () => {
    const history = await races.getRecentRaces("Alice");
    expect(history.map((h) => [h.laps, h.rank, h.participants])).toEqual([
      [1, 1, 1],
      [3, 2, 2],
      [3, 1, 3],
    ]);
    expect(await races.getRecentRaces("Alice", 1)).toHaveLength(1);
  });

  it("n'enregistre rien si une ligne est invalide (transaction)", async () => {
    const before = await pool.query("SELECT count(*)::int AS n FROM races");
    await expect(
      races.saveRace(
        race(20, [
          { rank: 1, userId: alice, displayName: "Alice", timeMs: 80_000 },
          { rank: 1, userId: bob, displayName: "Bob", timeMs: 81_000 }, // rang en double
        ]),
      ),
    ).rejects.toThrow();
    const after = await pool.query("SELECT count(*)::int AS n FROM races");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
