import { statfs } from "node:fs/promises";
import { pool } from "@/lib/db";

export type StorageStats = {
  used_bytes: number;
  total_bytes: number;
  used_pct: number;
};

const STORAGE_ROOT = process.env.VV_STORAGE_ROOT ?? "/data";
const TTL_MS = 60_000;

let cache: { value: StorageStats; expires: number } | null = null;

export function _resetStorageStatsCache(): void {
  cache = null;
}

export async function getStorageStats(): Promise<StorageStats> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.value;

  const [{ rows }, fs] = await Promise.all([
    pool.query<{ used_bytes: string }>(
      `SELECT COALESCE(SUM(size_bytes), 0)::text AS used_bytes
         FROM files WHERE deleted_at IS NULL`,
    ),
    statfs(STORAGE_ROOT),
  ]);

  const used_bytes = parseInt(rows[0].used_bytes, 10);
  const total_bytes = Number(fs.blocks) * Number(fs.bsize);
  const used_pct = total_bytes > 0 ? used_bytes / total_bytes : 0;

  const value: StorageStats = { used_bytes, total_bytes, used_pct };
  cache = { value, expires: now + TTL_MS };
  return value;
}
