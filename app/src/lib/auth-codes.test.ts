import { describe, it, expect } from "vitest";
import { sha256Base64Url } from "./auth-codes";

describe("sha256Base64Url", () => {
  it("produces a 43-char base64url string with no padding", () => {
    const out = sha256Base64Url("any input");
    expect(out).toHaveLength(43);
    expect(out).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("matches the PKCE RFC 7636 §4.2 example vector", () => {
    // Per the RFC: code_verifier "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    // → code_challenge "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(sha256Base64Url(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("produces different output for different input", () => {
    expect(sha256Base64Url("a")).not.toBe(sha256Base64Url("b"));
  });
});
