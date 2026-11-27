import { buildTrack, CIRCUIT_1, MAX_PLAYERS_PER_ROOM } from "@racing/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Room } from "./Room";
import { ROOM_CODE_LENGTH, RoomManager } from "./RoomManager";

const track = buildTrack(CIRCUIT_1);
const factory = (code: string) =>
  new Room({ code, track, onSnapshot: () => {}, onRoomState: () => {} });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("RoomManager", () => {
  it("crée un salon avec un code de 4 lettres et y place le joueur", () => {
    const m = new RoomManager(factory);
    const r = m.create("a", "Alice");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code).toMatch(new RegExp(`^[A-Z]{${ROOM_CODE_LENGTH}}$`));
    expect(m.roomOf("a")?.code).toBe(r.code);
  });

  it("rejoint un salon par son code, refuse un code inconnu", () => {
    const m = new RoomManager(factory);
    const r = m.create("a", "Alice");
    if (!r.ok) throw new Error();
    expect(m.join("b", r.code, "Bob")).toMatchObject({ ok: true, code: r.code });
    expect(m.roomOf("b")).toBe(m.roomOf("a"));
    expect(m.join("c", "ZZZZ", "Carl").ok).toBe(false);
  });

  it("refuse un salon plein", () => {
    const m = new RoomManager(factory);
    const r = m.create("p0", "P");
    if (!r.ok) throw new Error();
    for (let i = 1; i < MAX_PLAYERS_PER_ROOM; i++) m.join(`p${i}`, r.code, "P");
    expect(m.join("de-trop", r.code, "X")).toEqual({ ok: false, error: "Salon plein." });
  });

  it("change de salon : quitte l'ancien, qui est supprimé s'il est vide", () => {
    const m = new RoomManager(factory);
    const first = m.create("a", "A");
    const second = m.create("b", "B");
    if (!first.ok || !second.ok) throw new Error();
    expect(m.roomCount).toBe(2);
    m.join("a", second.code, "A");
    expect(m.roomCount).toBe(1);
    expect(m.join("x", first.code, "X").ok).toBe(false);
  });

  it("supprime le salon quand le dernier joueur part", () => {
    const m = new RoomManager(factory);
    m.create("a", "A");
    m.leave("a");
    expect(m.roomCount).toBe(0);
    expect(m.roomOf("a")).toBeUndefined();
  });

  it("ne réutilise pas un code déjà pris", () => {
    // Générateur truqué : donne deux fois le même code, puis un autre.
    const values = [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5];
    const m = new RoomManager(factory, () => values.shift() ?? 0.9);
    const a = m.create("a", "A");
    const b = m.create("b", "B");
    if (!a.ok || !b.ok) throw new Error();
    expect(a.code).toBe("AAAA");
    expect(b.code).not.toBe("AAAA");
  });
});
