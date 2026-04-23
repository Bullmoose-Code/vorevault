import archiver from "archiver";
import type { Readable } from "node:stream";
import { createReadStream } from "node:fs";

export type ZipEntry = {
  /** filename inside the zip; collisions get " (2)" etc. suffix. */
  name: string;
  /** absolute filesystem path to the source file. */
  path: string;
};

/**
 * Stream a zip archive of the given files. STORE mode (no compression) —
 * inputs are usually already compressed (videos, images) so deflate would
 * waste CPU. Returns a Node Readable for piping.
 */
export function buildZipStream(entries: ZipEntry[]): Readable {
  const archive = archiver("zip", { store: true });

  const seen = new Map<string, number>();
  for (const entry of entries) {
    const base = entry.name;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const nameInZip = count === 1 ? base : suffixName(base, count);
    archive.append(createReadStream(entry.path), { name: nameInZip });
  }

  archive.finalize().catch(() => {
    // finalize errors surface as 'error' events on the stream; nothing more to do here.
  });

  return archive;
}

function suffixName(name: string, count: number): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name} (${count})`;
  return `${name.slice(0, dot)} (${count})${name.slice(dot)}`;
}
