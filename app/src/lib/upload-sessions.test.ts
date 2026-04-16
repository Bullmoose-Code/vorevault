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

describe("upload-sessions module", () => {
  it("registers a tus upload session and finalizes it with a file id", async () => {
    const { registerUploadSession, finalizeUploadSession, getUploadSession } =
      await import("./upload-sessions");
    const userId = await makeUser();
    await registerUploadSession("tus-abc", userId);
    expect((await getUploadSession("tus-abc"))?.user_id).toBe(userId);

    const { rows: f } = await pg.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path)
       VALUES ($1, 'x', 'image/png', 1, '/x') RETURNING id`,
      [userId],
    );
    await finalizeUploadSession("tus-abc", f[0].id);
    expect((await getUploadSession("tus-abc"))?.file_id).toBe(f[0].id);
  });

  it("getUploadSession returns null for unknown tus id", async () => {
    const { getUploadSession } = await import("./upload-sessions");
    expect(await getUploadSession("nope")).toBeNull();
  });
});
