import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "../tests/pg";
import { runBackfill } from "./backfill-batches-and-tags";

let fx: PgFixture;
let userId: string;

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("@/lib/db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });
  userId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('d-bf','ryan.17') RETURNING id`,
  )).rows[0].id;
}, 120_000);
afterAll(async () => { await stopPg(fx); });

describe("runBackfill", () => {
  it("backfills batches for clustered top-level folders", async () => {
    const f = (await fx.pool.query<{ id: string }>(
      `INSERT INTO folders (name, parent_id, created_by) VALUES ('Cluster', NULL, $1) RETURNING id`,
      [userId],
    )).rows[0].id;
    // 3 files within 60s of folder created_at
    for (let i = 0; i < 3; i++) {
      await fx.pool.query(
        `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
         VALUES ($1, $2, $3, 'video/mp4', 1, '/x', (SELECT created_at + interval '${i * 10} seconds' FROM folders WHERE id = $2))`,
        [userId, f, `clip-${i}.mp4`],
      );
    }
    await runBackfill(fx.pool);
    const folderRow = await fx.pool.query<{ upload_batch_id: string | null }>(
      `SELECT upload_batch_id FROM folders WHERE id = $1`, [f],
    );
    expect(folderRow.rows[0].upload_batch_id).not.toBeNull();
    const filesBatched = await fx.pool.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM files WHERE folder_id = $1 AND upload_batch_id IS NOT NULL`, [f],
    );
    expect(filesBatched.rows[0].c).toBe(3);
  });

  it("does NOT backfill batches for sparse-time folders (<2 files in 60s)", async () => {
    const f = (await fx.pool.query<{ id: string }>(
      `INSERT INTO folders (name, parent_id, created_by) VALUES ('Sparse', NULL, $1) RETURNING id`,
      [userId],
    )).rows[0].id;
    await fx.pool.query(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path)
       VALUES ($1, $2, 'only.mp4', 'video/mp4', 1, '/x')`,
      [userId, f],
    );
    await runBackfill(fx.pool);
    const row = await fx.pool.query<{ upload_batch_id: string | null }>(
      `SELECT upload_batch_id FROM folders WHERE id = $1`, [f],
    );
    expect(row.rows[0].upload_batch_id).toBeNull();
  });

  it("auto-tags every live file with the uploader's username tag", async () => {
    await runBackfill(fx.pool);
    const tagged = await fx.pool.query<{ c: number }>(
      `SELECT count(*)::int AS c
         FROM files f
         JOIN file_tags ft ON ft.file_id = f.id
         JOIN tags t ON t.id = ft.tag_id
        WHERE t.name = 'ryan-17' AND f.deleted_at IS NULL`,
    );
    expect(tagged.rows[0].c).toBeGreaterThan(0);
  });

  it("is idempotent on repeat runs", async () => {
    await runBackfill(fx.pool);
    const firstCount = (await fx.pool.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM upload_batches`,
    )).rows[0].c;
    await runBackfill(fx.pool);
    const secondCount = (await fx.pool.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM upload_batches`,
    )).rows[0].c;
    expect(secondCount).toBe(firstCount);
  });
});
