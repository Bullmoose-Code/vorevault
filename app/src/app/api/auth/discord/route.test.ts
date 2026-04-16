import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  loadEnv: () => ({
    DISCORD_CLIENT_ID: "cid", DISCORD_CLIENT_SECRET: "x",
    DISCORD_REDIRECT_URI: "https://app.test/cb", DISCORD_GUILD_ID: "g",
    DISCORD_REQUIRED_ROLE_ID: "r", DATABASE_URL: "x",
    SESSION_SECRET: "0123456789abcdef", APP_PUBLIC_URL: "https://app.test",
  }),
}));

import { GET } from "./route";

describe("GET /api/auth/discord", () => {
  it("redirects to Discord with a state cookie", async () => {
    const res = await GET();
    expect(res.status).toBe(307);
    const location = res.headers.get("Location");
    expect(location).toMatch(/^https:\/\/discord\.com\/oauth2\/authorize\?/);
    expect(location).toContain("state=");
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toMatch(/vv_oauth_state=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  it("uses the same state in the redirect URL and the cookie", async () => {
    const res = await GET();
    const url = new URL(res.headers.get("Location")!);
    const stateInUrl = url.searchParams.get("state");
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    const m = setCookie.match(/vv_oauth_state=([^;]+)/);
    expect(m).not.toBeNull();
    expect(decodeURIComponent(m![1])).toBe(stateInUrl);
  });
});
