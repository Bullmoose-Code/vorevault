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
const removeBookmark = vi.fn();
vi.mock("@/lib/bookmarks", () => ({
  addBookmark: vi.fn(), listBookmarks: vi.fn(), isBookmarked: vi.fn(),
  removeBookmark: (...a: unknown[]) => removeBookmark(...a),
}));

import { DELETE } from "./route";

const FILE_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
function ctx(fileId: string) { return { params: Promise.resolve({ fileId }) }; }

beforeEach(() => { getCurrentUser.mockReset(); removeBookmark.mockReset(); });

describe("DELETE /api/bookmarks/[fileId]", () => {
  it("401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const res = await DELETE(
      new NextRequest(`https://app.test/api/bookmarks/${FILE_ID}`),
      ctx(FILE_ID),
    );
    expect(res.status).toBe(401);
  });
  it("204 whether row existed or not", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u", is_admin: false });
    removeBookmark.mockResolvedValueOnce(true);
    const res = await DELETE(
      new NextRequest(`https://app.test/api/bookmarks/${FILE_ID}`),
      ctx(FILE_ID),
    );
    expect(res.status).toBe(204);
  });
  it("400 on malformed file id", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u", is_admin: false });
    const res = await DELETE(
      new NextRequest("https://app.test/api/bookmarks/not-a-uuid"),
      ctx("not-a-uuid"),
    );
    expect(res.status).toBe(400);
  });
});
