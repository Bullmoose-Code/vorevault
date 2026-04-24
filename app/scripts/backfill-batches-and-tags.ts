import type { Pool } from "pg";
import { usernameToTag } from "../src/lib/username-to-tag";
import { normalizeTagName } from "../src/lib/tags";

/**
 * One-time migration:
 *  - Pass 1: detect time-clustered top-level folders, create batch rows, stamp
 *    descendants within the time window.
 *  - Pass 2: auto-tag every live file with its uploader's normalized username.
 * Safe to re-run.
 */
export async function runBackfill(pool: Pool): Promise<void> {
  // Pass 1 — batch backfill
  const candidates = await pool.query<{
    folder_id: string;
    created_at: Date;
    created_by: string;
    clustered_count: number;
  }>(
    `SELECT f.id AS folder_id, f.created_at, f.created_by,
            (SELECT count(*)::int FROM files x
              WHERE x.folder_id = f.id
                AND x.deleted_at IS NULL
                AND x.created_at BETWEEN f.created_at - interval '60 seconds'
                                     AND f.created_at + interval '60 seconds'
            ) AS clustered_count
       FROM folders f
      WHERE f.parent_id IS NULL
        AND f.deleted_at IS NULL
        AND f.upload_batch_id IS NULL`,
  );

  for (const c of candidates.rows) {
    if (c.clustered_count < 2) continue;

    const batch = await pool.query<{ id: string }>(
      `INSERT INTO upload_batches (uploader_id, top_folder_id, created_at)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [c.created_by, c.folder_id, c.created_at],
    );
    const batchId = batch.rows[0].id;

    await pool.query(
      `UPDATE folders SET upload_batch_id = $1 WHERE id = $2 AND upload_batch_id IS NULL`,
      [batchId, c.folder_id],
    );

    await pool.query(
      `WITH RECURSIVE tree(id) AS (
         SELECT id FROM folders WHERE parent_id = $2
         UNION ALL
         SELECT fo.id FROM folders fo JOIN tree ON fo.parent_id = tree.id
       )
       UPDATE folders SET upload_batch_id = $1
        WHERE id IN (SELECT id FROM tree)
          AND upload_batch_id IS NULL
          AND created_at BETWEEN $3 - interval '60 seconds'
                             AND $3 + interval '60 seconds'`,
      [batchId, c.folder_id, c.created_at],
    );

    await pool.query(
      `WITH RECURSIVE tree(id) AS (
         SELECT id FROM folders WHERE id = $2
         UNION ALL
         SELECT fo.id FROM folders fo JOIN tree ON fo.parent_id = tree.id
       )
       UPDATE files SET upload_batch_id = $1
        WHERE folder_id IN (SELECT id FROM tree)
          AND upload_batch_id IS NULL
          AND created_at BETWEEN $3 - interval '60 seconds'
                             AND $3 + interval '60 seconds'`,
      [batchId, c.folder_id, c.created_at],
    );
  }

  // Pass 2 — auto-tag every live file with uploader's username tag
  const files = await pool.query<{
    file_id: string;
    uploader_id: string;
    username: string;
  }>(
    `SELECT f.id AS file_id, f.uploader_id, u.username
       FROM files f JOIN users u ON u.id = f.uploader_id
      WHERE f.deleted_at IS NULL`,
  );
  for (const r of files.rows) {
    const tagName = usernameToTag(r.username);
    if (!tagName) continue;
    let normalized: string;
    try {
      normalized = normalizeTagName(tagName);
    } catch {
      continue;
    }

    const tag = await pool.query<{ id: string }>(
      `INSERT INTO tags (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
      [normalized],
    );
    await pool.query(
      `INSERT INTO file_tags (file_id, tag_id, created_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [r.file_id, tag.rows[0].id, r.uploader_id],
    );
  }
}

// CLI entry: `cd app && npx tsx scripts/backfill-batches-and-tags.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const { pool } = await import("../src/lib/db");
    console.log("running backfill…");
    await runBackfill(pool as unknown as Pool);
    console.log("done.");
    process.exit(0);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
