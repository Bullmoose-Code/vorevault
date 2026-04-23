import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";
import { createFolderTree } from "./folder-tree-create";

let fx: PgFixture;
let userId: string;

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("@/lib/db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });
  const res = await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username, avatar_url, is_admin)
       VALUES ('d1', 'tester', null, false) RETURNING id`,
  );
  userId = res.rows[0].id;
}, 60_000);

afterAll(async () => { await stopPg(fx); });

beforeEach(async () => {
  await fx.pool.query(`DELETE FROM folders`);
});

describe("createFolderTree", () => {
  it("creates all folders under the given parent and returns a path→id map", async () => {
    const map = await createFolderTree({
      parentId: null,
      paths: ["MyFolder", "MyFolder/sub", "MyFolder/sub/deep"],
      actorId: userId,
    });
    expect(Object.keys(map).sort()).toEqual(["MyFolder", "MyFolder/sub", "MyFolder/sub/deep"]);
    const { rows } = await fx.pool.query<{ name: string; parent_id: string | null }>(
      `SELECT name, parent_id FROM folders ORDER BY name`,
    );
    expect(rows.map((r) => r.name)).toEqual(["MyFolder", "deep", "sub"]);
  });

  it("reuses an existing active folder at the correct level", async () => {
    const first = await createFolderTree({
      parentId: null,
      paths: ["MyFolder", "MyFolder/sub"],
      actorId: userId,
    });
    const second = await createFolderTree({
      parentId: null,
      paths: ["MyFolder", "MyFolder/sub", "MyFolder/sub/deep"],
      actorId: userId,
    });
    expect(second["MyFolder"]).toBe(first["MyFolder"]);
    expect(second["MyFolder/sub"]).toBe(first["MyFolder/sub"]);
    expect(second["MyFolder/sub/deep"]).toBeDefined();
    const { rows } = await fx.pool.query(`SELECT count(*)::int AS c FROM folders`);
    expect(rows[0].c).toBe(3);
  });

  it("rolls back the whole tree if any insert fails", async () => {
    await expect(
      createFolderTree({
        parentId: "00000000-0000-0000-0000-000000000000",
        paths: ["A", "A/B"],
        actorId: userId,
      }),
    ).rejects.toThrow();
    const { rows } = await fx.pool.query(`SELECT count(*)::int AS c FROM folders`);
    expect(rows[0].c).toBe(0);
  });

  it("scopes tree under a non-null parentId", async () => {
    const { rows: parentRows } = await fx.pool.query<{ id: string }>(
      `INSERT INTO folders (name, parent_id, created_by) VALUES ('dest', NULL, $1) RETURNING id`,
      [userId],
    );
    const parentId = parentRows[0].id;
    const map = await createFolderTree({
      parentId, paths: ["Album"], actorId: userId,
    });
    const { rows } = await fx.pool.query(`SELECT parent_id FROM folders WHERE id = $1`, [map["Album"]]);
    expect(rows[0].parent_id).toBe(parentId);
  });
});
