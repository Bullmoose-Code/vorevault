export class TagNameError extends Error {
  constructor(message: string) { super(message); this.name = "TagNameError"; }
}

const TAG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function normalizeTagName(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (!lower) throw new TagNameError("tag name is empty");
  if (lower.length > 32) throw new TagNameError("tag name is longer than 32 chars");
  if (!TAG_RE.test(lower)) {
    throw new TagNameError(
      "tag names must be lowercase letters, digits, or hyphens, and can't start with a hyphen",
    );
  }
  return lower;
}

import { pool } from "@/lib/db";

export type Tag = { id: string; name: string; created_at: Date };
export type TagWithCount = Tag & { file_count: number };

export async function attachTagToFile(
  fileId: string,
  rawName: string,
  actorUserId: string,
): Promise<Tag> {
  const name = normalizeTagName(rawName);
  const up = await pool.query<Tag>(
    `INSERT INTO tags (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, created_at`,
    [name],
  );
  const tag = up.rows[0];
  await pool.query(
    `INSERT INTO file_tags (file_id, tag_id, created_by)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [fileId, tag.id, actorUserId],
  );
  return tag;
}

export async function detachTagFromFileById(fileId: string, tagId: string): Promise<void> {
  await pool.query(
    `DELETE FROM file_tags WHERE file_id = $1 AND tag_id = $2`,
    [fileId, tagId],
  );
}

export async function listTagsForFile(fileId: string): Promise<Tag[]> {
  const { rows } = await pool.query<Tag>(
    `SELECT t.id, t.name, t.created_at
       FROM tags t JOIN file_tags ft ON ft.tag_id = t.id
      WHERE ft.file_id = $1
      ORDER BY t.name ASC`,
    [fileId],
  );
  return rows;
}

export async function listAllTagsWithCounts(): Promise<TagWithCount[]> {
  const { rows } = await pool.query<TagWithCount>(
    `SELECT t.id, t.name, t.created_at,
            COALESCE(
              (SELECT count(*)::int FROM file_tags ft
                 JOIN files f ON f.id = ft.file_id
                WHERE ft.tag_id = t.id AND f.deleted_at IS NULL),
              0
            ) AS file_count
       FROM tags t
       ORDER BY t.name ASC`,
  );
  return rows;
}
