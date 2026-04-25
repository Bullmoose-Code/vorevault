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

describe("getNeighbors — recent context", () => {
  const topIds: string[] = []; // newest → oldest, all top-level (folder_id NULL)
  beforeAll(async () => {
    for (let i = 0; i < 3; i++) {
      const ts = `2026-04-10T00:00:0${i}Z`;
      const r = await fx.pool.query<{ id: string }>(
        `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
         VALUES ($1, NULL, $2, 'video/mp4', 1, '/x', $3) RETURNING id`,
        [userId, `top-${i}.mp4`, ts],
      );
      topIds.push(r.rows[0].id);
    }
  });

  it("excludes files inside a folder", async () => {
    const r = await getNeighbors(topIds[1], { kind: "recent" });
    expect(r.prev?.id).toBe(topIds[2]);
    expect(r.next?.id).toBe(topIds[0]);
  });

  it("returns null at boundaries", async () => {
    expect((await getNeighbors(topIds[2], { kind: "recent" })).prev).toBeNull();
    expect((await getNeighbors(topIds[0], { kind: "recent" })).next).toBeNull();
  });
});

describe("getNeighbors — mine context", () => {
  let otherUserId: string;
  const mineIds: string[] = [];
  beforeAll(async () => {
    otherUserId = (await fx.pool.query<{ id: string }>(
      `INSERT INTO users (discord_id, username) VALUES ('d-nbr-other','bob') RETURNING id`,
    )).rows[0].id;
    for (let i = 0; i < 2; i++) {
      const ts = `2026-04-15T00:00:0${i}Z`;
      const r = await fx.pool.query<{ id: string }>(
        `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
         VALUES ($1, NULL, $2, 'video/mp4', 1, '/x', $3) RETURNING id`,
        [userId, `mine-${i}.mp4`, ts],
      );
      mineIds.push(r.rows[0].id);
    }
    await fx.pool.query(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
       VALUES ($1, NULL, 'bobs.mp4', 'video/mp4', 1, '/x', '2026-04-15T00:00:00.5Z')`,
      [otherUserId],
    );
  });

  it("only walks files uploaded by uploaderId, skipping others' files", async () => {
    const r = await getNeighbors(mineIds[1], { kind: "mine", uploaderId: userId });
    expect(r.prev).toBeNull();
    expect(r.next?.id).toBe(mineIds[0]); // jumps over bob's file
  });
});

describe("getNeighbors — starred context", () => {
  const starredFileIds: string[] = [];
  beforeAll(async () => {
    for (let i = 0; i < 3; i++) {
      const r = await fx.pool.query<{ id: string }>(
        `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
         VALUES ($1, NULL, $2, 'video/mp4', 1, '/x', '2026-04-20T00:00:00Z') RETURNING id`,
        [userId, `star-${i}.mp4`],
      );
      starredFileIds.push(r.rows[0].id);
    }
    for (let i = 0; i < 3; i++) {
      const ts = `2026-04-21T00:00:0${i}Z`;
      await fx.pool.query(
        `INSERT INTO bookmarks (user_id, file_id, created_at) VALUES ($1, $2, $3)`,
        [userId, starredFileIds[i], ts],
      );
    }
  });

  it("orders by bookmark created_at, not file created_at", async () => {
    const r = await getNeighbors(starredFileIds[1], { kind: "starred", userId });
    expect(r.prev?.id).toBe(starredFileIds[2]); // newer bookmark
    expect(r.next?.id).toBe(starredFileIds[0]); // older bookmark
  });
});

describe("getNeighbors — tagged context", () => {
  let tagId: string;
  const taggedIds: string[] = [];
  beforeAll(async () => {
    tagId = (await fx.pool.query<{ id: string }>(
      `INSERT INTO tags (name) VALUES ('apex') RETURNING id`,
    )).rows[0].id;
    for (let i = 0; i < 3; i++) {
      const ts = `2026-04-22T00:00:0${i}Z`;
      const f = await fx.pool.query<{ id: string }>(
        `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
         VALUES ($1, NULL, $2, 'video/mp4', 1, '/x', $3) RETURNING id`,
        [userId, `tag-${i}.mp4`, ts],
      );
      taggedIds.push(f.rows[0].id);
      await fx.pool.query(
        `INSERT INTO file_tags (file_id, tag_id, created_by) VALUES ($1, $2, $3)`,
        [f.rows[0].id, tagId, userId],
      );
    }
    await fx.pool.query(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
       VALUES ($1, NULL, 'untagged.mp4', 'video/mp4', 1, '/x', '2026-04-22T00:00:00.5Z')`,
      [userId],
    );
  });

  it("walks only files with the given tag, in created_at DESC order", async () => {
    const r = await getNeighbors(taggedIds[1], { kind: "tagged", tagId });
    expect(r.prev?.id).toBe(taggedIds[2]); // newer
    expect(r.next?.id).toBe(taggedIds[0]); // older — skips the untagged file
  });
});
