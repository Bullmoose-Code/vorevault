import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  loadEnv: () => ({
    DISCORD_CLIENT_ID: "cid", DISCORD_CLIENT_SECRET: "x",
    DISCORD_REDIRECT_URI: "https://app.test/cb", DISCORD_GUILD_ID: "g",
    DISCORD_REQUIRED_ROLE_ID: "r", DATABASE_URL: "x",
    SESSION_SECRET: "0123456789abcdef", APP_PUBLIC_URL: "https://app.test",
  }),
}));

const destroy = vi.fn();
vi.mock("@/lib/sessions", () => ({ destroySession: (...a: unknown[]) => destroy(...a) }));

import { POST } from "./route";

beforeEach(() => destroy.mockReset());

describe("POST /api/auth/logout", () => {
  it("destroys session and clears cookie when present", async () => {
    const req = new NextRequest("https://app.test/api/auth/logout", {
      method: "POST",
      headers: { cookie: "vv_session=abc-123" },
    });
    const res = await POST(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("https://app.test/login");
    expect(destroy).toHaveBeenCalledWith("abc-123");
    expect(res.headers.get("Set-Cookie") ?? "").toMatch(/vv_session=;/);
  });

  it("redirects to /login even when no session cookie", async () => {
    const req = new NextRequest("https://app.test/api/auth/logout", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(307);
    expect(destroy).not.toHaveBeenCalled();
  });
});
