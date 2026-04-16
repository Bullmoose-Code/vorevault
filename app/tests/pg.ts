import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const INIT_DIR = path.resolve(__dirname, "../../db/init");

export type PgFixture = {
  container: StartedPostgreSqlContainer;
  pool: Pool;
};

export async function startPg(): Promise<PgFixture> {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const pool = new Pool({ connectionString: container.getConnectionUri(), max: 4 });
  for (const file of readdirSync(INIT_DIR).sort()) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(path.join(INIT_DIR, file), "utf8");
    await pool.query(sql);
  }
  return { container, pool };
}

export async function stopPg(fixture: PgFixture): Promise<void> {
  await fixture.pool.end();
  await fixture.container.stop();
}
