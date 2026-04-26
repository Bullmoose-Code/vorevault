import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/discord", () => ({
  buildAuthorizeUrl: (state: string) =>
    `https://discord.com/oauth2/authorize?state=${encodeURIComponent(state)}`,
}));

beforeEach(() => {
  vi.resetModules();
});

const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

async function call(qs: string) {
  const { GET } = await import("./route");
  const req = new NextRequest(`https://vault.example.com/api/auth/desktop-init?${qs}`);
  return GET(req);
}

describe("GET /api/auth/desktop-init", () => {
  it("400s when port is missing", async () => {
    const r = await call(`code_challenge=${CHALLENGE}`);
    expect(r.status).toBe(400);
  });

  it("400s when code_challenge is missing", async () => {
    const r = await call("port=42876");
    expect(r.status).toBe(400);
  });

  it("400s when port is below 1024", async () => {
    const r = await call(`port=1023&code_challenge=${CHALLENGE}`);
    expect(r.status).toBe(400);
  });

  it("400s when port is above 65535", async () => {
    const r = await call(`port=65536&code_challenge=${CHALLENGE}`);
    expect(r.status).toBe(400);
  });

  it("400s when code_challenge is the wrong length", async () => {
    const r = await call(`port=42876&code_challenge=${"A".repeat(42)}`);
    expect(r.status).toBe(400);
  });

  it("redirects to Discord with the desktop-formatted state", async () => {
    const r = await call(`port=42876&code_challenge=${CHALLENGE}`);
    expect(r.status).toBe(307);
    const loc = r.headers.get("location") ?? "";
    expect(loc).toContain("https://discord.com/oauth2/authorize");
    expect(loc).toContain(encodeURIComponent(`desktop:42876:${CHALLENGE}`));
  });

  it("sets the vv_oauth_state cookie to the desktop state", async () => {
    const r = await call(`port=42876&code_challenge=${CHALLENGE}`);
    const cookie = r.cookies.get("vv_oauth_state");
    expect(cookie?.value).toBe(`desktop:42876:${CHALLENGE}`);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.maxAge).toBe(600);
  });
});
