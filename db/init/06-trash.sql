-- Add soft-delete to folders (files already have deleted_at).
-- Partial index keeps lookups of trashed items cheap without bloating the main index.
ALTER TABLE folders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS folders_deleted_at_idx
  ON folders (deleted_at) WHERE deleted_at IS NOT NULL;

-- The existing folders_parent_idx stays as-is. Active-folder lookups are still
-- fast because every app-level query pairs parent_id filtering with
-- `AND deleted_at IS NULL`.

-- The sibling-uniqueness index must ignore trashed rows so a trashed "foo"
-- doesn't block creating a new active "foo" in the same parent.
DROP INDEX IF EXISTS folders_parent_name_ci_idx;
CREATE UNIQUE INDEX IF NOT EXISTS folders_parent_name_ci_idx
  ON folders (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(name))
  WHERE deleted_at IS NULL;
