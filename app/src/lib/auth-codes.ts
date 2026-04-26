import { createHash, randomBytes } from "node:crypto";
import { pool } from "@/lib/db";

const CODE_TTL_SEC = 60;

/**
 * Create a single-use auth code bound to a session and a PKCE code_challenge.
 * Returns the auth code string (43-char base64url, 32 bytes of entropy).
 */
export async function createAuthCode(
  sessionId: string,
  codeChallenge: string,
): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CODE_TTL_SEC * 1000);
  await pool.query(
    `INSERT INTO auth_codes (code, code_challenge, session_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [code, codeChallenge, sessionId, expiresAt],
  );
  // Opportunistic cleanup: ~1% of inserts also sweep expired+used rows.
  // Keeps the table from growing forever without needing cron infrastructure.
  // The auth_codes_expires_at_idx makes this O(deleted_rows).
  if (Math.random() < 0.01) {
    await pool.query(
      `DELETE FROM auth_codes
        WHERE expires_at < now() - interval '1 day'
           OR (used_at IS NOT NULL AND used_at < now() - interval '1 day')`,
    );
  }
  return code;
}

/**
 * Exchange an auth code for the session it represents. Returns the session id
 * on success, or null on any failure (code missing / expired / already used /
 * verifier doesn't match the stored challenge).
 *
 * Uses an UPDATE...WHERE used_at IS NULL...RETURNING construction so the
 * single-use guarantee is enforced by the database, not the application.
 */
export async function exchangeAuthCode(
  code: string,
  codeVerifier: string,
): Promise<{ sessionId: string } | null> {
  const computedChallenge = sha256Base64Url(codeVerifier);
  const { rows } = await pool.query<{ session_id: string }>(
    `UPDATE auth_codes
        SET used_at = now()
      WHERE code = $1
        AND code_challenge = $2
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING session_id`,
    [code, computedChallenge],
  );
  if (rows.length === 0) return null;
  return { sessionId: rows[0].session_id };
}

/**
 * SHA256 the input as UTF-8 bytes, base64url-encode the digest with no padding.
 * Matches the standard PKCE S256 transform (RFC 7636 §4.2).
 */
export function sha256Base64Url(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("base64url");
}
