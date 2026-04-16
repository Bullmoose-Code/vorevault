import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";

let pg: PgFixture;

vi.mock("@/lib/db", () => {
  const pgLib = require("pg") as typeof import("pg");
  let pool: import("pg").Pool | undefined;
  return {
    pool: {
      query: (text: string, params?: unknown[]) => {
        if (!pool) pool = new pgLib.Pool({ connectionString: process.env.TEST_PG_URL, max: 2 });
        return pool.query(text, params);
      },
    },
  };
});

beforeAll(async () => {
  pg = await startPg();
  process.env.TEST_PG_URL = pg.container.getConnectionUri();
});
afterAll(async () => { await stopPg(pg); });
beforeEach(async () => { await pg.pool.query("TRUNCATE users RESTART IDENTITY CASCADE"); });

describe("upsertUserFromDiscord", () => {
  it("inserts a new user on first login", async () => {
    const { upsertUserFromDiscord } = await import("./users");
    const u = await upsertUserFromDiscord({ id: "12345", username: "ryan", avatar: "abc" });
    expect(u.discord_id).toBe("12345");
    expect(u.username).toBe("ryan");
    expect(u.avatar_url).toBe("https://cdn.discordapp.com/avatars/12345/abc.png");
    expect(u.last_login_at).toBeInstanceOf(Date);
  });

  it("updates username/avatar/last_login on subsequent logins", async () => {
    const { upsertUserFromDiscord } = await import("./users");
    await upsertUserFromDiscord({ id: "12345", username: "ryan", avatar: "abc" });
    const u2 = await upsertUserFromDiscord({ id: "12345", username: "ryan2", avatar: null });
    expect(u2.username).toBe("ryan2");
    expect(u2.avatar_url).toBeNull();
  });
});
