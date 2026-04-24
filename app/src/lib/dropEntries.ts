import type { UploadItem } from "./uploadTree";

// Minimal shape we need from the FileSystemEntry API (non-standard webkit*).
// Typed loose because browsers differ and we gate behavior with .isFile/.isDirectory.
type FSEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (cb: (f: File) => void, err: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (cb: (es: FSEntry[]) => void, err: (e: unknown) => void) => void };
};

function getEntry(item: DataTransferItem): FSEntry | null {
  const anyItem = item as unknown as { webkitGetAsEntry?: () => FSEntry | null };
  if (typeof anyItem.webkitGetAsEntry !== "function") return null;
  return anyItem.webkitGetAsEntry() ?? null;
}

async function readAllEntries(reader: NonNullable<FSEntry["createReader"]> extends () => infer R ? R : never): Promise<FSEntry[]> {
  const all: FSEntry[] = [];
  // readEntries returns at most ~100 entries at a time — keep calling until empty.
  for (;;) {
    const batch = await new Promise<FSEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

async function walkEntry(entry: FSEntry, prefix: string, out: UploadItem[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
    out.push({ file, relPath: prefix ? `${prefix}/${file.name}` : file.name });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const children = await readAllEntries(reader);
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    for (const child of children) {
      await walkEntry(child, nextPrefix, out);
    }
  }
}

// Walk a DataTransfer from a drop event, producing a flat list of File + relPath.
// Falls back to dataTransfer.files when webkitGetAsEntry isn't available (older
// browsers) — in that mode every item is treated as a root-level file with no
// directory structure.
export async function collectDroppedItems(dataTransfer: DataTransfer): Promise<UploadItem[]> {
  const out: UploadItem[] = [];
  const items = Array.from(dataTransfer.items ?? []);
  if (items.length > 0 && typeof (items[0] as unknown as { webkitGetAsEntry?: unknown }).webkitGetAsEntry === "function") {
    for (const item of items) {
      const entry = getEntry(item);
      if (entry) await walkEntry(entry, "", out);
    }
    if (out.length > 0) return out;
  }
  // Fallback: plain file list (no directory info)
  for (const f of Array.from(dataTransfer.files ?? [])) {
    out.push({ file: f, relPath: f.name });
  }
  return out;
}
