import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";

let pg: PgFixture;

vi.mock("@/lib/db", () => {
  const pgLib = require("pg") as typeof import("pg");
  let pool: import("pg").Pool | undefined;
  function getPool() {
    if (!pool) pool = new pgLib.Pool({ connectionString: process.env.TEST_PG_URL, max: 2 });
    return pool;
  }
  return {
    pool: {
      query: (text: string, params?: unknown[]) => getPool().query(text, params),
      connect: () => getPool().connect(),
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

describe("folders — renameFolder", () => {
  it("creator can rename their folder", async () => {
    const { createFolder, renameFolder } = await import("./folders");
    const userId = await makeUser();
    const folder = await createFolder({ name: "old", parentId: null, createdBy: userId });
    const renamed = await renameFolder({ id: folder.id, newName: "new", actorId: userId, isAdmin: false });
    expect(renamed.name).toBe("new");
  });

  it("non-creator non-admin cannot rename", async () => {
    const { createFolder, renameFolder, FolderAuthError } = await import("./folders");
    const owner = await makeUser("owner");
    const stranger = await makeUser("stranger");
    const folder = await createFolder({ name: "old", parentId: null, createdBy: owner });
    await expect(
      renameFolder({ id: folder.id, newName: "new", actorId: stranger, isAdmin: false }),
    ).rejects.toBeInstanceOf(FolderAuthError);
  });

  it("admin can rename any folder", async () => {
    const { createFolder, renameFolder } = await import("./folders");
    const owner = await makeUser("owner");
    const admin = await makeUser("admin");
    const folder = await createFolder({ name: "old", parentId: null, createdBy: owner });
    const renamed = await renameFolder({ id: folder.id, newName: "new", actorId: admin, isAdmin: true });
    expect(renamed.name).toBe("new");
  });

  it("rename collision raises FolderCollisionError", async () => {
    const { createFolder, renameFolder, FolderCollisionError } = await import("./folders");
    const userId = await makeUser();
    await createFolder({ name: "Clips", parentId: null, createdBy: userId });
    const other = await createFolder({ name: "Other", parentId: null, createdBy: userId });
    await expect(
      renameFolder({ id: other.id, newName: "clips", actorId: userId, isAdmin: false }),
    ).rejects.toBeInstanceOf(FolderCollisionError);
  });
});

describe("folders — moveFolder", () => {
  it("creator can move their folder to a new parent", async () => {
    const { createFolder, moveFolder } = await import("./folders");
    const userId = await makeUser();
    const a = await createFolder({ name: "A", parentId: null, createdBy: userId });
    const b = await createFolder({ name: "B", parentId: null, createdBy: userId });
    const moved = await moveFolder({ id: a.id, newParentId: b.id, actorId: userId, isAdmin: false });
    expect(moved.parent_id).toBe(b.id);
  });

  it("rejects cycle: self as parent", async () => {
    const { createFolder, moveFolder, FolderCycleError } = await import("./folders");
    const userId = await makeUser();
    const a = await createFolder({ name: "A", parentId: null, createdBy: userId });
    await expect(
      moveFolder({ id: a.id, newParentId: a.id, actorId: userId, isAdmin: false }),
    ).rejects.toBeInstanceOf(FolderCycleError);
  });

  it("rejects cycle: descendant as parent", async () => {
    const { createFolder, moveFolder, FolderCycleError } = await import("./folders");
    const userId = await makeUser();
    const a = await createFolder({ name: "A", parentId: null, createdBy: userId });
    const b = await createFolder({ name: "B", parentId: a.id, createdBy: userId });
    const c = await createFolder({ name: "C", parentId: b.id, createdBy: userId });
    await expect(
      moveFolder({ id: a.id, newParentId: c.id, actorId: userId, isAdmin: false }),
    ).rejects.toBeInstanceOf(FolderCycleError);
  });

  it("rejects collision at new parent", async () => {
    const { createFolder, moveFolder, FolderCollisionError } = await import("./folders");
    const userId = await makeUser();
    const parent = await createFolder({ name: "P", parentId: null, createdBy: userId });
    await createFolder({ name: "X", parentId: parent.id, createdBy: userId });
    const other = await createFolder({ name: "X", parentId: null, createdBy: userId });
    await expect(
      moveFolder({ id: other.id, newParentId: parent.id, actorId: userId, isAdmin: false }),
    ).rejects.toBeInstanceOf(FolderCollisionError);
  });
});

describe("folders — deleteFolder (orphan-to-parent)", () => {
  it("reparents direct child folders to the deleted folder's parent", async () => {
    const { createFolder, deleteFolder } = await import("./folders");
    const userId = await makeUser();
    const top = await createFolder({ name: "Top", parentId: null, createdBy: userId });
    const mid = await createFolder({ name: "Mid", parentId: top.id, createdBy: userId });
    const leaf = await createFolder({ name: "Leaf", parentId: mid.id, createdBy: userId });
    await deleteFolder({ id: mid.id, actorId: userId, isAdmin: false });
    const { rows } = await pg.pool.query<{ parent_id: string | null }>(
      `SELECT parent_id FROM folders WHERE id = $1`,
      [leaf.id],
    );
    expect(rows[0].parent_id).toBe(top.id);
  });

  it("reparents direct files to the deleted folder's parent", async () => {
    const { createFolder, deleteFolder } = await import("./folders");
    const userId = await makeUser();
    const top = await createFolder({ name: "Top", parentId: null, createdBy: userId });
    const mid = await createFolder({ name: "Mid", parentId: top.id, createdBy: userId });
    const { rows: fileRows } = await pg.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path, folder_id, transcode_status)
       VALUES ($1, 'f.mp4', 'video/mp4', 100, 'uploads/x/f.mp4', $2, 'skipped')
       RETURNING id`,
      [userId, mid.id],
    );
    await deleteFolder({ id: mid.id, actorId: userId, isAdmin: false });
    const { rows } = await pg.pool.query<{ folder_id: string | null }>(
      `SELECT folder_id FROM files WHERE id = $1`,
      [fileRows[0].id],
    );
    expect(rows[0].folder_id).toBe(top.id);
  });

  it("reparents to NULL when deleting a top-level folder", async () => {
    const { createFolder, deleteFolder } = await import("./folders");
    const userId = await makeUser();
    const top = await createFolder({ name: "Top", parentId: null, createdBy: userId });
    const mid = await createFolder({ name: "Mid", parentId: top.id, createdBy: userId });
    await deleteFolder({ id: top.id, actorId: userId, isAdmin: false });
    const { rows } = await pg.pool.query<{ parent_id: string | null }>(
      `SELECT parent_id FROM folders WHERE id = $1`,
      [mid.id],
    );
    expect(rows[0].parent_id).toBeNull();
  });

  it("non-creator non-admin cannot delete", async () => {
    const { createFolder, deleteFolder, FolderAuthError } = await import("./folders");
    const owner = await makeUser("owner");
    const stranger = await makeUser("stranger");
    const folder = await createFolder({ name: "F", parentId: null, createdBy: owner });
    await expect(
      deleteFolder({ id: folder.id, actorId: stranger, isAdmin: false }),
    ).rejects.toBeInstanceOf(FolderAuthError);
  });
});

describe("folders — queries", () => {
  it("listTopLevelFolders returns top-level folders with counts", async () => {
    const { createFolder, listTopLevelFolders } = await import("./folders");
    const userId = await makeUser();
    const clips = await createFolder({ name: "Clips", parentId: null, createdBy: userId });
    await createFolder({ name: "Apex", parentId: clips.id, createdBy: userId });
    await pg.pool.query(
      `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path, folder_id, transcode_status)
       VALUES ($1, 'x.mp4', 'video/mp4', 1, 'uploads/a/x.mp4', $2, 'skipped')`,
      [userId, clips.id],
    );
    const list = await listTopLevelFolders();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Clips");
    expect(list[0].direct_file_count).toBe(1);
    expect(list[0].direct_subfolder_count).toBe(1);
  });

  it("listChildren returns subfolders and files of a given folder", async () => {
    const { createFolder, listChildren } = await import("./folders");
    const userId = await makeUser();
    const clips = await createFolder({ name: "Clips", parentId: null, createdBy: userId });
    await createFolder({ name: "Apex", parentId: clips.id, createdBy: userId });
    await pg.pool.query(
      `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path, folder_id, transcode_status)
       VALUES ($1, 'clip.mp4', 'video/mp4', 1, 'uploads/a/clip.mp4', $2, 'skipped')`,
      [userId, clips.id],
    );
    const { subfolders, files } = await listChildren(clips.id);
    expect(subfolders).toHaveLength(1);
    expect(subfolders[0].name).toBe("Apex");
    expect(files).toHaveLength(1);
    expect(files[0].original_name).toBe("clip.mp4");
  });

  it("getBreadcrumbs returns root-to-leaf chain", async () => {
    const { createFolder, getBreadcrumbs } = await import("./folders");
    const userId = await makeUser();
    const a = await createFolder({ name: "A", parentId: null, createdBy: userId });
    const b = await createFolder({ name: "B", parentId: a.id, createdBy: userId });
    const c = await createFolder({ name: "C", parentId: b.id, createdBy: userId });
    const crumbs = await getBreadcrumbs(c.id);
    expect(crumbs.map((f) => f.name)).toEqual(["A", "B", "C"]);
  });

  it("getFolderWithCreator returns folder row with creator_username", async () => {
    const { createFolder, getFolderWithCreator } = await import("./folders");
    const userId = await makeUser("alice");
    const folder = await createFolder({ name: "Clips", parentId: null, createdBy: userId });
    const result = await getFolderWithCreator(folder.id);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Clips");
    expect(result!.creator_username).toBe("alice");
  });

  it("getFolderWithCreator returns null for unknown id", async () => {
    const { getFolderWithCreator } = await import("./folders");
    const result = await getFolderWithCreator("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("listChildrenWithUploader returns subfolders and files with uploader_name", async () => {
    const { createFolder, listChildrenWithUploader } = await import("./folders");
    const userId = await makeUser("bob");
    const parent = await createFolder({ name: "Parent", parentId: null, createdBy: userId });
    await createFolder({ name: "Child", parentId: parent.id, createdBy: userId });
    await pg.pool.query(
      `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path, folder_id, transcode_status)
       VALUES ($1, 'clip.mp4', 'video/mp4', 1, 'uploads/a/clip.mp4', $2, 'skipped')`,
      [userId, parent.id],
    );
    const { subfolders, files } = await listChildrenWithUploader(parent.id);
    expect(subfolders).toHaveLength(1);
    expect(subfolders[0].name).toBe("Child");
    expect(files).toHaveLength(1);
    expect(files[0].original_name).toBe("clip.mp4");
    expect(files[0].uploader_name).toBe("bob");
  });
});

describe("folder read paths skip trashed", () => {
  it("listTopLevelFolders excludes trashed folders", async () => {
    const { createFolder, listTopLevelFolders } = await import("./folders");
    const uid = await makeUser("alice");
    const keep = await createFolder({ name: "keep", parentId: null, createdBy: uid });
    const trash = await createFolder({ name: "trash", parentId: null, createdBy: uid });
    await pg.pool.query(`UPDATE folders SET deleted_at = now() WHERE id = $1`, [trash.id]);
    const rows = await listTopLevelFolders();
    expect(rows.map((r) => r.id)).toEqual([keep.id]);
  });

  it("listChildren excludes trashed subfolders", async () => {
    const { createFolder, listChildren } = await import("./folders");
    const uid = await makeUser("bob");
    const root = await createFolder({ name: "root", parentId: null, createdBy: uid });
    const keep = await createFolder({ name: "keep", parentId: root.id, createdBy: uid });
    const trash = await createFolder({ name: "trash", parentId: root.id, createdBy: uid });
    await pg.pool.query(`UPDATE folders SET deleted_at = now() WHERE id = $1`, [trash.id]);
    const { subfolders } = await listChildren(root.id);
    expect(subfolders.map((r) => r.id)).toEqual([keep.id]);
  });

  it("getFolder returns null for trashed folders, getFolderIncludingTrashed returns them", async () => {
    const { createFolder, getFolder, getFolderIncludingTrashed } = await import("./folders");
    const uid = await makeUser("carol");
    const f = await createFolder({ name: "x", parentId: null, createdBy: uid });
    await pg.pool.query(`UPDATE folders SET deleted_at = now() WHERE id = $1`, [f.id]);
    expect(await getFolder(f.id)).toBeNull();
    const including = await getFolderIncludingTrashed(f.id);
    expect(including?.id).toBe(f.id);
  });

  it("createFolder allows reusing a trashed sibling's name", async () => {
    const { createFolder } = await import("./folders");
    const uid = await makeUser("dan");
    const a = await createFolder({ name: "dup", parentId: null, createdBy: uid });
    await pg.pool.query(`UPDATE folders SET deleted_at = now() WHERE id = $1`, [a.id]);
    const b = await createFolder({ name: "dup", parentId: null, createdBy: uid });
    expect(b.id).not.toBe(a.id);
  });
});

describe("trashFolder", () => {
  it("cascades deleted_at to descendant folders and files with same timestamp", async () => {
    const { createFolder, trashFolder } = await import("./folders");
    const { insertFile } = await import("./files");
    const uid = await makeUser("eve");
    const a = await createFolder({ name: "a", parentId: null, createdBy: uid });
    const b = await createFolder({ name: "b", parentId: a.id, createdBy: uid });
    const c = await createFolder({ name: "c", parentId: b.id, createdBy: uid });
    const f1 = await insertFile({ uploaderId: uid, folderId: a.id, originalName: "f1", mimeType: "image/png", sizeBytes: 1, storagePath: "/a/f1" });
    const f2 = await insertFile({ uploaderId: uid, folderId: c.id, originalName: "f2", mimeType: "image/png", sizeBytes: 1, storagePath: "/a/f2" });

    const counts = await trashFolder({ id: a.id, actorId: uid, isAdmin: false });
    expect(counts).toEqual({ folders: 3, files: 2 });

    const { rows: f } = await pg.pool.query<{ id: string; deleted_at: string | null }>(
      `SELECT id, deleted_at FROM folders WHERE id IN ($1, $2, $3) ORDER BY id`,
      [a.id, b.id, c.id],
    );
    expect(f.every((r) => r.deleted_at !== null)).toBe(true);
    const ts = new Set(f.map((r) => r.deleted_at));
    expect(ts.size).toBe(1); // same timestamp across cascade

    const { rows: files } = await pg.pool.query<{ id: string; deleted_at: string | null }>(
      `SELECT id, deleted_at FROM files WHERE id IN ($1, $2)`,
      [f1.id, f2.id],
    );
    expect(files.every((r) => r.deleted_at === f[0].deleted_at)).toBe(true);
  });

  it("rejects a non-owner non-admin actor", async () => {
    const { createFolder, trashFolder, FolderAuthError } = await import("./folders");
    const owner = await makeUser("owner");
    const other = await makeUser("other");
    const f = await createFolder({ name: "x", parentId: null, createdBy: owner });
    await expect(trashFolder({ id: f.id, actorId: other, isAdmin: false })).rejects.toBeInstanceOf(FolderAuthError);
  });

  it("is a no-op on an already-trashed folder (returns zero counts)", async () => {
    const { createFolder, trashFolder } = await import("./folders");
    const uid = await makeUser("ida");
    const f = await createFolder({ name: "x", parentId: null, createdBy: uid });
    await trashFolder({ id: f.id, actorId: uid, isAdmin: false });
    const second = await trashFolder({ id: f.id, actorId: uid, isAdmin: false });
    expect(second).toEqual({ folders: 0, files: 0 });
  });
});
