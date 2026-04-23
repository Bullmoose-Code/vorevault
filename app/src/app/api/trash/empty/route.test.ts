import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  loadEnv: () => ({
    DISCORD_CLIENT_ID: "x", DISCORD_CLIENT_SECRET: "x",
    DISCORD_REDIRECT_URI: "https://app.test/cb", DISCORD_GUILD_ID: "g",
    DISCORD_REQUIRED_ROLE_ID: "r", DATABASE_URL: "x",
    SESSION_SECRET: "0123456789abcdef", APP_PUBLIC_URL: "https://app.test",
  }),
}));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, rm: vi.fn().mockResolvedValue(undefined) };
});

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const listTrashedItems = vi.fn();
const permanentDeleteFolder = vi.fn();
vi.mock("@/lib/folders", () => ({
  listTrashedItems: (...a: unknown[]) => listTrashedItems(...a),
  permanentDeleteFolder: (...a: unknown[]) => permanentDeleteFolder(...a),
}));

const permanentDeleteFile = vi.fn();
vi.mock("@/lib/files", () => ({
  permanentDeleteFile: (...a: unknown[]) => permanentDeleteFile(...a),
}));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/trash/empty", () => {
  it("401 when not authenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/trash/empty", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("403 when authenticated but not admin", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/trash/empty", { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("200 when admin: deletes all items and returns correct counts", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "admin1", is_admin: true });

    // First batch: one folder + one file
    listTrashedItems.mockResolvedValueOnce({
      items: [
        { kind: "folder", id: "f1", name: "Folder", deleted_at: new Date(), actor_username: "u" },
        { kind: "file", id: "file2", name: "clip.mp4", deleted_at: new Date(), actor_username: "u", size_bytes: 1000 },
      ],
      total: 2,
      page: 1,
      limit: 100,
    });
    // Second batch: empty — loop exits
    listTrashedItems.mockResolvedValueOnce({ items: [], total: 0, page: 1, limit: 100 });

    // folder delete returns 1 deleted file
    permanentDeleteFolder.mockResolvedValueOnce({
      deletedFiles: [
        { id: "inner-file", storage_path: "/uploads/inner-file/original.mp4", transcoded_path: null, thumbnail_path: null },
      ],
    });

    // standalone file delete
    permanentDeleteFile.mockResolvedValueOnce({
      id: "file2",
      storage_path: "/uploads/file2/original.mp4",
      transcoded_path: "/uploads/file2/transcoded.mp4",
      thumbnail_path: "/uploads/file2/thumb.jpg",
    });

    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/trash/empty", { method: "POST" }));
    expect(res.status).toBe(200);

    expect(permanentDeleteFolder).toHaveBeenCalledOnce();
    expect(permanentDeleteFolder).toHaveBeenCalledWith({ id: "f1", actorId: "admin1", isAdmin: true });

    expect(permanentDeleteFile).toHaveBeenCalledOnce();
    expect(permanentDeleteFile).toHaveBeenCalledWith({ fileId: "file2", actorId: "admin1", isAdmin: true });

    const body = await res.json();
    // folders: 1, files: 1 (from folder) + 1 (standalone) = 2
    expect(body).toEqual({ emptied: true, folders: 1, files: 2 });
  });
});
