import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "./pg";

describe("testcontainer Postgres", () => {
  let pg: PgFixture;
  beforeAll(async () => { pg = await startPg(); });
  afterAll(async () => { await stopPg(pg); });

  it("connects and runs a query", async () => {
    const result = await pg.pool.query<{ ok: number }>("SELECT 1::int AS ok");
    expect(result.rows[0].ok).toBe(1);
  });
});
