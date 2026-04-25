import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";
import { getNeighbors } from "./neighbors";

let fx: PgFixture;
let userId: string;
let folderId: string;
const fileIds: string[] = []; // newest → oldest in this folder

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("@/lib/db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });

  userId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('d-nbr','alice') RETURNING id`,
  )).rows[0].id;

  folderId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO folders (name, parent_id, created_by) VALUES ('Apex', NULL, $1) RETURNING id`,
    [userId],
  )).rows[0].id;

  // Insert 5 files into the folder with explicit, monotonically-increasing
  // created_at so the grid order is fully deterministic.
  // file 0 = oldest, file 4 = newest.
  for (let i = 0; i < 5; i++) {
    const ts = `2026-04-01T00:00:0${i}Z`;
    const r = await fx.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
       VALUES ($1, $2, $3, 'video/mp4', 1, '/x', $4) RETURNING id`,
      [userId, folderId, `clip-${i}.mp4`, ts],
    );
    fileIds.push(r.rows[0].id);
  }
  // Grid sorts created_at DESC, so the visible order is: file 4, 3, 2, 1, 0.
}, 120_000);

afterAll(async () => { await stopPg(fx); });

describe("getNeighbors — folder context", () => {
  it("middle file: prev = the next-newer file, next = the next-older file", async () => {
    const r = await getNeighbors(fileIds[2], { kind: "folder", folderId });
    expect(r.prev?.id).toBe(fileIds[3]);
    expect(r.next?.id).toBe(fileIds[1]);
  });

  it("newest file (visually first): prev = null, next = next-older", async () => {
    const r = await getNeighbors(fileIds[4], { kind: "folder", folderId });
    expect(r.prev).toBeNull();
    expect(r.next?.id).toBe(fileIds[3]);
  });

  it("oldest file (visually last): prev = next-newer, next = null", async () => {
    const r = await getNeighbors(fileIds[0], { kind: "folder", folderId });
    expect(r.prev?.id).toBe(fileIds[1]);
    expect(r.next).toBeNull();
  });

  it("ignores soft-deleted files", async () => {
    await fx.pool.query(`UPDATE files SET deleted_at = now() WHERE id = $1`, [fileIds[3]]);
    const r = await getNeighbors(fileIds[2], { kind: "folder", folderId });
    expect(r.prev?.id).toBe(fileIds[4]); // jumps over the deleted one
    expect(r.next?.id).toBe(fileIds[1]);
    await fx.pool.query(`UPDATE files SET deleted_at = NULL WHERE id = $1`, [fileIds[3]]);
  });

  it("uses id as a deterministic tie-breaker for identical timestamps", async () => {
    const sameTs = "2026-04-02T00:00:00Z";
    const a = await fx.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
       VALUES ($1, $2, 'tie-a.mp4', 'video/mp4', 1, '/x', $3) RETURNING id`,
      [userId, folderId, sameTs],
    );
    const b = await fx.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
       VALUES ($1, $2, 'tie-b.mp4', 'video/mp4', 1, '/x', $3) RETURNING id`,
      [userId, folderId, sameTs],
    );
    const aId = a.rows[0].id, bId = b.rows[0].id;
    const [largerId, smallerId] = aId > bId ? [aId, bId] : [bId, aId];
    const r = await getNeighbors(largerId, { kind: "folder", folderId });
    expect(r.next?.id).toBe(smallerId);
    await fx.pool.query(`DELETE FROM files WHERE id = ANY($1)`, [[aId, bId]]);
  });
});
