import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";

let pg: PgFixture;

vi.mock("@/lib/db", () => {
  const pgLib = require("pg") as typeof import("pg");
  let pool: import("pg").Pool | undefined;
  return {
    pool: {
      query: (text: string, params?: unknown[]) => {
        if (!pool) pool = new pgLib.Pool({ connectionString: process.env.TEST_PG_URL, max: 2 });
        return pool.query(text, params);
      },
    },
  };
});

beforeAll(async () => {
  pg = await startPg();
  process.env.TEST_PG_URL = pg.container.getConnectionUri();
});
afterAll(async () => { await stopPg(pg); });
beforeEach(async () => { await pg.pool.query("TRUNCATE users RESTART IDENTITY CASCADE"); });

async function makeUser(): Promise<string> {
  const { rows } = await pg.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('1', 'a') RETURNING id`,
  );
  return rows[0].id;
}

describe("files DB module", () => {
  it("inserts a file and returns it from getFile", async () => {
    const { insertFile, getFile } = await import("./files");
    const userId = await makeUser();
    const f = await insertFile({
      uploaderId: userId,
      originalName: "clip.mp4",
      mimeType: "video/mp4",
      sizeBytes: 1234,
      storagePath: "/data/uploads/abc/clip.mp4",
    });
    expect(f.id).toBeTruthy();
    expect(f.original_name).toBe("clip.mp4");
    expect(f.transcode_status).toBe("pending");
    const got = await getFile(f.id);
    expect(got?.id).toBe(f.id);
  });

  it("getFile returns null for unknown id", async () => {
    const { getFile } = await import("./files");
    expect(await getFile("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("getFile returns null for soft-deleted files", async () => {
    const { insertFile, softDeleteFile, getFile } = await import("./files");
    const userId = await makeUser();
    const f = await insertFile({
      uploaderId: userId, originalName: "a", mimeType: "image/png",
      sizeBytes: 1, storagePath: "/x",
    });
    await softDeleteFile(f.id);
    expect(await getFile(f.id)).toBeNull();
  });
});
