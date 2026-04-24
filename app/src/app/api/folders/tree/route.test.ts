import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  loadEnv: () => ({
    DISCORD_CLIENT_ID: "cid", DISCORD_CLIENT_SECRET: "csecret",
    DISCORD_REDIRECT_URI: "https://app.test/cb", DISCORD_GUILD_ID: "gid",
    DISCORD_REQUIRED_ROLE_ID: "rid", DATABASE_URL: "x",
    SESSION_SECRET: "0123456789abcdef", APP_PUBLIC_URL: "https://app.test",
  }),
}));

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUser(...a),
}));

const mockQuery = vi.fn();
vi.mock("@/lib/db", () => ({
  pool: { query: (...a: unknown[]) => mockQuery(...a) },
}));

const mockCreateFolderTree = vi.fn();
vi.mock("@/lib/folder-tree-create", () => ({
  createFolderTree: (...a: unknown[]) => mockCreateFolderTree(...a),
}));

import { GET, POST } from "./route";

function makeReq() {
  return new NextRequest(new URL("https://app.test/api/folders/tree"));
}

function makePost(body: unknown) {
  return new NextRequest(new URL("https://app.test/api/folders/tree"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => { getCurrentUser.mockReset(); mockQuery.mockReset(); mockCreateFolderTree.mockReset(); });

describe("GET /api/folders/tree", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthenticated");
  });

  it("returns 200 with folders array when authenticated", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: "f1", name: "Clips", parent_id: null },
        { id: "f2", name: "Highlights", parent_id: "f1" },
      ],
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.folders).toHaveLength(2);
    expect(body.folders[0]).toMatchObject({ id: "f1", name: "Clips", parent_id: null });
    expect(body.folders[1]).toMatchObject({ id: "f2", name: "Highlights", parent_id: "f1" });
  });
});

describe("POST /api/folders/tree", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const res = await POST(makePost({ parent_id: null, paths: ["A"] }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const res = await POST(makePost({ parent_id: null })); // missing paths
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid path segments", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const res = await POST(makePost({ parent_id: null, paths: ["A/../B"] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_path");
  });

  it("returns 200 with path→id map on success", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    mockCreateFolderTree.mockResolvedValueOnce({ A: "id-a", "A/B": "id-b" });
    const res = await POST(makePost({ parent_id: null, paths: ["A", "A/B"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.folders).toEqual({ A: "id-a", "A/B": "id-b" });
    expect(mockCreateFolderTree).toHaveBeenCalledWith({
      parentId: null,
      paths: ["A", "A/B"],
      actorId: "u1",
      batchId: null,
    });
  });

  it("returns 404 when parent folder does not exist", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const { FolderNotFoundError } = await import("@/lib/folders");
    mockCreateFolderTree.mockRejectedValueOnce(new FolderNotFoundError("parent folder"));
    const res = await POST(makePost({
      parent_id: "00000000-0000-0000-0000-000000000000",
      paths: ["A"],
    }));
    expect(res.status).toBe(404);
  });
});
