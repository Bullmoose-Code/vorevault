import { pool } from "@/lib/db";

export type UploadBatchRow = {
  id: string;
  uploader_id: string;
  top_folder_id: string | null;
  created_at: Date;
};

export async function createUploadBatch(uploaderId: string): Promise<UploadBatchRow> {
  const { rows } = await pool.query<UploadBatchRow>(
    `INSERT INTO upload_batches (uploader_id) VALUES ($1)
     RETURNING id, uploader_id, top_folder_id, created_at`,
    [uploaderId],
  );
  return rows[0];
}

export async function setBatchTopFolder(batchId: string, folderId: string): Promise<void> {
  await pool.query(
    `UPDATE upload_batches SET top_folder_id = $1 WHERE id = $2`,
    [folderId, batchId],
  );
}

export async function getUploadBatch(batchId: string): Promise<UploadBatchRow | null> {
  const { rows } = await pool.query<UploadBatchRow>(
    `SELECT id, uploader_id, top_folder_id, created_at FROM upload_batches WHERE id = $1`,
    [batchId],
  );
  return rows[0] ?? null;
}

export async function stampFoldersWithBatch(
  batchId: string,
  folderIds: string[],
): Promise<void> {
  if (folderIds.length === 0) return;
  await pool.query(
    `UPDATE folders SET upload_batch_id = $1 WHERE id = ANY($2::uuid[]) AND upload_batch_id IS NULL`,
    [batchId, folderIds],
  );
}
