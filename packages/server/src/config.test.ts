import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("applique les valeurs par défaut", () => {
    expect(loadConfig({})).toEqual({
      NODE_ENV: "development",
      PORT: 3001,
      CLIENT_ORIGIN: "http://localhost:5173",
    });
  });

  it("convertit les nombres et traite une valeur vide comme absente", () => {
    const config = loadConfig({ PORT: "8080", RACE_LAPS: "2", DATABASE_URL: "" });
    expect(config.PORT).toBe(8080);
    expect(config.RACE_LAPS).toBe(2);
    expect(config.DATABASE_URL).toBeUndefined();
  });

  it("refuse une configuration invalide avec un message clair", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/PORT/);
    expect(() => loadConfig({ RACE_LAPS: "50" })).toThrow(/RACE_LAPS/);
    expect(() => loadConfig({ DATABASE_URL: "pas une url" })).toThrow(/DATABASE_URL/);
  });
});
