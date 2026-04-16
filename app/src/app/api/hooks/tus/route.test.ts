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
vi.mock("@/lib/files", () => ({
  insertFile: (...a: unknown[]) => insertFile(...a),
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
  it("moves file, sniffs MIME, inserts files row, generates thumb, finalizes session", async () => {
    getUploadSession.mockResolvedValueOnce({ tus_id: "tus-1", user_id: "u1", file_id: null });
    execFileMock.mockImplementationOnce((_cmd: string, _args: string[], cb: Function) => cb(null, "video/mp4\n"));
    insertFile.mockResolvedValueOnce({ id: "file-uuid" });
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
    expect(insertFile).toHaveBeenCalledWith(
      expect.objectContaining({
        uploaderId: "u1",
        originalName: "great clip.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1024,
      }),
    );
    expect(generateThumbnail).toHaveBeenCalled();
    expect(finalizeUploadSession).toHaveBeenCalledWith("tus-1", "file-uuid");
  });

  it("returns 200 for unknown hook names (no-op)", async () => {
    const res = await POST(hookReq("post-create", {
      Event: { Upload: { ID: "x", Size: 1, MetaData: {} }, HTTPRequest: { Header: {} } },
    }));
    expect(res.status).toBe(200);
  });
});
