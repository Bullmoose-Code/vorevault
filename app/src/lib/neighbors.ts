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
