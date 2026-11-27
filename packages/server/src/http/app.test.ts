import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../auth/AuthService";
import { createTestDb, TEST_DATABASE_URL } from "../db/testDb";
import { RaceRepository } from "../races/RaceRepository";
import { createHttpApp } from "./app";

const ORIGIN = "http://localhost:5173";

/** Horloge des limiteurs de débit, avancée par les tests (chaque test repart avec des seaux pleins). */
let clock = 0;

/** Démarre l'app sur un port libre et renvoie une fonction de requête. */
async function start(auth: AuthService | null, races: RaceRepository | null = null) {
  const app = createHttpApp({
    auth,
    races,
    clientOrigin: ORIGIN,
    secureCookies: false,
    trustProxy: 0,
    now: () => clock,
  });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, init: RequestInit = {}) =>
    fetch(base + path, {
      ...init,
      headers: { "content-type": "application/json", origin: ORIGIN, ...init.headers },
    });
  return { server, request };
}

const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";

describe("HTTP sans base de données", () => {
  it("répond à /health et désactive les comptes", async () => {
    const { server, request } = await start(null);
    expect((await request("/health")).status).toBe(200);
    const res = await request("/api/auth/login", { method: "POST", body: "{}" });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("accounts_disabled");
    server.close();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("HTTP /api/auth (PostgreSQL)", () => {
  let pool: Pool;
  let drop: () => Promise<void>;
  let server: Server;
  let request: Awaited<ReturnType<typeof start>>["request"];

  beforeAll(async () => {
    ({ pool, drop } = await createTestDb());
    ({ server, request } = await start(new AuthService(pool), new RaceRepository(pool)));
  });
  beforeEach(() => {
    clock += 3_600_000;
  });
  afterAll(async () => {
    server?.close();
    await drop?.();
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    request(path, { method: "POST", body: JSON.stringify(body), headers });

  it("inscription → cookie de session → /me → déconnexion", async () => {
    const reg = await post("/api/auth/register", { username: "Bob_42", password: "unmotdepasse" });
    expect(reg.status).toBe(201);
    expect(reg.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Lax/);
    const cookie = cookieOf(reg);

    const me = await request("/api/auth/me", { headers: { cookie } });
    expect(await me.json()).toMatchObject({ user: { username: "Bob_42" } });

    expect((await post("/api/auth/logout", {}, { cookie })).status).toBe(204);
    expect((await request("/api/auth/me", { headers: { cookie } })).status).toBe(401);
  });

  it("connexion : bon et mauvais mot de passe, même message pour un pseudo inconnu", async () => {
    await post("/api/auth/register", { username: "Carla", password: "secret-carla" });
    expect(
      (await post("/api/auth/login", { username: "carla", password: "secret-carla" })).status,
    ).toBe(200);
    const wrong = await post("/api/auth/login", { username: "Carla", password: "mauvais!!" });
    const unknown = await post("/api/auth/login", { username: "Nobody", password: "mauvais!!" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("valide les entrées et refuse un pseudo déjà pris", async () => {
    const short = await post("/api/auth/register", { username: "ab", password: "unmotdepasse" });
    expect(short.status).toBe(400);
    const weak = await post("/api/auth/register", { username: "Dora", password: "court" });
    expect(((await weak.json()) as { message: string }).message).toMatch(/8 caractères/);
    const sqlish = await post("/api/auth/register", {
      username: "x'; DROP TABLE users;--",
      password: "unmotdepasse",
    });
    expect(sqlish.status).toBe(400);
    const taken = await post("/api/auth/register", {
      username: "BOB_42",
      password: "unmotdepasse",
    });
    expect(taken.status).toBe(409);
  });

  it("refuse une requête venant d'une autre origine (CSRF) et un JSON mal formé", async () => {
    const evil = await post(
      "/api/auth/login",
      { username: "Carla", password: "secret-carla" },
      {
        origin: "https://evil.example",
      },
    );
    expect(evil.status).toBe(403);
    const broken = await request("/api/auth/login", { method: "POST", body: "{pas du json" });
    expect(broken.status).toBe(400);
  });

  it("limite les tentatives de connexion par IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      statuses.push(
        (await post("/api/auth/login", { username: "Carla", password: "mauvais!!" })).status,
      );
    }
    expect(statuses).toContain(429);
  });

  it("expose les statistiques et l'historique d'un joueur", async () => {
    const reg = await post("/api/auth/register", { username: "Eve", password: "unmotdepasse" });
    const { user } = (await reg.json()) as { user: { id: number } };
    await new RaceRepository(pool).saveRace({
      roomCode: "ABCD",
      trackId: "circuit-1",
      laps: 3,
      startedAt: new Date(Date.UTC(2026, 0, 1)),
      finishedAt: new Date(Date.UTC(2026, 0, 1, 0, 2)),
      results: [{ rank: 1, userId: user.id, displayName: "Eve", timeMs: 80_000 }],
    });
    const stats = await request("/api/users/eve/stats");
    expect(await stats.json()).toMatchObject({ stats: { username: "Eve", races: 1, wins: 1 } });
    const races = (await (await request("/api/users/Eve/races")).json()) as { races: unknown[] };
    expect(races.races).toHaveLength(1);
    expect((await request("/api/users/inconnu/stats")).status).toBe(404);
    expect((await request("/api/users/%27%3B--/stats")).status).toBe(404);
  });
});
