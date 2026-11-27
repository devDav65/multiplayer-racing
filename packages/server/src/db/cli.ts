/** `pnpm db:migrate` : applique les migrations en attente sur DATABASE_URL. */
import { loadConfig, loadEnvFile } from "../config";
import { runMigrations } from "./migrate";
import { createPool } from "./pool";

loadEnvFile();
const config = loadConfig();
if (!config.DATABASE_URL) {
  console.error("DATABASE_URL n'est pas défini (voir .env.example).");
  process.exit(1);
}
const pool = createPool(config.DATABASE_URL);
try {
  const applied = await runMigrations(pool);
  console.log(applied.length ? `Appliquées : ${applied.join(", ")}` : "Base déjà à jour.");
} finally {
  await pool.end();
}
