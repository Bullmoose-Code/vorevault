import { open } from "node:fs/promises";

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

export type TextPreviewResult = {
  text: string;
  truncated: boolean;
  error?: boolean;
};

export async function readTextPreview(
  absPath: string,
  capBytes: number,
): Promise<TextPreviewResult> {
  let handle;
  try {
    handle = await open(absPath, "r");
  } catch {
    return { text: "", truncated: false, error: true };
  }
  try {
    const buf = Buffer.alloc(capBytes);
    const { bytesRead } = await handle.read(buf, 0, capBytes, 0);
    const text = buf.slice(0, bytesRead).toString("utf8");
    // If we filled the buffer completely, there may be more
    const stat = await handle.stat();
    const truncated = stat.size > bytesRead;
    return { text, truncated };
  } finally {
    await handle.close();
  }
}
