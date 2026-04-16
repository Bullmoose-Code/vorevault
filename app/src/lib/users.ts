import { pool } from "@/lib/db";

export type DiscordProfile = {
  id: string;
  username: string;
  avatar: string | null;
};

export type UserRow = {
  id: string;
  discord_id: string;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
  is_banned: boolean;
  created_at: Date;
  last_login_at: Date | null;
};

function avatarUrl(id: string, hash: string | null): string | null {
  return hash ? `https://cdn.discordapp.com/avatars/${id}/${hash}.png` : null;
}

export async function upsertUserFromDiscord(profile: DiscordProfile): Promise<UserRow> {
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (discord_id, username, avatar_url, last_login_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (discord_id) DO UPDATE
       SET username = EXCLUDED.username,
           avatar_url = EXCLUDED.avatar_url,
           last_login_at = now()
     RETURNING *`,
    [profile.id, profile.username, avatarUrl(profile.id, profile.avatar)],
  );
  return rows[0];
}
