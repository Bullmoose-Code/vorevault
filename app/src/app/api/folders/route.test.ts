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

const createFolder = vi.fn();
vi.mock("@/lib/folders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/folders")>("@/lib/folders");
  return { ...actual, createFolder: (...a: unknown[]) => createFolder(...a) };
});

import { POST } from "./route";

function reqBody(body: unknown) {
  return new NextRequest(new URL("https://app.test/api/folders"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => { getCurrentUser.mockReset(); createFolder.mockReset(); });

describe("POST /api/folders", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const res = await POST(reqBody({ name: "Clips" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const res = await POST(reqBody({ name: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 on successful create", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    createFolder.mockResolvedValueOnce({
      id: "f1", name: "Clips", parent_id: null, created_by: "u1", created_at: new Date(),
    });
    const res = await POST(reqBody({ name: "Clips" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("f1");
    expect(body.name).toBe("Clips");
  });

  it("returns 409 on collision", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const { FolderCollisionError } = await import("@/lib/folders");
    createFolder.mockRejectedValueOnce(new FolderCollisionError("existing-id"));
    const res = await POST(reqBody({ name: "Clips" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.existingId).toBe("existing-id");
  });

  it("returns 404 when parent not found", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const { FolderNotFoundError } = await import("@/lib/folders");
    createFolder.mockRejectedValueOnce(new FolderNotFoundError("parent folder"));
    const res = await POST(reqBody({ name: "Clips", parentId: "ghost" }));
    expect(res.status).toBe(404);
  });
});
