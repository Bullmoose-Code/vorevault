import { pool } from "@/lib/db";
import type { FileRow } from "@/lib/files";

export type BookmarkListItem = { file: FileRow; created_at: Date };

export async function addBookmark(userId: string, fileId: string): Promise<{ created: boolean }> {
  const { rowCount } = await pool.query(
    `INSERT INTO bookmarks (user_id, file_id) VALUES ($1, $2)
     ON CONFLICT (user_id, file_id) DO NOTHING`,
    [userId, fileId],
  );
  return { created: (rowCount ?? 0) > 0 };
}

export async function removeBookmark(userId: string, fileId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM bookmarks WHERE user_id = $1 AND file_id = $2`,
    [userId, fileId],
  );
  return (rowCount ?? 0) > 0;
}

export async function isBookmarked(userId: string, fileId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM bookmarks WHERE user_id = $1 AND file_id = $2`,
    [userId, fileId],
  );
  return (rowCount ?? 0) > 0;
}

export async function listBookmarks(
  userId: string, limit: number, offset: number,
): Promise<{ items: BookmarkListItem[]; total: number }> {
  const { rows: items } = await pool.query<FileRow & { bm_created_at: Date }>(
    `SELECT f.*, b.created_at AS bm_created_at
       FROM bookmarks b
       JOIN files f ON f.id = b.file_id
      WHERE b.user_id = $1 AND f.deleted_at IS NULL
      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  const { rows: totalRows } = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c
       FROM bookmarks b JOIN files f ON f.id = b.file_id
      WHERE b.user_id = $1 AND f.deleted_at IS NULL`,
    [userId],
  );
  return {
    items: items.map(({ bm_created_at, ...file }) => ({ file: file as FileRow, created_at: bm_created_at })),
    total: Number(totalRows[0].c),
  };
}
