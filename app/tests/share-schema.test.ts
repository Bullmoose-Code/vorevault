import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "./pg";

describe("share_links schema", () => {
  let pg: PgFixture;
  beforeAll(async () => { pg = await startPg(); });
  afterAll(async () => { await stopPg(pg); });

  it("has share_links table with required columns", async () => {
    const { rows } = await pg.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'share_links' ORDER BY ordinal_position`,
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).toEqual(
      expect.arrayContaining(["token", "file_id", "created_by", "created_at", "expires_at", "revoked_at"]),
    );
  });

  it("token is the primary key", async () => {
    const { rows: u } = await pg.pool.query<{ id: string }>(
      `INSERT INTO users (discord_id, username) VALUES ('s1', 's1') RETURNING id`,
    );
    const { rows: f } = await pg.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path)
       VALUES ($1, 'a.mp4', 'video/mp4', 1, '/x') RETURNING id`,
      [u[0].id],
    );
    await pg.pool.query(
      `INSERT INTO share_links (token, file_id, created_by) VALUES ('tok1', $1, $2)`,
      [f[0].id, u[0].id],
    );
    await expect(
      pg.pool.query(
        `INSERT INTO share_links (token, file_id, created_by) VALUES ('tok1', $1, $2)`,
        [f[0].id, u[0].id],
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it("cascades delete when file is deleted", async () => {
    const { rows: u } = await pg.pool.query<{ id: string }>(
      `INSERT INTO users (discord_id, username) VALUES ('s2', 's2') RETURNING id`,
    );
    const { rows: f } = await pg.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path)
       VALUES ($1, 'b.mp4', 'video/mp4', 1, '/y') RETURNING id`,
      [u[0].id],
    );
    await pg.pool.query(
      `INSERT INTO share_links (token, file_id, created_by) VALUES ('tok2', $1, $2)`,
      [f[0].id, u[0].id],
    );
    await pg.pool.query(`DELETE FROM files WHERE id = $1`, [f[0].id]);
    const { rows } = await pg.pool.query(`SELECT * FROM share_links WHERE token = 'tok2'`);
    expect(rows.length).toBe(0);
  });
});
