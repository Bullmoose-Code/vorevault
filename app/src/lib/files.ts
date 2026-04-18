import { pool } from "@/lib/db";

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
};

export async function insertFile(args: InsertFileArgs): Promise<FileRow> {
  const { rows } = await pool.query<FileRow>(
    `INSERT INTO files
       (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path,
        thumbnail_path, duration_sec, width, height)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      args.uploaderId, args.folderId ?? null, args.originalName, args.mimeType, args.sizeBytes,
      args.storagePath, args.thumbnailPath ?? null, args.durationSec ?? null,
      args.width ?? null, args.height ?? null,
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
): Promise<FilePage> {
  const offset = (page - 1) * limit;
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
    total: parseInt(countRes.rows[0].count, 10),
    page,
    limit,
  };
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
