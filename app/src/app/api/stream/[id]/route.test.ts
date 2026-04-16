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

const statMock = vi.fn();
const createReadStreamMock = vi.fn();
vi.mock("node:fs", () => ({
  createReadStream: (...a: unknown[]) => createReadStreamMock(...a),
}));
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, stat: (...a: unknown[]) => statMock(...a) };
});

import { GET } from "./route";

beforeEach(() => {
  getSessionUser.mockReset();
  getFile.mockReset();
  statMock.mockReset();
  createReadStreamMock.mockReset();
});

function req(id: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://app.test/api/stream/${id}`, {
    headers: { cookie: "vv_session=valid", ...headers },
  });
}

describe("GET /api/stream/[id]", () => {
  it("returns 401 for unauthenticated requests", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const res = await GET(
      new NextRequest("https://app.test/api/stream/abc", { headers: {} }),
      { params: Promise.resolve({ id: "abc" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown file", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1" });
    getFile.mockResolvedValueOnce(null);
    const res = await GET(req("abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(404);
  });

  it("returns 410 when file missing from disk", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1" });
    getFile.mockResolvedValueOnce({ id: "abc", storage_path: "/x", transcoded_path: null, mime_type: "video/mp4" });
    statMock.mockRejectedValueOnce(new Error("ENOENT"));
    const res = await GET(req("abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(410);
  });
});
