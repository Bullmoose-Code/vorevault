import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";
import {
  createUploadBatch,
  setBatchTopFolder,
  getUploadBatch,
} from "./upload-batches";

let fx: PgFixture;
let userId: string;

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("./db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });
  const u = await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('d-batch','batchuser') RETURNING id`,
  );
  userId = u.rows[0].id;
}, 120_000);
afterAll(async () => { await stopPg(fx); });

describe("upload-batches helpers", () => {
  it("creates a batch with null top_folder_id", async () => {
    const batch = await createUploadBatch(userId);
    expect(batch.id).toBeDefined();
    expect(batch.top_folder_id).toBeNull();
    expect(batch.uploader_id).toBe(userId);
  });

  it("sets top_folder_id after folder is created", async () => {
    const batch = await createUploadBatch(userId);
    const f = await fx.pool.query<{ id: string }>(
      `INSERT INTO folders (name, parent_id, created_by) VALUES ('Valheim', NULL, $1) RETURNING id`,
      [userId],
    );
    await setBatchTopFolder(batch.id, f.rows[0].id);
    const reread = await getUploadBatch(batch.id);
    expect(reread?.top_folder_id).toBe(f.rows[0].id);
  });

  it("getUploadBatch returns null for unknown id", async () => {
    const reread = await getUploadBatch("00000000-0000-0000-0000-000000000000");
    expect(reread).toBeNull();
  });
});
