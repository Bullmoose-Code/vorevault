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

const getFolder = vi.fn();
const listChildren = vi.fn();
const getBreadcrumbs = vi.fn();
const renameFolder = vi.fn();
const moveFolder = vi.fn();
const deleteFolder = vi.fn();
vi.mock("@/lib/folders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/folders")>("@/lib/folders");
  return {
    ...actual,
    getFolder: (...a: unknown[]) => getFolder(...a),
    listChildren: (...a: unknown[]) => listChildren(...a),
    getBreadcrumbs: (...a: unknown[]) => getBreadcrumbs(...a),
    renameFolder: (...a: unknown[]) => renameFolder(...a),
    moveFolder: (...a: unknown[]) => moveFolder(...a),
    deleteFolder: (...a: unknown[]) => deleteFolder(...a),
  };
});

import { GET, PATCH, DELETE } from "./route";

const FOLDER_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const GHOST_ID  = "00000000-0000-0000-0000-000000000000";
const PARENT_ID = "bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb";

function ctx(id: string) { return { params: Promise.resolve({ id }) }; }

beforeEach(() => {
  getCurrentUser.mockReset(); getFolder.mockReset(); listChildren.mockReset();
  getBreadcrumbs.mockReset(); renameFolder.mockReset(); moveFolder.mockReset(); deleteFolder.mockReset();
});

describe("GET /api/folders/[id]", () => {
  it("returns folder + children + breadcrumbs", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    getFolder.mockResolvedValueOnce({ id: FOLDER_ID, name: "Clips", parent_id: null, created_by: "u1", created_at: new Date() });
    listChildren.mockResolvedValueOnce({ subfolders: [], files: [] });
    getBreadcrumbs.mockResolvedValueOnce([{ id: FOLDER_ID, name: "Clips", parent_id: null }]);
    const res = await GET(new NextRequest(`https://app.test/api/folders/${FOLDER_ID}`), ctx(FOLDER_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.folder.id).toBe(FOLDER_ID);
    expect(body.breadcrumbs).toHaveLength(1);
  });

  it("returns 404 when folder missing", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    getFolder.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest(`https://app.test/api/folders/${GHOST_ID}`), ctx(GHOST_ID));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/folders/[id]", () => {
  it("rename path: 200 on success", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    renameFolder.mockResolvedValueOnce({ id: FOLDER_ID, name: "new" });
    const req = new NextRequest(`https://app.test/api/folders/${FOLDER_ID}`, {
      method: "PATCH", body: JSON.stringify({ name: "new" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, ctx(FOLDER_ID));
    expect(res.status).toBe(200);
  });

  it("move path: 200 on success", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    moveFolder.mockResolvedValueOnce({ id: FOLDER_ID, parent_id: PARENT_ID });
    const req = new NextRequest(`https://app.test/api/folders/${FOLDER_ID}`, {
      method: "PATCH", body: JSON.stringify({ parentId: PARENT_ID }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, ctx(FOLDER_ID));
    expect(res.status).toBe(200);
  });

  it("returns 403 on auth error", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const { FolderAuthError } = await import("@/lib/folders");
    renameFolder.mockRejectedValueOnce(new FolderAuthError());
    const req = new NextRequest(`https://app.test/api/folders/${FOLDER_ID}`, {
      method: "PATCH", body: JSON.stringify({ name: "new" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, ctx(FOLDER_ID));
    expect(res.status).toBe(403);
  });

  it("returns 400 on cycle", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const { FolderCycleError } = await import("@/lib/folders");
    moveFolder.mockRejectedValueOnce(new FolderCycleError());
    const req = new NextRequest(`https://app.test/api/folders/${FOLDER_ID}`, {
      method: "PATCH", body: JSON.stringify({ parentId: PARENT_ID }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, ctx(FOLDER_ID));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/folders/[id]", () => {
  it("returns 204 on success", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    deleteFolder.mockResolvedValueOnce(undefined);
    const res = await DELETE(new NextRequest(`https://app.test/api/folders/${FOLDER_ID}`), ctx(FOLDER_ID));
    expect(res.status).toBe(204);
  });

  it("returns 403 on auth error", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const { FolderAuthError } = await import("@/lib/folders");
    deleteFolder.mockRejectedValueOnce(new FolderAuthError());
    const res = await DELETE(new NextRequest(`https://app.test/api/folders/${FOLDER_ID}`), ctx(FOLDER_ID));
    expect(res.status).toBe(403);
  });
});
