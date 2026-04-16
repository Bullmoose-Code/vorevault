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

async function makeUserAndFile(): Promise<{ userId: string; fileId: string }> {
  const { rows: u } = await pg.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('1', 'a') RETURNING id`,
  );
  const { rows: f } = await pg.pool.query<{ id: string }>(
    `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path)
     VALUES ($1, 'clip.mp4', 'video/mp4', 1024, '/data/uploads/abc/clip.mp4') RETURNING id`,
    [u[0].id],
  );
  return { userId: u[0].id, fileId: f[0].id };
}

describe("share-links module", () => {
  it("creates a share link and retrieves it", async () => {
    const { createShareLink, getShareLink } = await import("./share-links");
    const { userId, fileId } = await makeUserAndFile();
    const link = await createShareLink(fileId, userId);
    expect(link.token.length).toBeGreaterThanOrEqual(22);
    expect(link.file_id).toBe(fileId);
    expect(link.revoked_at).toBeNull();
    const got = await getShareLink(link.token);
    expect(got?.token).toBe(link.token);
  });

  it("getShareLink returns null for revoked links", async () => {
    const { createShareLink, revokeShareLink, getShareLink } = await import("./share-links");
    const { userId, fileId } = await makeUserAndFile();
    const link = await createShareLink(fileId, userId);
    await revokeShareLink(link.token);
    expect(await getShareLink(link.token)).toBeNull();
  });

  it("getShareLink returns null for expired links", async () => {
    const { getShareLink } = await import("./share-links");
    const { userId, fileId } = await makeUserAndFile();
    await pg.pool.query(
      `INSERT INTO share_links (token, file_id, created_by, expires_at)
       VALUES ('expired-tok', $1, $2, now() - interval '1 minute')`,
      [fileId, userId],
    );
    expect(await getShareLink("expired-tok")).toBeNull();
  });

  it("getActiveShareLink returns the active link for a file", async () => {
    const { createShareLink, getActiveShareLink } = await import("./share-links");
    const { userId, fileId } = await makeUserAndFile();
    expect(await getActiveShareLink(fileId)).toBeNull();
    const link = await createShareLink(fileId, userId);
    const active = await getActiveShareLink(fileId);
    expect(active?.token).toBe(link.token);
  });

  it("getActiveShareLink returns null after revocation", async () => {
    const { createShareLink, revokeShareLink, getActiveShareLink } = await import("./share-links");
    const { userId, fileId } = await makeUserAndFile();
    const link = await createShareLink(fileId, userId);
    await revokeShareLink(link.token);
    expect(await getActiveShareLink(fileId)).toBeNull();
  });

  it("revokeAllForFile revokes all links for a file", async () => {
    const { createShareLink, revokeAllForFile, getActiveShareLink } = await import("./share-links");
    const { userId, fileId } = await makeUserAndFile();
    await createShareLink(fileId, userId);
    await revokeAllForFile(fileId);
    expect(await getActiveShareLink(fileId)).toBeNull();
  });
});
