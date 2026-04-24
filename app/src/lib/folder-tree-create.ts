import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import { FolderNotFoundError } from "@/lib/folders";

export type CreateFolderTreeArgs = {
  parentId: string | null;
  /** Must be produced by `normalizePaths` — parents-before-children, deduped. */
  paths: string[];
  actorId: string;
  batchId?: string | null;
};

export async function createFolderTree(
  args: CreateFolderTreeArgs,
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (args.paths.length === 0) return map;

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    if (args.parentId !== null) {
      const parent = await client.query<{ id: string }>(
        `SELECT id FROM folders WHERE id = $1 AND deleted_at IS NULL`,
        [args.parentId],
      );
      if (parent.rowCount === 0) throw new FolderNotFoundError("parent folder");
    }

    for (const path of args.paths) {
      const slash = path.lastIndexOf("/");
      const parentPath = slash === -1 ? "" : path.slice(0, slash);
      const name = slash === -1 ? path : path.slice(slash + 1);
      let parentId: string | null;
      if (parentPath === "") {
        parentId = args.parentId;
      } else {
        const resolved = map[parentPath];
        if (!resolved) {
          throw new Error(
            `createFolderTree: path "${path}" references parent "${parentPath}" which was not in the input set (violates normalizePaths contract)`,
          );
        }
        parentId = resolved;
      }

      const existing = await client.query<{ id: string }>(
        `SELECT id FROM folders
          WHERE COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
                = COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
            AND LOWER(name) = LOWER($2)
            AND deleted_at IS NULL`,
        [parentId, name],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        map[path] = existing.rows[0].id;
        continue;
      }

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO folders (name, parent_id, created_by, upload_batch_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [name, parentId, args.actorId, args.batchId ?? null],
      );
      map[path] = rows[0].id;
    }

    await client.query("COMMIT");
    return map;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
