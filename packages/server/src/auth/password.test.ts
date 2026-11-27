import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("vérifie le bon mot de passe et refuse un mauvais", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
  });

  it("produit un hash différent à chaque fois (sel aléatoire) et ne contient pas le mot de passe", async () => {
    const [a, b] = await Promise.all([hashPassword("motdepasse"), hashPassword("motdepasse")]);
    expect(a).not.toBe(b);
    expect(a).not.toContain("motdepasse");
    expect(a).toMatch(/^scrypt\$32768\$8\$3\$/);
  });

  it("refuse un hash mal formé sans planter", async () => {
    expect(await verifyPassword("x", "n'importe quoi")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
  });
});
