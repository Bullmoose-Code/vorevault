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

export type SearchTagHit = { id: string; name: string; file_count: number };

export type SearchResult = {
  folders: FolderRow[];
  files: SearchFileHit[];
  tags: SearchTagHit[];
  total: number;
};

export async function searchEverything(args: SearchArgs): Promise<SearchResult> {
  if (args.query.trim().length < 2) {
    return { folders: [], files: [], tags: [], total: 0 };
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
        AND (
          GREATEST(
            similarity(fi.original_name, $1),
            COALESCE(similarity(fo.name, $1), 0),
            similarity(u.username, $1)
          ) > ${SIMILARITY_THRESHOLD}
          OR EXISTS (
            SELECT 1 FROM file_tags ft
              JOIN tags t ON t.id = ft.tag_id
             WHERE ft.file_id = fi.id
               AND t.name ILIKE '%' || $1 || '%'
          )
        )
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

  // Tag hits — standalone so the dropdown can surface `#valheim` as its own
  // clickable entry that routes to /?tag=<id>. Substring match is deliberate:
  // tags are short, lowercase, and normalized, so users expect partial-word
  // matching rather than trigram similarity.
  const { rows: tags } = await pool.query<SearchTagHit>(
    `SELECT t.id, t.name,
            COALESCE(
              (SELECT count(*)::int FROM file_tags ft
                 JOIN files f ON f.id = ft.file_id
                WHERE ft.tag_id = t.id AND f.deleted_at IS NULL),
              0
            ) AS file_count
       FROM tags t
      WHERE t.name ILIKE '%' || $1 || '%'
      ORDER BY t.name ASC
      LIMIT 10`,
    [args.query],
  );

  return { folders, files, tags, total: folders.length + files.length + tags.length };
}
