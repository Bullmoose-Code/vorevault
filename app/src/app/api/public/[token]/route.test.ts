import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getShareLink = vi.fn();
vi.mock("@/lib/share-links", () => ({
  getShareLink: (...a: unknown[]) => getShareLink(...a),
}));

const getFile = vi.fn();
vi.mock("@/lib/files", () => ({
  getFile: (...a: unknown[]) => getFile(...a),
}));

const statMock = vi.fn();
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, stat: (...a: unknown[]) => statMock(...a) };
});

vi.mock("node:fs", () => ({
  createReadStream: () => {
    const { Readable } = require("node:stream");
    return Readable.from(Buffer.from("fake"));
  },
}));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/public/[token]", () => {
  it("returns 404 for invalid/revoked/expired token", async () => {
    getShareLink.mockResolvedValueOnce(null);
    const res = await GET(
      new NextRequest("https://app.test/api/public/badtoken"),
      { params: Promise.resolve({ token: "badtoken" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when file is soft-deleted", async () => {
    getShareLink.mockResolvedValueOnce({ token: "tok", file_id: "f1" });
    getFile.mockResolvedValueOnce(null);
    const res = await GET(
      new NextRequest("https://app.test/api/public/tok"),
      { params: Promise.resolve({ token: "tok" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 410 when file missing from disk", async () => {
    getShareLink.mockResolvedValueOnce({ token: "tok", file_id: "f1" });
    getFile.mockResolvedValueOnce({ id: "f1", storage_path: "/x", transcoded_path: null, mime_type: "video/mp4", original_name: "a.mp4" });
    statMock.mockRejectedValueOnce(new Error("ENOENT"));
    const res = await GET(
      new NextRequest("https://app.test/api/public/tok"),
      { params: Promise.resolve({ token: "tok" }) },
    );
    expect(res.status).toBe(410);
  });

  it("streams the file on valid token (full response)", async () => {
    getShareLink.mockResolvedValueOnce({ token: "tok", file_id: "f1" });
    getFile.mockResolvedValueOnce({ id: "f1", storage_path: "/x", transcoded_path: null, mime_type: "video/mp4", original_name: "a.mp4" });
    statMock.mockResolvedValueOnce({ size: 100 });
    const res = await GET(
      new NextRequest("https://app.test/api/public/tok"),
      { params: Promise.resolve({ token: "tok" }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
  });
});
