import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";

let pg: PgFixture;

vi.mock("@/lib/db", () => {
  const pgLib = require("pg") as typeof import("pg");
  let pool: import("pg").Pool | undefined;
  const getPool = () => {
    if (!pool) pool = new pgLib.Pool({ connectionString: process.env.TEST_PG_URL, max: 2 });
    return pool;
  };
  return {
    pool: {
      query: (text: string, params?: unknown[]) => getPool().query(text, params),
      connect: () => getPool().connect(),
    },
  };
});

beforeAll(async () => { pg = await startPg(); process.env.TEST_PG_URL = pg.container.getConnectionUri(); });
afterAll(async () => { await stopPg(pg); });
beforeEach(async () => {
  await pg.pool.query("TRUNCATE bookmarks, folders, files, upload_sessions, sessions, users RESTART IDENTITY CASCADE");
});

async function makeUserFile(): Promise<{ userId: string; fileId: string }> {
  const { rows: u } = await pg.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('d', 'u') RETURNING id`,
  );
  const { rows: f } = await pg.pool.query<{ id: string }>(
    `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path, transcode_status)
     VALUES ($1, 'x', 'video/mp4', 1, 'uploads/x/x', 'skipped') RETURNING id`,
    [u[0].id],
  );
  return { userId: u[0].id, fileId: f[0].id };
}

describe("bookmarks", () => {
  it("addBookmark is idempotent", async () => {
    const { addBookmark, isBookmarked } = await import("./bookmarks");
    const { userId, fileId } = await makeUserFile();
    const first = await addBookmark(userId, fileId);
    expect(first.created).toBe(true);
    expect(await isBookmarked(userId, fileId)).toBe(true);
    const second = await addBookmark(userId, fileId);
    expect(second.created).toBe(false);
  });

  it("removeBookmark returns whether a row was removed", async () => {
    const { addBookmark, removeBookmark } = await import("./bookmarks");
    const { userId, fileId } = await makeUserFile();
    await addBookmark(userId, fileId);
    expect(await removeBookmark(userId, fileId)).toBe(true);
    expect(await removeBookmark(userId, fileId)).toBe(false);
  });

  it("listBookmarks returns files most-recent-first", async () => {
    const { addBookmark, listBookmarks } = await import("./bookmarks");
    const { userId, fileId: f1 } = await makeUserFile();
    const { rows: f2rows } = await pg.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path, transcode_status)
       VALUES ($1, 'y', 'image/png', 1, 'uploads/y/y', 'skipped') RETURNING id`,
      [userId],
    );
    await addBookmark(userId, f1);
    await addBookmark(userId, f2rows[0].id);
    const list = await listBookmarks(userId, 10, 0);
    expect(list.total).toBe(2);
    expect(list.items[0].file.id).toBe(f2rows[0].id);
  });

  it("cascades on file hard-delete", async () => {
    const { addBookmark, isBookmarked } = await import("./bookmarks");
    const { userId, fileId } = await makeUserFile();
    await addBookmark(userId, fileId);
    await pg.pool.query(`DELETE FROM files WHERE id = $1`, [fileId]);
    expect(await isBookmarked(userId, fileId)).toBe(false);
  });
});
