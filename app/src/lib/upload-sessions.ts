import { pool } from "@/lib/db";

export type UploadSessionRow = {
  tus_id: string;
  user_id: string;
  created_at: Date;
  file_id: string | null;
};

export async function registerUploadSession(
  tusId: string,
  userId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO upload_sessions (tus_id, user_id) VALUES ($1, $2)
     ON CONFLICT (tus_id) DO NOTHING`,
    [tusId, userId],
  );
}

export async function finalizeUploadSession(
  tusId: string,
  fileId: string,
): Promise<void> {
  await pool.query(
    `UPDATE upload_sessions SET file_id = $1 WHERE tus_id = $2`,
    [fileId, tusId],
  );
}

export async function getUploadSession(
  tusId: string,
): Promise<UploadSessionRow | null> {
  const { rows } = await pool.query<UploadSessionRow>(
    `SELECT * FROM upload_sessions WHERE tus_id = $1`,
    [tusId],
  );
  return rows[0] ?? null;
}
