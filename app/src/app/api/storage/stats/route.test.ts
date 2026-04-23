import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/storage-stats", () => ({ getStorageStats: vi.fn() }));

import { GET } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { getStorageStats } from "@/lib/storage-stats";

describe("GET /api/storage/stats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns stats when authenticated", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "u1" });
    (getStorageStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      used_bytes: 100, total_bytes: 1000, used_fraction: 0.1,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ used_bytes: 100, total_bytes: 1000, used_fraction: 0.1 });
  });
});
