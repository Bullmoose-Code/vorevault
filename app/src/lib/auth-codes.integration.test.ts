import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";
import { createAuthCode, exchangeAuthCode, sha256Base64Url } from "./auth-codes";

let fx: PgFixture;
let userId: string;
let sessionId: string;

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("@/lib/db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });

  userId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('d-ac','alice') RETURNING id`,
  )).rows[0].id;
  sessionId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (gen_random_uuid(), $1, now() + interval '30 days') RETURNING id`,
    [userId],
  )).rows[0].id;
}, 120_000);

afterAll(async () => { await stopPg(fx); });

describe("createAuthCode + exchangeAuthCode", () => {
  it("round-trips a valid code+verifier to the session id", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = sha256Base64Url(verifier);
    const code = await createAuthCode(sessionId, challenge);
    const result = await exchangeAuthCode(code, verifier);
    expect(result).toEqual({ sessionId });
  });

  it("rejects exchange when verifier doesn't match challenge", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = sha256Base64Url(verifier);
    const code = await createAuthCode(sessionId, challenge);
    const result = await exchangeAuthCode(code, "wrong-verifier-1234567890ABCDEFGHIJ");
    expect(result).toBeNull();
  });

  it("rejects a second exchange with the same code (single-use)", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = sha256Base64Url(verifier);
    const code = await createAuthCode(sessionId, challenge);
    const first = await exchangeAuthCode(code, verifier);
    expect(first).toEqual({ sessionId });
    const second = await exchangeAuthCode(code, verifier);
    expect(second).toBeNull();
  });

  it("rejects exchange after the code has expired", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = sha256Base64Url(verifier);
    const code = await createAuthCode(sessionId, challenge);
    // Manually expire the code so we don't have to wait 60 seconds.
    await fx.pool.query(
      `UPDATE auth_codes SET expires_at = now() - interval '1 second' WHERE code = $1`,
      [code],
    );
    const result = await exchangeAuthCode(code, verifier);
    expect(result).toBeNull();
  });

  it("rejects an unknown code", async () => {
    const result = await exchangeAuthCode("nonexistent-code-zzzzzzzzzzzzzzzzz", "any");
    expect(result).toBeNull();
  });

  it("only one of two concurrent redeems succeeds (single-use enforced atomically)", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = sha256Base64Url(verifier);
    const code = await createAuthCode(sessionId, challenge);
    // Fire two redemptions in parallel; the SQL UPDATE...WHERE used_at IS
    // NULL serializes them via row-level locking, so exactly one wins.
    const [a, b] = await Promise.all([
      exchangeAuthCode(code, verifier),
      exchangeAuthCode(code, verifier),
    ]);
    const successes = [a, b].filter((r) => r !== null);
    const failures = [a, b].filter((r) => r === null);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(successes[0]).toEqual({ sessionId });
  });
});
