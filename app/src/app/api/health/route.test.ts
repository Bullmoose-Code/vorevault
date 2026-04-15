import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  pool: { query: vi.fn() },
}));

import { GET } from "./route";
import { pool } from "@/lib/db";

describe("GET /api/health", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 and status ok when DB is reachable", async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("up");
  });

  it("returns 503 and status degraded when DB is unreachable", async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("down");
  });
});
