import { pool } from "@/lib/db";
import type { PoolClient } from "pg";

export type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  created_by: string;
  created_at: Date;
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
      `SELECT id FROM folders WHERE id = $1`,
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
            AND LOWER(name) = LOWER($2)`,
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
  const { rows } = await pool.query<FolderRow>(`SELECT * FROM folders WHERE id = $1`, [folderId]);
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
            AND id <> $3`,
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
    const parentExists = await pool.query(`SELECT 1 FROM folders WHERE id = $1`, [args.newParentId]);
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
            AND id <> $3`,
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
