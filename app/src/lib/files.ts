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
  created_at: Date;
  deleted_at: Date | null;
};

export type InsertFileArgs = {
  uploaderId: string;
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
       (uploader_id, original_name, mime_type, size_bytes, storage_path,
        thumbnail_path, duration_sec, width, height)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      args.uploaderId, args.originalName, args.mimeType, args.sizeBytes,
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
