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

describe("admin module", () => {
  it("listAllUsers returns all users with file counts", async () => {
    const { listAllUsers } = await import("./admin");
    await pg.pool.query(`INSERT INTO users (discord_id, username) VALUES ('1', 'alice')`);
    await pg.pool.query(`INSERT INTO users (discord_id, username) VALUES ('2', 'bob')`);
    const users = await listAllUsers();
    expect(users.length).toBe(2);
    expect(users[0]).toHaveProperty("file_count");
  });

  it("getDiskUsage returns total bytes per status", async () => {
    const { getDiskUsage } = await import("./admin");
    const { rows: u } = await pg.pool.query<{ id: string }>(
      `INSERT INTO users (discord_id, username) VALUES ('1', 'a') RETURNING id`,
    );
    await pg.pool.query(
      `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path)
       VALUES ($1, 'x.mp4', 'video/mp4', 5000, '/a')`,
      [u[0].id],
    );
    const usage = await getDiskUsage();
    expect(usage.total_bytes).toBe(5000);
    expect(usage.total_files).toBe(1);
  });

  it("toggleBan bans and unbans a user", async () => {
    const { toggleBan } = await import("./admin");
    const { rows: u } = await pg.pool.query<{ id: string }>(
      `INSERT INTO users (discord_id, username) VALUES ('1', 'a') RETURNING id`,
    );
    await toggleBan(u[0].id, true);
    const { rows: r1 } = await pg.pool.query(`SELECT is_banned FROM users WHERE id = $1`, [u[0].id]);
    expect(r1[0].is_banned).toBe(true);
    await toggleBan(u[0].id, false);
    const { rows: r2 } = await pg.pool.query(`SELECT is_banned FROM users WHERE id = $1`, [u[0].id]);
    expect(r2[0].is_banned).toBe(false);
  });
});
