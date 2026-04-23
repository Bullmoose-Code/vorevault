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

const restoreFolder = vi.fn();
class FolderCollisionError extends Error {
  existingId: string;
  constructor(existingId: string) {
    super("duplicate");
    this.name = "FolderCollisionError";
    this.existingId = existingId;
  }
}
class FolderNotFoundError extends Error { constructor(what: string) { super(`${what} not found`); this.name = "FolderNotFoundError"; } }
vi.mock("@/lib/folders", () => ({
  restoreFolder: (...a: unknown[]) => restoreFolder(...a),
  FolderCollisionError,
  FolderNotFoundError,
}));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/folders/[id]/restore", () => {
  it("401 when not authenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/folders/abc/restore", { method: "POST" }), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(401);
  });

  it("200 on success", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    restoreFolder.mockResolvedValueOnce({ folders: 1, files: 3 });
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/folders/abc/restore", { method: "POST" }), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(200);
    expect(restoreFolder).toHaveBeenCalledWith({ id: "abc", actorId: "u1" });
    const body = await res.json() as { restored: boolean; folders: number; files: number };
    expect(body.restored).toBe(true);
    expect(body.folders).toBe(1);
    expect(body.files).toBe(3);
  });

  it("409 on FolderCollisionError", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    restoreFolder.mockRejectedValueOnce(new FolderCollisionError("existing-uuid"));
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/folders/abc/restore", { method: "POST" }), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; existingId: string };
    expect(body.error).toBe("duplicate");
    expect(body.existingId).toBe("existing-uuid");
  });

  it("404 on FolderNotFoundError", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    restoreFolder.mockRejectedValueOnce(new FolderNotFoundError("folder"));
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/folders/abc/restore", { method: "POST" }), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(404);
  });
});
