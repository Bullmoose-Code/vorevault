import { pool } from "@/lib/db";
import type { PoolClient } from "pg";
import type { FileRow, FileWithUploader } from "@/lib/files";

export type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  created_by: string;
  created_at: Date;
  deleted_at: Date | null;
};

export class FolderNameError extends Error {
  constructor(message: string) { super(message); this.name = "FolderNameError"; }
}
export class FolderCollisionError extends Error {
  existingId: string;
  constructor(existingId: string) {
    super(`A folder with this name already exists here`);
    this.name = "FolderCollisionError";
    this.existingId = existingId;
  }
}
export class FolderNotFoundError extends Error {
  constructor(what: string) { super(`${what} not found`); this.name = "FolderNotFoundError"; }
}

function validateName(name: string): void {
  if (typeof name !== "string" || name.length < 1 || name.length > 64) {
    throw new FolderNameError("folder name must be 1-64 characters");
  }
}

export type CreateFolderArgs = {
  name: string;
  parentId: string | null;
  createdBy: string;
};

export async function createFolder(args: CreateFolderArgs): Promise<FolderRow> {
  validateName(args.name);

  if (args.parentId) {
    const parent = await pool.query<{ id: string }>(
      `SELECT id FROM folders WHERE id = $1 AND deleted_at IS NULL`,
      [args.parentId],
    );
    if (parent.rowCount === 0) throw new FolderNotFoundError("parent folder");
  }

  try {
    const { rows } = await pool.query<FolderRow>(
      `INSERT INTO folders (name, parent_id, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [args.name, args.parentId, args.createdBy],
    );
    return rows[0];
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM folders
          WHERE COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
                = COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
            AND LOWER(name) = LOWER($2)
            AND deleted_at IS NULL`,
        [args.parentId, args.name],
      );
      throw new FolderCollisionError(existing.rows[0].id);
    }
    throw err;
  }
}

export class FolderAuthError extends Error {
  constructor() { super("not authorized"); this.name = "FolderAuthError"; }
}
export class FolderCycleError extends Error {
  constructor() { super("cannot move folder into its own descendant"); this.name = "FolderCycleError"; }
}

async function assertCanEdit(folderId: string, actorId: string, isAdmin: boolean): Promise<FolderRow> {
  const { rows } = await pool.query<FolderRow>(`SELECT * FROM folders WHERE id = $1 AND deleted_at IS NULL`, [folderId]);
  if (rows.length === 0) throw new FolderNotFoundError("folder");
  if (!isAdmin && rows[0].created_by !== actorId) throw new FolderAuthError();
  return rows[0];
}

export type RenameFolderArgs = { id: string; newName: string; actorId: string; isAdmin: boolean };

export async function renameFolder(args: RenameFolderArgs): Promise<FolderRow> {
  validateName(args.newName);
  const current = await assertCanEdit(args.id, args.actorId, args.isAdmin);
  try {
    const { rows } = await pool.query<FolderRow>(
      `UPDATE folders SET name = $1 WHERE id = $2 RETURNING *`,
      [args.newName, args.id],
    );
    return rows[0];
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM folders
          WHERE COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
                = COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
            AND LOWER(name) = LOWER($2)
            AND id <> $3
            AND deleted_at IS NULL`,
        [current.parent_id, args.newName, args.id],
      );
      throw new FolderCollisionError(existing.rows[0].id);
    }
    throw err;
  }
}

export type MoveFolderArgs = { id: string; newParentId: string | null; actorId: string; isAdmin: boolean };

async function isDescendant(ancestorId: string, maybeDescendantId: string): Promise<boolean> {
  const { rows } = await pool.query<{ ancestor: string | null }>(
    `WITH RECURSIVE chain AS (
       SELECT id, parent_id FROM folders WHERE id = $1
       UNION ALL
       SELECT f.id, f.parent_id FROM folders f JOIN chain c ON f.id = c.parent_id
     )
     SELECT id AS ancestor FROM chain WHERE id = $2 LIMIT 1`,
    [maybeDescendantId, ancestorId],
  );
  return rows.length > 0;
}

export async function moveFolder(args: MoveFolderArgs): Promise<FolderRow> {
  const current = await assertCanEdit(args.id, args.actorId, args.isAdmin);

  if (args.newParentId === args.id) throw new FolderCycleError();
  if (args.newParentId !== null) {
    const parentExists = await pool.query(`SELECT 1 FROM folders WHERE id = $1 AND deleted_at IS NULL`, [args.newParentId]);
    if (parentExists.rowCount === 0) throw new FolderNotFoundError("new parent");
    if (await isDescendant(args.id, args.newParentId)) throw new FolderCycleError();
  }

  try {
    const { rows } = await pool.query<FolderRow>(
      `UPDATE folders SET parent_id = $1 WHERE id = $2 RETURNING *`,
      [args.newParentId, args.id],
    );
    return rows[0];
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM folders
          WHERE COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
                = COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
            AND LOWER(name) = LOWER($2)
            AND id <> $3
            AND deleted_at IS NULL`,
        [args.newParentId, current.name, args.id],
      );
      throw new FolderCollisionError(existing.rows[0].id);
    }
    throw err;
  }
}

export type DeleteFolderArgs = { id: string; actorId: string; isAdmin: boolean };

export async function deleteFolder(args: DeleteFolderArgs): Promise<void> {
  const current = await assertCanEdit(args.id, args.actorId, args.isAdmin);

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE folders SET parent_id = $1 WHERE parent_id = $2`,
      [current.parent_id, args.id],
    );
    await client.query(
      `UPDATE files SET folder_id = $1 WHERE folder_id = $2`,
      [current.parent_id, args.id],
    );
    await client.query(`DELETE FROM folders WHERE id = $1`, [args.id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type FolderWithCounts = FolderRow & {
  direct_file_count: number;
  direct_subfolder_count: number;
};

export async function listTopLevelFolders(): Promise<FolderWithCounts[]> {
  const { rows } = await pool.query<FolderWithCounts>(
    `SELECT f.*,
            (SELECT count(*)::int FROM files c WHERE c.folder_id = f.id AND c.deleted_at IS NULL) AS direct_file_count,
            (SELECT count(*)::int FROM folders c WHERE c.parent_id = f.id AND c.deleted_at IS NULL) AS direct_subfolder_count
       FROM folders f
      WHERE f.parent_id IS NULL
        AND f.deleted_at IS NULL
      ORDER BY LOWER(f.name)`,
  );
  return rows;
}

export async function listChildren(folderId: string): Promise<{ subfolders: FolderWithCounts[]; files: FileRow[] }> {
  const { rows: subfolders } = await pool.query<FolderWithCounts>(
    `SELECT f.*,
            (SELECT count(*)::int FROM files c WHERE c.folder_id = f.id AND c.deleted_at IS NULL) AS direct_file_count,
            (SELECT count(*)::int FROM folders c WHERE c.parent_id = f.id AND c.deleted_at IS NULL) AS direct_subfolder_count
       FROM folders f
      WHERE f.parent_id = $1
        AND f.deleted_at IS NULL
      ORDER BY LOWER(f.name)`,
    [folderId],
  );
  const { rows: files } = await pool.query<FileRow>(
    `SELECT * FROM files
      WHERE folder_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC`,
    [folderId],
  );
  return { subfolders, files };
}

export async function getBreadcrumbs(folderId: string): Promise<FolderRow[]> {
  const { rows } = await pool.query<FolderRow & { depth: number }>(
    `WITH RECURSIVE chain AS (
       SELECT *, 0 AS depth FROM folders WHERE id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT f.*, c.depth + 1 FROM folders f JOIN chain c ON f.id = c.parent_id WHERE f.deleted_at IS NULL
     )
     SELECT * FROM chain ORDER BY depth DESC`,
    [folderId],
  );
  return rows.map(({ depth: _depth, ...rest }) => rest);
}

export async function getFolder(id: string): Promise<FolderRow | null> {
  const { rows } = await pool.query<FolderRow>(`SELECT * FROM folders WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return rows[0] ?? null;
}

export async function folderExists(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM folders WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return (rowCount ?? 0) > 0;
}

/**
 * Returns the id of the user's top-level "home" folder (named after their username),
 * creating it lazily on first call. Returns null if a foreign folder with the same
 * name already occupies that slot — caller should fall back to root in that case.
 */
export async function getOrCreateUserHomeFolder(
  userId: string,
  username: string,
): Promise<string | null> {
  const existing = await pool.query<{ id: string; created_by: string }>(
    `SELECT id, created_by FROM folders
      WHERE parent_id IS NULL AND LOWER(name) = LOWER($1) AND deleted_at IS NULL`,
    [username],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    return existing.rows[0].created_by === userId ? existing.rows[0].id : null;
  }
  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO folders (name, parent_id, created_by)
       VALUES ($1, NULL, $2) RETURNING id`,
      [username, userId],
    );
    return rows[0].id;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      const retry = await pool.query<{ id: string; created_by: string }>(
        `SELECT id, created_by FROM folders
          WHERE parent_id IS NULL AND LOWER(name) = LOWER($1) AND deleted_at IS NULL`,
        [username],
      );
      if (retry.rowCount && retry.rowCount > 0 && retry.rows[0].created_by === userId) {
        return retry.rows[0].id;
      }
      return null;
    }
    throw err;
  }
}

export type FolderWithCreator = FolderRow & { creator_username: string };

export async function getFolderWithCreator(id: string): Promise<FolderWithCreator | null> {
  const { rows } = await pool.query<FolderWithCreator>(
    `SELECT f.*, u.username AS creator_username
       FROM folders f JOIN users u ON u.id = f.created_by
      WHERE f.id = $1 AND f.deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listChildrenWithUploader(folderId: string): Promise<{
  subfolders: FolderWithCounts[];
  files: FileWithUploader[];
}> {
  const { rows: subfolders } = await pool.query<FolderWithCounts>(
    `SELECT f.*,
            (SELECT count(*)::int FROM files c WHERE c.folder_id = f.id AND c.deleted_at IS NULL) AS direct_file_count,
            (SELECT count(*)::int FROM folders c WHERE c.parent_id = f.id AND c.deleted_at IS NULL) AS direct_subfolder_count
       FROM folders f
      WHERE f.parent_id = $1
        AND f.deleted_at IS NULL
      ORDER BY LOWER(f.name)`,
    [folderId],
  );
  const { rows: files } = await pool.query<FileWithUploader>(
    `SELECT f.*, u.username AS uploader_name
       FROM files f JOIN users u ON u.id = f.uploader_id
      WHERE f.folder_id = $1 AND f.deleted_at IS NULL
      ORDER BY f.created_at DESC`,
    [folderId],
  );
  return { subfolders, files };
}

export async function getFolderIncludingTrashed(id: string): Promise<FolderRow | null> {
  const { rows } = await pool.query<FolderRow>(`SELECT * FROM folders WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export type RestoreFolderArgs = { id: string; actorId: string };
export type RestoreFolderResult = { folders: number; files: number };

export async function restoreFolder(args: RestoreFolderArgs): Promise<RestoreFolderResult> {
  const folder = await getFolderIncludingTrashed(args.id);
  if (!folder) throw new FolderNotFoundError("folder");
  if (!folder.deleted_at) return { folders: 0, files: 0 };
  // Restore is permitted for any signed-in user per spec.

  // Do everything in a single statement so the cascade-group timestamp never
  // round-trips through a JS Date (which truncates Postgres's microsecond
  // precision, causing the = comparison to miss every row).
  try {
    const { rows } = await pool.query<{ folder_count: number; file_count: number }>(
      `WITH RECURSIVE
         target AS (SELECT deleted_at AS ts FROM folders WHERE id = $1),
         tree(id) AS (
           SELECT id FROM folders WHERE id = $1
           UNION ALL
           SELECT f.id FROM folders f JOIN tree t ON f.parent_id = t.id
         ),
         chain(id, parent_id, deleted_at) AS (
           SELECT id, parent_id, deleted_at FROM folders WHERE id = $1
           UNION ALL
           SELECT f.id, f.parent_id, f.deleted_at
             FROM folders f JOIN chain c ON f.id = c.parent_id
         ),
         ancestors AS (SELECT id FROM chain WHERE deleted_at = (SELECT ts FROM target)),
         all_ids AS (SELECT id FROM tree UNION SELECT id FROM ancestors),
         folder_update AS (
           UPDATE folders SET deleted_at = NULL
             WHERE id IN (SELECT id FROM all_ids)
               AND deleted_at = (SELECT ts FROM target)
             RETURNING 1
         ),
         file_update AS (
           UPDATE files SET deleted_at = NULL
             WHERE folder_id IN (SELECT id FROM all_ids)
               AND deleted_at = (SELECT ts FROM target)
             RETURNING 1
         )
       SELECT
         (SELECT count(*) FROM folder_update)::int AS folder_count,
         (SELECT count(*) FROM file_update)::int AS file_count`,
      [args.id],
    );
    return { folders: rows[0].folder_count, files: rows[0].file_count };
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      // Find the existing active row that blocks us.
      const { rows } = await pool.query<{ id: string }>(
        `SELECT id FROM folders
           WHERE deleted_at IS NULL
             AND COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
                 = COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
             AND LOWER(name) = LOWER($2)
             AND id <> $3`,
        [folder.parent_id, folder.name, folder.id],
      );
      throw new FolderCollisionError(rows[0]?.id ?? "");
    }
    throw err;
  }
}

export class FolderNotTrashedError extends Error {
  constructor() { super("folder is not trashed"); this.name = "FolderNotTrashedError"; }
}

export type PermanentDeleteFolderArgs = { id: string; actorId: string; isAdmin: boolean };
export type PermanentDeleteFolderResult = { deletedFiles: FileRow[] };

export async function permanentDeleteFolder(
  args: PermanentDeleteFolderArgs,
): Promise<PermanentDeleteFolderResult> {
  const folder = await getFolderIncludingTrashed(args.id);
  if (!folder) throw new FolderNotFoundError("folder");
  if (!folder.deleted_at) throw new FolderNotTrashedError();
  if (!args.isAdmin && folder.created_by !== args.actorId) throw new FolderAuthError();

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: subtree } = await client.query<{ id: string }>(
      `WITH RECURSIVE tree AS (
         SELECT id FROM folders WHERE id = $1
         UNION ALL
         SELECT f.id FROM folders f JOIN tree t ON f.parent_id = t.id
       )
       SELECT id FROM tree`,
      [args.id],
    );
    const folderIds = subtree.map((r) => r.id);

    const { rows: deletedFiles } = await client.query<FileRow>(
      `DELETE FROM files WHERE folder_id = ANY($1::uuid[]) RETURNING *`,
      [folderIds],
    );
    await client.query(`DELETE FROM folders WHERE id = ANY($1::uuid[])`, [folderIds]);
    await client.query("COMMIT");
    return { deletedFiles };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type TrashItem =
  | { kind: "folder"; id: string; name: string; deleted_at: Date; actor_username: string }
  | { kind: "file"; id: string; name: string; deleted_at: Date; actor_username: string; size_bytes: number };

export type TrashPage = { items: TrashItem[]; total: number; page: number; limit: number };

export async function listTrashedItems({ page, limit }: { page: number; limit: number }): Promise<TrashPage> {
  const offset = (page - 1) * limit;
  const { rows } = await pool.query<{
    kind: "folder" | "file";
    id: string;
    name: string;
    deleted_at: Date;
    actor_username: string;
    size_bytes: string | null;
  }>(
    `WITH folder_rows AS (
       SELECT 'folder'::text AS kind, f.id, f.name, f.deleted_at, u.username AS actor_username, NULL::bigint AS size_bytes
         FROM folders f
         JOIN users u ON u.id = f.created_by
        WHERE f.deleted_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM folders p
             WHERE p.id = f.parent_id AND p.deleted_at IS NOT NULL
          )
     ),
     file_rows AS (
       SELECT 'file'::text AS kind, fi.id, fi.original_name AS name, fi.deleted_at, u.username AS actor_username, fi.size_bytes::bigint
         FROM files fi
         JOIN users u ON u.id = fi.uploader_id
        WHERE fi.deleted_at IS NOT NULL
          AND (fi.folder_id IS NULL
               OR NOT EXISTS (
                 SELECT 1 FROM folders p
                  WHERE p.id = fi.folder_id AND p.deleted_at IS NOT NULL
               ))
     )
     SELECT * FROM (SELECT * FROM folder_rows UNION ALL SELECT * FROM file_rows) u
      ORDER BY deleted_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT (
       (SELECT count(*) FROM folders f WHERE f.deleted_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM folders p WHERE p.id = f.parent_id AND p.deleted_at IS NOT NULL))
       +
       (SELECT count(*) FROM files fi WHERE fi.deleted_at IS NOT NULL
          AND (fi.folder_id IS NULL OR NOT EXISTS (SELECT 1 FROM folders p WHERE p.id = fi.folder_id AND p.deleted_at IS NOT NULL)))
     )::text AS count`,
  );

  const items: TrashItem[] = rows.map((r) =>
    r.kind === "folder"
      ? { kind: "folder", id: r.id, name: r.name, deleted_at: r.deleted_at, actor_username: r.actor_username }
      : {
          kind: "file", id: r.id, name: r.name, deleted_at: r.deleted_at,
          actor_username: r.actor_username, size_bytes: Number(r.size_bytes ?? 0),
        },
  );
  return { items, total: parseInt(countRows[0].count, 10), page, limit };
}

export async function getExpiredTrashedFolders(daysOld: number): Promise<FolderRow[]> {
  const { rows } = await pool.query<FolderRow>(
    `SELECT * FROM folders
       WHERE deleted_at IS NOT NULL
         AND deleted_at < now() - ($1 || ' days')::interval`,
    [daysOld],
  );
  return rows;
}

export type TrashFolderArgs = { id: string; actorId: string; isAdmin: boolean };
export type TrashFolderResult = { folders: number; files: number };

export async function trashFolder(args: TrashFolderArgs): Promise<TrashFolderResult> {
  const folder = await getFolderIncludingTrashed(args.id);
  if (!folder) throw new FolderNotFoundError("folder");
  if (folder.deleted_at) return { folders: 0, files: 0 };
  if (!args.isAdmin && folder.created_by !== args.actorId) throw new FolderAuthError();

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    // Find every descendant folder id (includes the folder itself).
    const { rows: ids } = await client.query<{ id: string }>(
      `WITH RECURSIVE tree AS (
         SELECT id FROM folders WHERE id = $1
         UNION ALL
         SELECT f.id FROM folders f JOIN tree t ON f.parent_id = t.id
       )
       SELECT id FROM tree`,
      [args.id],
    );
    const folderIds = ids.map((r) => r.id);
    // Stamp all folders with the same now().
    const { rowCount: folderCount } = await client.query(
      `UPDATE folders SET deleted_at = now()
         WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [folderIds],
    );
    // Match the timestamp for files in those folders.
    const { rowCount: fileCount } = await client.query(
      `UPDATE files SET deleted_at = (SELECT deleted_at FROM folders WHERE id = $1)
         WHERE folder_id = ANY($2::uuid[]) AND deleted_at IS NULL`,
      [args.id, folderIds],
    );
    await client.query("COMMIT");
    return { folders: folderCount ?? 0, files: fileCount ?? 0 };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
