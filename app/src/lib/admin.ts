import { pool } from "@/lib/db";

export type AdminUserRow = {
  id: string;
  discord_id: string;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
  is_banned: boolean;
  created_at: Date;
  last_login_at: Date | null;
  file_count: number;
  total_bytes: number;
};

export type DiskUsage = {
  total_files: number;
  total_bytes: number;
  pending_transcode: number;
  deleted_pending_cleanup: number;
};

export async function listAllUsers(): Promise<AdminUserRow[]> {
  const { rows } = await pool.query<AdminUserRow>(
    `SELECT u.*,
            count(f.id)::int AS file_count,
            coalesce(sum(f.size_bytes), 0)::bigint AS total_bytes
     FROM users u
     LEFT JOIN files f ON f.uploader_id = u.id AND f.deleted_at IS NULL
     GROUP BY u.id
     ORDER BY u.created_at ASC`,
  );
  return rows;
}

export async function getDiskUsage(): Promise<DiskUsage> {
  const { rows } = await pool.query<{
    total_files: string;
    total_bytes: string;
    pending_transcode: string;
    deleted_pending_cleanup: string;
  }>(
    `SELECT
       count(*) FILTER (WHERE deleted_at IS NULL)::text AS total_files,
       coalesce(sum(size_bytes) FILTER (WHERE deleted_at IS NULL), 0)::text AS total_bytes,
       count(*) FILTER (WHERE transcode_status = 'pending' AND deleted_at IS NULL)::text AS pending_transcode,
       count(*) FILTER (WHERE deleted_at IS NOT NULL)::text AS deleted_pending_cleanup
     FROM files`,
  );
  const r = rows[0];
  return {
    total_files: parseInt(r.total_files, 10),
    total_bytes: parseInt(r.total_bytes, 10),
    pending_transcode: parseInt(r.pending_transcode, 10),
    deleted_pending_cleanup: parseInt(r.deleted_pending_cleanup, 10),
  };
}

export async function toggleBan(userId: string, banned: boolean): Promise<void> {
  await pool.query(`UPDATE users SET is_banned = $1 WHERE id = $2`, [banned, userId]);
  if (banned) {
    await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  }
}
