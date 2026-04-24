import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  loadEnv: () => ({
    DISCORD_CLIENT_ID: "x", DISCORD_CLIENT_SECRET: "x",
    DISCORD_REDIRECT_URI: "https://app.test/cb", DISCORD_GUILD_ID: "g",
    DISCORD_REQUIRED_ROLE_ID: "r", DATABASE_URL: "x",
    SESSION_SECRET: "0123456789abcdef", APP_PUBLIC_URL: "https://app.test",
  }),
}));

const getSessionUser = vi.fn();
vi.mock("@/lib/sessions", () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));

const freeBytes = vi.fn();
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return { ...actual, freeBytes: (...a: unknown[]) => freeBytes(...a) };
});

const registerUploadSession = vi.fn();
const getUploadSession = vi.fn();
const finalizeUploadSession = vi.fn();
vi.mock("@/lib/upload-sessions", () => ({
  registerUploadSession: (...a: unknown[]) => registerUploadSession(...a),
  getUploadSession: (...a: unknown[]) => getUploadSession(...a),
  finalizeUploadSession: (...a: unknown[]) => finalizeUploadSession(...a),
}));

const insertFile = vi.fn();
const updateTranscodeStatus = vi.fn();
vi.mock("@/lib/files", () => ({
  insertFile: (...a: unknown[]) => insertFile(...a),
  updateTranscodeStatus: (...a: unknown[]) => updateTranscodeStatus(...a),
}));

const folderExists = vi.fn();
const getOrCreateUserHomeFolder = vi.fn();
vi.mock("@/lib/folders", () => ({
  folderExists: (...a: unknown[]) => folderExists(...a),
  getOrCreateUserHomeFolder: (...a: unknown[]) => getOrCreateUserHomeFolder(...a),
}));

const getUserById = vi.fn();
vi.mock("@/lib/users", () => ({
  getUserById: (...a: unknown[]) => getUserById(...a),
}));

const attachTagToFile = vi.fn();
vi.mock("@/lib/tags", () => ({
  attachTagToFile: (...a: unknown[]) => attachTagToFile(...a),
}));

const generateThumbnail = vi.fn();
vi.mock("@/lib/thumbnails", () => ({
  generateThumbnail: (...a: unknown[]) => generateThumbnail(...a),
}));

const execFileMock = vi.fn();
vi.mock("node:child_process", () => ({
  execFile: (...a: unknown[]) => execFileMock(...a),
}));

const renameMock = vi.fn();
const mkdirMock = vi.fn();
const statMock = vi.fn();
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    rename: (...a: unknown[]) => renameMock(...a),
    mkdir: (...a: unknown[]) => mkdirMock(...a),
    stat: (...a: unknown[]) => statMock(...a),
  };
});

import { POST } from "./route";

beforeEach(() => {
  getSessionUser.mockReset();
  freeBytes.mockReset();
  registerUploadSession.mockReset();
  getUploadSession.mockReset();
  finalizeUploadSession.mockReset();
  insertFile.mockReset();
  updateTranscodeStatus.mockReset();
  folderExists.mockReset();
  getOrCreateUserHomeFolder.mockReset();
  getUserById.mockReset();
  attachTagToFile.mockReset();
  generateThumbnail.mockReset();
  execFileMock.mockReset();
  renameMock.mockReset();
  mkdirMock.mockReset();
  statMock.mockReset();
});

function hookReq(name: string, body: unknown): NextRequest {
  return new NextRequest("https://app.test/api/hooks/tus", {
    method: "POST",
    headers: { "hook-name": name, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/hooks/tus pre-create", () => {
  it("rejects when no session cookie", async () => {
    const res = await POST(hookReq("pre-create", {
      Event: { Upload: { Size: 100, MetaData: { filename: "a.mp4" } },
               HTTPRequest: { Header: {} } },
    }));
    const body = await res.json();
    expect(body.RejectUpload).toBe(true);
    expect(body.HTTPResponse.StatusCode).toBe(401);
  });

  it("rejects when session is invalid", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const res = await POST(hookReq("pre-create", {
      Event: { Upload: { Size: 100, MetaData: { filename: "a.mp4" } },
               HTTPRequest: { Header: { Cookie: ["vv_session=bad"] } } },
    }));
    const body = await res.json();
    expect(body.RejectUpload).toBe(true);
    expect(body.HTTPResponse.StatusCode).toBe(401);
  });

  it("rejects when file size exceeds limit", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1" });
    const res = await POST(hookReq("pre-create", {
      Event: { Upload: { Size: 11 * 1024 ** 3, MetaData: { filename: "a.mp4" } },
               HTTPRequest: { Header: { Cookie: ["vv_session=ok"] } } },
    }));
    const body = await res.json();
    expect(body.RejectUpload).toBe(true);
    expect(body.HTTPResponse.StatusCode).toBe(413);
  });

  it("rejects when disk free is below threshold", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1" });
    freeBytes.mockResolvedValueOnce(1n * 1024n * 1024n * 1024n); // 1 GiB
    const res = await POST(hookReq("pre-create", {
      Event: { Upload: { Size: 1024, MetaData: { filename: "a.mp4" } },
               HTTPRequest: { Header: { Cookie: ["vv_session=ok"] } } },
    }));
    const body = await res.json();
    expect(body.RejectUpload).toBe(true);
    expect(body.HTTPResponse.StatusCode).toBe(507);
  });

  it("accepts valid pre-create and registers upload session", async () => {
    getSessionUser.mockResolvedValueOnce({ id: "u1" });
    freeBytes.mockResolvedValueOnce(100n * 1024n * 1024n * 1024n);
    registerUploadSession.mockResolvedValueOnce(undefined);
    const res = await POST(hookReq("pre-create", {
      Event: { Upload: { ID: "tus-1", Size: 1024, MetaData: { filename: "a.mp4" } },
               HTTPRequest: { Header: { Cookie: ["vv_session=ok"] } } },
    }));
    const body = await res.json();
    expect(body.RejectUpload).toBeFalsy();
    expect(registerUploadSession).toHaveBeenCalled();
  });
});

describe("POST /api/hooks/tus post-finish", () => {
  it("drops file into user home folder when no folderId metadata is supplied", async () => {
    getUploadSession.mockResolvedValueOnce({ tus_id: "tus-1", user_id: "u1", file_id: null });
    execFileMock.mockImplementationOnce((_cmd: string, _args: string[], cb: Function) => cb(null, "video/mp4\n"));
    getUserById.mockResolvedValueOnce({ id: "u1", username: "ryan" });
    getOrCreateUserHomeFolder.mockResolvedValueOnce("home-folder-id");
    insertFile.mockResolvedValueOnce({ id: "file-uuid" });
    attachTagToFile.mockResolvedValueOnce({ id: "t1", name: "ryan", created_at: new Date() });
    generateThumbnail.mockResolvedValueOnce({ width: 1920, height: 1080, durationSec: 5 });

    const res = await POST(hookReq("post-finish", {
      Event: {
        Upload: {
          ID: "tus-1",
          Size: 1024,
          Storage: { Type: "filestore", Path: "/data/tusd-tmp/tus-1" },
          MetaData: { filename: "great clip.mp4" },
        },
      },
    }));
    expect(res.status).toBe(200);
    expect(renameMock).toHaveBeenCalled();
    expect(getOrCreateUserHomeFolder).toHaveBeenCalledWith("u1", "ryan");
    expect(insertFile).toHaveBeenCalledWith(
      expect.objectContaining({
        uploaderId: "u1",
        folderId: "home-folder-id",
        originalName: "great clip.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1024,
      }),
    );
    expect(finalizeUploadSession).toHaveBeenCalledWith("tus-1", "file-uuid");
    expect(attachTagToFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/^[a-z0-9][a-z0-9-]{0,31}$/),
      expect.any(String),
    );
  });

  it("preserves leading-dot usernames (.ryan) as the home folder name — no hidden-folder logic", async () => {
    getUploadSession.mockResolvedValueOnce({ tus_id: "tus-dot", user_id: "u2", file_id: null });
    execFileMock.mockImplementationOnce((_cmd: string, _args: string[], cb: Function) => cb(null, "video/mp4\n"));
    getUserById.mockResolvedValueOnce({ id: "u2", username: ".ryan" });
    getOrCreateUserHomeFolder.mockResolvedValueOnce("dot-folder-id");
    insertFile.mockResolvedValueOnce({ id: "dot-file" });
    generateThumbnail.mockResolvedValueOnce(null);

    const res = await POST(hookReq("post-finish", {
      Event: {
        Upload: {
          ID: "tus-dot",
          Size: 100,
          Storage: { Type: "filestore", Path: "/data/tusd-tmp/tus-dot" },
          MetaData: { filename: "x.mp4" },
        },
      },
    }));
    expect(res.status).toBe(200);
    expect(getOrCreateUserHomeFolder).toHaveBeenCalledWith("u2", ".ryan");
    expect(insertFile).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: "dot-folder-id" }),
    );
  });

  it("returns 200 for unknown hook names (no-op)", async () => {
    const res = await POST(hookReq("post-create", {
      Event: { Upload: { ID: "x", Size: 1, MetaData: {} }, HTTPRequest: { Header: {} } },
    }));
    expect(res.status).toBe(200);
  });

  it("post-finish stores folder_id when metadata.folderId is a valid existing folder", async () => {
    const validFolderId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    getUploadSession.mockResolvedValueOnce({ tus_id: "tus-2", user_id: "u1", file_id: null });
    execFileMock.mockImplementationOnce((_cmd: string, _args: string[], cb: Function) => cb(null, "video/mp4\n"));
    folderExists.mockResolvedValueOnce(true);
    insertFile.mockResolvedValueOnce({ id: "file-uuid-2" });
    generateThumbnail.mockResolvedValueOnce(null);

    const res = await POST(hookReq("post-finish", {
      Event: {
        Upload: {
          ID: "tus-2",
          Size: 512,
          Storage: { Type: "filestore", Path: "/data/tusd-tmp/tus-2" },
          MetaData: { filename: "clip.mp4", folderId: validFolderId },
        },
      },
    }));
    expect(res.status).toBe(200);
    expect(folderExists).toHaveBeenCalledWith(validFolderId);
    expect(insertFile).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: validFolderId }),
    );
  });

  it("post-finish falls back to user home folder when metadata.folderId doesn't match an existing folder", async () => {
    const missingFolderId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    getUploadSession.mockResolvedValueOnce({ tus_id: "tus-3", user_id: "u1", file_id: null });
    execFileMock.mockImplementationOnce((_cmd: string, _args: string[], cb: Function) => cb(null, "video/mp4\n"));
    folderExists.mockResolvedValueOnce(false);
    getUserById.mockResolvedValueOnce({ id: "u1", username: "ryan" });
    getOrCreateUserHomeFolder.mockResolvedValueOnce("home-for-u1");
    insertFile.mockResolvedValueOnce({ id: "file-uuid-3" });
    generateThumbnail.mockResolvedValueOnce(null);

    const res = await POST(hookReq("post-finish", {
      Event: {
        Upload: {
          ID: "tus-3",
          Size: 512,
          Storage: { Type: "filestore", Path: "/data/tusd-tmp/tus-3" },
          MetaData: { filename: "clip.mp4", folderId: missingFolderId },
        },
      },
    }));
    expect(res.status).toBe(200);
    expect(folderExists).toHaveBeenCalledWith(missingFolderId);
    expect(insertFile).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: "home-for-u1" }),
    );
  });

  it("post-finish stores null folder when home-folder slot is already taken by another user", async () => {
    getUploadSession.mockResolvedValueOnce({ tus_id: "tus-4", user_id: "u1", file_id: null });
    execFileMock.mockImplementationOnce((_cmd: string, _args: string[], cb: Function) => cb(null, "video/mp4\n"));
    getUserById.mockResolvedValueOnce({ id: "u1", username: "ryan" });
    getOrCreateUserHomeFolder.mockResolvedValueOnce(null);
    insertFile.mockResolvedValueOnce({ id: "file-uuid-4" });
    generateThumbnail.mockResolvedValueOnce(null);

    const res = await POST(hookReq("post-finish", {
      Event: {
        Upload: {
          ID: "tus-4",
          Size: 512,
          Storage: { Type: "filestore", Path: "/data/tusd-tmp/tus-4" },
          MetaData: { filename: "clip.mp4" },
        },
      },
    }));
    expect(res.status).toBe(200);
    expect(insertFile).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: null }),
    );
  });
});
