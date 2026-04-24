import { pool } from "@/lib/db";
import { revokeAllForFile } from "@/lib/share-links";
import type { PoolClient } from "pg";

export type FileRow = {
  id: string;
  uploader_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  transcoded_path: string | null;
  thumbnail_path: string | null;
  transcode_status: "pending" | "skipped" | "done" | "failed";
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  folder_id: string | null;
  upload_batch_id: string | null;
  created_at: Date;
  deleted_at: Date | null;
};

export type InsertFileArgs = {
  uploaderId: string;
  folderId?: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  thumbnailPath?: string | null;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  uploadBatchId?: string | null;
};

export async function insertFile(args: InsertFileArgs): Promise<FileRow> {
  const { rows } = await pool.query<FileRow>(
    `INSERT INTO files
       (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path,
        thumbnail_path, duration_sec, width, height, upload_batch_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      args.uploaderId, args.folderId ?? null, args.originalName, args.mimeType, args.sizeBytes,
      args.storagePath, args.thumbnailPath ?? null, args.durationSec ?? null,
      args.width ?? null, args.height ?? null, args.uploadBatchId ?? null,
    ],
  );
  return rows[0];
}

export async function getFile(id: string): Promise<FileRow | null> {
  const { rows } = await pool.query<FileRow>(
    `SELECT * FROM files WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function softDeleteFile(id: string): Promise<void> {
  await pool.query(`UPDATE files SET deleted_at = now() WHERE id = $1`, [id]);
}

export async function getNextPendingTranscode(): Promise<FileRow | null> {
  const { rows } = await pool.query<FileRow>(
    `SELECT * FROM files
     WHERE transcode_status = 'pending'
       AND mime_type LIKE 'video/%'
       AND deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function updateTranscodeStatus(
  id: string,
  status: FileRow["transcode_status"],
  transcodedPath: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE files SET transcode_status = $1, transcoded_path = $2 WHERE id = $3`,
    [status, transcodedPath, id],
  );
}

export type FileWithUploader = FileRow & { uploader_name: string };

export type FilePage = {
  files: FileWithUploader[];
  total: number;
  page: number;
  limit: number;
};

export async function listFiles(
  page: number,
  limit: number,
  uploaderId?: string,
  extraOffset: number = 0,
): Promise<FilePage> {
  const offset = (page - 1) * limit + extraOffset;
  const [dataRes, countRes] = await Promise.all([
    uploaderId
      ? pool.query<FileWithUploader>(
          `SELECT f.*, u.username AS uploader_name
           FROM files f JOIN users u ON u.id = f.uploader_id
           WHERE f.deleted_at IS NULL AND f.uploader_id = $3
           ORDER BY f.created_at DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset, uploaderId],
        )
      : pool.query<FileWithUploader>(
          `SELECT f.*, u.username AS uploader_name
           FROM files f JOIN users u ON u.id = f.uploader_id
           WHERE f.deleted_at IS NULL
           ORDER BY f.created_at DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset],
        ),
    uploaderId
      ? pool.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM files WHERE deleted_at IS NULL AND uploader_id = $1`,
          [uploaderId],
        )
      : pool.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM files WHERE deleted_at IS NULL`,
        ),
  ]);
  return {
    files: dataRes.rows,
    total: Math.max(0, parseInt(countRes.rows[0].count, 10) - extraOffset),
    page,
    limit,
  };
}

export async function listRecentFiles(limit: number): Promise<FileWithUploader[]> {
  const { rows } = await pool.query<FileWithUploader>(
    `SELECT f.*, u.username AS uploader_name
     FROM files f JOIN users u ON u.id = f.uploader_id
     WHERE f.deleted_at IS NULL
     ORDER BY f.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function getFileWithUploader(id: string): Promise<FileWithUploader | null> {
  const { rows } = await pool.query<FileWithUploader>(
    `SELECT f.*, u.username AS uploader_name
     FROM files f JOIN users u ON u.id = f.uploader_id
     WHERE f.id = $1 AND f.deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getExpiredDeletedFiles(daysOld: number): Promise<FileRow[]> {
  const { rows } = await pool.query<FileRow>(
    `SELECT * FROM files
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - ($1 || ' days')::interval`,
    [daysOld],
  );
  return rows;
}

export async function hardDeleteFile(id: string): Promise<void> {
  await pool.query(`DELETE FROM files WHERE id = $1`, [id]);
}

export class FileAuthError extends Error {
  constructor() { super("not authorized"); this.name = "FileAuthError"; }
}
export class FileDeletedError extends Error {
  constructor() { super("file is deleted"); this.name = "FileDeletedError"; }
}
export class FileNotFoundError extends Error {
  constructor() { super("file not found"); this.name = "FileNotFoundError"; }
}
export class FileFolderNotFoundError extends Error {
  constructor() { super("target folder not found"); this.name = "FileFolderNotFoundError"; }
}
export class FileNameError extends Error {
  constructor(message: string) { super(message); this.name = "FileNameError"; }
}

export type RenameFileArgs = {
  fileId: string;
  actorId: string;
  isAdmin: boolean;
  newName: string;
};

export async function renameFile(args: RenameFileArgs): Promise<FileRow> {
  const trimmed = args.newName.trim();
  if (trimmed.length < 1 || trimmed.length > 255) {
    throw new FileNameError("name must be 1-255 characters");
  }
  if (/[\/\\]/.test(trimmed) || trimmed === "." || trimmed === "..") {
    throw new FileNameError("name cannot contain path separators");
  }

  const { rows } = await pool.query<FileRow>(`SELECT * FROM files WHERE id = $1`, [args.fileId]);
  if (rows.length === 0) throw new FileNotFoundError();
  const file = rows[0];
  if (!args.isAdmin && file.uploader_id !== args.actorId) throw new FileAuthError();
  if (file.deleted_at) throw new FileDeletedError();

  const { rows: updated } = await pool.query<FileRow>(
    `UPDATE files SET original_name = $1 WHERE id = $2 RETURNING *`,
    [trimmed, args.fileId],
  );
  return updated[0];
}

export type MoveFileArgs = {
  fileId: string;
  actorId: string;
  isAdmin: boolean;
  folderId: string | null;
};

export async function moveFile(args: MoveFileArgs): Promise<FileRow> {
  const { rows } = await pool.query<FileRow>(`SELECT * FROM files WHERE id = $1`, [args.fileId]);
  if (rows.length === 0) throw new FileNotFoundError();
  const file = rows[0];
  if (!args.isAdmin && file.uploader_id !== args.actorId) throw new FileAuthError();
  if (file.deleted_at) throw new FileDeletedError();

  if (args.folderId) {
    const exists = await pool.query(`SELECT 1 FROM folders WHERE id = $1`, [args.folderId]);
    if (exists.rowCount === 0) throw new FileFolderNotFoundError();
  }

  const { rows: updated } = await pool.query<FileRow>(
    `UPDATE files SET folder_id = $1 WHERE id = $2 RETURNING *`,
    [args.folderId, args.fileId],
  );
  return updated[0];
}

export class FileNotTrashedError extends Error {
  constructor() { super("file is not trashed"); this.name = "FileNotTrashedError"; }
}

export type TrashFileArgs = { fileId: string; actorId: string; isAdmin: boolean };

export async function trashFile(args: TrashFileArgs): Promise<void> {
  const file = await pool.query<FileRow>(`SELECT * FROM files WHERE id = $1`, [args.fileId]);
  if (file.rowCount === 0) throw new FileNotFoundError();
  const row = file.rows[0];
  if (row.deleted_at) return;
  if (!args.isAdmin && row.uploader_id !== args.actorId) throw new FileAuthError();
  await revokeAllForFile(args.fileId);
  await pool.query(`UPDATE files SET deleted_at = now() WHERE id = $1`, [args.fileId]);
}

export type RestoreFileArgs = { fileId: string; actorId: string };

export async function restoreFile(args: RestoreFileArgs): Promise<void> {
  const { rows } = await pool.query<FileRow>(`SELECT * FROM files WHERE id = $1`, [args.fileId]);
  if (rows.length === 0) throw new FileNotFoundError();
  const file = rows[0];
  if (!file.deleted_at) return;

  // Single statement: the target timestamp stays server-side so Postgres's
  // microsecond precision isn't truncated by a JS Date round-trip.
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    if (file.folder_id) {
      await client.query(
        `WITH RECURSIVE
           target AS (SELECT deleted_at AS ts FROM files WHERE id = $1),
           chain(id, parent_id, deleted_at) AS (
             SELECT id, parent_id, deleted_at FROM folders WHERE id = $2
             UNION ALL
             SELECT f.id, f.parent_id, f.deleted_at
               FROM folders f JOIN chain c ON f.id = c.parent_id
           )
         UPDATE folders SET deleted_at = NULL
           WHERE id IN (SELECT id FROM chain WHERE deleted_at = (SELECT ts FROM target))
             AND deleted_at = (SELECT ts FROM target)`,
        [args.fileId, file.folder_id],
      );
    }

    await client.query(`UPDATE files SET deleted_at = NULL WHERE id = $1`, [args.fileId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type PermanentDeleteFileArgs = { fileId: string; actorId: string; isAdmin: boolean };

export async function permanentDeleteFile(args: PermanentDeleteFileArgs): Promise<FileRow> {
  const { rows } = await pool.query<FileRow>(`SELECT * FROM files WHERE id = $1`, [args.fileId]);
  if (rows.length === 0) throw new FileNotFoundError();
  const file = rows[0];
  if (!file.deleted_at) throw new FileNotTrashedError();
  if (!args.isAdmin && file.uploader_id !== args.actorId) throw new FileAuthError();
  await pool.query(`DELETE FROM files WHERE id = $1`, [args.fileId]);
  return file;
}

// ---------------------------------------------------------------------------
// Top-level mixed listing (top-level folders + root-level files, interleaved
// by created_at). Home strip, home grid, and /recent all render this shape so
// a folder upload appears as a single tile instead of flattening its contents.
// ---------------------------------------------------------------------------

export type TopLevelFolderItem = {
  kind: "folder";
  id: string;
  name: string;
  parent_id: null;
  created_by: string;
  created_at: Date;
  direct_file_count: number;
  direct_subfolder_count: number;
};

export type TopLevelFileItem = FileWithUploader & { kind: "file"; tags: string[] };
export type TopLevelItem = TopLevelFolderItem | TopLevelFileItem;

export type TopLevelPage = {
  items: TopLevelItem[];
  total: number;
  page: number;
  limit: number;
};

export type TopLevelOptions = {
  extraOffset?: number;
  tagId?: string;
};

export async function listTopLevelItems(
  page: number,
  limit: number,
  opts: TopLevelOptions = {},
): Promise<TopLevelPage> {
  const extraOffset = opts.extraOffset ?? 0;
  const tagId = opts.tagId;
  const offset = (page - 1) * limit + extraOffset;

  const hasTagFilter = !!tagId;
  const params: unknown[] = [];
  const tagParamIdx = (() => {
    if (!hasTagFilter) return null;
    params.push(tagId);
    return params.length;
  })();

  // Branch A (batch) — one row per batch with a live top folder.
  const branchBatch = `
    SELECT
      'folder'::text AS kind,
      f.id::text AS id,
      f.name AS name,
      NULL::text AS original_name,
      NULL::text AS mime_type,
      NULL::text AS thumbnail_path,
      NULL::text AS uploader_name,
      f.created_by::text AS created_by,
      b.created_at AS created_at,
      (SELECT count(*)::int FROM files x WHERE x.folder_id = f.id AND x.deleted_at IS NULL) AS direct_file_count,
      (SELECT count(*)::int FROM folders s WHERE s.parent_id = f.id AND s.deleted_at IS NULL) AS direct_subfolder_count,
      NULL::bigint AS size_bytes,
      NULL::text AS storage_path,
      NULL::text AS transcode_status,
      NULL::text AS transcoded_path,
      NULL::int AS duration_sec,
      NULL::int AS width,
      NULL::int AS height,
      '{}'::text[] AS tags
    FROM upload_batches b
    JOIN folders f ON f.id = b.top_folder_id
    WHERE f.deleted_at IS NULL
  `;

  // Branch A-legacy — top-level folders without a batch.
  const branchLegacyFolder = `
    SELECT
      'folder'::text, f.id::text, f.name,
      NULL::text, NULL::text, NULL::text, NULL::text,
      f.created_by::text, f.created_at,
      (SELECT count(*)::int FROM files x WHERE x.folder_id = f.id AND x.deleted_at IS NULL),
      (SELECT count(*)::int FROM folders s WHERE s.parent_id = f.id AND s.deleted_at IS NULL),
      NULL::bigint, NULL::text, NULL::text, NULL::text,
      NULL::int, NULL::int, NULL::int,
      '{}'::text[]
    FROM folders f
    WHERE f.parent_id IS NULL
      AND f.deleted_at IS NULL
      AND f.upload_batch_id IS NULL
  `;

  // Branch B — loose files (not part of a folder upload).
  // tags literal is '{}'::text[] for now; Task 6 will replace with real join.
  const branchFile = `
    SELECT
      'file'::text, ff.id::text, NULL::text,
      ff.original_name, ff.mime_type, ff.thumbnail_path,
      u.username, ff.uploader_id::text, ff.created_at,
      NULL::int, NULL::int,
      ff.size_bytes, ff.storage_path, ff.transcode_status, ff.transcoded_path,
      ff.duration_sec, ff.width, ff.height,
      '{}'::text[] AS tags
    FROM files ff
    JOIN users u ON u.id = ff.uploader_id
    WHERE ff.deleted_at IS NULL
      AND ff.upload_batch_id IS NULL
      ${hasTagFilter
        ? `AND EXISTS (SELECT 1 FROM file_tags ft2 WHERE ft2.file_id = ff.id AND ft2.tag_id = $${tagParamIdx})`
        : ""}
  `;

  const unionSql = hasTagFilter
    ? branchFile
    : `${branchBatch} UNION ALL ${branchLegacyFolder} UNION ALL ${branchFile}`;

  params.push(limit, offset);
  const dataSql = `
    SELECT * FROM (${unionSql}) t
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const countParams: unknown[] = [];
  if (hasTagFilter) countParams.push(tagId);
  const countSql = hasTagFilter
    ? `SELECT (SELECT count(*)::int FROM files ff
                WHERE ff.deleted_at IS NULL
                  AND ff.upload_batch_id IS NULL
                  AND EXISTS (SELECT 1 FROM file_tags ft WHERE ft.file_id = ff.id AND ft.tag_id = $1)
              ) AS total`
    : `SELECT
         (SELECT count(*)::int FROM upload_batches b
            JOIN folders f ON f.id = b.top_folder_id
            WHERE f.deleted_at IS NULL)
         + (SELECT count(*)::int FROM folders
              WHERE parent_id IS NULL AND deleted_at IS NULL AND upload_batch_id IS NULL)
         + (SELECT count(*)::int FROM files
              WHERE deleted_at IS NULL AND upload_batch_id IS NULL)
         AS total`;

  const [dataRes, countRes] = await Promise.all([
    pool.query(dataSql, params),
    pool.query<{ total: number }>(countSql, countParams),
  ]);

  return {
    items: dataRes.rows.map(mapTopLevelRow),
    total: Math.max(0, countRes.rows[0].total - extraOffset),
    page,
    limit,
  };
}

function mapTopLevelRow(r: Record<string, unknown>): TopLevelItem {
  if (r.kind === "folder") {
    return {
      kind: "folder",
      id: r.id as string,
      name: r.name as string,
      parent_id: null,
      created_by: r.created_by as string,
      created_at: r.created_at as Date,
      direct_file_count: (r.direct_file_count as number) ?? 0,
      direct_subfolder_count: (r.direct_subfolder_count as number) ?? 0,
    };
  }
  return {
    kind: "file",
    id: r.id as string,
    uploader_id: r.created_by as string,
    uploader_name: r.uploader_name as string,
    original_name: r.original_name as string,
    mime_type: r.mime_type as string,
    size_bytes: Number(r.size_bytes),
    storage_path: r.storage_path as string,
    thumbnail_path: (r.thumbnail_path as string) ?? null,
    transcoded_path: (r.transcoded_path as string) ?? null,
    transcode_status: (r.transcode_status as FileRow["transcode_status"]) ?? "pending",
    duration_sec: (r.duration_sec as number) ?? null,
    width: (r.width as number) ?? null,
    height: (r.height as number) ?? null,
    folder_id: null,
    upload_batch_id: (r.upload_batch_id as string) ?? null,
    created_at: r.created_at as Date,
    deleted_at: null,
    tags: (r.tags as string[]) ?? [],
  };
}

export async function listRecentTopLevelItems(limit: number): Promise<TopLevelItem[]> {
  const page = await listTopLevelItems(1, limit, {});
  return page.items;
}

