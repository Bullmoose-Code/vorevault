import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/upload-batches", () => ({
  createUploadBatch: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import { createUploadBatch } from "@/lib/upload-batches";

describe("POST /api/upload-batches", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(createUploadBatch).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(new Request("http://test", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("creates a batch and returns batchId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", username: "alice", is_admin: false } as never);
    vi.mocked(createUploadBatch).mockResolvedValue({
      id: "b1", uploader_id: "u1", top_folder_id: null, created_at: new Date(),
    });
    const res = await POST(new Request("http://test", { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.batchId).toBe("b1");
    expect(createUploadBatch).toHaveBeenCalledWith("u1");
  });
});
