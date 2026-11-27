import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { getDummyHash, hashPassword, verifyPassword } from "./password";

/** Durée de vie d'une session. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface User {
  id: number;
  username: string;
}

export type RegisterResult = { ok: true; user: User } | { ok: false; error: "username_taken" };

/** Le jeton est envoyé au navigateur ; la base n'en garde que l'empreinte SHA-256. */
function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/**
 * Comptes et sessions. Les entrées sont supposées DÉJÀ validées (Zod, côté HTTP).
 * Toutes les requêtes SQL sont paramétrées ($1, $2...) : jamais de concaténation de
 * texte venant d'un joueur, donc pas d'injection SQL possible.
 */
export class AuthService {
  private readonly pool: Pool;
  private readonly now: () => number;

  constructor(pool: Pool, now: () => number = Date.now) {
    this.pool = pool;
    this.now = now;
  }

  async register(username: string, password: string): Promise<RegisterResult> {
    const passwordHash = await hashPassword(password);
    try {
      const { rows } = await this.pool.query<{ id: string; username: string }>(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
        [username, passwordHash],
      );
      const row = rows[0];
      if (!row) throw new Error("INSERT sans résultat");
      return { ok: true, user: { id: Number(row.id), username: row.username } };
    } catch (error) {
      // 23505 = violation d'unicité : pseudo déjà pris (sans tenir compte de la casse).
      if ((error as { code?: string }).code === "23505") {
        return { ok: false, error: "username_taken" };
      }
      throw error;
    }
  }

  /** Renvoie l'utilisateur si le couple pseudo/mot de passe est bon, sinon null. */
  async login(username: string, password: string): Promise<User | null> {
    const { rows } = await this.pool.query<{ id: string; username: string; password_hash: string }>(
      "SELECT id, username, password_hash FROM users WHERE lower(username) = lower($1)",
      [username],
    );
    const row = rows[0];
    // Même coût de calcul que le compte existe ou non (voir getDummyHash).
    const valid = await verifyPassword(password, row?.password_hash ?? (await getDummyHash()));
    return row && valid ? { id: Number(row.id), username: row.username } : null;
  }

  /** Crée une session et renvoie le jeton à mettre dans le cookie. */
  async createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.now() + SESSION_TTL_MS);
    await this.pool.query(
      "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [userId, hashToken(token), expiresAt],
    );
    return { token, expiresAt };
  }

  /** L'utilisateur d'une session valide (non expirée), ou null. */
  async getSessionUser(token: string): Promise<User | null> {
    const { rows } = await this.pool.query<{ id: string; username: string }>(
      `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > $2`,
      [hashToken(token), new Date(this.now())],
    );
    const row = rows[0];
    return row ? { id: Number(row.id), username: row.username } : null;
  }

  async deleteSession(token: string): Promise<void> {
    await this.pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }

  /** Supprime les sessions expirées. Renvoie le nombre supprimé. */
  async purgeExpiredSessions(): Promise<number> {
    const result = await this.pool.query("DELETE FROM sessions WHERE expires_at <= $1", [
      new Date(this.now()),
    ]);
    return result.rowCount ?? 0;
  }
}
