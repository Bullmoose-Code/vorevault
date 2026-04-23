export type FileKind =
  | "video"
  | "audio"
  | "image"
  | "document"
  | "code"
  | "archive"
  | "executable"
  | "disk-image"
  | "font"
  | "data"
  | "other";

export type FileClassification = { kind: FileKind; label: string };

// Extension → kind map. Extension-first precedence because uploads often
// arrive as `application/octet-stream` when `file --mime-type` can't detect.
const EXT_KIND: Record<string, FileKind> = {
  // video
  mp4: "video", webm: "video", mov: "video", mkv: "video", avi: "video", m4v: "video",
  // audio
  mp3: "audio", wav: "audio", flac: "audio", ogg: "audio", m4a: "audio", opus: "audio", aac: "audio",
  // image
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
  heic: "image", heif: "image", bmp: "image", svg: "image", avif: "image",
  // document
  pdf: "document", doc: "document", docx: "document", xls: "document", xlsx: "document",
  ppt: "document", pptx: "document", txt: "document", md: "document", rtf: "document",
  epub: "document",
  // code
  js: "code", mjs: "code", cjs: "code", ts: "code", tsx: "code", jsx: "code",
  py: "code", rb: "code", go: "code", rs: "code", c: "code", h: "code",
  cpp: "code", hpp: "code", cc: "code", java: "code", cs: "code", php: "code",
  html: "code", htm: "code", css: "code", scss: "code", sass: "code",
  sh: "code", bash: "code", zsh: "code", fish: "code", yaml: "code", yml: "code",
  toml: "code", sql: "code", lua: "code", swift: "code", kt: "code", kts: "code",
  // archive
  zip: "archive", tar: "archive", "7z": "archive", rar: "archive", gz: "archive",
  bz2: "archive", xz: "archive", tgz: "archive",
  // executable
  exe: "executable", msi: "executable", deb: "executable", rpm: "executable",
  apk: "executable", app: "executable",
  // disk-image
  iso: "disk-image", img: "disk-image", dmg: "disk-image",
  vhd: "disk-image", vhdx: "disk-image", vmdk: "disk-image", qcow2: "disk-image",
  // font
  ttf: "font", otf: "font", woff: "font", woff2: "font", eot: "font",
  // data
  json: "data", csv: "data", tsv: "data", xml: "data",
  ndjson: "data", jsonl: "data", parquet: "data",
};

function kindFromMime(mime: string): FileKind | null {
  const m = mime.toLowerCase();
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("font/")) return "font";
  if (m === "application/pdf") return "document";
  if (m === "application/msword") return "document";
  if (m === "application/epub+zip") return "document";
  if (m.startsWith("application/vnd.openxmlformats-officedocument")) return "document";
  if (m === "text/plain" || m === "text/markdown" || m === "text/rtf") return "document";
  if (m === "application/zip") return "archive";
  if (m === "application/x-tar" || m === "application/gzip") return "archive";
  if (m === "application/x-7z-compressed" || m === "application/x-rar-compressed") return "archive";
  if (m === "application/x-bzip2") return "archive";
  if (m === "application/x-msdownload") return "executable";
  if (m === "application/vnd.microsoft.portable-executable") return "executable";
  if (m === "application/vnd.android.package-archive") return "executable";
  if (m === "application/x-iso9660-image") return "disk-image";
  if (m === "application/x-apple-diskimage") return "disk-image";
  if (m === "application/font-woff" || m === "application/vnd.ms-fontobject") return "font";
  if (m === "application/json") return "data";
  if (m === "text/csv" || m === "text/tab-separated-values") return "data";
  if (m === "application/xml" || m === "text/xml") return "data";
  if (m.startsWith("text/x-") || m === "text/html" || m === "text/css" || m === "text/javascript") return "code";
  return null;
}

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

function cleanMimeSubtype(mime: string): string {
  const slash = mime.indexOf("/");
  let sub = slash >= 0 ? mime.slice(slash + 1) : mime;
  sub = sub.replace(/^x-/, "").replace(/^vnd\./, "");
  const cut = sub.search(/[^a-zA-Z0-9]/);
  if (cut >= 0) sub = sub.slice(0, cut);
  return sub.toUpperCase().slice(0, 5);
}

export function classifyFile(mime: string, filename: string): FileClassification {
  const ext = extOf(filename);

  // 1. Extension-based kind (most reliable).
  const extKind = ext ? EXT_KIND[ext] : undefined;
  if (extKind) {
    return { kind: extKind, label: ext.toUpperCase() };
  }

  // 2. MIME-based kind; label from extension if any, else from MIME subtype.
  const mimeKind = kindFromMime(mime);
  if (mimeKind) {
    const label = ext ? ext.toUpperCase() : cleanMimeSubtype(mime) || "FILE";
    return { kind: mimeKind, label };
  }

  // 3. Unknown. Label: extension > octet-stream special case > cleaned MIME subtype > "FILE".
  if (ext) return { kind: "other", label: ext.toUpperCase() };
  if (filename.length === 0) return { kind: "other", label: "FILE" };
  if (mime.toLowerCase() === "application/octet-stream") return { kind: "other", label: "BIN" };
  return { kind: "other", label: cleanMimeSubtype(mime) || "FILE" };
}
