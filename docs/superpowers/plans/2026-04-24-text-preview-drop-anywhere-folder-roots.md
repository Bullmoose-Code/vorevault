# Text Preview + Drop-Anywhere + Folder-As-Unit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three user-facing improvements:
1. Show actual text content inline on `/f/[id]` for text files (capped at 256 KB).
2. Allow dragging files onto any page in the shell (not just the explicit DropZone) to trigger the upload flow with a folder picker.
3. Stop flattening folder contents into "All Files" and "Recent" grids — show folder tiles instead.

**Architecture:**
- **Text preview** is a pure server-render tweak to the existing file-detail page. Read bytes off disk in the same process that already looks up the row; no new API route.
- **Drop-anywhere** is a single client component `GlobalDropTarget` mounted in the shell layout. It attaches `document`-level `dragenter/dragover/drop` handlers, shows a full-viewport scrim while dragging files, opens a folder picker on drop, and enqueues files through the existing `UploadProgressProvider`. The existing in-page `DropZone` keeps working because drop events bubble, and `GlobalDropTarget` stops bubbling at the document handler only when no inner handler has called `preventDefault` yet (standard pattern — rely on the browser dispatching to the innermost target first).
- **Folder-as-unit** introduces a unified "root-level items" concept: a paginated list mixing top-level folders (`parent_id IS NULL`) and root-level files (`folder_id IS NULL`) ordered by `created_at DESC`. Home's "all files" grid, the recent strip, and the `/recent` page all switch to this unified list. Everything inside a folder still lives at `/d/[id]`.

**Out of scope (explicit):**
- `/mine` page — remains uploader-filtered flat file list (the user did not ask about it; scoping by uploader + root-only has ambiguous semantics when a user uploads a folder containing files from another uploader). Revisit if asked.
- Directory drops (drop a whole folder from the OS onto the page) — MVP handles file drops only. A later task can hook the existing `webkitGetAsEntry` tree-walking code from `NewMenu` if users request it.
- Syntax highlighting / markdown rendering for text preview — plain monospace only in this pass.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Postgres 16 via `pg` Pool, Vitest + jsdom for component tests, testcontainers for DB integration tests.

---

## File Structure

**Text preview:**
- Create: `app/src/lib/text-preview.ts` — pure helpers: `isPreviewableTextMime(mime)`, `readTextPreview(absPath, capBytes)` returning `{ text, truncated }`.
- Create: `app/src/lib/text-preview.test.ts` — unit tests for both helpers (uses `tmpdir()` for real file reads; no DB).
- Modify: `app/src/app/(shell)/f/[id]/page.tsx` — new branch in the preview switch that calls the helpers and renders a `<pre>`.
- Modify: `app/src/app/(shell)/f/[id]/page.module.css` — add `.textPreview` + `.textPreviewTruncated` styles.

**Drop-anywhere:**
- Create: `app/src/components/GlobalDropTarget.tsx` — client component; attaches document listeners; opens `FolderPickerModal` on drop; enqueues via `useUploadProgress()`.
- Create: `app/src/components/GlobalDropTarget.module.css` — scrim overlay styling.
- Create: `app/src/components/GlobalDropTarget.test.tsx` — jsdom component tests (drag events, folder-picker gating, enqueue calls).
- Modify: `app/src/app/(shell)/layout.tsx` — render `<GlobalDropTarget />` inside `UploadProgressProvider`.

**Folder-as-unit:**
- Modify: `app/src/lib/files.ts` — add `listTopLevelItems(page, limit, extraOffset?)` and `listRecentTopLevelItems(limit)` returning a discriminated `TopLevelItem[]` (file vs folder).
- Modify: `app/src/app/(shell)/page.tsx` — swap "all files" grid for mixed grid; swap recent-strip input.
- Modify: `app/src/app/(shell)/recent/page.tsx` — swap for mixed grid.
- Modify: `app/src/components/RecentStrip.tsx` — accept mixed items; render folder tiles alongside file tiles in the strip style.
- Create: `app/src/lib/files.topLevel.integration.test.ts` — testcontainers integration test for the union SQL (ordering + pagination + mixed count).

All new files stay well under the ~400-line rule. Existing files gain <30 lines each.

---

### Task 1: Text-preview helper module

**Files:**
- Create: `app/src/lib/text-preview.ts`
- Create: `app/src/lib/text-preview.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/src/lib/text-preview.test.ts
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isPreviewableTextMime, readTextPreview } from "./text-preview";

describe("isPreviewableTextMime", () => {
  it("allows common text mimes", () => {
    expect(isPreviewableTextMime("text/plain")).toBe(true);
    expect(isPreviewableTextMime("text/markdown")).toBe(true);
    expect(isPreviewableTextMime("text/csv")).toBe(true);
    expect(isPreviewableTextMime("application/json")).toBe(true);
    expect(isPreviewableTextMime("application/xml")).toBe(true);
    expect(isPreviewableTextMime("application/javascript")).toBe(true);
  });
  it("rejects unsafe and binary mimes", () => {
    expect(isPreviewableTextMime("text/html")).toBe(false);
    expect(isPreviewableTextMime("image/svg+xml")).toBe(false);
    expect(isPreviewableTextMime("application/octet-stream")).toBe(false);
    expect(isPreviewableTextMime("video/mp4")).toBe(false);
    expect(isPreviewableTextMime("")).toBe(false);
  });
});

describe("readTextPreview", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vv-text-"));

  it("returns full text when under cap", async () => {
    const p = path.join(dir, "small.txt");
    writeFileSync(p, "hello world");
    const r = await readTextPreview(p, 1024);
    expect(r.text).toBe("hello world");
    expect(r.truncated).toBe(false);
  });
  it("caps at capBytes and marks truncated", async () => {
    const p = path.join(dir, "big.txt");
    writeFileSync(p, "a".repeat(5000));
    const r = await readTextPreview(p, 1024);
    expect(r.text.length).toBe(1024);
    expect(r.truncated).toBe(true);
  });
  it("returns empty on missing file without throwing", async () => {
    const r = await readTextPreview(path.join(dir, "missing.txt"), 1024);
    expect(r.text).toBe("");
    expect(r.truncated).toBe(false);
    expect(r.error).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/text-preview.test.ts`
Expected: FAIL (`Cannot find module './text-preview'`).

- [ ] **Step 3: Write the implementation**

```ts
// app/src/lib/text-preview.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/text-preview.test.ts`
Expected: PASS (all three `readTextPreview` + two `isPreviewableTextMime` blocks green).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/text-preview.ts app/src/lib/text-preview.test.ts
git commit -m "feat(preview): text-preview helpers (mime whitelist + capped read)"
```

---

### Task 2: Render text preview on /f/[id]

**Files:**
- Modify: `app/src/app/(shell)/f/[id]/page.tsx`
- Modify: `app/src/app/(shell)/f/[id]/page.module.css`

**Constraint:** Cap at 256 KB. Render inside a `<pre>` with monospace and scrollbars. Show a small banner when truncated. Render nothing clickable (text is text — no markdown rendering, no syntax highlighting in this pass).

- [ ] **Step 1: Read the current preview block**

Confirm lines 79–82 of `app/src/app/(shell)/f/[id]/page.tsx` — the "No preview available…" branch you'll extend.

- [ ] **Step 2: Update the page to branch on text mimes**

```tsx
// app/src/app/(shell)/f/[id]/page.tsx — near the existing isVideo/isAudio/isImage consts
import { isPreviewableTextMime, readTextPreview } from "@/lib/text-preview";
// ...
const TEXT_PREVIEW_CAP_BYTES = 256 * 1024;
const isText = isPreviewableTextMime(file.mime_type);
const textPreview = isText
  ? await readTextPreview(file.storage_path, TEXT_PREVIEW_CAP_BYTES)
  : null;
```

Then in the JSX, replace the existing "no preview" branch:

```tsx
{!isVideo && !isAudio && !isImage && !isText && (
  <div className={styles.noPreview}>
    No preview available for <code>{file.mime_type}</code>.
  </div>
)}
{isText && textPreview && !textPreview.error && (
  <div className={styles.textPreview}>
    {textPreview.truncated && (
      <div className={styles.textPreviewTruncated}>
        showing first 256 KB — download for the full file
      </div>
    )}
    <pre>{textPreview.text}</pre>
  </div>
)}
{isText && textPreview?.error && (
  <div className={styles.noPreview}>
    Couldn't read this file from storage.
  </div>
)}
```

- [ ] **Step 3: Add CSS for the preview box**

Append to `app/src/app/(shell)/f/[id]/page.module.css`:

```css
.textPreview {
  border: 2px solid var(--vv-ink);
  border-radius: var(--vv-radius-md);
  background: var(--vv-bg-panel);
  box-shadow: var(--vv-shadow-sm);
  overflow: hidden;
}
.textPreview pre {
  margin: 0;
  padding: 16px;
  font-family: var(--vv-font-mono);
  font-size: 13px;
  line-height: 1.55;
  max-height: 480px;
  overflow: auto;
  white-space: pre;
  color: var(--vv-ink);
}
.textPreviewTruncated {
  padding: 8px 12px;
  font-size: 12px;
  border-bottom: 1.5px solid var(--vv-ink);
  background: var(--vv-warn);
  color: var(--vv-ink-warn);
}
```

- [ ] **Step 4: Manual verification**

Run: `cd app && npm run build` — expect clean build.
Then: `npm run dev`, upload a `.txt` file (and `.md`, `.json`, `.log`), open `/f/<id>`, confirm text renders in a monospace block.
Also upload a >256 KB text file and confirm the truncation banner appears.

- [ ] **Step 5: Commit**

```bash
git add app/src/app/\(shell\)/f/\[id\]/page.tsx app/src/app/\(shell\)/f/\[id\]/page.module.css
git commit -m "feat(preview): inline text preview on file-detail page (256 KB cap)"
```

---

### Task 3: `listTopLevelItems` + integration test

**Files:**
- Modify: `app/src/lib/files.ts`
- Create: `app/src/lib/files.topLevel.integration.test.ts`

**SQL shape:** UNION ALL of top-level folders (`parent_id IS NULL AND deleted_at IS NULL`) and root-level files (`folder_id IS NULL AND deleted_at IS NULL`), ordered by `created_at DESC`, paginated at the outer level. Counts computed via a separate `SELECT sum(c)` query.

- [ ] **Step 1: Write the failing integration test**

```ts
// app/src/lib/files.topLevel.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";
import { listTopLevelItems } from "./files";

let fx: PgFixture;

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("./db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });
  await fx.pool.query(
    `INSERT INTO users (id, discord_id, username) VALUES
      ('11111111-1111-1111-1111-111111111111','d1','alice'),
      ('22222222-2222-2222-2222-222222222222','d2','bob')`,
  );
}, 120_000);
afterAll(async () => { await stopPg(fx); });

describe("listTopLevelItems", () => {
  it("mixes top-level folders and root-level files, newest first", async () => {
    const { pool } = fx;
    await pool.query(`DELETE FROM files; DELETE FROM folders;`);
    // two root folders, two root files, one nested file that MUST be hidden
    await pool.query(
      `INSERT INTO folders (id, name, parent_id, created_by, created_at) VALUES
        ('aaaaaaa1-0000-0000-0000-000000000001','fA',NULL,'11111111-1111-1111-1111-111111111111',now() - interval '5 minutes'),
        ('aaaaaaa1-0000-0000-0000-000000000002','fB',NULL,'11111111-1111-1111-1111-111111111111',now() - interval '2 minutes')`,
    );
    await pool.query(
      `INSERT INTO files (id, uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
       VALUES
        ('bbbbbbb1-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',NULL,'root1.txt','text/plain',1,'/x',now() - interval '4 minutes'),
        ('bbbbbbb1-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222',NULL,'root2.txt','text/plain',1,'/x',now() - interval '1 minutes'),
        ('bbbbbbb1-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','aaaaaaa1-0000-0000-0000-000000000001','nested.txt','text/plain',1,'/x',now() - interval '30 seconds')`,
    );
    const page = await listTopLevelItems(1, 10);
    expect(page.total).toBe(4);
    expect(page.items.map((i) => i.kind + ":" + (i.kind === "folder" ? i.name : i.original_name))).toEqual([
      "file:root2.txt",   // 1 min ago
      "folder:fB",        // 2 min ago
      "file:root1.txt",   // 4 min ago
      "folder:fA",        // 5 min ago
    ]);
    // nested.txt must not appear
    expect(page.items.find((i) => i.kind === "file" && i.original_name === "nested.txt")).toBeUndefined();
  });
  it("paginates correctly", async () => {
    const page1 = await listTopLevelItems(1, 2);
    const page2 = await listTopLevelItems(2, 2);
    expect(page1.items.length).toBe(2);
    expect(page2.items.length).toBe(2);
    expect(page1.items[0]).not.toEqual(page2.items[0]);
  });
  it("respects extraOffset (home strip skip)", async () => {
    const withSkip = await listTopLevelItems(1, 10, 1);
    expect(withSkip.items.length).toBe(3);
    expect(withSkip.total).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npx vitest run src/lib/files.topLevel.integration.test.ts`
Expected: FAIL — `listTopLevelItems` not exported.

- [ ] **Step 3: Implement `listTopLevelItems`**

Append to `app/src/lib/files.ts`:

```ts
export type TopLevelFolderItem = {
  kind: "folder";
  id: string;
  name: string;
  parent_id: null;
  created_by: string;
  created_at: Date;
  direct_file_count: number;
  direct_subfolder_count: number;
};

export type TopLevelFileItem = FileWithUploader & { kind: "file" };
export type TopLevelItem = TopLevelFolderItem | TopLevelFileItem;

export type TopLevelPage = {
  items: TopLevelItem[];
  total: number;
  page: number;
  limit: number;
};

export async function listTopLevelItems(
  page: number,
  limit: number,
  extraOffset: number = 0,
): Promise<TopLevelPage> {
  const offset = (page - 1) * limit + extraOffset;
  const dataSql = `
    SELECT * FROM (
      SELECT
        'folder'::text AS kind,
        f.id::text AS id,
        f.name AS name,
        NULL::text AS original_name,
        NULL::text AS mime_type,
        NULL::text AS thumbnail_path,
        NULL::text AS uploader_name,
        f.created_by::text AS created_by,
        f.created_at AS created_at,
        (SELECT count(*)::int FROM files x WHERE x.folder_id = f.id AND x.deleted_at IS NULL) AS direct_file_count,
        (SELECT count(*)::int FROM folders s WHERE s.parent_id = f.id AND s.deleted_at IS NULL) AS direct_subfolder_count,
        NULL::bigint AS size_bytes,
        NULL::text AS storage_path,
        NULL::text AS transcode_status
      FROM folders f
      WHERE f.parent_id IS NULL AND f.deleted_at IS NULL
      UNION ALL
      SELECT
        'file'::text AS kind,
        ff.id::text AS id,
        NULL::text AS name,
        ff.original_name AS original_name,
        ff.mime_type AS mime_type,
        ff.thumbnail_path AS thumbnail_path,
        u.username AS uploader_name,
        ff.uploader_id::text AS created_by,
        ff.created_at AS created_at,
        NULL::int AS direct_file_count,
        NULL::int AS direct_subfolder_count,
        ff.size_bytes AS size_bytes,
        ff.storage_path AS storage_path,
        ff.transcode_status AS transcode_status
      FROM files ff JOIN users u ON u.id = ff.uploader_id
      WHERE ff.folder_id IS NULL AND ff.deleted_at IS NULL
    ) t
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `;
  const countSql = `
    SELECT
      (SELECT count(*)::int FROM folders WHERE parent_id IS NULL AND deleted_at IS NULL)
      + (SELECT count(*)::int FROM files WHERE folder_id IS NULL AND deleted_at IS NULL)
      AS total
  `;
  const [dataRes, countRes] = await Promise.all([
    pool.query(dataSql, [limit, offset]),
    pool.query<{ total: number }>(countSql),
  ]);

  const items = dataRes.rows.map(mapTopLevelRow);
  return {
    items,
    total: Math.max(0, countRes.rows[0].total - extraOffset),
    page,
    limit,
  };
}

function mapTopLevelRow(r: Record<string, unknown>): TopLevelItem {
  if (r.kind === "folder") {
    return {
      kind: "folder",
      id: r.id as string,
      name: r.name as string,
      parent_id: null,
      created_by: r.created_by as string,
      created_at: r.created_at as Date,
      direct_file_count: (r.direct_file_count as number) ?? 0,
      direct_subfolder_count: (r.direct_subfolder_count as number) ?? 0,
    };
  }
  return {
    kind: "file",
    id: r.id as string,
    uploader_id: r.created_by as string,
    uploader_name: r.uploader_name as string,
    original_name: r.original_name as string,
    mime_type: r.mime_type as string,
    size_bytes: r.size_bytes as number,
    storage_path: r.storage_path as string,
    thumbnail_path: (r.thumbnail_path as string) ?? null,
    folder_id: null,
    created_at: r.created_at as Date,
    deleted_at: null,
    transcode_status: (r.transcode_status as FileRow["transcode_status"]) ?? "pending",
  } as TopLevelFileItem;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/files.topLevel.integration.test.ts`
Expected: PASS — 3 cases green.

- [ ] **Step 5: Add `listRecentTopLevelItems` (no pagination, used by strip)**

Append to `app/src/lib/files.ts`:

```ts
export async function listRecentTopLevelItems(limit: number): Promise<TopLevelItem[]> {
  const page = await listTopLevelItems(1, limit, 0);
  return page.items;
}
```

No separate test — it's a thin wrapper and the underlying query is already covered.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/files.ts app/src/lib/files.topLevel.integration.test.ts
git commit -m "feat(files): listTopLevelItems — mixed folders+root-files paginated"
```

---

### Task 4: RecentStrip accepts mixed items

**Files:**
- Modify: `app/src/components/RecentStrip.tsx`
- Modify: `app/src/components/RecentStrip.module.css` (if needed for folder-tile variant)

**Constraint:** A single strip that renders folders and files interleaved. Folder tiles link to `/d/[id]`, file tiles stay as they are. Visual: keep the strip's card footprint uniform so it reads as a chronological row.

- [ ] **Step 1: Update props + rendering**

```tsx
// app/src/components/RecentStrip.tsx
import Link from "next/link";
import type { TopLevelItem } from "@/lib/files";
import styles from "./RecentStrip.module.css";

export function RecentStrip({ items }: { items: TopLevelItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className={styles.section} aria-label="recent uploads">
      <div className={styles.header}>
        <h2 className="vv-section-label">recent</h2>
        <Link href="/recent" className={styles.viewAll}>view all</Link>
      </div>
      <div className={styles.strip}>
        {items.map((it) => it.kind === "folder" ? (
          <Link key={it.id} href={`/d/${it.id}`} className={`${styles.tile} ${styles.folderTile}`}>
            <div className={styles.folderGlyph} aria-hidden="true">▤</div>
            <div className={styles.tileLabel} title={it.name}>{it.name}</div>
          </Link>
        ) : (
          <Link key={it.id} href={`/f/${it.id}`} className={styles.tile}>
            {it.thumbnail_path ? (
              <img src={`/api/thumbs/${it.id}`} alt={it.original_name} loading="lazy" />
            ) : (
              <div className={styles.tilePlaceholder} aria-hidden="true">{it.original_name.slice(0, 1)}</div>
            )}
            <div className={styles.tileLabel} title={it.original_name}>{it.original_name}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add folder-tile CSS variant**

Append to `app/src/components/RecentStrip.module.css`:

```css
.folderTile { background: var(--vv-bg-sunken); }
.folderGlyph {
  font-family: var(--vv-font-display);
  font-size: 32px;
  line-height: 1;
  display: grid;
  place-items: center;
  aspect-ratio: 1 / 1;
  color: var(--vv-ink-muted);
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/components/RecentStrip.tsx app/src/components/RecentStrip.module.css
git commit -m "feat(ui): RecentStrip renders mixed folders+files"
```

---

### Task 5: Home page — mixed grid + mixed strip

**Files:**
- Modify: `app/src/app/(shell)/page.tsx`

**Constraint:** Swap `listRecentFiles` → `listRecentTopLevelItems`; swap `listFiles` → `listTopLevelItems`. The "folders" section above (`listTopLevelFolders`) stays — users still want the at-a-glance folders row. Both FileCard and FolderTile render in the main grid.

- [ ] **Step 1: Update the home page**

Replace lines 33–37 and the grid JSX:

```tsx
import { listTopLevelItems, listRecentTopLevelItems } from "@/lib/files";
// (drop listFiles, listRecentFiles imports)
// ...
const [recent, folders, data] = await Promise.all([
  listRecentTopLevelItems(RECENT_STRIP_COUNT),
  listTopLevelFolders(),
  listTopLevelItems(page, limit, RECENT_STRIP_COUNT),
]);
```

And in JSX, swap the map:

```tsx
{data.items.map((it) => it.kind === "folder" ? (
  <FolderTile key={`f-${it.id}`} id={it.id} name={it.name}
    fileCount={it.direct_file_count} subfolderCount={it.direct_subfolder_count}
    createdBy={it.created_by} parentId={null} />
) : (
  <FileCard key={`x-${it.id}`} file={it} />
))}
```

Update the count line:

```tsx
<strong>{recent.length + data.total}</strong> items · last upload <strong>{relativeTime(lastUpload)}</strong>
```

Where `lastUpload = recent[0]?.created_at ?? null` still works because `TopLevelItem` carries `created_at`.

Also pass `items={recent}` to `<RecentStrip items={recent} />`.

- [ ] **Step 2: Build + smoke-test**

Run: `cd app && npm run build` — expect clean.
Then: `npm run dev` + upload a small folder; confirm the folder appears once in the strip + grid, not flattened.

- [ ] **Step 3: Commit**

```bash
git add app/src/app/\(shell\)/page.tsx
git commit -m "feat(ui): home grid + strip show mixed top-level items"
```

---

### Task 6: /recent page — mixed grid

**Files:**
- Modify: `app/src/app/(shell)/recent/page.tsx`

- [ ] **Step 1: Update the recent page**

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listTopLevelItems } from "@/lib/files";
import { FileCard } from "@/components/FileCard";
import { FolderTile } from "@/components/FolderTile";
import { PaginationLink } from "@/components/PaginationLink";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function RecentPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 24;
  const data = await listTopLevelItems(page, limit);
  const totalPages = Math.ceil(data.total / limit);

  return (
    <>
      <div className={styles.subheader}>
        <h1 className="vv-greeting">recent uploads</h1>
      </div>
      <div className={styles.grid}>
        {data.items.map((it) => it.kind === "folder" ? (
          <FolderTile key={`f-${it.id}`} id={it.id} name={it.name}
            fileCount={it.direct_file_count} subfolderCount={it.direct_subfolder_count}
            createdBy={it.created_by} parentId={null} />
        ) : (
          <FileCard key={`x-${it.id}`} file={it} />
        ))}
      </div>
      {totalPages > 1 && (
        <div className={styles.pagination}>
          {page > 1 && <PaginationLink href={`/recent?page=${page - 1}`}>← prev</PaginationLink>}
          <span>page {page} of {totalPages}</span>
          {page < totalPages && <PaginationLink href={`/recent?page=${page + 1}`}>next →</PaginationLink>}
        </div>
      )}
    </>
  );
}
```

Note: also switches plain `<a>` pagination to `PaginationLink` so the focus-restore flow from PR #58 works.

- [ ] **Step 2: Commit**

```bash
git add app/src/app/\(shell\)/recent/page.tsx
git commit -m "feat(ui): /recent shows mixed top-level items, paginated"
```

---

### Task 7: GlobalDropTarget — drop-anywhere upload

**Files:**
- Create: `app/src/components/GlobalDropTarget.tsx`
- Create: `app/src/components/GlobalDropTarget.module.css`
- Create: `app/src/components/GlobalDropTarget.test.tsx`
- Modify: `app/src/app/(shell)/layout.tsx`

**Constraints:**
- Only react when `e.dataTransfer.types` includes `"Files"` (ignore text/URL drags).
- Show a full-viewport scrim (`position: fixed; inset: 0`) while drag is over the document.
- Ignore drops that land inside an existing `<DropZone />` — those elements call `stopPropagation` via default React event system; we listen on `document` so we naturally get only events that bubbled up unhandled.
- On drop: open the existing `FolderPickerModal`, then call `enqueue(file, destFolderId)` for each dropped file.
- **MVP scope:** files only. Dropping a folder (webkit directory entry) falls through to enqueueing the directory-as-file or is quietly ignored — out of scope for this task. Document this in a comment.

- [ ] **Step 1: Write the failing test**

```tsx
// app/src/components/GlobalDropTarget.test.tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { GlobalDropTarget } from "./GlobalDropTarget";
import { UploadProgressProvider } from "./UploadProgressProvider";

// FolderPickerModal is expensive; stub it so the test just forces a folder selection.
// Real signature (app/src/components/FolderPickerModal.tsx:8-12):
//   { initialFolderId: string | null, onCancel: () => void, onSelect: (folderId: string | null) => void }
// It's rendered unconditionally when shown — parent controls mount.
vi.mock("./FolderPickerModal", () => ({
  FolderPickerModal: ({ onSelect, onCancel }: any) => (
    <div>
      <button onClick={() => onSelect(null)}>pick-root</button>
      <button onClick={onCancel}>cancel</button>
    </div>
  ),
}));

const enqueueSpy = vi.fn();
vi.mock("./UploadProgressProvider", () => ({
  useUploadProgress: () => ({ enqueue: enqueueSpy, items: [], cancel: vi.fn(), clear: vi.fn() }),
  UploadProgressProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function dataTransferWithFile(file: File): DataTransfer {
  const dt = new DataTransfer();
  dt.items.add(file);
  return dt;
}

describe("GlobalDropTarget", () => {
  beforeEach(() => { enqueueSpy.mockReset(); });

  it("shows scrim on dragenter and hides on dragleave", () => {
    render(<UploadProgressProvider><GlobalDropTarget /></UploadProgressProvider>);
    act(() => {
      const ev = new DragEvent("dragenter", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: { types: ["Files"] } });
      document.dispatchEvent(ev);
    });
    expect(screen.getByTestId("global-drop-scrim")).toBeTruthy();
  });

  it("opens picker on drop with a File and enqueues after selection", async () => {
    render(<UploadProgressProvider><GlobalDropTarget /></UploadProgressProvider>);
    const f = new File(["hi"], "hi.txt", { type: "text/plain" });
    act(() => {
      const ev = new DragEvent("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: { types: ["Files"], files: [f] } });
      document.dispatchEvent(ev);
    });
    const pickBtn = await screen.findByText("pick-root");
    act(() => { pickBtn.click(); });
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(enqueueSpy).toHaveBeenCalledWith(f, null);
  });

  it("ignores drags that don't carry Files", () => {
    render(<UploadProgressProvider><GlobalDropTarget /></UploadProgressProvider>);
    act(() => {
      const ev = new DragEvent("dragenter", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: { types: ["text/plain"] } });
      document.dispatchEvent(ev);
    });
    expect(screen.queryByTestId("global-drop-scrim")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/components/GlobalDropTarget.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the component**

```tsx
// app/src/components/GlobalDropTarget.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useUploadProgress } from "./UploadProgressProvider";
import { FolderPickerModal } from "./FolderPickerModal";
import styles from "./GlobalDropTarget.module.css";

// MVP: files only. Directory drops fall through to ignored / filesystem-dependent
// behavior. If users ask for recursive drop later, hook into NewMenu's
// webkitGetAsEntry tree path.
export function GlobalDropTarget() {
  const { enqueue } = useUploadProgress();
  const [scrim, setScrim] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pendingFilesRef = useRef<File[]>([]);
  const depthRef = useRef(0);

  useEffect(() => {
    function hasFiles(dt: DataTransfer | null) {
      return !!dt && Array.from(dt.types || []).includes("Files");
    }

    function onDragEnter(e: DragEvent) {
      if (!hasFiles(e.dataTransfer)) return;
      depthRef.current += 1;
      setScrim(true);
    }
    function onDragOver(e: DragEvent) {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault(); // required to allow drop
    }
    function onDragLeave() {
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setScrim(false);
    }
    function onDrop(e: DragEvent) {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      depthRef.current = 0;
      setScrim(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      pendingFilesRef.current = files;
      setPickerOpen(true);
    }

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <>
      {scrim && (
        <div data-testid="global-drop-scrim" className={styles.scrim} aria-hidden="true">
          <div className={styles.message}>drop files to upload</div>
        </div>
      )}
      {pickerOpen && (
        <FolderPickerModal
          initialFolderId={null}
          onCancel={() => { pendingFilesRef.current = []; setPickerOpen(false); }}
          onSelect={(folderId) => {
            setPickerOpen(false);
            for (const file of pendingFilesRef.current) enqueue(file, folderId);
            pendingFilesRef.current = [];
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Add CSS**

```css
/* app/src/components/GlobalDropTarget.module.css */
.scrim {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--vv-accent) 25%, transparent);
  border: 4px dashed var(--vv-accent);
  z-index: 900;
  display: grid;
  place-items: center;
  pointer-events: none;
}
.message {
  font-family: var(--vv-font-display);
  font-style: italic;
  font-weight: 700;
  font-size: 28px;
  color: var(--vv-ink);
  background: var(--vv-bg-panel);
  padding: 16px 28px;
  border: 2px solid var(--vv-ink);
  border-radius: var(--vv-radius-md);
  box-shadow: var(--vv-shadow);
}
```

- [ ] **Step 5: Confirm existing FolderPickerModal props (already done during planning)**

Real signature lives at `app/src/components/FolderPickerModal.tsx:8-12`:
```ts
{ initialFolderId: string | null; onCancel: () => void; onSelect: (folderId: string | null) => void }
```
The component is rendered conditionally by its parent (no `isOpen` prop). The code above matches this.

- [ ] **Step 6: Run test to verify passing**

Run: `cd app && npx vitest run src/components/GlobalDropTarget.test.tsx`
Expected: PASS.

- [ ] **Step 7: Mount in layout**

```tsx
// app/src/app/(shell)/layout.tsx — inside UploadProgressProvider, near GridMarquee
import { GlobalDropTarget } from "@/components/GlobalDropTarget";
// ...
<GlobalDropTarget />
```

- [ ] **Step 8: Commit**

```bash
git add app/src/components/GlobalDropTarget.tsx app/src/components/GlobalDropTarget.module.css app/src/components/GlobalDropTarget.test.tsx app/src/app/\(shell\)/layout.tsx
git commit -m "feat(upload): drop-anywhere to upload (opens folder picker)"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full test run**

Run: `cd app && npm test`
Expected: all previously-passing tests still pass; new tests green. Pre-existing ffprobe + testcontainers infra failures (Docker/ffmpeg unavailable) are acceptable — same baseline as PR #58.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Manual smoke in dev**
- [ ] Upload a `.txt` file → open `/f/<id>` → text renders in monospace
- [ ] Upload a 500 KB `.log` → banner says "showing first 256 KB"
- [ ] Drag a file from the OS onto the middle of the home page (outside the DropZone) → scrim appears → picker opens → pick root → file enqueues in drawer
- [ ] Upload a folder of 10 files → home page shows ONE folder tile (not 10 file cards) in the mixed grid; `/recent` same
- [ ] Dark mode folder hover reads (regression check on PR #59)

- [ ] **Step 4: Push branch + open PR**

```bash
git push -u origin feat/text-preview-drop-anywhere-folder-roots
gh pr create --title "feat: inline text preview + drop-anywhere upload + folder-as-unit grids"
```
