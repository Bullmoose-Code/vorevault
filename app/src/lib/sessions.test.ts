import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";

let pg: PgFixture;

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

beforeAll(async () => {
  pg = await startPg();
  process.env.TEST_PG_URL = pg.container.getConnectionUri();
});
afterAll(async () => { await stopPg(pg); });
beforeEach(async () => { await pg.pool.query("TRUNCATE users RESTART IDENTITY CASCADE"); });

async function makeUser(): Promise<string> {
  const { rows } = await pg.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('1', 'a') RETURNING id`,
  );
  return rows[0].id;
}

describe("sessions", () => {
  it("creates a session and looks up the user by id", async () => {
    const { createSession, getSessionUser } = await import("./sessions");
    const userId = await makeUser();
    const s = await createSession(userId, "test-agent");
    const u = await getSessionUser(s.id);
    expect(u?.id).toBe(userId);
    expect(u?.username).toBe("a");
  });

  it("returns null for unknown session id", async () => {
    const { getSessionUser } = await import("./sessions");
    expect(await getSessionUser("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("returns null for expired session", async () => {
    const { getSessionUser } = await import("./sessions");
    const userId = await makeUser();
    const { rows } = await pg.pool.query<{ id: string }>(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES (gen_random_uuid(), $1, now() - interval '1 minute') RETURNING id`,
      [userId],
    );
    expect(await getSessionUser(rows[0].id)).toBeNull();
  });

  it("destroys a session", async () => {
    const { createSession, destroySession, getSessionUser } = await import("./sessions");
    const userId = await makeUser();
    const s = await createSession(userId, null);
    await destroySession(s.id);
    expect(await getSessionUser(s.id)).toBeNull();
  });

  it("extends expires_at on successful lookup (sliding window)", async () => {
    const { createSession, getSessionUser } = await import("./sessions");
    const userId = await makeUser();
    const s = await createSession(userId, null);
    // Backdate the session so any later extension is clearly visible.
    await pg.pool.query(
      `UPDATE sessions SET expires_at = now() + interval '1 hour' WHERE id = $1`,
      [s.id],
    );
    const before = await pg.pool.query<{ expires_at: Date }>(
      `SELECT expires_at FROM sessions WHERE id = $1`,
      [s.id],
    );
    const beforeTs = before.rows[0].expires_at.getTime();
    const u = await getSessionUser(s.id);
    expect(u?.id).toBe(userId);
    const after = await pg.pool.query<{ expires_at: Date }>(
      `SELECT expires_at FROM sessions WHERE id = $1`,
      [s.id],
    );
    const afterTs = after.rows[0].expires_at.getTime();
    // Should be extended well past the 1-hour marker — the sliding window
    // pushes it out to now + 30 days.
    expect(afterTs - beforeTs).toBeGreaterThan(27 * 24 * 60 * 60 * 1000);
  });

  it("ignores users that are banned", async () => {
    const { createSession, getSessionUser } = await import("./sessions");
    const userId = await makeUser();
    const s = await createSession(userId, null);
    await pg.pool.query(`UPDATE users SET is_banned = true WHERE id = $1`, [userId]);
    expect(await getSessionUser(s.id)).toBeNull();
  });
});
