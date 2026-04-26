import { describe, it, expect } from "vitest";
import { formatDesktopState, parseDesktopState } from "./desktop-state";

const CSRF = "abcdef1234567890ABCDEF_-";

describe("formatDesktopState", () => {
  it("encodes port and csrf with the desktop: prefix", () => {
    expect(formatDesktopState({ port: 42876, csrf: CSRF })).toBe(`desktop:42876:${CSRF}`);
  });
});

describe("parseDesktopState", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseDesktopState(null)).toBeNull();
    expect(parseDesktopState(undefined)).toBeNull();
    expect(parseDesktopState("")).toBeNull();
  });

  it("returns null when prefix is wrong", () => {
    expect(parseDesktopState(`web:42876:${CSRF}`)).toBeNull();
    expect(parseDesktopState(`42876:${CSRF}`)).toBeNull();
  });

  it("returns null when there are not exactly 3 colon-separated segments", () => {
    expect(parseDesktopState("desktop:42876")).toBeNull();
    expect(parseDesktopState(`desktop:42876:${CSRF}:extra`)).toBeNull();
  });

  it("returns null when port is not an integer in [1024, 65535]", () => {
    expect(parseDesktopState(`desktop:abc:${CSRF}`)).toBeNull();
    expect(parseDesktopState(`desktop:1023:${CSRF}`)).toBeNull();
    expect(parseDesktopState(`desktop:65536:${CSRF}`)).toBeNull();
    expect(parseDesktopState(`desktop:0:${CSRF}`)).toBeNull();
    expect(parseDesktopState(`desktop:-1:${CSRF}`)).toBeNull();
    expect(parseDesktopState(`desktop:42876.5:${CSRF}`)).toBeNull();
  });

  it("returns null when csrf is too short, too long, or contains invalid characters", () => {
    expect(parseDesktopState("desktop:42876:short")).toBeNull(); // < 20 chars
    expect(parseDesktopState(`desktop:42876:${"a".repeat(65)}`)).toBeNull(); // > 64 chars
    expect(parseDesktopState("desktop:42876:has spaces 1234567890")).toBeNull();
    expect(parseDesktopState("desktop:42876:has=equals1234567890ab")).toBeNull();
  });

  it("returns the parsed state for valid input", () => {
    expect(parseDesktopState(`desktop:42876:${CSRF}`)).toEqual({
      port: 42876,
      csrf: CSRF,
    });
  });

  it("accepts port boundary values 1024 and 65535", () => {
    expect(parseDesktopState(`desktop:1024:${CSRF}`)).toEqual({ port: 1024, csrf: CSRF });
    expect(parseDesktopState(`desktop:65535:${CSRF}`)).toEqual({ port: 65535, csrf: CSRF });
  });
});
