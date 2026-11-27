import { describe, expect, it } from "vitest";
import { clearSessionCookie, parseCookies, sessionCookie } from "./cookies";

describe("cookies", () => {
  it("lit un en-tête Cookie", () => {
    expect(parseCookies("a=1; session=abc%3D; b")).toEqual({ a: "1", session: "abc=" });
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("bad=%E0%A4%A")).toEqual({});
  });

  it("pose un cookie de session HttpOnly, SameSite, Secure en production", () => {
    const cookie = sessionCookie("tok", 60_000, true);
    expect(cookie).toBe("session=tok; Path=/; HttpOnly; SameSite=Lax; Max-Age=60; Secure");
    expect(sessionCookie("tok", 60_000, false)).not.toContain("Secure");
    expect(clearSessionCookie(false)).toContain("Max-Age=0");
  });
});
