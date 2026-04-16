CREATE TABLE IF NOT EXISTS files (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  original_name     text NOT NULL,
  mime_type         text NOT NULL,
  size_bytes        bigint NOT NULL,
  storage_path      text NOT NULL,
  transcoded_path   text,
  thumbnail_path    text,
  transcode_status  text NOT NULL DEFAULT 'pending',
  duration_sec      int,
  width             int,
  height            int,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS files_created_at_idx ON files (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS files_uploader_idx ON files (uploader_id);

CREATE TABLE IF NOT EXISTS upload_sessions (
  tus_id      text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  file_id     uuid REFERENCES files(id) ON DELETE SET NULL
);
