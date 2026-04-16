CREATE TABLE IF NOT EXISTS share_links (
  token       text PRIMARY KEY,
  file_id     uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  revoked_at  timestamptz
);

CREATE INDEX IF NOT EXISTS share_links_file_id_idx ON share_links (file_id);
