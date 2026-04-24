import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";
import { listTopLevelItems } from "./files";

let fx: PgFixture;
let userId: string;
let batchId: string;
let topFolderId: string;

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("@/lib/db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });

  userId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('d-top','alice') RETURNING id`,
  )).rows[0].id;

  // 1) Legacy top-level folder (no batch) with one file inside
  const legacy = await fx.pool.query<{ id: string }>(
    `INSERT INTO folders (name, parent_id, created_by)
     VALUES ('LegacyFolder', NULL, $1) RETURNING id`, [userId],
  );
  await fx.pool.query(
    `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path)
     VALUES ($1, $2, 'inner.mp4', 'video/mp4', 1, '/x')`,
    [userId, legacy.rows[0].id],
  );

  // 2) Folder-upload batch: Valheim/ with 3 inner files
  batchId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO upload_batches (uploader_id) VALUES ($1) RETURNING id`, [userId],
  )).rows[0].id;
  topFolderId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO folders (name, parent_id, created_by, upload_batch_id)
     VALUES ('Valheim', NULL, $1, $2) RETURNING id`, [userId, batchId],
  )).rows[0].id;
  await fx.pool.query(
    `UPDATE upload_batches SET top_folder_id = $1 WHERE id = $2`, [topFolderId, batchId],
  );
  for (let i = 0; i < 3; i++) {
    await fx.pool.query(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, upload_batch_id)
       VALUES ($1, $2, $3, 'video/mp4', 1, '/x', $4)`,
      [userId, topFolderId, `clip-${i}.mp4`, batchId],
    );
  }

  // 3) Loose file dropped into legacy folder individually (no batch)
  await fx.pool.query(
    `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path)
     VALUES ($1, $2, 'solo.mp4', 'video/mp4', 1, '/x')`,
    [userId, legacy.rows[0].id],
  );

  // 4) Loose file at root (folder_id NULL, no batch)
  await fx.pool.query(
    `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path)
     VALUES ($1, NULL, 'rooted.mp4', 'video/mp4', 1, '/x')`,
    [userId],
  );
}, 120_000);
afterAll(async () => { await stopPg(fx); });

describe("listTopLevelItems (batch-aware)", () => {
  it("emits exactly one folder tile per upload batch", async () => {
    const page = await listTopLevelItems(1, 50, {});
    const valheim = page.items.filter((i) => i.kind === "folder" && i.name === "Valheim");
    expect(valheim).toHaveLength(1);
  });

  it("emits one folder tile per legacy top-level folder", async () => {
    const page = await listTopLevelItems(1, 50, {});
    const legacy = page.items.filter((i) => i.kind === "folder" && i.name === "LegacyFolder");
    expect(legacy).toHaveLength(1);
  });

  it("does NOT emit file tiles for files inside a folder-upload batch", async () => {
    const page = await listTopLevelItems(1, 50, {});
    const clips = page.items.filter((i) => i.kind === "file" && i.original_name.startsWith("clip-"));
    expect(clips).toHaveLength(0);
  });

  it("emits file tiles for loose files (root AND dropped into existing folders)", async () => {
    const page = await listTopLevelItems(1, 50, {});
    const names = page.items
      .filter((i) => i.kind === "file")
      .map((i) => (i as { original_name: string }).original_name);
    expect(names).toEqual(expect.arrayContaining(["solo.mp4", "rooted.mp4", "inner.mp4"]));
  });

  it("orders items by created_at DESC across branches", async () => {
    const page = await listTopLevelItems(1, 50, {});
    const times = page.items.map((i) => new Date(i.created_at).getTime());
    for (let i = 1; i < times.length; i++) expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
  });

  it("total count matches items across branches", async () => {
    const page = await listTopLevelItems(1, 50, {});
    expect(page.total).toBe(page.items.length);
  });
});
