import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  pool: { query: vi.fn() },
}));
vi.mock("node:fs/promises", () => ({
  statfs: vi.fn(),
}));

import { pool } from "@/lib/db";
import { statfs } from "node:fs/promises";
import { getStorageStats, _resetStorageStatsCache } from "./storage-stats";

describe("getStorageStats", () => {
  beforeEach(() => {
    _resetStorageStatsCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns used_bytes from sum and total_bytes from statfs", async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ used_bytes: "1500" }],
    });
    (statfs as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      blocks: 100n,
      bsize: 4096n,
    });

    const stats = await getStorageStats();
    expect(stats).toEqual({
      used_bytes: 1500,
      total_bytes: 409600,
      used_fraction: 1500 / 409600,
    });
  });

  it("caches results for 60 seconds", async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ used_bytes: "1000" }],
    });
    (statfs as ReturnType<typeof vi.fn>).mockResolvedValue({
      blocks: 1n,
      bsize: 1000n,
    });

    await getStorageStats();
    await getStorageStats();
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(statfs).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(61_000);
    await getStorageStats();
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(statfs).toHaveBeenCalledTimes(2);
  });

  it("does not cache when total_bytes is zero (statfs anomaly)", async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ used_bytes: "100" }],
    });
    (statfs as ReturnType<typeof vi.fn>).mockResolvedValue({ blocks: 0n, bsize: 0n });

    const a = await getStorageStats();
    const b = await getStorageStats();
    expect(a.total_bytes).toBe(0);
    expect(b.total_bytes).toBe(0);
    expect(pool.query).toHaveBeenCalledTimes(2);  // not cached
  });
});
