import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
});

async function getRoute() {
  const route = await import("./route");
  const auth = await import("@/lib/auth");
  return { GET: route.GET, getCurrentUser: vi.mocked(auth.getCurrentUser) };
}

describe("GET /api/auth/me", () => {
  it("returns 401 with {user:null} when no session", async () => {
    const { GET, getCurrentUser } = await getRoute();
    getCurrentUser.mockResolvedValue(null);
    const r = await GET();
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body).toEqual({ user: null });
  });

  it("returns 200 with the user when authenticated", async () => {
    const { GET, getCurrentUser } = await getRoute();
    getCurrentUser.mockResolvedValue({
      id: "user-1",
      username: "alice",
      is_admin: false,
    } as never);
    const r = await GET();
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({
      user: { id: "user-1", username: "alice", is_admin: false },
    });
  });

  it("returns is_admin: true for admin users", async () => {
    const { GET, getCurrentUser } = await getRoute();
    getCurrentUser.mockResolvedValue({
      id: "admin-1",
      username: "ryan",
      is_admin: true,
    } as never);
    const r = await GET();
    const body = await r.json();
    expect(body.user.is_admin).toBe(true);
  });
});
