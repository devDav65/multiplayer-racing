import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate";
import { createTestDb, TEST_DATABASE_URL } from "./testDb";

describe.skipIf(!TEST_DATABASE_URL)("migrations (PostgreSQL)", () => {
  let pool: Pool;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ pool, drop } = await createTestDb());
  });
  afterAll(async () => {
    await drop?.();
  });

  it("crée les tables et enregistre la migration", async () => {
    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() ORDER BY table_name`,
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual([
      "race_results",
      "races",
      "schema_migrations",
      "sessions",
      "users",
    ]);
  });

  it("ne rejoue pas une migration déjà appliquée", async () => {
    expect(await runMigrations(pool)).toEqual([]);
  });

  it("refuse deux pseudos qui ne diffèrent que par la casse", async () => {
    await pool.query("INSERT INTO users (username, password_hash) VALUES ('Alice', 'x')");
    await expect(
      pool.query("INSERT INTO users (username, password_hash) VALUES ('alice', 'x')"),
    ).rejects.toThrow(/users_username_lower_key/);
  });
});
