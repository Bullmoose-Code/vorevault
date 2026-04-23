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

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const trashFolder = vi.fn();
class FolderAuthError extends Error { constructor() { super("auth"); this.name = "FolderAuthError"; } }
class FolderNotFoundError extends Error { constructor(what: string) { super(`${what} not found`); this.name = "FolderNotFoundError"; } }
vi.mock("@/lib/folders", () => ({
  trashFolder: (...a: unknown[]) => trashFolder(...a),
  FolderAuthError,
  FolderNotFoundError,
}));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/folders/[id]/trash", () => {
  it("401 when not authenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/folders/abc/trash", { method: "POST" }), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(401);
  });

  it("200 on success", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    trashFolder.mockResolvedValueOnce({ folders: 2, files: 5 });
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/folders/abc/trash", { method: "POST" }), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(200);
    expect(trashFolder).toHaveBeenCalledWith({ id: "abc", actorId: "u1", isAdmin: false });
    const body = await res.json() as { trashed: boolean; folders: number; files: number };
    expect(body.trashed).toBe(true);
    expect(body.folders).toBe(2);
    expect(body.files).toBe(5);
  });

  it("403 on FolderAuthError", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    trashFolder.mockRejectedValueOnce(new FolderAuthError());
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/folders/abc/trash", { method: "POST" }), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(403);
  });

  it("404 on FolderNotFoundError", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    trashFolder.mockRejectedValueOnce(new FolderNotFoundError("folder"));
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/folders/abc/trash", { method: "POST" }), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(404);
  });
});
