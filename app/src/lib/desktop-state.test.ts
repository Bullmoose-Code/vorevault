import { describe, it, expect } from "vitest";
import {
  formatDesktopState,
  parseDesktopState,
  validateDesktopState,
} from "./desktop-state";

// 43-char base64url string (matches the SHA256 challenge format).
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("formatDesktopState", () => {
  it("encodes port and code_challenge with the desktop: prefix", () => {
    expect(formatDesktopState({ port: 42876, code_challenge: CHALLENGE })).toBe(
      `desktop:42876:${CHALLENGE}`,
    );
  });
});

describe("parseDesktopState", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseDesktopState(null)).toBeNull();
    expect(parseDesktopState(undefined)).toBeNull();
    expect(parseDesktopState("")).toBeNull();
  });

  it("returns null when prefix is wrong", () => {
    expect(parseDesktopState(`web:42876:${CHALLENGE}`)).toBeNull();
    expect(parseDesktopState(`42876:${CHALLENGE}`)).toBeNull();
  });

  it("returns null when there are not exactly 3 colon-separated segments", () => {
    expect(parseDesktopState("desktop:42876")).toBeNull();
    expect(parseDesktopState(`desktop:42876:${CHALLENGE}:extra`)).toBeNull();
  });

  it("returns null when port is not an integer in [1024, 65535]", () => {
    expect(parseDesktopState(`desktop:abc:${CHALLENGE}`)).toBeNull();
    expect(parseDesktopState(`desktop:1023:${CHALLENGE}`)).toBeNull();
    expect(parseDesktopState(`desktop:65536:${CHALLENGE}`)).toBeNull();
    expect(parseDesktopState(`desktop:0:${CHALLENGE}`)).toBeNull();
    expect(parseDesktopState(`desktop:-1:${CHALLENGE}`)).toBeNull();
    expect(parseDesktopState(`desktop:42876.5:${CHALLENGE}`)).toBeNull();
  });

  it("returns null when code_challenge is not exactly 43 base64url chars", () => {
    // 42 chars
    expect(parseDesktopState(`desktop:42876:${"A".repeat(42)}`)).toBeNull();
    // 44 chars
    expect(parseDesktopState(`desktop:42876:${"A".repeat(44)}`)).toBeNull();
    // valid length but invalid character (=)
    expect(parseDesktopState(`desktop:42876:${"A".repeat(42)}=`)).toBeNull();
    // valid length but invalid character (space)
    expect(parseDesktopState(`desktop:42876:${"A".repeat(42)} `)).toBeNull();
  });

  it("returns the parsed state for valid input", () => {
    expect(parseDesktopState(`desktop:42876:${CHALLENGE}`)).toEqual({
      port: 42876,
      code_challenge: CHALLENGE,
    });
  });

  it("accepts port boundary values 1024 and 65535", () => {
    expect(parseDesktopState(`desktop:1024:${CHALLENGE}`)).toEqual({
      port: 1024,
      code_challenge: CHALLENGE,
    });
    expect(parseDesktopState(`desktop:65535:${CHALLENGE}`)).toEqual({
      port: 65535,
      code_challenge: CHALLENGE,
    });
  });
});

describe("validateDesktopState", () => {
  it("accepts valid raw inputs (string port + string challenge)", () => {
    expect(validateDesktopState("42876", CHALLENGE)).toEqual({
      port: 42876,
      code_challenge: CHALLENGE,
    });
  });

  it("accepts numeric port", () => {
    expect(validateDesktopState(42876, CHALLENGE)).toEqual({
      port: 42876,
      code_challenge: CHALLENGE,
    });
  });

  it("rejects out-of-range port", () => {
    expect(validateDesktopState("1023", CHALLENGE)).toBeNull();
    expect(validateDesktopState("65536", CHALLENGE)).toBeNull();
  });

  it("rejects non-integer port", () => {
    expect(validateDesktopState("abc", CHALLENGE)).toBeNull();
    expect(validateDesktopState(42.5, CHALLENGE)).toBeNull();
  });

  it("rejects malformed code_challenge", () => {
    expect(validateDesktopState("42876", "short")).toBeNull();
    expect(validateDesktopState("42876", undefined)).toBeNull();
    expect(validateDesktopState("42876", null)).toBeNull();
  });

  it("rejects non-string non-number port", () => {
    expect(validateDesktopState(undefined, CHALLENGE)).toBeNull();
    expect(validateDesktopState(null, CHALLENGE)).toBeNull();
    expect(validateDesktopState({}, CHALLENGE)).toBeNull();
  });

  it("rejects string port with trailing junk (consistency with parseDesktopState)", () => {
    expect(validateDesktopState("42876abc", CHALLENGE)).toBeNull();
    expect(validateDesktopState("42876.5", CHALLENGE)).toBeNull();
    expect(validateDesktopState(" 42876", CHALLENGE)).toBeNull();
    expect(validateDesktopState("42876 ", CHALLENGE)).toBeNull();
  });
});
