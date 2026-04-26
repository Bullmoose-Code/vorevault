import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "./route";

const getCurrentUserMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

beforeEach(() => {
  getCurrentUserMock.mockReset();
});

describe("GET /api/auth/me", () => {
  it("returns 401 with {user:null} when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const r = await GET();
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body).toEqual({ user: null });
  });

  it("returns 200 with the user when authenticated", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      username: "alice",
      is_admin: false,
    });
    const r = await GET();
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({
      user: { id: "user-1", username: "alice", is_admin: false },
    });
  });

  it("returns is_admin: true for admin users", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "admin-1",
      username: "ryan",
      is_admin: true,
    });
    const r = await GET();
    const body = await r.json();
    expect(body.user.is_admin).toBe(true);
  });
});
