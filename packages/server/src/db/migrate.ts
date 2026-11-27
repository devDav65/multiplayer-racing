import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

export const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations/", import.meta.url));

/** Identifiant arbitraire du verrou : deux serveurs qui démarrent ensemble ne migrent pas en même temps. */
const MIGRATION_LOCK_ID = 726_354_001;

/**
 * MIGRATIONS
 *
 * Le schéma de la base évolue avec le code. Chaque changement est un fichier SQL numéroté
 * (001_init.sql, 002_...), appliqué UNE seule fois, dans l'ordre. La table
 * schema_migrations retient ceux déjà appliqués. Chaque fichier tourne dans une
 * transaction : s'il échoue, rien n'est appliqué à moitié.
 *
 * Règle : on ne modifie jamais une migration déjà appliquée ; on en ajoute une nouvelle.
 *
 * Renvoie les noms des migrations appliquées pendant cet appel.
 */
export async function runMigrations(pool: Pool, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const done = new Set(
      (await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map(
        (r) => r.name,
      ),
    );
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(`${dir}/${file}`, "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} échouée : ${(error as Error).message}`);
      }
      applied.push(file);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
  return applied;
}
