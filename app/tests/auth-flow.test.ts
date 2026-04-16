import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startPg, stopPg, type PgFixture } from "./pg";

let pg: PgFixture;

vi.mock("@/lib/env", () => ({
  loadEnv: () => ({
    DISCORD_CLIENT_ID: "cid", DISCORD_CLIENT_SECRET: "csecret",
    DISCORD_REDIRECT_URI: "https://app.test/api/auth/discord/callback",
    DISCORD_GUILD_ID: "gid", DISCORD_REQUIRED_ROLE_ID: "rid",
    DATABASE_URL: "x", SESSION_SECRET: "0123456789abcdef",
    APP_PUBLIC_URL: "https://app.test",
  }),
}));

vi.mock("@/lib/db", () => {
  const pgLib = require("pg") as typeof import("pg");
  let pool: import("pg").Pool | undefined;
  return {
    pool: {
      query: (text: string, params?: unknown[]) => {
        if (!pool) pool = new pgLib.Pool({ connectionString: process.env.TEST_PG_URL, max: 2 });
        return pool.query(text, params);
      },
    },
  };
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeAll(async () => {
  pg = await startPg();
  process.env.TEST_PG_URL = pg.container.getConnectionUri();
});
afterAll(async () => { await stopPg(pg); });
beforeEach(async () => {
  fetchMock.mockReset();
  await pg.pool.query("TRUNCATE users RESTART IDENTITY CASCADE");
});

describe("login -> session -> getCurrentUser flow", () => {
  it("creates a user + session and getCurrentUser returns them", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, json: async () => ({ access_token: "tok", token_type: "Bearer" }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: "discord-1", username: "ryan", avatar: null },
        roles: ["rid"],
      }),
    });

    const { NextRequest } = await import("next/server");
    const { GET } = await import("@/app/api/auth/discord/callback/route");
    const req = new NextRequest(
      "https://app.test/api/auth/discord/callback?code=AC&state=ST",
      { headers: { cookie: "vv_oauth_state=ST" } },
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    const sessionId = /vv_session=([^;]+)/.exec(setCookie)?.[1];
    expect(sessionId).toBeTruthy();

    const { getSessionUser } = await import("@/lib/sessions");
    const u = await getSessionUser(sessionId!);
    expect(u?.username).toBe("ryan");
    expect(u?.discord_id).toBe("discord-1");
  });
});
