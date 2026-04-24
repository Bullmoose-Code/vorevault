import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";
import { listTopLevelItems } from "./files";

let fx: PgFixture;

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("./db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });
  await fx.pool.query(
    `INSERT INTO users (id, discord_id, username) VALUES
      ('11111111-1111-1111-1111-111111111111','d1','alice'),
      ('22222222-2222-2222-2222-222222222222','d2','bob')`,
  );
}, 120_000);
afterAll(async () => { await stopPg(fx); });

describe("listTopLevelItems", () => {
  it("mixes top-level folders and root-level files, newest first", async () => {
    const { pool } = fx;
    await pool.query(`DELETE FROM files; DELETE FROM folders;`);
    // two root folders, two root files, one nested file that MUST be hidden
    await pool.query(
      `INSERT INTO folders (id, name, parent_id, created_by, created_at) VALUES
        ('aaaaaaa1-0000-0000-0000-000000000001','fA',NULL,'11111111-1111-1111-1111-111111111111',now() - interval '5 minutes'),
        ('aaaaaaa1-0000-0000-0000-000000000002','fB',NULL,'11111111-1111-1111-1111-111111111111',now() - interval '2 minutes')`,
    );
    await pool.query(
      `INSERT INTO files (id, uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
       VALUES
        ('bbbbbbb1-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',NULL,'root1.txt','text/plain',1,'/x',now() - interval '4 minutes'),
        ('bbbbbbb1-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222',NULL,'root2.txt','text/plain',1,'/x',now() - interval '1 minutes'),
        ('bbbbbbb1-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','aaaaaaa1-0000-0000-0000-000000000001','nested.txt','text/plain',1,'/x',now() - interval '30 seconds')`,
    );
    const page = await listTopLevelItems(1, 10);
    expect(page.total).toBe(4);
    expect(page.items.map((i) => i.kind + ":" + (i.kind === "folder" ? i.name : i.original_name))).toEqual([
      "file:root2.txt",   // 1 min ago
      "folder:fB",        // 2 min ago
      "file:root1.txt",   // 4 min ago
      "folder:fA",        // 5 min ago
    ]);
    // nested.txt must not appear
    expect(page.items.find((i) => i.kind === "file" && i.original_name === "nested.txt")).toBeUndefined();
  });
  it("paginates correctly", async () => {
    const page1 = await listTopLevelItems(1, 2);
    const page2 = await listTopLevelItems(2, 2);
    expect(page1.items.length).toBe(2);
    expect(page2.items.length).toBe(2);
    expect(page1.items[0]).not.toEqual(page2.items[0]);
  });
  it("respects extraOffset (home strip skip)", async () => {
    const withSkip = await listTopLevelItems(1, 10, 1);
    expect(withSkip.items.length).toBe(3);
    expect(withSkip.total).toBe(3);
  });
});
