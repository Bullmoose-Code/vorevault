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
  await pg.pool.query(
    "TRUNCATE file_tags, tags, bookmarks, folders, files, upload_sessions, upload_batches, sessions, users RESTART IDENTITY CASCADE",
  );
});

async function seed() {
  const { rows: u } = await pg.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('1', 'ryan') RETURNING id`,
  );
  const { rows: fld } = await pg.pool.query<{ id: string }>(
    `INSERT INTO folders (name, parent_id, created_by) VALUES ('Apex', NULL, $1) RETURNING id`,
    [u[0].id],
  );
  await pg.pool.query(
    `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, transcode_status)
     VALUES ($1, $2, 'apex-clutch.mp4', 'video/mp4', 1, 'uploads/a/x.mp4', 'skipped'),
            ($1, NULL,'golf-ob.mp4', 'video/mp4', 1, 'uploads/b/y.mp4', 'skipped')`,
    [u[0].id, fld[0].id],
  );
  return { userId: u[0].id, folderId: fld[0].id };
}

describe("search", () => {
  it("matches filename", async () => {
    const { searchEverything } = await import("./search");
    await seed();
    const res = await searchEverything({ query: "apex", limit: 10, offset: 0 });
    expect(res.files.map((f) => f.original_name)).toContain("apex-clutch.mp4");
  });

  it("matches folder name (folder result)", async () => {
    const { searchEverything } = await import("./search");
    await seed();
    const res = await searchEverything({ query: "apex", limit: 10, offset: 0 });
    expect(res.folders.map((f) => f.name)).toContain("Apex");
  });

  it("matches uploader name", async () => {
    const { searchEverything } = await import("./search");
    await seed();
    const res = await searchEverything({ query: "ryan", limit: 10, offset: 0 });
    expect(res.files.length).toBeGreaterThan(0);
  });

  it("fuzzy match — 'apx' finds 'apex-clutch.mp4'", async () => {
    const { searchEverything } = await import("./search");
    await seed();
    const res = await searchEverything({ query: "apx", limit: 10, offset: 0 });
    expect(res.files.map((f) => f.original_name)).toContain("apex-clutch.mp4");
  });

  it("scope filters files to a folder subtree", async () => {
    const { searchEverything } = await import("./search");
    const { folderId } = await seed();
    const res = await searchEverything({ query: "mp4", limit: 10, offset: 0, scopeFolderId: folderId });
    expect(res.files.map((f) => f.original_name)).toEqual(["apex-clutch.mp4"]);
  });

  it("returns empty for queries shorter than 2 chars", async () => {
    const { searchEverything } = await import("./search");
    await seed();
    const res = await searchEverything({ query: "a", limit: 10, offset: 0 });
    expect(res.files).toHaveLength(0);
    expect(res.folders).toHaveLength(0);
    expect(res.tags).toHaveLength(0);
  });

  it("tag-name substring match: surfaces matching tags AND files tagged with them", async () => {
    const { searchEverything } = await import("./search");
    const { userId } = await seed();
    // Add a file with a filename that would NOT match 'valheim' on its own,
    // tag it, and verify the query picks it up through the tag join.
    const { rows: f } = await pg.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, transcode_status)
       VALUES ($1, NULL, 'clip-xyz.mp4', 'video/mp4', 1, 'uploads/c/z.mp4', 'skipped') RETURNING id`,
      [userId],
    );
    const { rows: t } = await pg.pool.query<{ id: string }>(
      `INSERT INTO tags (name) VALUES ('valheim') RETURNING id`,
    );
    await pg.pool.query(
      `INSERT INTO file_tags (file_id, tag_id, created_by) VALUES ($1, $2, $3)`,
      [f[0].id, t[0].id, userId],
    );

    const res = await searchEverything({ query: "valheim", limit: 10, offset: 0 });
    expect(res.tags.map((x) => x.name)).toEqual(["valheim"]);
    expect(res.files.map((x) => x.original_name)).toContain("clip-xyz.mp4");
  });
});
