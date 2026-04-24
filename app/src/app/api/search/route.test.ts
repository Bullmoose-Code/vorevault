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
const searchEverything = vi.fn();
vi.mock("@/lib/search", () => ({ searchEverything: (...a: unknown[]) => searchEverything(...a) }));

import { GET } from "./route";

beforeEach(() => { getCurrentUser.mockReset(); searchEverything.mockReset(); });

describe("GET /api/search", () => {
  it("401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("https://app.test/api/search?q=apex"));
    expect(res.status).toBe(401);
  });

  it("400 when query missing", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u" });
    const res = await GET(new NextRequest("https://app.test/api/search"));
    expect(res.status).toBe(400);
  });

  it("400 when query too short", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u" });
    const res = await GET(new NextRequest("https://app.test/api/search?q=a"));
    expect(res.status).toBe(400);
  });

  it("200 with results", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u" });
    searchEverything.mockResolvedValueOnce({ folders: [], files: [], tags: [], total: 0 });
    const res = await GET(new NextRequest("https://app.test/api/search?q=apex"));
    expect(res.status).toBe(200);
  });

  it("passes scope folder + pagination to lib", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u" });
    searchEverything.mockResolvedValueOnce({ folders: [], files: [], tags: [], total: 0 });
    const folder = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const res = await GET(new NextRequest(`https://app.test/api/search?q=apex&folder=${folder}&limit=5&offset=10`));
    expect(res.status).toBe(200);
    expect(searchEverything).toHaveBeenCalledWith(
      expect.objectContaining({ query: "apex", scopeFolderId: folder, limit: 5, offset: 10 }),
    );
  });
});
