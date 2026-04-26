import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-codes", () => ({
  exchangeAuthCode: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
});

async function getRoute() {
  const route = await import("./route");
  const ac = await import("@/lib/auth-codes");
  return {
    POST: route.POST,
    exchangeAuthCode: vi.mocked(ac.exchangeAuthCode),
  };
}

const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXkXXXXX"; // 48 chars

function jsonReq(body: unknown): NextRequest {
  return new NextRequest("https://vault.example.com/api/auth/desktop-exchange", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/auth/desktop-exchange", () => {
  it("400s when body is not JSON", async () => {
    const { POST } = await getRoute();
    const r = await POST(jsonReq("not json"));
    expect(r.status).toBe(400);
  });

  it("400s when code is missing", async () => {
    const { POST } = await getRoute();
    const r = await POST(jsonReq({ code_verifier: VERIFIER }));
    expect(r.status).toBe(400);
  });

  it("400s when code_verifier is missing", async () => {
    const { POST } = await getRoute();
    const r = await POST(jsonReq({ code: "some-code-1234567890" }));
    expect(r.status).toBe(400);
  });

  it("400s when code_verifier is too short", async () => {
    const { POST } = await getRoute();
    const r = await POST(jsonReq({ code: "some-code-1234567890", code_verifier: "short" }));
    expect(r.status).toBe(400);
  });

  it("401s when exchangeAuthCode returns null", async () => {
    const { POST, exchangeAuthCode } = await getRoute();
    exchangeAuthCode.mockResolvedValue(null);
    const r = await POST(jsonReq({ code: "some-code-1234567890", code_verifier: VERIFIER }));
    expect(r.status).toBe(401);
  });

  it("returns 200 with session_token on success", async () => {
    const { POST, exchangeAuthCode } = await getRoute();
    exchangeAuthCode.mockResolvedValue({ sessionId: "session-uuid-1" });
    const r = await POST(jsonReq({ code: "some-code-1234567890", code_verifier: VERIFIER }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({ session_token: "session-uuid-1" });
  });

  it("passes the code and verifier through to exchangeAuthCode verbatim", async () => {
    const { POST, exchangeAuthCode } = await getRoute();
    exchangeAuthCode.mockResolvedValue({ sessionId: "s1" });
    await POST(jsonReq({ code: "some-code-1234567890", code_verifier: VERIFIER }));
    expect(exchangeAuthCode).toHaveBeenCalledWith("some-code-1234567890", VERIFIER);
  });
});
