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

const listTrashedItems = vi.fn();
vi.mock("@/lib/folders", () => ({ listTrashedItems: (...a: unknown[]) => listTrashedItems(...a) }));

beforeEach(() => vi.clearAllMocks());

describe("GET /api/trash", () => {
  it("401 when not authenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://x/api/trash"));
    expect(res.status).toBe(401);
  });

  it("200 returns data and calls listTrashedItems with page 1 limit 50 by default", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const fakeData = { items: [], total: 0, page: 1, limit: 50 };
    listTrashedItems.mockResolvedValueOnce(fakeData);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://x/api/trash"));
    expect(res.status).toBe(200);
    expect(listTrashedItems).toHaveBeenCalledWith({ page: 1, limit: 50 });
    expect(await res.json()).toEqual(fakeData);
  });

  it("honors ?page=3 query param", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const fakeData = { items: [], total: 0, page: 3, limit: 50 };
    listTrashedItems.mockResolvedValueOnce(fakeData);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://x/api/trash?page=3"));
    expect(res.status).toBe(200);
    expect(listTrashedItems).toHaveBeenCalledWith({ page: 3, limit: 50 });
  });
});
