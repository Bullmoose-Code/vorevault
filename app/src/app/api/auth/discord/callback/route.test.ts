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

const exchange = vi.fn();
const fetchMember = vi.fn();
vi.mock("@/lib/discord", () => ({
  exchangeCodeForToken: (...a: unknown[]) => exchange(...a),
  fetchGuildMember: (...a: unknown[]) => fetchMember(...a),
  buildAuthorizeUrl: () => "",
}));

const upsertUser = vi.fn();
vi.mock("@/lib/users", () => ({
  upsertUserFromDiscord: (...a: unknown[]) => upsertUser(...a),
}));

const createSession = vi.fn();
vi.mock("@/lib/sessions", () => ({
  createSession: (...a: unknown[]) => createSession(...a),
}));

import { GET } from "./route";

function reqWithStateCookie(stateInUrl: string, stateInCookie: string, code = "abc") {
  const url = new URL(`https://app.test/api/auth/discord/callback?code=${code}&state=${stateInUrl}`);
  return new NextRequest(url, {
    headers: { cookie: `vv_oauth_state=${stateInCookie}; other=foo` },
  });
}

beforeEach(() => {
  exchange.mockReset();
  fetchMember.mockReset();
  upsertUser.mockReset();
  createSession.mockReset();
});

describe("GET /api/auth/discord/callback", () => {
  it("rejects when state cookie is missing", async () => {
    const url = new URL("https://app.test/api/auth/discord/callback?code=x&state=y");
    const req = new NextRequest(url, { headers: {} });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("rejects when state mismatches", async () => {
    const res = await GET(reqWithStateCookie("a", "b"));
    expect(res.status).toBe(400);
  });

  it("rejects with 403 when user is not in the guild", async () => {
    exchange.mockResolvedValueOnce("token");
    fetchMember.mockResolvedValueOnce(null);
    const res = await GET(reqWithStateCookie("s", "s"));
    expect(res.status).toBe(403);
  });

  it("rejects with 403 when user lacks required role", async () => {
    exchange.mockResolvedValueOnce("token");
    fetchMember.mockResolvedValueOnce({
      profile: { id: "u1", username: "ryan", avatar: null },
      hasRequiredRole: false,
    });
    const res = await GET(reqWithStateCookie("s", "s"));
    expect(res.status).toBe(403);
  });

  it("creates session and redirects to / on success", async () => {
    exchange.mockResolvedValueOnce("token");
    fetchMember.mockResolvedValueOnce({
      profile: { id: "u1", username: "ryan", avatar: null },
      hasRequiredRole: true,
    });
    upsertUser.mockResolvedValueOnce({ id: "user-uuid", username: "ryan" });
    createSession.mockResolvedValueOnce({ id: "session-uuid" });
    const res = await GET(reqWithStateCookie("s", "s"));
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("https://app.test/");
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toMatch(/vv_session=session-uuid/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/vv_oauth_state=;/);
  });
});
