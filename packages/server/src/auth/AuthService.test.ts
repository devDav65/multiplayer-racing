import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL } from "../db/testDb";
import { AuthService, SESSION_TTL_MS } from "./AuthService";

describe.skipIf(!TEST_DATABASE_URL)("AuthService (PostgreSQL)", () => {
  let pool: Pool;
  let drop: () => Promise<void>;
  let now = Date.UTC(2026, 0, 1);
  let auth: AuthService;

  beforeAll(async () => {
    ({ pool, drop } = await createTestDb());
    auth = new AuthService(pool, () => now);
  });
  afterAll(async () => {
    await drop?.();
  });

  it("inscrit un joueur et refuse le même pseudo, quelle que soit la casse", async () => {
    const first = await auth.register("Alice", "motdepasse1");
    expect(first).toMatchObject({ ok: true, user: { username: "Alice" } });
    expect(await auth.register("ALICE", "autre-mdp-2")).toEqual({
      ok: false,
      error: "username_taken",
    });
  });

  it("connecte avec le bon mot de passe, insensible à la casse du pseudo", async () => {
    expect(await auth.login("alice", "motdepasse1")).toMatchObject({ username: "Alice" });
    expect(await auth.login("Alice", "mauvais")).toBeNull();
    expect(await auth.login("inconnu", "motdepasse1")).toBeNull();
  });

  it("ne stocke ni le mot de passe ni le jeton en clair", async () => {
    const user = await auth.login("Alice", "motdepasse1");
    if (!user) throw new Error();
    const { token } = await auth.createSession(user.id);
    const users = await pool.query("SELECT password_hash FROM users");
    const sessions = await pool.query("SELECT token_hash FROM sessions");
    expect(JSON.stringify(users.rows)).not.toContain("motdepasse1");
    expect(sessions.rows.map((r) => (r.token_hash as Buffer).toString("base64url"))).not.toContain(
      token,
    );
  });

  it("gère le cycle de vie d'une session : valide, expirée, supprimée", async () => {
    const user = await auth.login("Alice", "motdepasse1");
    if (!user) throw new Error();
    const { token } = await auth.createSession(user.id);
    expect(await auth.getSessionUser(token)).toEqual(user);
    expect(await auth.getSessionUser("jeton-bidon")).toBeNull();

    now += SESSION_TTL_MS + 1;
    expect(await auth.getSessionUser(token)).toBeNull();
    expect(await auth.purgeExpiredSessions()).toBeGreaterThanOrEqual(1);

    now = Date.UTC(2026, 0, 1);
    const second = await auth.createSession(user.id);
    await auth.deleteSession(second.token);
    expect(await auth.getSessionUser(second.token)).toBeNull();
  });
});
