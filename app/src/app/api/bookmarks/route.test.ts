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
const addBookmark = vi.fn();
const listBookmarks = vi.fn();
vi.mock("@/lib/bookmarks", () => ({
  addBookmark: (...a: unknown[]) => addBookmark(...a),
  listBookmarks: (...a: unknown[]) => listBookmarks(...a),
  removeBookmark: vi.fn(), isBookmarked: vi.fn(),
}));

import { POST, GET } from "./route";

const FILE_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

beforeEach(() => { getCurrentUser.mockReset(); addBookmark.mockReset(); listBookmarks.mockReset(); });

describe("POST /api/bookmarks", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const req = new NextRequest("https://app.test/api/bookmarks", {
      method: "POST", body: JSON.stringify({ fileId: FILE_ID }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
  it("201 when newly created", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u", is_admin: false });
    addBookmark.mockResolvedValueOnce({ created: true });
    const req = new NextRequest("https://app.test/api/bookmarks", {
      method: "POST", body: JSON.stringify({ fileId: FILE_ID }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });
  it("200 when already existed", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u", is_admin: false });
    addBookmark.mockResolvedValueOnce({ created: false });
    const req = new NextRequest("https://app.test/api/bookmarks", {
      method: "POST", body: JSON.stringify({ fileId: FILE_ID }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
  it("400 on invalid body", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u", is_admin: false });
    const req = new NextRequest("https://app.test/api/bookmarks", {
      method: "POST", body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/bookmarks", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("https://app.test/api/bookmarks"));
    expect(res.status).toBe(401);
  });
  it("returns list", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u", is_admin: false });
    listBookmarks.mockResolvedValueOnce({ items: [], total: 0 });
    const res = await GET(new NextRequest("https://app.test/api/bookmarks"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
  });
});
