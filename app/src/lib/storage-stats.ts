// app/src/lib/storage-stats.ts
import { pool } from "@/lib/db";
import { DATA_ROOT, totalBytes } from "@/lib/storage";

export type StorageStats = {
  used_bytes: number;
  total_bytes: number;
  used_fraction: number;  // 0..1; named "fraction" not "pct" because it's not multiplied by 100
};

const TTL_MS = 60_000;

let cache: { value: StorageStats; expires: number } | null = null;

export function _resetStorageStatsCache(): void {
  cache = null;
}

export async function getStorageStats(): Promise<StorageStats> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.value;

  const [{ rows }, total] = await Promise.all([
    pool.query<{ used_bytes: string }>(
      `SELECT COALESCE(SUM(size_bytes), 0)::text AS used_bytes
         FROM files WHERE deleted_at IS NULL`,
    ),
    totalBytes(DATA_ROOT),
  ]);

  const used_bytes = Number(rows[0].used_bytes);
  const total_bytes = Number(total);
  const used_fraction = total_bytes > 0 ? used_bytes / total_bytes : 0;

  const value: StorageStats = { used_bytes, total_bytes, used_fraction };

  // Don't cache anomalous reads (e.g., transient mount issue returning 0 capacity).
  if (total_bytes > 0) {
    cache = { value, expires: now + TTL_MS };
  }
  return value;
}
