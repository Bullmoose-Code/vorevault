const ALLOWED_EXACT = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-yaml",
  "application/x-sh",
  "application/x-toml",
]);
const DISALLOWED_TEXT_SUBTYPES = new Set(["html"]);

export function isPreviewableTextMime(mime: string): boolean {
  if (!mime) return false;
  const lower = mime.toLowerCase();
  if (lower.startsWith("text/")) {
    const subtype = lower.slice(5).split(";")[0];
    return !DISALLOWED_TEXT_SUBTYPES.has(subtype);
  }
  return ALLOWED_EXACT.has(lower.split(";")[0]);
}
