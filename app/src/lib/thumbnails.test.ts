import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("thumbnails", () => {
  let workDir: string;
  beforeAll(() => { workDir = mkdtempSync(path.join(tmpdir(), "thumb-")); });

  it("generates a JPEG thumbnail from an image", async () => {
    const { generateThumbnail } = await import("./thumbnails");
    const dst = path.join(workDir, "img.jpg");
    const meta = await generateThumbnail({
      srcPath: "tests/fixtures/sample.png",
      mimeType: "image/png",
      dstPath: dst,
    });
    expect(existsSync(dst)).toBe(true);
    expect(statSync(dst).size).toBeGreaterThan(0);
    expect(meta.width).toBe(2);
    expect(meta.height).toBe(2);
  });

  it("generates a JPEG thumbnail from a video", async () => {
    const { generateThumbnail } = await import("./thumbnails");
    const dst = path.join(workDir, "vid.jpg");
    const meta = await generateThumbnail({
      srcPath: "tests/fixtures/sample.mp4",
      mimeType: "video/mp4",
      dstPath: dst,
    });
    expect(existsSync(dst)).toBe(true);
    expect(statSync(dst).size).toBeGreaterThan(0);
    expect(meta.durationSec).toBeGreaterThan(0);
  });

  it("returns null for unsupported types", async () => {
    const { generateThumbnail } = await import("./thumbnails");
    const result = await generateThumbnail({
      srcPath: "tests/fixtures/sample.png",
      mimeType: "application/octet-stream",
      dstPath: path.join(workDir, "x.jpg"),
    });
    expect(result).toBeNull();
  });
});
