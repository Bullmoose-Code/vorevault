import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "./pg";

describe("auth schema", () => {
  let pg: PgFixture;
  beforeAll(async () => { pg = await startPg(); });
  afterAll(async () => { await stopPg(pg); });

  it("has users table with required columns", async () => {
    const { rows } = await pg.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'users' ORDER BY ordinal_position`,
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id", "discord_id", "username", "avatar_url",
        "is_admin", "is_banned", "created_at", "last_login_at",
      ]),
    );
  });

  it("enforces unique discord_id", async () => {
    await pg.pool.query(`INSERT INTO users (discord_id, username) VALUES ('111', 'a')`);
    await expect(
      pg.pool.query(`INSERT INTO users (discord_id, username) VALUES ('111', 'b')`),
    ).rejects.toThrow(/duplicate key/);
  });

  it("has sessions table with cascading delete on user", async () => {
    const { rows: u } = await pg.pool.query<{ id: string }>(
      `INSERT INTO users (discord_id, username) VALUES ('222', 'b') RETURNING id`,
    );
    const userId = u[0].id;
    await pg.pool.query(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES (gen_random_uuid(), $1, now() + interval '1 day')`,
      [userId],
    );
    await pg.pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    const { rows } = await pg.pool.query(
      `SELECT count(*)::int AS c FROM sessions WHERE user_id = $1`,
      [userId],
    );
    expect(rows[0].c).toBe(0);
  });
});
