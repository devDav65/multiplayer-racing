import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { loadEnvFile } from "../config";
import { runMigrations } from "./migrate";
import { createPool } from "./pool";

loadEnvFile();

/** URL de la base de test, ou undefined : les tests d'intégration sont alors ignorés. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * Base de test isolée : un SCHÉMA PostgreSQL neuf par fichier de test (Vitest exécute les
 * fichiers en parallèle), migré, puis supprimé à la fin. Les tests ne se gênent pas entre eux.
 */
export async function createTestDb(): Promise<{ pool: Pool; drop: () => Promise<void> }> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL non défini");
  const schema = `test_${randomBytes(6).toString("hex")}`;
  const admin = createPool(TEST_DATABASE_URL, { max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();

  const pool = createPool(TEST_DATABASE_URL, { max: 4, options: `-c search_path=${schema}` });
  await runMigrations(pool);
  return {
    pool,
    drop: async () => {
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
    },
  };
}
