import { describe, it, expect, afterEach } from "vitest";

const KEYS = [
  "DATABASE_URL", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET",
  "DISCORD_GUILD_ID", "DISCORD_REQUIRED_ROLE_ID", "DISCORD_REDIRECT_URI",
  "SESSION_SECRET", "APP_PUBLIC_URL",
] as const;

const original: Record<string, string | undefined> = {};
afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

function setAll() {
  for (const k of KEYS) {
    original[k] = process.env[k];
    process.env[k] = `test-${k}`;
  }
  process.env.APP_PUBLIC_URL = "https://example.test";
  process.env.DISCORD_REDIRECT_URI = "https://example.test/cb";
  process.env.DATABASE_URL = "postgres://x:y@localhost/z";
}

describe("env loader", () => {
  it("returns parsed env when all vars present", async () => {
    setAll();
    const { loadEnv } = await import("./env");
    const env = loadEnv();
    expect(env.DISCORD_CLIENT_ID).toBe("test-DISCORD_CLIENT_ID");
    expect(env.APP_PUBLIC_URL).toBe("https://example.test");
  });

  it("throws when a required var is missing", async () => {
    setAll();
    delete process.env.DISCORD_CLIENT_ID;
    const { loadEnv } = await import("./env");
    expect(() => loadEnv()).toThrow(/DISCORD_CLIENT_ID/);
  });
});
