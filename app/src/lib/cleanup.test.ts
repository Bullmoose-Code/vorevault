import { describe, it, expect, vi, beforeEach } from "vitest";

const getExpiredDeletedFiles = vi.fn();
const hardDeleteFile = vi.fn();
vi.mock("@/lib/files", () => ({
  getExpiredDeletedFiles: (...a: unknown[]) => getExpiredDeletedFiles(...a),
  hardDeleteFile: (...a: unknown[]) => hardDeleteFile(...a),
}));

const rmMock = vi.fn();
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, rm: (...a: unknown[]) => rmMock(...a), readdir: actual.readdir, stat: actual.stat };
});

const pool = { query: vi.fn() };
vi.mock("@/lib/db", () => ({ pool }));

beforeEach(() => vi.clearAllMocks());

describe("cleanupExpiredFiles", () => {
  it("deletes files from disk and DB", async () => {
    getExpiredDeletedFiles.mockResolvedValueOnce([
      { id: "f1", storage_path: "/data/uploads/f1/a.mp4", transcoded_path: "/data/transcoded/f1.mp4", thumbnail_path: "/data/thumbs/f1.jpg" },
    ]);
    hardDeleteFile.mockResolvedValueOnce(undefined);
    rmMock.mockResolvedValue(undefined);
    const { cleanupExpiredFiles } = await import("./cleanup");
    const count = await cleanupExpiredFiles();
    expect(count).toBe(1);
    expect(rmMock).toHaveBeenCalledTimes(3);
    expect(hardDeleteFile).toHaveBeenCalledWith("f1");
  });

  it("returns 0 when nothing to clean", async () => {
    getExpiredDeletedFiles.mockResolvedValueOnce([]);
    const { cleanupExpiredFiles } = await import("./cleanup");
    expect(await cleanupExpiredFiles()).toBe(0);
  });
});

describe("cleanupOrphanUploads", () => {
  it("deletes stale upload_sessions and returns count", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 2 });
    const { cleanupOrphanUploads } = await import("./cleanup");
    const count = await cleanupOrphanUploads();
    expect(count).toBe(2);
  });
});
