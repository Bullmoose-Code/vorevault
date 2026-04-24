import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "./pg";

describe("files schema", () => {
  let pg: PgFixture;
  beforeAll(async () => { pg = await startPg(); });
  afterAll(async () => { await stopPg(pg); });

  it("has files table with required columns", async () => {
    const { rows } = await pg.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'files' ORDER BY ordinal_position`,
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id", "uploader_id", "original_name", "mime_type", "size_bytes",
        "storage_path", "transcoded_path", "thumbnail_path", "transcode_status",
        "duration_sec", "width", "height", "created_at", "deleted_at",
      ]),
    );
  });

  it("requires uploader_id to reference a real user", async () => {
    await expect(
      pg.pool.query(
        `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path)
         VALUES (gen_random_uuid(), 'a.mp4', 'video/mp4', 1, '/x')`,
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it("has upload_sessions table with file_id nullable", async () => {
    const { rows: u } = await pg.pool.query<{ id: string }>(
      `INSERT INTO users (discord_id, username) VALUES ('u', 'u') RETURNING id`,
    );
    await pg.pool.query(
      `INSERT INTO upload_sessions (tus_id, user_id) VALUES ('tus-1', $1)`,
      [u[0].id],
    );
    const { rows } = await pg.pool.query<{ tus_id: string; file_id: string | null }>(
      `SELECT tus_id, file_id FROM upload_sessions WHERE tus_id = 'tus-1'`,
    );
    expect(rows[0].file_id).toBeNull();
  });

  it("transcode_status defaults to 'pending'", async () => {
    const { rows: u } = await pg.pool.query<{ id: string }>(
      `INSERT INTO users (discord_id, username) VALUES ('u2', 'u2') RETURNING id`,
    );
    const { rows } = await pg.pool.query<{ transcode_status: string }>(
      `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path)
       VALUES ($1, 'b.mp4', 'video/mp4', 1, '/x') RETURNING transcode_status`,
      [u[0].id],
    );
    expect(rows[0].transcode_status).toBe("pending");
  });

  it("files table has upload_batch_id column", async () => {
    const { rows } = await pg.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'files' AND column_name = 'upload_batch_id'`,
    );
    expect(rows).toHaveLength(1);
  });

  it("folders table has upload_batch_id column", async () => {
    const { rows } = await pg.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'folders' AND column_name = 'upload_batch_id'`,
    );
    expect(rows).toHaveLength(1);
  });

  it("upload_batches table exists with required columns", async () => {
    const { rows } = await pg.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'upload_batches' ORDER BY ordinal_position`,
    );
    expect(rows.map(r => r.column_name)).toEqual(
      expect.arrayContaining(["id", "uploader_id", "top_folder_id", "created_at"]),
    );
  });
});
