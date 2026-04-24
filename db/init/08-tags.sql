CREATE TABLE IF NOT EXISTS tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE
             CHECK (name ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS file_tags (
  file_id    uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (file_id, tag_id)
);

CREATE INDEX IF NOT EXISTS file_tags_tag_id_idx  ON file_tags (tag_id);
CREATE INDEX IF NOT EXISTS file_tags_file_id_idx ON file_tags (file_id);
