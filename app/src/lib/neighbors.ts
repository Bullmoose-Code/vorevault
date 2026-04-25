import { pool } from "@/lib/db";

export type NeighborContext =
  | { kind: "folder"; folderId: string }
  | { kind: "recent" }
  | { kind: "mine"; uploaderId: string }
  | { kind: "starred"; userId: string }
  | { kind: "tagged"; tagId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOLDER_PREFIX = "folder/";

/**
 * Parse the `from`/`tag` searchParams from the file-detail URL into a
 * NeighborContext. Returns null for missing or malformed input — the page
 * uses null to mean "do not render the prev/next row."
 *
 * `userId` is the current viewer's id (from the session). It's needed to
 * resolve `from=mine` and `from=starred` server-side.
 */
export function parseFromParam(
  from: string | undefined,
  tag: string | undefined,
  userId: string,
): NeighborContext | null {
  if (!from) return null;

  if (from === "recent") return { kind: "recent" };
  if (from === "mine") return { kind: "mine", uploaderId: userId };
  if (from === "starred") return { kind: "starred", userId };

  if (from === "tagged") {
    if (!tag || !UUID_RE.test(tag)) return null;
    return { kind: "tagged", tagId: tag };
  }

  if (from.startsWith(FOLDER_PREFIX)) {
    const folderId = from.slice(FOLDER_PREFIX.length);
    if (!UUID_RE.test(folderId)) return null;
    return { kind: "folder", folderId };
  }

  return null;
}

export type Neighbors = {
  prev: { id: string } | null;
  next: { id: string } | null;
};

/**
 * Resolve the prev (visually-earlier-in-grid) and next (visually-later)
 * file ids for `currentFileId` within `ctx`. Returns null on each side at
 * the boundary. Single round-trip per side; uses `(created_at, id)` as a
 * deterministic tie-breaker so files sharing a timestamp resolve uniquely.
 */
export async function getNeighbors(
  currentFileId: string,
  ctx: NeighborContext,
): Promise<Neighbors> {
  switch (ctx.kind) {
    case "folder":  return getFolderNeighbors(currentFileId, ctx.folderId);
    case "recent":  return getRecentNeighbors(currentFileId);
    case "mine":    return getMineNeighbors(currentFileId, ctx.uploaderId);
    case "starred": return getStarredNeighbors(currentFileId, ctx.userId);
    case "tagged":  return getTaggedNeighbors(currentFileId, ctx.tagId);
  }
}

async function getFolderNeighbors(
  currentFileId: string,
  folderId: string,
): Promise<Neighbors> {
  const PREV_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id
    FROM files f, cur
    WHERE f.deleted_at IS NULL
      AND f.folder_id = $2
      AND (f.created_at > cur.created_at
           OR (f.created_at = cur.created_at AND f.id > $1))
    ORDER BY f.created_at ASC, f.id ASC
    LIMIT 1
  `;
  const NEXT_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id
    FROM files f, cur
    WHERE f.deleted_at IS NULL
      AND f.folder_id = $2
      AND (f.created_at < cur.created_at
           OR (f.created_at = cur.created_at AND f.id < $1))
    ORDER BY f.created_at DESC, f.id DESC
    LIMIT 1
  `;
  const [prevR, nextR] = await Promise.all([
    pool.query<{ id: string }>(PREV_SQL, [currentFileId, folderId]),
    pool.query<{ id: string }>(NEXT_SQL, [currentFileId, folderId]),
  ]);
  return {
    prev: prevR.rows[0] ?? null,
    next: nextR.rows[0] ?? null,
  };
}

async function getRecentNeighbors(currentFileId: string): Promise<Neighbors> {
  // Mirrors `branchFile` in listTopLevelItems (app/src/lib/files.ts): the
  // /recent grid filters by `upload_batch_id IS NULL`, NOT folder_id. Files
  // in legacy folders are visible there; files inside a batch folder are
  // represented by the batch tile and must be excluded here.
  const PREV_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id FROM files f, cur
    WHERE f.deleted_at IS NULL
      AND f.upload_batch_id IS NULL
      AND (f.created_at > cur.created_at
           OR (f.created_at = cur.created_at AND f.id > $1))
    ORDER BY f.created_at ASC, f.id ASC LIMIT 1
  `;
  const NEXT_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id FROM files f, cur
    WHERE f.deleted_at IS NULL
      AND f.upload_batch_id IS NULL
      AND (f.created_at < cur.created_at
           OR (f.created_at = cur.created_at AND f.id < $1))
    ORDER BY f.created_at DESC, f.id DESC LIMIT 1
  `;
  const [p, n] = await Promise.all([
    pool.query<{ id: string }>(PREV_SQL, [currentFileId]),
    pool.query<{ id: string }>(NEXT_SQL, [currentFileId]),
  ]);
  return { prev: p.rows[0] ?? null, next: n.rows[0] ?? null };
}

async function getMineNeighbors(currentFileId: string, uploaderId: string): Promise<Neighbors> {
  const PREV_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id FROM files f, cur
    WHERE f.deleted_at IS NULL
      AND f.uploader_id = $2
      AND (f.created_at > cur.created_at
           OR (f.created_at = cur.created_at AND f.id > $1))
    ORDER BY f.created_at ASC, f.id ASC LIMIT 1
  `;
  const NEXT_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id FROM files f, cur
    WHERE f.deleted_at IS NULL
      AND f.uploader_id = $2
      AND (f.created_at < cur.created_at
           OR (f.created_at = cur.created_at AND f.id < $1))
    ORDER BY f.created_at DESC, f.id DESC LIMIT 1
  `;
  const [p, n] = await Promise.all([
    pool.query<{ id: string }>(PREV_SQL, [currentFileId, uploaderId]),
    pool.query<{ id: string }>(NEXT_SQL, [currentFileId, uploaderId]),
  ]);
  return { prev: p.rows[0] ?? null, next: n.rows[0] ?? null };
}

async function getStarredNeighbors(currentFileId: string, userId: string): Promise<Neighbors> {
  // /starred orders by BOOKMARK created_at, not file created_at.
  // The cursor is the bookmark for (userId, currentFileId).
  const PREV_SQL = `
    WITH cur AS (
      SELECT created_at FROM bookmarks WHERE user_id = $1 AND file_id = $2
    )
    SELECT b.file_id AS id FROM bookmarks b, cur
    WHERE b.user_id = $1
      AND (b.created_at > cur.created_at
           OR (b.created_at = cur.created_at AND b.file_id > $2))
    ORDER BY b.created_at ASC, b.file_id ASC LIMIT 1
  `;
  const NEXT_SQL = `
    WITH cur AS (
      SELECT created_at FROM bookmarks WHERE user_id = $1 AND file_id = $2
    )
    SELECT b.file_id AS id FROM bookmarks b, cur
    WHERE b.user_id = $1
      AND (b.created_at < cur.created_at
           OR (b.created_at = cur.created_at AND b.file_id < $2))
    ORDER BY b.created_at DESC, b.file_id DESC LIMIT 1
  `;
  const [p, n] = await Promise.all([
    pool.query<{ id: string }>(PREV_SQL, [userId, currentFileId]),
    pool.query<{ id: string }>(NEXT_SQL, [userId, currentFileId]),
  ]);
  return { prev: p.rows[0] ?? null, next: n.rows[0] ?? null };
}

async function getTaggedNeighbors(currentFileId: string, tagId: string): Promise<Neighbors> {
  // Tagged home grid also flows through `branchFile` in listTopLevelItems
  // (with an EXISTS clause for the tag), so it shares the same
  // `upload_batch_id IS NULL` constraint.
  const PREV_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id FROM files f
    JOIN file_tags ft ON ft.file_id = f.id, cur
    WHERE f.deleted_at IS NULL
      AND ft.tag_id = $2
      AND f.upload_batch_id IS NULL
      AND (f.created_at > cur.created_at
           OR (f.created_at = cur.created_at AND f.id > $1))
    ORDER BY f.created_at ASC, f.id ASC LIMIT 1
  `;
  const NEXT_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id FROM files f
    JOIN file_tags ft ON ft.file_id = f.id, cur
    WHERE f.deleted_at IS NULL
      AND ft.tag_id = $2
      AND f.upload_batch_id IS NULL
      AND (f.created_at < cur.created_at
           OR (f.created_at = cur.created_at AND f.id < $1))
    ORDER BY f.created_at DESC, f.id DESC LIMIT 1
  `;
  const [p, n] = await Promise.all([
    pool.query<{ id: string }>(PREV_SQL, [currentFileId, tagId]),
    pool.query<{ id: string }>(NEXT_SQL, [currentFileId, tagId]),
  ]);
  return { prev: p.rows[0] ?? null, next: n.rows[0] ?? null };
}
