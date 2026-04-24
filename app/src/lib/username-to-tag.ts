export function usernameToTag(raw: string): string | null {
  const scrubbed = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!scrubbed) return null;
  const capped = scrubbed.slice(0, 32).replace(/^-+|-+$/g, "");
  return capped || null;
}
