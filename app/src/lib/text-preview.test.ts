import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isPreviewableTextMime, readTextPreview } from "./text-preview";

describe("isPreviewableTextMime", () => {
  it("allows common text mimes", () => {
    expect(isPreviewableTextMime("text/plain")).toBe(true);
    expect(isPreviewableTextMime("text/markdown")).toBe(true);
    expect(isPreviewableTextMime("text/csv")).toBe(true);
    expect(isPreviewableTextMime("application/json")).toBe(true);
    expect(isPreviewableTextMime("application/xml")).toBe(true);
    expect(isPreviewableTextMime("application/javascript")).toBe(true);
  });
  it("rejects unsafe and binary mimes", () => {
    expect(isPreviewableTextMime("text/html")).toBe(false);
    expect(isPreviewableTextMime("image/svg+xml")).toBe(false);
    expect(isPreviewableTextMime("application/octet-stream")).toBe(false);
    expect(isPreviewableTextMime("video/mp4")).toBe(false);
    expect(isPreviewableTextMime("")).toBe(false);
  });
});

describe("readTextPreview", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vv-text-"));

  it("returns full text when under cap", async () => {
    const p = path.join(dir, "small.txt");
    writeFileSync(p, "hello world");
    const r = await readTextPreview(p, 1024);
    expect(r.text).toBe("hello world");
    expect(r.truncated).toBe(false);
  });
  it("caps at capBytes and marks truncated", async () => {
    const p = path.join(dir, "big.txt");
    writeFileSync(p, "a".repeat(5000));
    const r = await readTextPreview(p, 1024);
    expect(r.text.length).toBe(1024);
    expect(r.truncated).toBe(true);
  });
  it("returns empty on missing file without throwing", async () => {
    const r = await readTextPreview(path.join(dir, "missing.txt"), 1024);
    expect(r.text).toBe("");
    expect(r.truncated).toBe(false);
    expect(r.error).toBe(true);
  });
});
