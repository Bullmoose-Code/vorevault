import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";
import {
  attachTagToFile, detachTagFromFileById,
  listTagsForFile, listAllTagsWithCounts,
} from "./tags";

let fx: PgFixture;
let userId: string;
let fileId: string;

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("@/lib/db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });
  userId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('d-tag','tagger') RETURNING id`,
  )).rows[0].id;
  fileId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path)
     VALUES ($1, 'clip.mp4', 'video/mp4', 1, '/x') RETURNING id`, [userId],
  )).rows[0].id;
}, 120_000);
afterAll(async () => { await stopPg(fx); });

describe("tags DB helpers", () => {
  it("attach creates tag on first use and is idempotent", async () => {
    const t1 = await attachTagToFile(fileId, "Valheim", userId);
    expect(t1.name).toBe("valheim");
    const t2 = await attachTagToFile(fileId, "valheim", userId);
    expect(t2.id).toBe(t1.id);
    const list = await listTagsForFile(fileId);
    expect(list.map((t) => t.name)).toEqual(["valheim"]);
  });
  it("detachById removes the link, keeps the tag row", async () => {
    const mc = await attachTagToFile(fileId, "minecraft", userId);
    await detachTagFromFileById(fileId, mc.id);
    const list = await listTagsForFile(fileId);
    expect(list.map((t) => t.name)).toEqual(["valheim"]);
    const all = await listAllTagsWithCounts();
    expect(all.find((t) => t.name === "minecraft")?.file_count).toBe(0);
  });
  it("listAllTagsWithCounts sorted by name with counts", async () => {
    const all = await listAllTagsWithCounts();
    const names = all.map((t) => t.name);
    expect(names).toEqual([...names].sort());
    expect(all.find((t) => t.name === "valheim")?.file_count).toBe(1);
  });
  it("attach rejects invalid tag names", async () => {
    await expect(attachTagToFile(fileId, "Hello World!", userId)).rejects.toThrow();
  });
});
