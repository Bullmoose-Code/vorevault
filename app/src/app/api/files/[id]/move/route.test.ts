import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  loadEnv: () => ({
    DISCORD_CLIENT_ID: "cid", DISCORD_CLIENT_SECRET: "csecret",
    DISCORD_REDIRECT_URI: "https://app.test/cb", DISCORD_GUILD_ID: "gid",
    DISCORD_REQUIRED_ROLE_ID: "rid", DATABASE_URL: "x",
    SESSION_SECRET: "0123456789abcdef", APP_PUBLIC_URL: "https://app.test",
  }),
}));

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const moveFile = vi.fn();
vi.mock("@/lib/files", async () => {
  const actual = await vi.importActual<typeof import("@/lib/files")>("@/lib/files");
  return { ...actual, moveFile: (...a: unknown[]) => moveFile(...a) };
});

import { POST } from "./route";

const FILE_ID   = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const FOLDER_ID = "bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb";

function ctx(id: string) { return { params: Promise.resolve({ id }) }; }

beforeEach(() => { getCurrentUser.mockReset(); moveFile.mockReset(); });

describe("POST /api/files/[id]/move", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const req = new NextRequest(`https://app.test/api/files/${FILE_ID}/move`, {
      method: "POST", body: JSON.stringify({ folderId: null }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, ctx(FILE_ID));
    expect(res.status).toBe(401);
  });

  it("returns 200 on success", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    moveFile.mockResolvedValueOnce({ id: FILE_ID, folder_id: FOLDER_ID });
    const req = new NextRequest(`https://app.test/api/files/${FILE_ID}/move`, {
      method: "POST", body: JSON.stringify({ folderId: FOLDER_ID }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, ctx(FILE_ID));
    expect(res.status).toBe(200);
  });

  it("returns 403 when non-uploader", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const { FileAuthError } = await import("@/lib/files");
    moveFile.mockRejectedValueOnce(new FileAuthError());
    const req = new NextRequest(`https://app.test/api/files/${FILE_ID}/move`, {
      method: "POST", body: JSON.stringify({ folderId: null }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, ctx(FILE_ID));
    expect(res.status).toBe(403);
  });
});
