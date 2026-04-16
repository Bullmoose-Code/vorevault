import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db";
import type { UserRow } from "@/lib/users";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type SessionRow = {
  id: string;
  user_id: string;
  created_at: Date;
  expires_at: Date;
  user_agent: string | null;
};

export async function createSession(
  userId: string,
  userAgent: string | null,
): Promise<SessionRow> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const { rows } = await pool.query<SessionRow>(
    `INSERT INTO sessions (id, user_id, expires_at, user_agent)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, userId, expiresAt, userAgent],
  );
  return rows[0];
}

export async function getSessionUser(sessionId: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    `SELECT u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1
       AND s.expires_at > now()
       AND u.is_banned = false`,
    [sessionId],
  );
  return rows[0] ?? null;
}

export async function destroySession(sessionId: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
}
