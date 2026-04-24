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
