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

const getSessionUser = vi.fn();
vi.mock("@/lib/sessions", () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));

const getFile = vi.fn();
const softDeleteFile = vi.fn();
vi.mock("@/lib/files", () => ({
  getFile: (...a: unknown[]) => getFile(...a),
  softDeleteFile: (...a: unknown[]) => softDeleteFile(...a),
}));

const revokeAllForFile = vi.fn();
vi.mock("@/lib/share-links", () => ({
  revokeAllForFile: (...a: unknown[]) => revokeAllForFile(...a),
}));

import { POST } from "./route";

beforeEach(() => {
  getSessionUser.mockReset();
  getFile.mockReset();
  softDeleteFile.mockReset();
  revokeAllForFile.mockReset();
});

function req(id: string) {
  return new NextRequest(`https://app.test/api/files/${id}/delete`, {
    method: "POST",
    headers: { cookie: "vv_session=valid" },
  });
}

describe("POST /api/files/[id]/delete", () => {
  it("returns 401 for unauthenticated requests", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const res = await POST(
      new NextRequest("https://app.test/api/files/abc/delete", {
        method: "POST", headers: { cookie: "vv_session=bad" },
      }),
      { params: Promise.resolve({ id: "abc" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown file", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    getFile.mockResolvedValueOnce(null);
    const res = await POST(req("abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when non-owner non-admin tries to delete", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    getFile.mockResolvedValueOnce({ id: "f1", uploader_id: "u2" });
    const res = await POST(req("f1"), { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(403);
  });

  it("soft-deletes when owner requests", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    getFile.mockResolvedValueOnce({ id: "f1", uploader_id: "u1" });
    revokeAllForFile.mockResolvedValueOnce(undefined);
    softDeleteFile.mockResolvedValueOnce(undefined);
    const res = await POST(req("f1"), { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(200);
    expect(revokeAllForFile).toHaveBeenCalledWith("f1");
    expect(softDeleteFile).toHaveBeenCalledWith("f1");
  });

  it("soft-deletes when admin requests (even non-owner)", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1", is_admin: true });
    getFile.mockResolvedValueOnce({ id: "f1", uploader_id: "u2" });
    revokeAllForFile.mockResolvedValueOnce(undefined);
    softDeleteFile.mockResolvedValueOnce(undefined);
    const res = await POST(req("f1"), { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(200);
    expect(revokeAllForFile).toHaveBeenCalledWith("f1");
    expect(softDeleteFile).toHaveBeenCalledWith("f1");
  });
});
