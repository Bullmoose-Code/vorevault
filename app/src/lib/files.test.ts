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

async function makeUser(username = "a"): Promise<string> {
  const { rows } = await pg.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ($1, $2) RETURNING id`,
    [username, username],
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

  it("listFiles returns non-deleted files newest first with uploader username", async () => {
    const { insertFile, listFiles } = await import("./files");
    const userId = await makeUser();
    await insertFile({
      uploaderId: userId, originalName: "old.png", mimeType: "image/png",
      sizeBytes: 1, storagePath: "/a",
    });
    await insertFile({
      uploaderId: userId, originalName: "new.mp4", mimeType: "video/mp4",
      sizeBytes: 2, storagePath: "/b",
    });
    const page = await listFiles(1, 10);
    expect(page.files.length).toBe(2);
    expect(page.files[0].original_name).toBe("new.mp4");
    expect(page.files[0].uploader_name).toBe("a");
    expect(page.total).toBe(2);
  });

  it("listFiles excludes soft-deleted files", async () => {
    const { insertFile, softDeleteFile, listFiles } = await import("./files");
    const userId = await makeUser();
    const f = await insertFile({
      uploaderId: userId, originalName: "gone.png", mimeType: "image/png",
      sizeBytes: 1, storagePath: "/c",
    });
    await softDeleteFile(f.id);
    const page = await listFiles(1, 10);
    expect(page.files.length).toBe(0);
    expect(page.total).toBe(0);
  });

  it("listFiles paginates correctly", async () => {
    const { insertFile, listFiles } = await import("./files");
    const userId = await makeUser();
    for (let i = 0; i < 3; i++) {
      await insertFile({
        uploaderId: userId, originalName: `f${i}.png`, mimeType: "image/png",
        sizeBytes: 1, storagePath: `/p${i}`,
      });
    }
    const p1 = await listFiles(1, 2);
    expect(p1.files.length).toBe(2);
    expect(p1.total).toBe(3);
    const p2 = await listFiles(2, 2);
    expect(p2.files.length).toBe(1);
  });

  it("getFileWithUploader returns file + uploader username", async () => {
    const { insertFile, getFileWithUploader } = await import("./files");
    const userId = await makeUser();
    const f = await insertFile({
      uploaderId: userId, originalName: "x.mp4", mimeType: "video/mp4",
      sizeBytes: 1, storagePath: "/d",
    });
    const got = await getFileWithUploader(f.id);
    expect(got?.id).toBe(f.id);
    expect(got?.uploader_name).toBe("a");
  });

  it("getFileWithUploader returns null for deleted files", async () => {
    const { insertFile, softDeleteFile, getFileWithUploader } = await import("./files");
    const userId = await makeUser();
    const f = await insertFile({
      uploaderId: userId, originalName: "x", mimeType: "image/png",
      sizeBytes: 1, storagePath: "/e",
    });
    await softDeleteFile(f.id);
    expect(await getFileWithUploader(f.id)).toBeNull();
  });

  it("getNextPendingTranscode returns oldest pending video file", async () => {
    const { insertFile, getNextPendingTranscode } = await import("./files");
    const userId = await makeUser();
    const f1 = await insertFile({
      uploaderId: userId, originalName: "old.mp4", mimeType: "video/mp4",
      sizeBytes: 1, storagePath: "/a",
    });
    await insertFile({
      uploaderId: userId, originalName: "new.mp4", mimeType: "video/mp4",
      sizeBytes: 1, storagePath: "/b",
    });
    await insertFile({
      uploaderId: userId, originalName: "img.png", mimeType: "image/png",
      sizeBytes: 1, storagePath: "/c",
    });
    const next = await getNextPendingTranscode();
    expect(next?.id).toBe(f1.id);
    expect(next?.original_name).toBe("old.mp4");
  });

  it("getNextPendingTranscode returns null when no pending videos", async () => {
    const { insertFile, getNextPendingTranscode } = await import("./files");
    const userId = await makeUser();
    await insertFile({
      uploaderId: userId, originalName: "img.png", mimeType: "image/png",
      sizeBytes: 1, storagePath: "/c",
    });
    expect(await getNextPendingTranscode()).toBeNull();
  });

  it("updateTranscodeStatus updates status and transcoded_path", async () => {
    const { insertFile, updateTranscodeStatus, getFile } = await import("./files");
    const userId = await makeUser();
    const f = await insertFile({
      uploaderId: userId, originalName: "a.mp4", mimeType: "video/mp4",
      sizeBytes: 1, storagePath: "/a",
    });
    await updateTranscodeStatus(f.id, "done", "/data/transcoded/abc.mp4");
    const updated = await getFile(f.id);
    expect(updated?.transcode_status).toBe("done");
    expect(updated?.transcoded_path).toBe("/data/transcoded/abc.mp4");
  });

  it("updateTranscodeStatus can set skipped with same storage_path", async () => {
    const { insertFile, updateTranscodeStatus, getFile } = await import("./files");
    const userId = await makeUser();
    const f = await insertFile({
      uploaderId: userId, originalName: "a.mp4", mimeType: "video/mp4",
      sizeBytes: 1, storagePath: "/a",
    });
    await updateTranscodeStatus(f.id, "skipped", "/a");
    const updated = await getFile(f.id);
    expect(updated?.transcode_status).toBe("skipped");
    expect(updated?.transcoded_path).toBe("/a");
  });

  it("getExpiredDeletedFiles returns files deleted more than N days ago", async () => {
    const { insertFile, softDeleteFile, getExpiredDeletedFiles } = await import("./files");
    const userId = await makeUser();
    const f = await insertFile({
      uploaderId: userId, originalName: "old.mp4", mimeType: "video/mp4",
      sizeBytes: 1, storagePath: "/old",
    });
    await softDeleteFile(f.id);
    await pg.pool.query(`UPDATE files SET deleted_at = now() - interval '8 days' WHERE id = $1`, [f.id]);
    const expired = await getExpiredDeletedFiles(7);
    expect(expired.length).toBe(1);
    expect(expired[0].id).toBe(f.id);
  });

  it("getExpiredDeletedFiles excludes recently deleted files", async () => {
    const { insertFile, softDeleteFile, getExpiredDeletedFiles } = await import("./files");
    const userId = await makeUser();
    const f = await insertFile({
      uploaderId: userId, originalName: "recent.mp4", mimeType: "video/mp4",
      sizeBytes: 1, storagePath: "/recent",
    });
    await softDeleteFile(f.id);
    const expired = await getExpiredDeletedFiles(7);
    expect(expired.length).toBe(0);
  });

  it("hardDeleteFile removes the row entirely", async () => {
    const { insertFile, hardDeleteFile } = await import("./files");
    const userId = await makeUser();
    const f = await insertFile({
      uploaderId: userId, originalName: "x.png", mimeType: "image/png",
      sizeBytes: 1, storagePath: "/x",
    });
    await hardDeleteFile(f.id);
    const { rows } = await pg.pool.query(`SELECT * FROM files WHERE id = $1`, [f.id]);
    expect(rows.length).toBe(0);
  });
});

describe("listFiles extraOffset", () => {
  it("skips the first extraOffset rows and reduces total by extraOffset", async () => {
    const { insertFile, listFiles } = await import("./files");
    const userId = await makeUser();
    // Insert 10 files with distinct names, oldest first; listFiles returns newest first.
    for (let i = 0; i < 10; i++) {
      await insertFile({
        uploaderId: userId,
        originalName: `f${i}.mp4`,
        mimeType: "video/mp4",
        sizeBytes: 1,
        storagePath: `/x/${i}`,
      });
    }
    const withOffset = await listFiles(1, 24, undefined, 3);
    expect(withOffset.files).toHaveLength(7);
    expect(withOffset.total).toBe(7); // 10 - 3

    // The 3 newest should be skipped — files f9, f8, f7 absent; f6 is now first.
    expect(withOffset.files[0].original_name).toBe("f6.mp4");
  });

  it("total never goes negative when extraOffset exceeds count", async () => {
    const { insertFile, listFiles } = await import("./files");
    const userId = await makeUser();
    await insertFile({
      uploaderId: userId, originalName: "only.mp4", mimeType: "video/mp4",
      sizeBytes: 1, storagePath: "/o",
    });
    const page = await listFiles(1, 24, undefined, 10);
    expect(page.total).toBe(0);
  });

  it("defaults extraOffset to 0 when omitted", async () => {
    const { insertFile, listFiles } = await import("./files");
    const userId = await makeUser();
    for (let i = 0; i < 3; i++) {
      await insertFile({
        uploaderId: userId, originalName: `a${i}`, mimeType: "image/png",
        sizeBytes: 1, storagePath: `/a/${i}`,
      });
    }
    const page = await listFiles(1, 24);
    expect(page.total).toBe(3);
    expect(page.files).toHaveLength(3);
  });
});

describe("listRecentFiles", () => {
  it("returns up to N most-recent non-deleted files with uploader_name", async () => {
    const { insertFile, listRecentFiles } = await import("./files");
    const userId = await makeUser("bob");
    for (let i = 0; i < 8; i++) {
      await insertFile({
        uploaderId: userId, originalName: `r${i}`, mimeType: "image/png",
        sizeBytes: 1, storagePath: `/r/${i}`,
      });
    }
    const rows = await listRecentFiles(6);
    expect(rows).toHaveLength(6);
    expect(rows[0].original_name).toBe("r7"); // newest first
    expect(rows[0].uploader_name).toBe("bob");
  });

  it("excludes soft-deleted files", async () => {
    const { insertFile, softDeleteFile, listRecentFiles } = await import("./files");
    const userId = await makeUser();
    const a = await insertFile({
      uploaderId: userId, originalName: "keep", mimeType: "image/png",
      sizeBytes: 1, storagePath: "/k",
    });
    const b = await insertFile({
      uploaderId: userId, originalName: "gone", mimeType: "image/png",
      sizeBytes: 1, storagePath: "/g",
    });
    await softDeleteFile(b.id);
    const rows = await listRecentFiles(10);
    expect(rows.map((r) => r.id)).toEqual([a.id]);
  });
});

describe("moveFile", () => {
  it("uploader moves their own file to a folder", async () => {
    const { moveFile } = await import("./files");
    const userId = await makeUser();
    const { rows: folderRows } = await pg.pool.query<{ id: string }>(
      `INSERT INTO folders (name, parent_id, created_by) VALUES ('Clips', NULL, $1) RETURNING id`,
      [userId],
    );
    const { rows: fileRows } = await pg.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path, transcode_status)
       VALUES ($1, 'x.mp4', 'video/mp4', 1, 'uploads/x/x.mp4', 'skipped') RETURNING id`,
      [userId],
    );
    const updated = await moveFile({ fileId: fileRows[0].id, actorId: userId, isAdmin: false, folderId: folderRows[0].id });
    expect(updated.folder_id).toBe(folderRows[0].id);
  });

  it("non-uploader non-admin is rejected", async () => {
    const { moveFile, FileAuthError } = await import("./files");
    const owner = await makeUser("owner");
    const stranger = await makeUser("stranger");
    const { rows: fileRows } = await pg.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path, transcode_status)
       VALUES ($1, 'x.mp4', 'video/mp4', 1, 'uploads/x/x.mp4', 'skipped') RETURNING id`,
      [owner],
    );
    await expect(
      moveFile({ fileId: fileRows[0].id, actorId: stranger, isAdmin: false, folderId: null }),
    ).rejects.toBeInstanceOf(FileAuthError);
  });

  it("rejects moving a soft-deleted file", async () => {
    const { moveFile, FileDeletedError } = await import("./files");
    const userId = await makeUser();
    const { rows: fileRows } = await pg.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path, transcode_status, deleted_at)
       VALUES ($1, 'x.mp4', 'video/mp4', 1, 'uploads/x/x.mp4', 'skipped', now()) RETURNING id`,
      [userId],
    );
    await expect(
      moveFile({ fileId: fileRows[0].id, actorId: userId, isAdmin: false, folderId: null }),
    ).rejects.toBeInstanceOf(FileDeletedError);
  });

  it("rejects when target folder doesn't exist", async () => {
    const { moveFile, FileFolderNotFoundError } = await import("./files");
    const userId = await makeUser();
    const { rows: fileRows } = await pg.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path, transcode_status)
       VALUES ($1, 'x.mp4', 'video/mp4', 1, 'uploads/x/x.mp4', 'skipped') RETURNING id`,
      [userId],
    );
    await expect(
      moveFile({ fileId: fileRows[0].id, actorId: userId, isAdmin: false, folderId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toBeInstanceOf(FileFolderNotFoundError);
  });
});

describe("trashFile", () => {
  it("sets deleted_at and revokes share links", async () => {
    const { insertFile, trashFile } = await import("./files");
    const { createShareLink } = await import("./share-links");
    const uid = await makeUser("qwe");
    const f = await insertFile({ uploaderId: uid, originalName: "a", mimeType: "image/png", sizeBytes: 1, storagePath: "/a" });
    await createShareLink(f.id, uid);
    await trashFile({ fileId: f.id, actorId: uid, isAdmin: false });
    const { rows } = await pg.pool.query<{ deleted_at: string | null }>(`SELECT deleted_at FROM files WHERE id = $1`, [f.id]);
    expect(rows[0].deleted_at).not.toBeNull();
    const { rows: shares } = await pg.pool.query<{ revoked_at: string | null }>(`SELECT revoked_at FROM share_links WHERE file_id = $1`, [f.id]);
    expect(shares.every((s) => s.revoked_at !== null)).toBe(true);
  });

  it("rejects a non-owner non-admin actor", async () => {
    const { insertFile, trashFile, FileAuthError } = await import("./files");
    const owner = await makeUser("r_owner");
    const other = await makeUser("r_other");
    const f = await insertFile({ uploaderId: owner, originalName: "a", mimeType: "image/png", sizeBytes: 1, storagePath: "/a" });
    await expect(trashFile({ fileId: f.id, actorId: other, isAdmin: false })).rejects.toBeInstanceOf(FileAuthError);
  });
});

describe("restoreFile", () => {
  it("restores ancestor folders trashed at the same timestamp", async () => {
    const { insertFile, trashFile, restoreFile } = await import("./files");
    const { createFolder, trashFolder } = await import("./folders");
    const uid = await makeUser("stu");
    const folder = await createFolder({ name: "x", parentId: null, createdBy: uid });
    const f = await insertFile({ uploaderId: uid, folderId: folder.id, originalName: "a", mimeType: "image/png", sizeBytes: 1, storagePath: "/a" });
    // Trash the folder: cascades file's deleted_at to the same ts.
    await trashFolder({ id: folder.id, actorId: uid, isAdmin: false });
    await restoreFile({ fileId: f.id, actorId: uid });
    const { rows } = await pg.pool.query<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM folders WHERE id = $1 UNION ALL SELECT deleted_at FROM files WHERE id = $2`,
      [folder.id, f.id],
    );
    expect(rows.every((r) => r.deleted_at === null)).toBe(true);
  });
});

describe("permanentDeleteFile", () => {
  it("refuses if file is not trashed", async () => {
    const { insertFile, permanentDeleteFile, FileNotTrashedError } = await import("./files");
    const uid = await makeUser("tim");
    const f = await insertFile({ uploaderId: uid, originalName: "x", mimeType: "image/png", sizeBytes: 1, storagePath: "/x" });
    await expect(permanentDeleteFile({ fileId: f.id, actorId: uid, isAdmin: false })).rejects.toBeInstanceOf(FileNotTrashedError);
  });

  it("hard-deletes a trashed file row", async () => {
    const { insertFile, trashFile, permanentDeleteFile } = await import("./files");
    const uid = await makeUser("uma");
    const f = await insertFile({ uploaderId: uid, originalName: "x", mimeType: "image/png", sizeBytes: 1, storagePath: "/x" });
    await trashFile({ fileId: f.id, actorId: uid, isAdmin: false });
    await permanentDeleteFile({ fileId: f.id, actorId: uid, isAdmin: false });
    const { rowCount } = await pg.pool.query(`SELECT 1 FROM files WHERE id = $1`, [f.id]);
    expect(rowCount).toBe(0);
  });
});
