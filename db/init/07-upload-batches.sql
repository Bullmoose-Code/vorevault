CREATE TABLE IF NOT EXISTS upload_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  top_folder_id   uuid REFERENCES folders(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE files   ADD COLUMN IF NOT EXISTS upload_batch_id uuid REFERENCES upload_batches(id) ON DELETE SET NULL;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS upload_batch_id uuid REFERENCES upload_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS files_upload_batch_idx
  ON files   (upload_batch_id) WHERE upload_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS folders_upload_batch_idx
  ON folders (upload_batch_id) WHERE upload_batch_id IS NOT NULL;
