import { Pool, type QueryResult, type QueryResultRow, type PoolClient } from "pg";

let _pool: Pool | undefined;

function getPool(): Pool {
  if (_pool) return _pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  _pool = new Pool({ connectionString, max: 10 });
  return _pool;
}

export const pool = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return getPool().query<T>(text, params);
  },
  connect(): Promise<PoolClient> {
    return getPool().connect();
  },
};
