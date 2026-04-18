-- Folders: shared organizational hierarchy over the file pool.
-- parent_id IS NULL means top-level. ON DELETE RESTRICT blocks raw cascade
-- deletes; all folder removal goes through the app, which implements the
-- orphan-to-parent semantics in a transaction.

CREATE TABLE IF NOT EXISTS folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
  parent_id   uuid REFERENCES folders(id) ON DELETE RESTRICT,
  created_by  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive sibling uniqueness. The COALESCE maps NULL (root) to a
-- sentinel UUID so top-level folders participate in the uniqueness check.
CREATE UNIQUE INDEX IF NOT EXISTS folders_parent_name_ci_idx
  ON folders (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(name));

CREATE INDEX IF NOT EXISTS folders_parent_idx ON folders (parent_id);

-- Files gain an optional folder pointer. ON DELETE SET NULL is a safety net
-- for any deletion path that bypasses the app's orphan-to-parent logic.
ALTER TABLE files ADD COLUMN IF NOT EXISTS folder_id uuid
  REFERENCES folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS files_folder_idx
  ON files (folder_id) WHERE deleted_at IS NULL;

-- Trigram search indexes on the three fields our search matches.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS files_name_trgm_idx
  ON files   USING gin (original_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS folders_name_trgm_idx
  ON folders USING gin (name          gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_name_trgm_idx
  ON users   USING gin (username      gin_trgm_ops);
