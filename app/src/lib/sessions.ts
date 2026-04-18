import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db";
import type { UserRow } from "@/lib/users";

// 30 days. Sliding window: getSessionUser pushes expires_at forward on every
// successful lookup, so active users stay signed in indefinitely; dormant
// sessions die after 30 days of no use.
export const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_SEC * 1000;

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
  const newExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const { rows } = await pool.query<UserRow>(
    `WITH upd AS (
       UPDATE sessions
          SET expires_at = $2
        WHERE id = $1 AND expires_at > now()
       RETURNING user_id
     )
     SELECT u.* FROM upd
     JOIN users u ON u.id = upd.user_id
     WHERE u.is_banned = false`,
    [sessionId, newExpiresAt],
  );
  return rows[0] ?? null;
}

export async function destroySession(sessionId: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
}
