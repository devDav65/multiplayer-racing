import { describe, expect, it } from "vitest";
import { joinRoomSchema, playerNameSchema } from "./roomSchemas";

describe("schémas de salon", () => {
  it("nettoie et accepte un pseudo normal, y compris accentué", () => {
    expect(playerNameSchema.parse("  Éloïse ")).toBe("Éloïse");
  });

  it.each([
    ["vide", "   "],
    ["trop long", "x".repeat(17)],
    ["caractère de contrôle", "abc\u0000"],
    ["caractère invisible", "a‎b"],
    ["pas une chaîne", 42],
  ])("refuse un pseudo %s", (_label, value) => {
    expect(playerNameSchema.safeParse(value).success).toBe(false);
  });

  it("normalise le code en majuscules et refuse les codes mal formés", () => {
    expect(joinRoomSchema.parse({ code: "abcd", name: "Bob" }).code).toBe("ABCD");
    for (const code of ["ABC", "ABCDE", "AB1D", ""]) {
      expect(joinRoomSchema.safeParse({ code, name: "Bob" }).success).toBe(false);
    }
  });
});
