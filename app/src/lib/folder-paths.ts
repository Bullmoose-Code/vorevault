export class InvalidFolderPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFolderPathError";
  }
}

function assertValidSegment(segment: string): void {
  if (segment === "" || segment === "." || segment === "..") {
    throw new InvalidFolderPathError(`invalid path segment: "${segment}"`);
  }
}

function cleanPath(raw: string): string {
  const segments = raw.split("/").filter((s) => s !== "");
  for (const s of segments) assertValidSegment(s);
  return segments.join("/");
}

export function splitRelativeDir(relativePath: string): { dir: string; name: string } {
  const cleaned = cleanPath(relativePath);
  const slash = cleaned.lastIndexOf("/");
  if (slash === -1) return { dir: "", name: cleaned };
  return { dir: cleaned.slice(0, slash), name: cleaned.slice(slash + 1) };
}

export function normalizePaths(inputs: string[]): string[] {
  const set = new Set<string>();
  for (const raw of inputs) {
    const cleaned = cleanPath(raw);
    if (cleaned === "") continue;
    // Include every ancestor so parents are always created before children.
    const parts = cleaned.split("/");
    for (let i = 1; i <= parts.length; i++) {
      set.add(parts.slice(0, i).join("/"));
    }
  }
  return [...set].sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
}
