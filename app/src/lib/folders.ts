import { pool } from "@/lib/db";

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
