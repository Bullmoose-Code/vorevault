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
  await pg.pool.query("TRUNCATE bookmarks, folders, files, upload_sessions, sessions, users RESTART IDENTITY CASCADE");
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
  });
});
