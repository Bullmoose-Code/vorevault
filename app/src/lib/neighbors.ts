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
  if (ctx.kind === "folder") {
    return getFolderNeighbors(currentFileId, ctx.folderId);
  }
  throw new Error(`getNeighbors: ${ctx.kind} not yet implemented`);
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
