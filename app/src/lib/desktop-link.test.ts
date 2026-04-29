import { describe, it, expect } from "vitest";
import { buildDesktopLink } from "./desktop-link";

describe("buildDesktopLink", () => {
  it("constructs a vorevault:// URL with the file's id under /open/f/", () => {
    expect(buildDesktopLink("abc-123-uuid")).toBe(
      "vorevault://open/f/abc-123-uuid",
    );
  });

  it("matches the canonical UUID format used by the vault", () => {
    expect(buildDesktopLink("00000000-0000-4000-8000-000000000000")).toBe(
      "vorevault://open/f/00000000-0000-4000-8000-000000000000",
    );
  });

  it("does not URL-encode the file id (UUIDs are already URL-safe)", () => {
    // If we ever started URL-encoding, this would become `abc%2D123` instead.
    expect(buildDesktopLink("abc-123")).toBe("vorevault://open/f/abc-123");
  });
});
