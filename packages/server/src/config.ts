import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** Fichier .env à la racine du dépôt (optionnel). */
const ENV_FILE = fileURLToPath(new URL("../../../.env", import.meta.url));

/** Une variable définie mais vide (`DATABASE_URL=`) compte comme absente. */
const emptyAsUndefined = (v: unknown) => (v === "" ? undefined : v);

/**
 * Variables d'environnement, validées au démarrage : une faute de frappe dans la
 * configuration doit faire échouer le lancement, pas provoquer un bug plus tard.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  /** Nombre de tours (1 à 10), surtout utile en développement pour des courses courtes. */
  RACE_LAPS: z.preprocess(emptyAsUndefined, z.coerce.number().int().min(1).max(10).optional()),
  /** Sans base de données, le serveur fonctionne en mode invité seulement. */
  DATABASE_URL: z.preprocess(emptyAsUndefined, z.string().url().optional()),
  /** Nombre de proxys de confiance devant le serveur (1 derrière Caddy), pour lire la vraie IP. */
  TRUST_PROXY: z.preprocess(emptyAsUndefined, z.coerce.number().int().min(0).max(5).default(0)),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")} : ${i.message}`);
    throw new Error(`Configuration invalide :\n${issues.join("\n")}`);
  }
  return parsed.data;
}

/** Charge le .env de la racine s'il existe (les variables déjà définies restent prioritaires). */
export function loadEnvFile(): void {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}
