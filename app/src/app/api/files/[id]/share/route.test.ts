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
vi.mock("@/lib/files", () => ({
  getFile: (...a: unknown[]) => getFile(...a),
}));

const createShareLink = vi.fn();
const getActiveShareLink = vi.fn();
const revokeAllForFile = vi.fn();
vi.mock("@/lib/share-links", () => ({
  createShareLink: (...a: unknown[]) => createShareLink(...a),
  getActiveShareLink: (...a: unknown[]) => getActiveShareLink(...a),
  revokeAllForFile: (...a: unknown[]) => revokeAllForFile(...a),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

function req(id: string, body: unknown) {
  return new NextRequest(`https://app.test/api/files/${id}/share`, {
    method: "POST",
    headers: { cookie: "vv_session=valid", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/files/[id]/share", () => {
  it("returns 401 for unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const res = await POST(
      new NextRequest("https://app.test/api/files/f1/share", {
        method: "POST",
        headers: { cookie: "vv_session=bad", "content-type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      }),
      { params: Promise.resolve({ id: "f1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown file", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1" });
    getFile.mockResolvedValueOnce(null);
    const res = await POST(req("f1", { action: "create" }), { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(404);
  });

  it("creates a share link and returns the token + URL", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1" });
    getFile.mockResolvedValueOnce({ id: "f1", uploader_id: "u1" });
    getActiveShareLink.mockResolvedValueOnce(null);
    createShareLink.mockResolvedValueOnce({ token: "abc123", file_id: "f1" });
    const res = await POST(req("f1", { action: "create" }), { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("abc123");
    expect(body.url).toBe("https://app.test/p/abc123");
  });

  it("returns existing active link instead of creating duplicate", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1" });
    getFile.mockResolvedValueOnce({ id: "f1", uploader_id: "u1" });
    getActiveShareLink.mockResolvedValueOnce({ token: "existing", file_id: "f1" });
    const res = await POST(req("f1", { action: "create" }), { params: Promise.resolve({ id: "f1" }) });
    const body = await res.json();
    expect(body.token).toBe("existing");
    expect(createShareLink).not.toHaveBeenCalled();
  });

  it("revokes all share links for a file", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1" });
    getFile.mockResolvedValueOnce({ id: "f1", uploader_id: "u1" });
    revokeAllForFile.mockResolvedValueOnce(undefined);
    const res = await POST(req("f1", { action: "revoke" }), { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(200);
    expect(revokeAllForFile).toHaveBeenCalledWith("f1");
  });
});
