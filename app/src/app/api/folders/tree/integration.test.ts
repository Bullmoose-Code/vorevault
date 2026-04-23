import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../../../../tests/pg";
import { createFolderTree } from "@/lib/folder-tree-create";
import { normalizePaths } from "@/lib/folder-paths";

let fx: PgFixture;
let userId: string;

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("@/lib/db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });
  const res = await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username, avatar_url, is_admin)
       VALUES ('d2', 'tester2', null, false) RETURNING id`,
  );
  userId = res.rows[0].id;
}, 60_000);

afterAll(async () => { await stopPg(fx); });

describe("recursive upload — end-to-end folder tree", () => {
  it("given file paths, normalizePaths+createFolderTree produces a full tree", async () => {
    // Simulate the set of directory parts from a webkitdirectory pick.
    const dirs = [
      "Album", "Album/sub1", "Album/sub1", "Album/sub2/deep", "Album/sub2",
    ];
    const paths = normalizePaths(dirs);
    const map = await createFolderTree({ parentId: null, paths, actorId: userId });

    expect(Object.keys(map).sort()).toEqual([
      "Album", "Album/sub1", "Album/sub2", "Album/sub2/deep",
    ]);

    // Verify parent links match the path prefixes.
    const { rows } = await fx.pool.query<{ id: string; name: string; parent_id: string | null }>(
      `SELECT id, name, parent_id FROM folders WHERE created_by = $1`, [userId],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const sub1 = rows.find((r) => r.name === "sub1");
    const deep = rows.find((r) => r.name === "deep");
    const sub2 = rows.find((r) => r.name === "sub2");
    expect(sub1!.parent_id).toBe(map["Album"]);
    expect(sub2!.parent_id).toBe(map["Album"]);
    expect(deep!.parent_id).toBe(map["Album/sub2"]);
    expect(byId.get(map["Album"])!.parent_id).toBeNull();
  });
});
