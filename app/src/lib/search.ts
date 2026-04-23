import { pool } from "@/lib/db";
import type { FileRow } from "@/lib/files";
import type { FolderRow } from "@/lib/folders";

const SIMILARITY_THRESHOLD = 0.2;

export type SearchArgs = {
  query: string;
  limit: number;
  offset: number;
  scopeFolderId?: string;
};

export type SearchFileHit = FileRow & { uploader_username: string };

export type SearchResult = {
  folders: FolderRow[];
  files: SearchFileHit[];
  total: number;
};

export async function searchEverything(args: SearchArgs): Promise<SearchResult> {
  if (args.query.trim().length < 2) {
    return { folders: [], files: [], total: 0 };
  }

  // Folders: fuzzy match on name, optionally scoped to descendants of a folder.
  const folderParams: unknown[] = [args.query];
  let folderScopeClause = "";
  if (args.scopeFolderId) {
    folderScopeClause = `
      AND f.id IN (
        WITH RECURSIVE tree AS (
          SELECT id FROM folders WHERE id = $2 AND deleted_at IS NULL
          UNION ALL
          SELECT c.id FROM folders c JOIN tree t ON c.parent_id = t.id
          WHERE c.deleted_at IS NULL
        )
        SELECT id FROM tree
      )`;
    folderParams.push(args.scopeFolderId);
  }

  const { rows: folders } = await pool.query<FolderRow>(
    `SELECT f.*
       FROM folders f
      WHERE similarity(f.name, $1) > ${SIMILARITY_THRESHOLD}
            AND f.deleted_at IS NULL
            ${folderScopeClause}
      ORDER BY similarity(f.name, $1) DESC
      LIMIT 20`,
    folderParams,
  );

  // Files: fuzzy match on filename OR folder name OR uploader name, scoped optionally.
  const fileParams: unknown[] = [args.query];
  let fileScopeClause = "";
  if (args.scopeFolderId) {
    fileScopeClause = `
      AND fi.folder_id IN (
        WITH RECURSIVE tree AS (
          SELECT id FROM folders WHERE id = $2 AND deleted_at IS NULL
          UNION ALL
          SELECT c.id FROM folders c JOIN tree t ON c.parent_id = t.id
          WHERE c.deleted_at IS NULL
        )
        SELECT id FROM tree
      )`;
    fileParams.push(args.scopeFolderId);
  }
  const limitIdx = fileParams.length + 1;
  const offsetIdx = fileParams.length + 2;
  fileParams.push(args.limit, args.offset);

  const { rows: files } = await pool.query<SearchFileHit>(
    `SELECT fi.*, u.username AS uploader_username
       FROM files fi
       JOIN users u ON u.id = fi.uploader_id
       LEFT JOIN folders fo ON fo.id = fi.folder_id
      WHERE fi.deleted_at IS NULL
        AND GREATEST(
              similarity(fi.original_name, $1),
              COALESCE(similarity(fo.name, $1), 0),
              similarity(u.username, $1)
            ) > ${SIMILARITY_THRESHOLD}
        AND (fi.folder_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM folders fo_t WHERE fo_t.id = fi.folder_id AND fo_t.deleted_at IS NOT NULL
        ))
        ${fileScopeClause}
      ORDER BY GREATEST(
                 similarity(fi.original_name, $1),
                 COALESCE(similarity(fo.name, $1), 0),
                 similarity(u.username, $1)
               ) DESC, fi.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    fileParams,
  );

  return { folders, files, total: folders.length + files.length };
}
