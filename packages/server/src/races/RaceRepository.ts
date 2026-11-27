import type { Pool } from "pg";

/** Une course terminée, telle que Room la décrit. */
export interface RaceRecord {
  roomCode: string;
  trackId: string;
  laps: number;
  startedAt: Date;
  finishedAt: Date;
  results: Array<{
    rank: number;
    /** null : invité. */
    userId: number | null;
    displayName: string;
    /** null : n'a pas fini (DNF). */
    timeMs: number | null;
  }>;
}

export interface UserStats {
  username: string;
  memberSince: string;
  races: number;
  wins: number;
  podiums: number;
  finished: number;
  /** Meilleur temps par circuit et nombre de tours. */
  bestTimes: Array<{ trackId: string; laps: number; timeMs: number }>;
}

export interface RaceHistoryEntry {
  raceId: number;
  trackId: string;
  laps: number;
  finishedAt: string;
  rank: number;
  participants: number;
  timeMs: number | null;
}

/** Enregistrement des courses et calcul des statistiques, en SQL. */
export class RaceRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /** Enregistre une course et son classement dans UNE transaction (tout ou rien). */
  async saveRace(race: RaceRecord): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO races (room_code, track_id, laps, started_at, finished_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [race.roomCode, race.trackId, race.laps, race.startedAt, race.finishedAt],
      );
      const raceId = Number(rows[0]?.id);
      for (const r of race.results) {
        await client.query(
          `INSERT INTO race_results (race_id, rank, user_id, display_name, time_ms)
           VALUES ($1, $2, $3, $4, $5)`,
          [raceId, r.rank, r.userId, r.displayName, r.timeMs],
        );
      }
      await client.query("COMMIT");
      return raceId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** Statistiques d'un joueur (pseudo insensible à la casse), ou null s'il n'existe pas. */
  async getUserStats(username: string): Promise<UserStats | null> {
    const user = await this.pool.query<{ id: string; username: string; created_at: Date }>(
      "SELECT id, username, created_at FROM users WHERE lower(username) = lower($1)",
      [username],
    );
    const row = user.rows[0];
    if (!row) return null;

    // COUNT(*) FILTER : plusieurs compteurs en un seul passage sur les résultats.
    // Victoire et podium exigent d'avoir fini : une 2e place DNF sur 2 n'est pas un podium.
    const totals = await this.pool.query<{
      races: string;
      wins: string;
      podiums: string;
      finished: string;
    }>(
      `SELECT count(*)                                  AS races,
              count(*) FILTER (WHERE rank = 1 AND time_ms IS NOT NULL)  AS wins,
              count(*) FILTER (WHERE rank <= 3 AND time_ms IS NOT NULL) AS podiums,
              count(*) FILTER (WHERE time_ms IS NOT NULL) AS finished
       FROM race_results WHERE user_id = $1`,
      [row.id],
    );
    const best = await this.pool.query<{ track_id: string; laps: number; time_ms: number }>(
      `SELECT r.track_id, r.laps, min(rr.time_ms) AS time_ms
       FROM race_results rr JOIN races r ON r.id = rr.race_id
       WHERE rr.user_id = $1 AND rr.time_ms IS NOT NULL
       GROUP BY r.track_id, r.laps
       ORDER BY r.track_id, r.laps`,
      [row.id],
    );
    const t = totals.rows[0];
    return {
      username: row.username,
      memberSince: row.created_at.toISOString(),
      races: Number(t?.races ?? 0),
      wins: Number(t?.wins ?? 0),
      podiums: Number(t?.podiums ?? 0),
      finished: Number(t?.finished ?? 0),
      bestTimes: best.rows.map((b) => ({ trackId: b.track_id, laps: b.laps, timeMs: b.time_ms })),
    };
  }

  /** Dernières courses d'un joueur, de la plus récente à la plus ancienne. */
  async getRecentRaces(username: string, limit = 20): Promise<RaceHistoryEntry[]> {
    const { rows } = await this.pool.query<{
      race_id: string;
      track_id: string;
      laps: number;
      finished_at: Date;
      rank: number;
      participants: string;
      time_ms: number | null;
    }>(
      `SELECT r.id AS race_id, r.track_id, r.laps, r.finished_at, rr.rank, rr.time_ms,
              (SELECT count(*) FROM race_results x WHERE x.race_id = r.id) AS participants
       FROM race_results rr
       JOIN races r ON r.id = rr.race_id
       JOIN users u ON u.id = rr.user_id
       WHERE lower(u.username) = lower($1)
       ORDER BY r.finished_at DESC, r.id DESC
       LIMIT $2`,
      [username, limit],
    );
    return rows.map((r) => ({
      raceId: Number(r.race_id),
      trackId: r.track_id,
      laps: r.laps,
      finishedAt: r.finished_at.toISOString(),
      rank: r.rank,
      participants: Number(r.participants),
      timeMs: r.time_ms,
    }));
  }
}
