import { mkdir, statfs } from "node:fs/promises";

export const DATA_ROOT = "/data";
export const UPLOADS_DIR = `${DATA_ROOT}/uploads`;
export const THUMBS_DIR = `${DATA_ROOT}/thumbs`;
export const TRANSCODED_DIR = `${DATA_ROOT}/transcoded`;
export const TUSD_TMP_DIR = `${DATA_ROOT}/tusd-tmp`;

export const MAX_FILE_BYTES = 100n * 1024n * 1024n * 1024n; // 100 GiB
export const MIN_FREE_BYTES = 10n * 1024n * 1024n * 1024n; // refuse uploads below 10 GiB free

export async function freeBytes(dir: string): Promise<bigint> {
  const stats = await statfs(dir, { bigint: true });
  return stats.bavail * stats.bsize;
}

export async function totalBytes(dir: string): Promise<bigint> {
  const stats = await statfs(dir, { bigint: true });
  return stats.blocks * stats.bsize;
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export function sanitizeFilename(name: string): string {
  // Strip path separators and null bytes; keep everything else (including spaces).
  return name.replace(/[/\\\0]/g, "_");
}

export function canonicalUploadPath(fileId: string, originalName: string): string {
  return `${UPLOADS_DIR}/${fileId}/${sanitizeFilename(originalName)}`;
}

export function canonicalThumbPath(fileId: string): string {
  return `${THUMBS_DIR}/${fileId}.jpg`;
}
