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

const trashFile = vi.fn();
class FileAuthError extends Error { constructor() { super("auth"); this.name = "FileAuthError"; } }
class FileNotFoundError extends Error { constructor() { super("nf"); this.name = "FileNotFoundError"; } }
vi.mock("@/lib/files", () => ({
  trashFile: (...a: unknown[]) => trashFile(...a),
  FileAuthError,
  FileNotFoundError,
}));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/files/[id]/trash", () => {
  it("401 when not authenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/files/abc/trash", { method: "POST" }), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(401);
  });

  it("200 on success", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    trashFile.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/files/abc/trash", { method: "POST" }), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(200);
    expect(trashFile).toHaveBeenCalledWith({ fileId: "abc", actorId: "u1", isAdmin: false });
  });

  it("403 on FileAuthError", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    trashFile.mockRejectedValueOnce(new FileAuthError());
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/files/abc/trash", { method: "POST" }), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(403);
  });

  it("404 on FileNotFoundError", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    trashFile.mockRejectedValueOnce(new FileNotFoundError());
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/files/abc/trash", { method: "POST" }), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(404);
  });
});
