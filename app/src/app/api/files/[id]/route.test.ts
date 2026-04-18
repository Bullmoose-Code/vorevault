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

const getFileWithUploader = vi.fn();
vi.mock("@/lib/files", async () => {
  const actual = await vi.importActual<typeof import("@/lib/files")>("@/lib/files");
  return { ...actual, getFileWithUploader: (...a: unknown[]) => getFileWithUploader(...a) };
});

const getBreadcrumbs = vi.fn();
vi.mock("@/lib/folders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/folders")>("@/lib/folders");
  return { ...actual, getBreadcrumbs: (...a: unknown[]) => getBreadcrumbs(...a) };
});

const isBookmarked = vi.fn();
vi.mock("@/lib/bookmarks", () => ({
  addBookmark: vi.fn(), removeBookmark: vi.fn(), listBookmarks: vi.fn(),
  isBookmarked: (...a: unknown[]) => isBookmarked(...a),
}));

import { GET } from "./route";

const FILE_ID   = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const FOLDER_ID = "bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb";

function ctx(id: string) { return { params: Promise.resolve({ id }) }; }

beforeEach(() => {
  getCurrentUser.mockReset();
  getFileWithUploader.mockReset();
  getBreadcrumbs.mockReset();
  isBookmarked.mockReset();
});

describe("GET /api/files/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const res = await GET(
      new NextRequest(`https://app.test/api/files/${FILE_ID}`),
      ctx(FILE_ID),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when file not found", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    getFileWithUploader.mockResolvedValueOnce(null);
    const res = await GET(
      new NextRequest(`https://app.test/api/files/${FILE_ID}`),
      ctx(FILE_ID),
    );
    expect(res.status).toBe(404);
  });

  it("returns file data with empty breadcrumbs when no folder", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    getFileWithUploader.mockResolvedValueOnce({
      id: FILE_ID,
      uploader_id: "u1",
      uploader_name: "testuser",
      original_name: "clip.mp4",
      mime_type: "video/mp4",
      size_bytes: 1024,
      storage_path: "/data/clip.mp4",
      transcoded_path: null,
      thumbnail_path: null,
      transcode_status: "pending",
      duration_sec: null,
      width: null,
      height: null,
      folder_id: null,
      created_at: new Date(),
      deleted_at: null,
    });
    isBookmarked.mockResolvedValueOnce(false);
    const res = await GET(
      new NextRequest(`https://app.test/api/files/${FILE_ID}`),
      ctx(FILE_ID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(FILE_ID);
    expect(body.folderId).toBeNull();
    expect(body.folderBreadcrumbs).toHaveLength(0);
    expect(body.bookmarked).toBe(false);
    expect(getBreadcrumbs).not.toHaveBeenCalled();
  });

  it("response includes folderId, folderBreadcrumbs, bookmarked", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    getFileWithUploader.mockResolvedValueOnce({
      id: FILE_ID,
      uploader_id: "u1",
      uploader_name: "testuser",
      original_name: "clip.mp4",
      mime_type: "video/mp4",
      size_bytes: 2048,
      storage_path: "/data/clip.mp4",
      transcoded_path: null,
      thumbnail_path: null,
      transcode_status: "done",
      duration_sec: 42,
      width: 1920,
      height: 1080,
      folder_id: FOLDER_ID,
      created_at: new Date(),
      deleted_at: null,
    });
    getBreadcrumbs.mockResolvedValueOnce([{ id: FOLDER_ID, name: "Clips", parent_id: null }]);
    isBookmarked.mockResolvedValueOnce(true);
    const res = await GET(
      new NextRequest(`https://app.test/api/files/${FILE_ID}`),
      ctx(FILE_ID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.folderId).toBe(FOLDER_ID);
    expect(body.folderBreadcrumbs).toHaveLength(1);
    expect(body.bookmarked).toBe(true);
  });
});
