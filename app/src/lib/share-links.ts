import { randomBytes } from "node:crypto";
import { pool } from "@/lib/db";

export type ShareLinkRow = {
  token: string;
  file_id: string;
  created_by: string;
  created_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
};

function generateToken(): string {
  return randomBytes(16).toString("base64url");
}

export async function createShareLink(
  fileId: string,
  createdBy: string,
  expiresAt?: Date | null,
): Promise<ShareLinkRow> {
  const token = generateToken();
  const { rows } = await pool.query<ShareLinkRow>(
    `INSERT INTO share_links (token, file_id, created_by, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [token, fileId, createdBy, expiresAt ?? null],
  );
  return rows[0];
}

export async function getShareLink(token: string): Promise<ShareLinkRow | null> {
  const { rows } = await pool.query<ShareLinkRow>(
    `SELECT * FROM share_links
     WHERE token = $1
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())`,
    [token],
  );
  return rows[0] ?? null;
}

export async function getActiveShareLink(fileId: string): Promise<ShareLinkRow | null> {
  const { rows } = await pool.query<ShareLinkRow>(
    `SELECT * FROM share_links
     WHERE file_id = $1
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY created_at DESC LIMIT 1`,
    [fileId],
  );
  return rows[0] ?? null;
}

export async function revokeShareLink(token: string): Promise<void> {
  await pool.query(
    `UPDATE share_links SET revoked_at = now() WHERE token = $1`,
    [token],
  );
}

export async function revokeAllForFile(fileId: string): Promise<void> {
  await pool.query(
    `UPDATE share_links SET revoked_at = now()
     WHERE file_id = $1 AND revoked_at IS NULL`,
    [fileId],
  );
}
