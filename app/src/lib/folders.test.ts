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
beforeEach(async () => {
  await pg.pool.query("TRUNCATE folders, files, upload_sessions, sessions, users RESTART IDENTITY CASCADE");
});

async function makeUser(username = "u"): Promise<string> {
  const { rows } = await pg.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ($1, $2) RETURNING id`,
    [username, username],
  );
  return rows[0].id;
}

describe("folders — createFolder", () => {
  it("creates a top-level folder", async () => {
    const { createFolder } = await import("./folders");
    const userId = await makeUser();
    const folder = await createFolder({ name: "Clips", parentId: null, createdBy: userId });
    expect(folder.name).toBe("Clips");
    expect(folder.parent_id).toBeNull();
    expect(folder.created_by).toBe(userId);
  });

  it("creates a nested folder", async () => {
    const { createFolder } = await import("./folders");
    const userId = await makeUser();
    const parent = await createFolder({ name: "Clips", parentId: null, createdBy: userId });
    const child = await createFolder({ name: "Apex", parentId: parent.id, createdBy: userId });
    expect(child.parent_id).toBe(parent.id);
  });

  it("rejects case-insensitive sibling collision", async () => {
    const { createFolder, FolderCollisionError } = await import("./folders");
    const userId = await makeUser();
    await createFolder({ name: "Clips", parentId: null, createdBy: userId });
    await expect(
      createFolder({ name: "CLIPS", parentId: null, createdBy: userId }),
    ).rejects.toBeInstanceOf(FolderCollisionError);
  });

  it("rejects name shorter than 1 or longer than 64", async () => {
    const { createFolder, FolderNameError } = await import("./folders");
    const userId = await makeUser();
    await expect(
      createFolder({ name: "", parentId: null, createdBy: userId }),
    ).rejects.toBeInstanceOf(FolderNameError);
    await expect(
      createFolder({ name: "x".repeat(65), parentId: null, createdBy: userId }),
    ).rejects.toBeInstanceOf(FolderNameError);
  });

  it("rejects non-existent parent", async () => {
    const { createFolder, FolderNotFoundError } = await import("./folders");
    const userId = await makeUser();
    await expect(
      createFolder({
        name: "Orphan",
        parentId: "00000000-0000-0000-0000-000000000000",
        createdBy: userId,
      }),
    ).rejects.toBeInstanceOf(FolderNotFoundError);
  });
});
