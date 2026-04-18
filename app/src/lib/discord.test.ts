import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  loadEnv: () => ({
    DISCORD_CLIENT_ID: "cid",
    DISCORD_CLIENT_SECRET: "csecret",
    DISCORD_REDIRECT_URI: "https://app.test/cb",
    DISCORD_GUILD_ID: "gid",
    DISCORD_REQUIRED_ROLE_ID: "rid",
    DATABASE_URL: "x",
    SESSION_SECRET: "0123456789abcdef",
    APP_PUBLIC_URL: "https://app.test",
  }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
beforeEach(() => fetchMock.mockReset());

describe("exchangeCodeForToken", () => {
  it("posts client creds and returns access token", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "abc", token_type: "Bearer" }),
    });
    const { exchangeCodeForToken } = await import("./discord");
    const tok = await exchangeCodeForToken("authcode");
    expect(tok).toBe("abc");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://discord.com/api/oauth2/token");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("throws on non-ok response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, text: async () => "bad" });
    const { exchangeCodeForToken } = await import("./discord");
    await expect(exchangeCodeForToken("authcode")).rejects.toThrow(/Discord token exchange/);
  });
});

describe("fetchGuildMember", () => {
  it("returns user profile + has-required-role flag when role present", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: "u1", username: "ryan", avatar: "h" },
        roles: ["other", "rid"],
      }),
    });
    const { fetchGuildMember } = await import("./discord");
    const m = await fetchGuildMember("token");
    expect(m).toEqual({
      profile: { id: "u1", username: "ryan", avatar: "h" },
      hasRequiredRole: true,
    });
  });

  it("returns hasRequiredRole=false when role missing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: "u1", username: "ryan", avatar: null },
        roles: ["other"],
      }),
    });
    const { fetchGuildMember } = await import("./discord");
    const m = await fetchGuildMember("token");
    expect(m?.hasRequiredRole).toBe(false);
  });

  it("returns null when user is not in the guild (404)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "" });
    const { fetchGuildMember } = await import("./discord");
    expect(await fetchGuildMember("token")).toBeNull();
  });
});

describe("discord retry behavior", () => {
  it("retries the token exchange once on fetch throw", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "abc", token_type: "Bearer" }),
      });
    const { exchangeCodeForToken } = await import("./discord");
    const tok = await exchangeCodeForToken("code");
    expect(tok).toBe("abc");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry token exchange on 5xx (code may be consumed)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "",
    });
    const { exchangeCodeForToken } = await import("./discord");
    await expect(exchangeCodeForToken("code")).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries the guild-member fetch on 5xx", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 502, text: async () => "" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: "u1", username: "ryan", avatar: null },
          roles: ["rid"],
        }),
      });
    const { fetchGuildMember } = await import("./discord");
    const m = await fetchGuildMember("token");
    expect(m?.hasRequiredRole).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries the guild-member fetch on fetch throw", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: "u1", username: "ryan", avatar: null },
          roles: [],
        }),
      });
    const { fetchGuildMember } = await import("./discord");
    const m = await fetchGuildMember("token");
    expect(m?.hasRequiredRole).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry the guild-member fetch on 404", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "" });
    const { fetchGuildMember } = await import("./discord");
    expect(await fetchGuildMember("token")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("buildAuthorizeUrl", () => {
  it("returns Discord authorize URL with required params", async () => {
    const { buildAuthorizeUrl } = await import("./discord");
    const u = new URL(buildAuthorizeUrl("statetoken"));
    expect(u.origin + u.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.test/cb");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("scope")).toBe("identify guilds.members.read");
    expect(u.searchParams.get("state")).toBe("statetoken");
    expect(u.searchParams.get("prompt")).toBe("none");
  });
});
