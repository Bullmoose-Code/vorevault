import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { mkdtempSync, rmSync, writeFileSync, statSync } from "node:fs";
import * as os from "node:os";

describe("storage helpers", () => {
  it("freeBytes returns positive number for an existing dir", async () => {
    const { freeBytes } = await import("./storage");
    const free = await freeBytes("/tmp");
    expect(typeof free).toBe("bigint");
    expect(free > 0n).toBe(true);
  });

  it("canonicalUploadPath builds /data/uploads/<uuid>/<sanitized-name>", async () => {
    const { canonicalUploadPath } = await import("./storage");
    const p = canonicalUploadPath("12345678-1234-1234-1234-123456789012", "My Clip.mp4");
    expect(p).toBe("/data/uploads/12345678-1234-1234-1234-123456789012/My Clip.mp4");
  });

  it("canonicalUploadPath strips path separators from the name", async () => {
    const { canonicalUploadPath } = await import("./storage");
    const p = canonicalUploadPath("aaa", "../etc/passwd");
    expect(p).toBe("/data/uploads/aaa/.._etc_passwd");
  });

  it("canonicalThumbPath returns /data/thumbs/<uuid>.jpg", async () => {
    const { canonicalThumbPath } = await import("./storage");
    expect(canonicalThumbPath("aaa")).toBe("/data/thumbs/aaa.jpg");
  });

  it("ensureDir creates a directory recursively", async () => {
    const { ensureDir } = await import("./storage");
    const tmp = mkdtempSync(path.join(os.tmpdir(), "vv-"));
    const target = path.join(tmp, "a", "b", "c");
    await ensureDir(target);
    expect(statSync(target).isDirectory()).toBe(true);
    rmSync(tmp, { recursive: true, force: true });
  });
});
