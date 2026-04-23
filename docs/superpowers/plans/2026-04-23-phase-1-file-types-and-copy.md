# Phase 1: File-Type Intelligence + Copy Generalization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make VoreVault honest about being a general file vault (not just a clip archive). Add a pure `fileKind` classifier, a hand-authored per-kind SVG icon set, variant rendering on `FileCard` so non-video files no longer masquerade as video tiles, a visible focus-ring pass, and a user-facing copy sweep from "clips" → "files."

**Architecture:** Pure TS helper `lib/fileKind.ts` classifies `(mime, filename)` → `{ kind, label }`. New `<FileIcon kind={...} />` component renders one of 11 hand-authored inline SVGs using `currentColor`. `<FileCard>` keeps its uniform 16:10 grid shape but switches on `kind`: real thumbnail if present, otherwise a colored tile with icon + type label. No new runtime deps (project bans icon libraries per `DESIGN.md`/design system rules). All logic is unit-tested with Vitest/jsdom, matching existing component test patterns.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, CSS Modules with `--vv-*` tokens, Vitest + jsdom + @testing-library/react.

**Branch:** `feat/phase-1-file-types` — branch off `main`.

---

## File Structure

**Created:**
- `app/src/lib/fileKind.ts` — pure classifier: `classifyFile(mime, filename) → { kind, label }`.
- `app/src/lib/fileKind.test.ts` — unit tests covering each kind, vendored MIME types, extension fallback, and unknown input.
- `app/src/components/FileIcon.tsx` — single component, `kind` + `size` props, returns inline SVG with `aria-label`.
- `app/src/components/FileIcon.module.css` — minimal; svg sizing + `currentColor`.
- `app/src/components/FileIcon.test.tsx` — renders each kind, asserts aria-label and svg present.

**Modified:**
- `app/src/components/FileCard.tsx` — use `classifyFile`; render icon-forward tile when no thumbnail; drop `typeBadge()` 4-char slice hack and `tileClass()` random color hack; duration badge gated to `video`/`audio`.
- `app/src/components/FileCard.module.css` — new `.iconTile` + per-kind background tokens; add `:focus-visible` ring.
- `app/src/components/FolderTile.module.css` — add `:focus-visible` ring (same pattern).
- `app/src/components/FileCard.test.tsx` — new file; covers thumbnail present, icon tile fallback, duration gating per kind, label derivation.
- `app/src/app/(shell)/page.tsx` — "clips" → "files" in 3 user-facing strings (L47, L73, L87).
- `app/src/app/layout.tsx` — `metadata.description` from `"The Bullmoose clip archive"` → `"The Bullmoose file archive"`.
- `app/src/app/login/page.tsx` — tagline `"the bullmoose clip archive"` → `"the bullmoose file archive"`.

**Not modified (intentionally):**
- `DESIGN.md` — line 6 already reads "file/clip" (general enough). No change.
- `README.md` — line 3 already reads "file and clip sharing" (general enough). No change.
- Test fixtures using the literal string `"clips"` as folder-name test data — these are test data, not user-facing copy.

---

## Kind taxonomy (authoritative reference for all tasks)

11 kinds. Keep this order stable — it's mirrored by the icon component and the CSS class map.

| kind          | Matches on MIME                                                                                | Matches on extension                                      | Example label |
|---------------|-------------------------------------------------------------------------------------------------|-----------------------------------------------------------|---------------|
| `video`       | `video/*`                                                                                      | mp4, webm, mov, mkv, avi                                  | `MP4`         |
| `audio`       | `audio/*`                                                                                      | mp3, wav, flac, ogg, m4a, opus                            | `MP3`         |
| `image`       | `image/*` (incl. gif, heic, webp)                                                              | png, jpg, jpeg, gif, webp, heic, heif, bmp, svg           | `PNG`         |
| `document`    | `application/pdf`, `application/msword`, `officedocument.*`, `text/plain`, `text/markdown`, `text/rtf`, `application/epub+zip` | pdf, doc, docx, xls, xlsx, ppt, pptx, txt, md, rtf, epub | `PDF`         |
| `code`        | `text/html`, `text/css`, `text/javascript`, `text/x-*`                                         | js, mjs, ts, tsx, jsx, py, rb, go, rs, c, h, cpp, hpp, java, cs, php, html, htm, css, scss, sass, sh, bash, zsh, fish, yaml, yml, toml, sql, lua, swift, kt | `TS`         |
| `archive`     | `application/zip`, `application/x-tar`, `application/x-7z-compressed`, `application/x-rar-compressed`, `application/gzip`, `application/x-bzip2` | zip, tar, 7z, rar, gz, bz2, xz                            | `ZIP`         |
| `executable`  | `application/x-msdownload`, `application/vnd.microsoft.portable-executable`, `application/vnd.android.package-archive` | exe, msi, deb, rpm, apk, app, dmg (dmg is disk-image, see below) | `EXE`   |
| `disk-image`  | `application/x-iso9660-image`, `application/x-apple-diskimage`                                 | iso, img, dmg, vhd, vhdx, vmdk, qcow2                     | `ISO`         |
| `font`        | `font/*`, `application/font-*`, `application/vnd.ms-fontobject`                                | ttf, otf, woff, woff2, eot                                | `TTF`         |
| `data`        | `application/json`, `text/csv`, `text/tab-separated-values`, `application/xml`, `text/xml`     | json, csv, tsv, xml, ndjson, jsonl, parquet               | `JSON`        |
| `other`       | fallback                                                                                       | fallback                                                  | subtype OR ext (uppercased, ≤5 chars) |

**Precedence inside `classifyFile`:** extension first (trusted — on-disk names are UUIDs, extension is derived from original_name by the db), MIME type second, fallback to `other` with label derived from extension if present, else the cleaned MIME subtype.

**Reason for extension-first:** MIME types from `file --mime-type` on upload are often `application/octet-stream` for `.iso`, `.exe`, `.7z` etc. The original filename's extension carries more signal.

**Label rules:** uppercase ASCII; strip leading `x-` and `vnd.` from MIME subtype; cap at 5 chars when deriving from MIME subtype (so `application/octet-stream` without an extension → `OCTET` not full mime); when a case has multiple extensions (e.g. jpeg vs jpg) the one in the filename wins.

---

## Per-kind tile color tokens (reused, no new tokens introduced)

Map from kind → existing `--vv-*` background + `--vv-bg` text inside the tile. The goal is visual variety without introducing new palette values.

| kind          | tile background          | tile glyph color |
|---------------|--------------------------|------------------|
| `video`       | `var(--vv-accent)`       | `var(--vv-bg)`   |
| `audio`       | `var(--vv-info)`         | `var(--vv-bg)`   |
| `image`       | `var(--vv-success)`      | `var(--vv-ink)`  |
| `document`    | `var(--vv-bg-panel)`     | `var(--vv-ink)`  |
| `code`        | `var(--vv-ink)`          | `var(--vv-bg)`   |
| `archive`     | `var(--vv-accent-soft)`  | `var(--vv-bg)`   |
| `executable`  | `var(--vv-danger)`       | `var(--vv-bg)`   |
| `disk-image`  | `var(--vv-ink-muted)`    | `var(--vv-bg)`   |
| `font`        | `var(--vv-warn)`         | `var(--vv-ink-warn)` |
| `data`        | `var(--vv-bg-sunken)`    | `var(--vv-ink)`  |
| `other`       | `var(--vv-ink-muted)`    | `var(--vv-bg)`   |

---

## Task 1: Branch and scaffold

**Files:** none modified yet; branch setup only.

- [ ] **Step 1: Create feature branch**

```bash
git -C /root/vorevault fetch origin
git -C /root/vorevault checkout main
git -C /root/vorevault pull --ff-only
git -C /root/vorevault checkout -b feat/phase-1-file-types
```

- [ ] **Step 2: Verify the starting test suite is green**

```bash
cd /root/vorevault/app && npm test
```

Expected: all existing tests pass. If not, stop and investigate before doing anything else — don't build on a red baseline.

---

## Task 2: `classifyFile` — write failing tests

**Files:**
- Create: `app/src/lib/fileKind.test.ts`
- Will create in next task: `app/src/lib/fileKind.ts`

- [ ] **Step 1: Write the test file**

Write `app/src/lib/fileKind.test.ts` with this exact content:

```ts
import { describe, it, expect } from "vitest";
import { classifyFile } from "./fileKind";

describe("classifyFile", () => {
  // Each row: [mime, filename, expectedKind, expectedLabel]
  const cases: Array<[string, string, string, string]> = [
    // video
    ["video/mp4", "a.mp4", "video", "MP4"],
    ["video/webm", "a.webm", "video", "WEBM"],
    ["video/quicktime", "clip.mov", "video", "MOV"],
    ["application/octet-stream", "weird.mkv", "video", "MKV"],
    // audio
    ["audio/mpeg", "song.mp3", "audio", "MP3"],
    ["audio/flac", "song.flac", "audio", "FLAC"],
    ["application/octet-stream", "song.opus", "audio", "OPUS"],
    // image
    ["image/png", "pic.png", "image", "PNG"],
    ["image/jpeg", "pic.jpg", "image", "JPG"],
    ["image/jpeg", "pic.jpeg", "image", "JPEG"],
    ["image/gif", "pic.gif", "image", "GIF"],
    ["image/heic", "pic.heic", "image", "HEIC"],
    ["image/svg+xml", "logo.svg", "image", "SVG"],
    // document
    ["application/pdf", "doc.pdf", "document", "PDF"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "doc.docx", "document", "DOCX"],
    ["text/plain", "notes.txt", "document", "TXT"],
    ["text/markdown", "README.md", "document", "MD"],
    ["application/epub+zip", "book.epub", "document", "EPUB"],
    // code
    ["text/javascript", "app.js", "code", "JS"],
    ["application/octet-stream", "app.ts", "code", "TS"],
    ["text/x-python", "main.py", "code", "PY"],
    ["application/octet-stream", "main.rs", "code", "RS"],
    ["text/html", "page.html", "code", "HTML"],
    ["application/octet-stream", "style.css", "code", "CSS"],
    ["application/octet-stream", "deploy.sh", "code", "SH"],
    ["application/octet-stream", "config.yaml", "code", "YAML"],
    // archive
    ["application/zip", "bundle.zip", "archive", "ZIP"],
    ["application/x-7z-compressed", "bundle.7z", "archive", "7Z"],
    ["application/gzip", "bundle.tar.gz", "archive", "GZ"],
    ["application/x-rar-compressed", "bundle.rar", "archive", "RAR"],
    // executable
    ["application/x-msdownload", "install.exe", "executable", "EXE"],
    ["application/vnd.microsoft.portable-executable", "install.exe", "executable", "EXE"],
    ["application/octet-stream", "install.msi", "executable", "MSI"],
    ["application/vnd.android.package-archive", "app.apk", "executable", "APK"],
    ["application/octet-stream", "package.deb", "executable", "DEB"],
    // disk-image
    ["application/x-iso9660-image", "ubuntu.iso", "disk-image", "ISO"],
    ["application/octet-stream", "ubuntu.iso", "disk-image", "ISO"],
    ["application/x-apple-diskimage", "app.dmg", "disk-image", "DMG"],
    ["application/octet-stream", "disk.img", "disk-image", "IMG"],
    // font
    ["font/ttf", "Inter.ttf", "font", "TTF"],
    ["application/octet-stream", "Inter.woff2", "font", "WOFF2"],
    ["application/octet-stream", "Inter.otf", "font", "OTF"],
    // data
    ["application/json", "data.json", "data", "JSON"],
    ["text/csv", "data.csv", "data", "CSV"],
    ["application/xml", "data.xml", "data", "XML"],
    ["application/octet-stream", "log.ndjson", "data", "NDJSON"],
    // other / fallbacks
    ["application/octet-stream", "binary", "other", "BIN"],
    ["application/octet-stream", "", "other", "FILE"],
    ["application/x-weird-thing", "noext", "other", "WEIRD"],
  ];

  it.each(cases)("classifies %s / %s → %s (%s)", (mime, filename, expectedKind, expectedLabel) => {
    const { kind, label } = classifyFile(mime, filename);
    expect(kind).toBe(expectedKind);
    expect(label).toBe(expectedLabel);
  });

  it("label is always uppercase ASCII", () => {
    const { label } = classifyFile("video/mp4", "A.MP4");
    expect(label).toBe("MP4");
  });

  it("label never exceeds 5 chars when derived from MIME (no extension)", () => {
    const { label } = classifyFile("application/x-really-long-subtype", "nameless");
    expect(label.length).toBeLessThanOrEqual(5);
  });

  it("extension on filename wins over MIME when they disagree", () => {
    // MIME says video but extension says zip — trust extension
    const { kind, label } = classifyFile("video/mp4", "oops.zip");
    expect(kind).toBe("archive");
    expect(label).toBe("ZIP");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd /root/vorevault/app && npm test -- fileKind
```

Expected: FAIL with `Cannot find module './fileKind'` or equivalent.

---

## Task 3: `classifyFile` — implementation

**Files:**
- Create: `app/src/lib/fileKind.ts`

- [ ] **Step 1: Write the implementation**

Write `app/src/lib/fileKind.ts` with this exact content:

```ts
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

// Extension → kind map. Ordered from most specific to least. When extensions
// map to the same kind, later duplicates are harmless.
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

// MIME prefix → kind. Checked only when extension gives no answer.
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
  // take up to first non-alphanumeric break
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

  // 2. MIME-based kind, label from extension if present, else from MIME subtype.
  const mimeKind = kindFromMime(mime);
  if (mimeKind) {
    const label = ext ? ext.toUpperCase() : cleanMimeSubtype(mime) || "FILE";
    return { kind: mimeKind, label };
  }

  // 3. Unknown. Label from extension if any, else from MIME subtype, else "FILE".
  const label = ext ? ext.toUpperCase() : cleanMimeSubtype(mime) || "FILE";
  return { kind: "other", label };
}
```

- [ ] **Step 2: Run tests and confirm they all pass**

```bash
cd /root/vorevault/app && npm test -- fileKind
```

Expected: PASS, all cases green.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault
git add app/src/lib/fileKind.ts app/src/lib/fileKind.test.ts
git commit -m "feat(lib): add fileKind classifier with per-kind labels"
```

---

## Task 4: `<FileIcon>` — write failing test

**Files:**
- Create: `app/src/components/FileIcon.test.tsx`

- [ ] **Step 1: Write the test**

Write `app/src/components/FileIcon.test.tsx` with this exact content:

```tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FileIcon } from "./FileIcon";
import type { FileKind } from "@/lib/fileKind";

const KINDS: FileKind[] = [
  "video", "audio", "image", "document", "code",
  "archive", "executable", "disk-image", "font", "data", "other",
];

describe("FileIcon", () => {
  it.each(KINDS)("renders an svg for kind=%s with an aria-label", (kind) => {
    const { container, getByLabelText } = render(<FileIcon kind={kind} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // aria-label contains the kind string (either the kind itself or a human-readable form)
    expect(getByLabelText(new RegExp(kind.replace("-", ".?")))).toBeInTheDocument();
  });

  it("honors the size prop", () => {
    const { container } = render(<FileIcon kind="video" size={48} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("48");
    expect(svg.getAttribute("height")).toBe("48");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd /root/vorevault/app && npm test -- FileIcon
```

Expected: FAIL (`Cannot find module './FileIcon'`).

---

## Task 5: `<FileIcon>` — implementation

**Files:**
- Create: `app/src/components/FileIcon.tsx`
- Create: `app/src/components/FileIcon.module.css`

- [ ] **Step 1: Write the component**

Write `app/src/components/FileIcon.tsx` with this exact content:

```tsx
import type { FileKind } from "@/lib/fileKind";
import styles from "./FileIcon.module.css";

type Props = {
  kind: FileKind;
  size?: number;
  className?: string;
};

const LABELS: Record<FileKind, string> = {
  video: "video file",
  audio: "audio file",
  image: "image file",
  document: "document file",
  code: "code file",
  archive: "archive file",
  executable: "executable file",
  "disk-image": "disk-image file",
  font: "font file",
  data: "data file",
  other: "other file",
};

// Hand-authored inline SVGs. currentColor so kind-tile CSS can drive color.
// Stroke width 2, 24x24 viewbox, round caps — matches the existing TopBar
// search icon and the overall sticker aesthetic.
function Path({ kind }: { kind: FileKind }): JSX.Element {
  switch (kind) {
    case "video":
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none" />
        </>
      );
    case "audio":
      return (
        <>
          <path d="M9 18V6l10-2v12" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="16" r="2" />
        </>
      );
    case "image":
      return (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <polyline points="4,18 9,13 14,18 20,12" />
        </>
      );
    case "document":
      return (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <polyline points="14,3 14,8 19,8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="14" y2="17" />
        </>
      );
    case "code":
      return (
        <>
          <polyline points="8,8 3,12 8,16" />
          <polyline points="16,8 21,12 16,16" />
          <line x1="14" y1="5" x2="10" y2="19" />
        </>
      );
    case "archive":
      return (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <line x1="12" y1="4" x2="12" y2="10" strokeDasharray="2 2" />
          <rect x="10" y="12" width="4" height="5" />
        </>
      );
    case "executable":
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <polyline points="7,10 10,12 7,14" />
          <line x1="13" y1="14" x2="17" y2="14" />
        </>
      );
    case "disk-image":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="3" x2="12" y2="9" />
        </>
      );
    case "font":
      return (
        <>
          <polyline points="6,19 10,5 14,19" />
          <line x1="7.5" y1="13" x2="12.5" y2="13" />
          <line x1="14" y1="8" x2="20" y2="8" />
          <line x1="17" y1="8" x2="17" y2="19" />
        </>
      );
    case "data":
      return (
        <>
          <ellipse cx="12" cy="6" rx="8" ry="3" />
          <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
          <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
        </>
      );
    case "other":
    default:
      return (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <polyline points="14,3 14,8 19,8" />
        </>
      );
  }
}

export function FileIcon({ kind, size = 24, className }: Props): JSX.Element {
  const label = LABELS[kind];
  const classes = className ? `${styles.icon} ${className}` : styles.icon;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={classes}
    >
      <Path kind={kind} />
    </svg>
  );
}
```

- [ ] **Step 2: Write the CSS module**

Write `app/src/components/FileIcon.module.css` with this exact content:

```css
.icon {
  display: inline-block;
  color: currentColor;
  flex-shrink: 0;
}
```

- [ ] **Step 3: Run tests and confirm they all pass**

```bash
cd /root/vorevault/app && npm test -- FileIcon
```

Expected: PASS, all 11 kind cases + size prop case green.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/components/FileIcon.tsx app/src/components/FileIcon.module.css app/src/components/FileIcon.test.tsx
git commit -m "feat(ui): FileIcon component with hand-authored per-kind SVGs"
```

---

## Task 6: `<FileCard>` — write failing tests

**Files:**
- Create: `app/src/components/FileCard.test.tsx`

Note: `FileCard` does not currently have a test. We add one that drives the new behavior, then refactor the component to match it.

- [ ] **Step 1: Write the test file**

Write `app/src/components/FileCard.test.tsx` with this exact content:

```tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileCard } from "./FileCard";
import type { FileWithUploader } from "@/lib/files";

function makeFile(overrides: Partial<FileWithUploader> = {}): FileWithUploader {
  const base: FileWithUploader = {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    uploader_id: "u1",
    uploader_name: "alice",
    original_name: "thing.mp4",
    mime_type: "video/mp4",
    size_bytes: 1024 * 1024,
    storage_path: "/data/uploads/aaa",
    transcoded_path: null,
    thumbnail_path: "/data/thumbs/aaa.jpg",
    transcode_status: "done",
    duration_sec: 125,
    width: 1920,
    height: 1080,
    folder_id: null,
    created_at: new Date(Date.now() - 60_000) as unknown as Date,
    deleted_at: null,
  };
  return { ...base, ...overrides };
}

describe("FileCard", () => {
  it("video with thumbnail: renders thumbnail img, duration badge, uppercased label", () => {
    render(<FileCard file={makeFile()} />);
    const img = screen.getByRole("img", { hidden: true }) as HTMLImageElement;
    expect(img.src).toContain("/api/thumbs/");
    expect(screen.getByText("2:05")).toBeInTheDocument();
    expect(screen.getByText("MP4")).toBeInTheDocument();
  });

  it("image file without thumbnail: renders icon tile with PNG label, no duration", () => {
    render(
      <FileCard
        file={makeFile({
          original_name: "pic.png",
          mime_type: "image/png",
          thumbnail_path: null,
          duration_sec: null,
        })}
      />
    );
    expect(screen.getByLabelText(/image.?file/)).toBeInTheDocument();
    expect(screen.getByText("PNG")).toBeInTheDocument();
    expect(screen.queryByText(/:\d\d/)).not.toBeInTheDocument();
  });

  it("iso file: renders disk-image icon tile with ISO label", () => {
    render(
      <FileCard
        file={makeFile({
          original_name: "ubuntu.iso",
          mime_type: "application/octet-stream",
          thumbnail_path: null,
          duration_sec: null,
        })}
      />
    );
    expect(screen.getByLabelText(/disk.?image.?file/)).toBeInTheDocument();
    expect(screen.getByText("ISO")).toBeInTheDocument();
  });

  it("readme.md: renders document icon tile with MD label", () => {
    render(
      <FileCard
        file={makeFile({
          original_name: "README.md",
          mime_type: "text/markdown",
          thumbnail_path: null,
          duration_sec: null,
        })}
      />
    );
    expect(screen.getByLabelText(/document.?file/)).toBeInTheDocument();
    expect(screen.getByText("MD")).toBeInTheDocument();
  });

  it("audio without thumbnail: renders audio icon tile with duration", () => {
    render(
      <FileCard
        file={makeFile({
          original_name: "song.mp3",
          mime_type: "audio/mpeg",
          thumbnail_path: null,
          duration_sec: 200,
        })}
      />
    );
    expect(screen.getByLabelText(/audio.?file/)).toBeInTheDocument();
    expect(screen.getByText("MP3")).toBeInTheDocument();
    expect(screen.getByText("3:20")).toBeInTheDocument();
  });

  it("non-video/audio never shows a duration badge even if duration_sec is set", () => {
    render(
      <FileCard
        file={makeFile({
          original_name: "weird.zip",
          mime_type: "application/zip",
          thumbnail_path: null,
          duration_sec: 99, // intentionally non-null; should be ignored for archives
        })}
      />
    );
    expect(screen.queryByText(/\d+:\d\d/)).not.toBeInTheDocument();
  });

  it("card links to /f/:id", () => {
    const file = makeFile({ id: "abc-123" });
    render(<FileCard file={file} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/f/abc-123");
  });
});
```

- [ ] **Step 2: Run and confirm the new tests fail**

```bash
cd /root/vorevault/app && npm test -- FileCard
```

Expected: FAIL on the `image`/`iso`/`md`/`audio`/`archive` cases (the current FileCard renders the raw MIME string centered in a colored tile and uses `.slice(0,4)` for the label, so `PNG` `ISO` `MD` labels and `aria-label=/image.?file/` queries will not match). The `video` case may partially pass because the current code lowercases the 4-char slice — but `MP4` vs `mp4` assertion will fail on case anyway. Good — that's the signal we want.

---

## Task 7: `<FileCard>` — refactor to use kind + FileIcon

**Files:**
- Modify: `app/src/components/FileCard.tsx` (full rewrite)
- Modify: `app/src/components/FileCard.module.css` (add `.iconTile`, per-kind backgrounds, focus ring; keep existing styles used by video)

- [ ] **Step 1: Replace FileCard.tsx**

Overwrite `app/src/components/FileCard.tsx` with:

```tsx
import type { FileWithUploader } from "@/lib/files";
import { classifyFile } from "@/lib/fileKind";
import { FileIcon } from "./FileIcon";
import styles from "./FileCard.module.css";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(sec: number | null): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const ago = Date.now() - d.getTime();
  const min = Math.floor(ago / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function FileCard({
  file,
  isShared,
}: {
  file: FileWithUploader;
  isShared?: boolean;
}) {
  const { kind, label } = classifyFile(file.mime_type, file.original_name);
  const duration = (kind === "video" || kind === "audio") ? formatDuration(file.duration_sec) : null;
  const hasThumb = file.thumbnail_path != null;

  return (
    <a href={`/f/${file.id}`} className={styles.card}>
      <div className={styles.thumb}>
        {hasThumb ? (
          <img src={`/api/thumbs/${file.id}`} alt="" loading="lazy" />
        ) : (
          <div className={`${styles.iconTile} ${styles[`kind_${kind.replace("-", "_")}`]}`}>
            <FileIcon kind={kind} size={48} />
          </div>
        )}
        <span className={styles.typeBadge}>{label}</span>
        {duration && <span className={styles.duration}>{duration}</span>}
        {isShared && <span className={styles.sharedBadge}>✦ shared</span>}
      </div>
      <div className={styles.meta}>
        <div className={styles.title}>{file.original_name}</div>
        <div className={`vv-meta ${styles.sub}`}>
          {file.uploader_name} · <strong>{formatBytes(file.size_bytes)}</strong> · <strong>{relativeTime(file.created_at)}</strong>
        </div>
      </div>
    </a>
  );
}
```

- [ ] **Step 2: Update FileCard.module.css**

Overwrite `app/src/components/FileCard.module.css` with:

```css
.card {
  background: var(--vv-ink);
  border: 2.5px solid var(--vv-ink);
  border-radius: var(--vv-radius-md);
  overflow: hidden;
  cursor: pointer;
  box-shadow: var(--vv-shadow-md);
  transition: transform 0.1s;
  position: relative;
  text-decoration: none;
  color: inherit;
  display: block;
}

.card:hover {
  transform: translate(-1px, -1px);
  box-shadow: var(--vv-shadow-lg);
  text-decoration: none;
}

.card:focus-visible {
  outline: 3px solid var(--vv-accent);
  outline-offset: 2px;
}

.thumb {
  aspect-ratio: 16 / 10;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.3);
  font-family: var(--vv-font-mono);
  font-size: 11px;
  background: var(--vv-ink);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.iconTile {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.kind_video      { background: var(--vv-accent);      color: var(--vv-bg); }
.kind_audio      { background: var(--vv-info);        color: var(--vv-bg); }
.kind_image      { background: var(--vv-success);     color: var(--vv-ink); }
.kind_document   { background: var(--vv-bg-panel);    color: var(--vv-ink); }
.kind_code       { background: var(--vv-ink);         color: var(--vv-bg); }
.kind_archive    { background: var(--vv-accent-soft); color: var(--vv-bg); }
.kind_executable { background: var(--vv-danger);      color: var(--vv-bg); }
.kind_disk_image { background: var(--vv-ink-muted);   color: var(--vv-bg); }
.kind_font       { background: var(--vv-warn);        color: var(--vv-ink-warn); }
.kind_data       { background: var(--vv-bg-sunken);   color: var(--vv-ink); }
.kind_other      { background: var(--vv-ink-muted);   color: var(--vv-bg); }

.typeBadge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: var(--vv-bg);
  color: var(--vv-ink);
  padding: 2px 7px;
  border-radius: var(--vv-radius-sm);
  font-size: 11px;
  font-weight: 700;
  font-family: var(--vv-font-mono);
}

.duration {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.85);
  color: var(--vv-bg);
  padding: 3px 7px;
  border-radius: var(--vv-radius-sm);
  font-size: 11px;
  font-weight: 700;
  font-family: var(--vv-font-ui);
}

.sharedBadge {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  background: var(--vv-accent);
  color: var(--vv-bg);
  padding: 2px 7px;
  border-radius: var(--vv-radius-sm);
  font-size: 11px;
  font-weight: 700;
  font-family: var(--vv-font-ui);
  box-shadow: var(--vv-shadow-sm);
}

.meta {
  padding: 10px 12px;
  background: var(--vv-bg);
  color: var(--vv-ink);
  border-top: 2.5px solid var(--vv-ink);
}

.title {
  font-weight: 700;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub {
  margin-top: 2px;
  font-size: 11px;
}
```

- [ ] **Step 3: Run FileCard tests**

```bash
cd /root/vorevault/app && npm test -- FileCard
```

Expected: PASS on all 7 cases.

- [ ] **Step 4: Run the full suite to catch regressions**

```bash
cd /root/vorevault/app && npm test
```

Expected: all green. If anything reads `typeBadge` or `tile1..tile6` CSS classes elsewhere, fix those now. (A quick grep before this step is fine: `grep -rn "tile1\\|tile2\\|tile3\\|tile4\\|tile5\\|tile6\\|tileFallback" app/src` — if empty, the rewrite is clean.)

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault
git add app/src/components/FileCard.tsx app/src/components/FileCard.module.css app/src/components/FileCard.test.tsx
git commit -m "feat(ui): FileCard variants per file kind; real type labels; focus ring"
```

---

## Task 8: Focus-ring pass for folder tiles (parity with FileCard)

**Files:**
- Modify: `app/src/components/FolderTile.module.css`

- [ ] **Step 1: Read current FolderTile.module.css to find the `.tile` selector**

```bash
grep -n "^\\.[a-zA-Z]" /root/vorevault/app/src/components/FolderTile.module.css
```

Identify the top-level `.tile` (or equivalent) selector the tile root uses. It's the class on the anchor/element that receives keyboard focus.

- [ ] **Step 2: Add a `:focus-visible` rule matching the FileCard one**

Append this block to `app/src/components/FolderTile.module.css` (adjust the selector to the actual class name from step 1 — likely `.tile`):

```css
.tile:focus-visible {
  outline: 3px solid var(--vv-accent);
  outline-offset: 2px;
}
```

If the actual class name differs, substitute it. Do not add a new rule for any class that doesn't already exist in that file.

- [ ] **Step 3: Verify build**

```bash
cd /root/vorevault/app && npm run build
```

Expected: clean build (no CSS parse errors). If the project's test or dev-run is faster than build here, either is fine — goal is just to catch a typo.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/components/FolderTile.module.css
git commit -m "feat(a11y): visible focus ring on folder tiles"
```

---

## Task 9: Copy sweep — "clips" → "files"

**Files:**
- Modify: `app/src/app/(shell)/page.tsx` (lines 47, 73, 87 per current state)
- Modify: `app/src/app/layout.tsx` (metadata description)
- Modify: `app/src/app/login/page.tsx` (tagline)

- [ ] **Step 1: Update the home page copy**

Edit `app/src/app/(shell)/page.tsx`:
- Change `{recent.length + data.total}</strong> clips ·` → `{recent.length + data.total}</strong> files ·`
- Change `<h2 className={\`vv-section-label ${styles.sectionLabel}\`}>all clips</h2>` → `<h2 className={\`vv-section-label ${styles.sectionLabel}\`}>all files</h2>`
- Change `<h2 className="vv-title">drop the first clip in the vault.</h2>` → `<h2 className="vv-title">drop the first file in the vault.</h2>`

- [ ] **Step 2: Update metadata description**

Edit `app/src/app/layout.tsx`:
- Change `description: "The Bullmoose clip archive"` → `description: "The Bullmoose file archive"`

- [ ] **Step 3: Update login tagline**

Edit `app/src/app/login/page.tsx`:
- Change `the <strong>bullmoose</strong> clip archive` → `the <strong>bullmoose</strong> file archive`

- [ ] **Step 4: Verify no other user-facing "clip" strings remain**

```bash
grep -rn -i 'clip' /root/vorevault/app/src/app --include='*.tsx' 2>/dev/null | grep -v navigator | grep -v '\.test\.'
```

Expected: no results (or only in comments that were pre-existing and not user-facing). If a new result appears, reason about it:
- Is it user-visible copy? Change it.
- Is it a test fixture (like `"clip.mp4"` as a filename)? Leave it — that's test data, not copy.

- [ ] **Step 5: Run full test suite**

```bash
cd /root/vorevault/app && npm test
```

Expected: all green. Any snapshot/text-matching test on "clips" copy would fail here; fix those in the same commit if they show up.

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault
git add app/src/app/\(shell\)/page.tsx app/src/app/layout.tsx app/src/app/login/page.tsx
git commit -m "chore(copy): generalize 'clips' → 'files' in user-facing strings"
```

---

## Task 10: Verification pass before PR

**Files:** none (this is pure verification).

- [ ] **Step 1: Run the full test suite once more from a clean slate**

```bash
cd /root/vorevault/app && npm test
```

Expected: every test file green, including the new `fileKind`, `FileIcon`, and `FileCard` suites.

- [ ] **Step 2: Run a production build**

```bash
cd /root/vorevault/app && npm run build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 3: Manual browser check**

Start dev and hit `/` in a browser (you will need a logged-in session — consult the runbook if unsure):

```bash
cd /root/vorevault/app && npm run dev
```

Verify by eye:
- Home page greeting no longer says "clips", says "files" (in the meta line and the "all files" section label).
- Empty state reads "drop the first file in the vault."
- Login page reads "bullmoose file archive."
- Grid: a file with a thumbnail (a video) still renders its thumbnail. An uploaded file without a thumbnail renders a colored tile with an SVG glyph and a clean type label (e.g. `MD`, `PDF`, `ISO`, `ZIP`) in the top-left — not a 4-character raw MIME slice.
- Duration badge only appears on video and audio rows.
- Focus a card via Tab — a 3px rust outline appears around it.

If any of those visual checks fail, do not open the PR. Fix first.

- [ ] **Step 4: Push and open PR**

```bash
cd /root/vorevault
git push -u origin feat/phase-1-file-types
gh pr create --title "feat: Phase 1 — file-type intelligence + general-files copy" --body "$(cat <<'EOF'
## Summary
- Add `classifyFile(mime, filename) → { kind, label }` pure helper covering 11 file kinds with extension-first precedence (since uploads often land as `application/octet-stream`).
- Add `<FileIcon>` component with 11 hand-authored inline SVGs (no icon lib, per design system rules).
- Refactor `<FileCard>` to render variant tiles per kind: thumbnails where available, colored icon tiles otherwise. Duration badge gated to video/audio only.
- Replace the old `typeBadge()` 4-char-MIME-slice hack with real uppercase labels (`MP4`, `MD`, `ISO`, `PDF`, ...).
- Visible focus ring on FileCard and FolderTile.
- Sweep user-facing "clips" → "files" (home page, login tagline, `<head>` metadata).

## Test plan
- [x] Vitest green: fileKind classifier, FileIcon rendering, FileCard variants (7 cases).
- [x] `npm run build` clean.
- [ ] Manual: grid renders a mix of real thumbs, `MD`/`PDF`/`ISO`/`ZIP` icon tiles, and gated duration badges.
- [ ] Manual: keyboard Tab onto a card shows a visible focus ring.
- [ ] Manual: home + login + browser tab title no longer read "clip".

Phase 2 (Drive-style context menus + multi-select + list view) and Phase 3 (design system persistence, dark mode, drag-and-drop) are tracked separately.
EOF
)"
```

---

## Self-review

**1. Spec coverage.** Phase 1 scope from the conversation was: file-type intelligence, per-kind icons, variant rendering, focus rings, copy generalization. Each is covered by Tasks 2–9.

**2. Placeholder scan.** No "TBD", no "add appropriate error handling", no "similar to Task N". Every task has concrete file paths, full code, and exact commands.

**3. Type consistency.**
- `FileKind` defined in Task 3, imported in Tasks 4, 5, 7.
- `FileClassification` (returned shape `{ kind, label }`) used identically by Task 7.
- CSS class name convention `kind_<name>` with underscores (not hyphens) is defined in Task 7's CSS and mirrored in Task 7's TSX via `kind.replace("-", "_")`. The only hyphenated kind is `disk-image` → `kind_disk_image` — verified in both files.
- `getByLabelText(/disk.?image.?file/)` regex matches the `aria-label="disk-image file"` produced by the FileIcon LABELS map.
- `dmg` is in `EXT_KIND` as `disk-image` (not `executable`) — the spec table footnote flags this, and the test case at line 62 of the test file covers it.

**4. One gap found during review:** the test for font MIME maps `"application/octet-stream"` + `Inter.woff2` → `{font, WOFF2}`. That requires `woff2` to be in `EXT_KIND` — verified present. Good.
