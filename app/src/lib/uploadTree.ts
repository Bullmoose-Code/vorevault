import { splitRelativeDir, normalizePaths } from "./folder-paths";

export type UploadItem = { file: File; relPath: string };

export type UploadEnqueue = (file: File, folderId: string | null) => void;

export type UploadTreeOptions = {
  items: UploadItem[];
  destFolderId: string | null;
  enqueue: UploadEnqueue;
  setError?: (message: string) => void;
};

export async function uploadItemsWithTree(opts: UploadTreeOptions): Promise<void> {
  const { items, destFolderId, enqueue, setError } = opts;
  if (items.length === 0) return;

  const dirs: string[] = [];
  const relDirs: string[] = [];
  for (const item of items) {
    const { dir } = splitRelativeDir(item.relPath);
    relDirs.push(dir);
    if (dir) dirs.push(dir);
  }

  let paths: string[];
  try {
    paths = normalizePaths(dirs);
  } catch (err) {
    setError?.((err as Error).message);
    return;
  }

  let map: Record<string, string> = {};
  if (paths.length > 0) {
    try {
      const res = await fetch("/api/folders/tree", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parent_id: destFolderId, paths }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError?.(`couldn't create folder structure: ${body.error ?? res.statusText}`);
        return;
      }
      const data = (await res.json()) as { folders?: Record<string, string> };
      map = data.folders ?? {};
    } catch (err) {
      setError?.((err as Error).message);
      return;
    }
  }

  for (let i = 0; i < items.length; i++) {
    const dir = relDirs[i];
    const target = dir ? (map[dir] ?? destFolderId) : destFolderId;
    enqueue(items[i].file, target);
  }
}
