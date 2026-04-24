import { describe, it, expect } from "vitest";
import { normalizeTagName, TagNameError } from "./tags";

describe("normalizeTagName", () => {
  it("lowercases and trims", () => {
    expect(normalizeTagName("  Valheim  ")).toBe("valheim");
  });
  it("accepts alphanumeric + hyphen", () => {
    expect(normalizeTagName("side-quest")).toBe("side-quest");
    expect(normalizeTagName("2024-clips")).toBe("2024-clips");
  });
  it("rejects empty", () => {
    expect(() => normalizeTagName("  ")).toThrow(TagNameError);
  });
  it("rejects leading hyphen", () => {
    expect(() => normalizeTagName("-game")).toThrow(TagNameError);
  });
  it("rejects spaces + punctuation", () => {
    expect(() => normalizeTagName("hello world")).toThrow(TagNameError);
    expect(() => normalizeTagName("game!")).toThrow(TagNameError);
  });
  it("rejects over 32 chars", () => {
    expect(() => normalizeTagName("a".repeat(33))).toThrow(TagNameError);
  });
  it("accepts 32 chars exactly", () => {
    const max = "a".repeat(32);
    expect(normalizeTagName(max)).toBe(max);
  });
});
