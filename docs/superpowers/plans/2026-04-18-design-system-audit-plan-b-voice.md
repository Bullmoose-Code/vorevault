# Plan B — Copy & Voice Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sweep every user-facing string across the app for voice compliance (sentence case, lowercase `vorevault`, no `!`, italic meta with bold mono stats), and apply the signature `.vv-meta` pattern to all count-bearing meta lines.

**Architecture:** No new components; no API changes; no layout changes. Each task modifies a page or component's JSX to reword strings and/or migrate a local `.meta`/`.by`/`.sub` class to the global `.vv-meta`. Numbers that should render as bold mono get wrapped in `<strong>` so the `.vv-meta strong` rule (defined in Plan A) auto-styles them.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, CSS Modules + `.vv-*` global classes (from Plan A).

**Depends on:** Plan A (`.vv-*` classes must be in `globals.css`). This branch stacks on `feat/design-system-audit` (Plan A PR #30).

**Spec reference:** `docs/superpowers/specs/2026-04-18-design-system-audit-design.md` (Plan B section).

---

## Voice rules (condensed)

1. Sentence case everywhere.
2. Brand always lowercase `vorevault`.
3. No exclamation marks. Greetings end in periods.
4. Bold role names in running copy: `**vorevault** role`.
5. Italic meta with bold mono numbers: `*12 clips · 3.4 GB · last upload 4h ago*` — numbers in `<strong>`.
6. Em-dash / ellipsis for quiet status (`Processing…`, `just now`, `—`).
7. No emoji in persistent UI. Allowed glyphs: `↑ ↓ ← → ✦ ★ ☆ × + › ·`.

## Signature pattern

For any count-bearing meta, the JSX is:

```tsx
<span className="vv-meta">... <strong>N</strong> things · <strong>X.X GB</strong> · last upload <strong>4h ago</strong></span>
```

The `.vv-meta strong` rule in `globals.css` auto-applies mono-bold-ink to the wrapped values.

---

## File Structure

**Create:** none.

**Modify:** page and component `.tsx` files. `.module.css` files are only touched where a local meta class is being deleted in favor of `.vv-meta`.

Pages
- `app/src/app/login/page.tsx` — verify (likely no change)
- `app/src/app/page.tsx` — confirm stats signature pattern renders
- `app/src/app/d/[id]/page.tsx` + `page.module.css`
- `app/src/app/f/[id]/page.tsx` + `page.module.css`
- `app/src/app/search/page.tsx` + `page.module.css`
- `app/src/app/upload/page.tsx`
- `app/src/app/upload/UploadClient.tsx` + `UploadClient.module.css`
- `app/src/app/saved/page.tsx`
- `app/src/app/p/[token]/page.tsx` + `page.module.css`
- `app/src/app/admin/page.tsx` (verify + minor copy tweaks)

Components
- `app/src/components/FileCard.tsx` + `FileCard.module.css`
- `app/src/components/FolderTile.tsx` + `FolderTile.module.css`
- `app/src/components/FolderPickerModal.tsx` + `FolderPickerModal.module.css` (replace `📁` emoji)
- `app/src/components/ShareBanner.tsx` (drop `!`)
- `app/src/app/f/[id]/FileActions.tsx` (`...` → `…`)

**Components verified voice-compliant during planning** (no per-task work needed):
- `DropZone` — ✓ sentence case, wry voice ("anything really"), approved glyph `✦`.
- `SearchBar` — ✓ placeholder lowercase intentional; `.kind` label renders raw `"folder"`/`"file"`.
- `NewFolderDialog` — ✓ all strings (`Folder name`, `Cancel`, `Create`, `Creating…`, conflict message) compliant.
- `TopBar` — ✓ lowercase brand, `Upload`, aria-labels. The `🔍` emoji is a known iconography concern deferred to Plan C.
- `UserChip` — ✓ menu items (`↑ My uploads`, `Saved`, `Admin`, `Log out`) compliant.
- `Breadcrumbs` — ✓ `home` link lowercase.
- `Pill`, `Button` — no internal strings (render children).

If the Task 14 sweep flags anything in these, fix inline and recommit.

**No test files are modified** unless a string-assertion test breaks. If that happens, update the test in the same commit as the copy change.

---

### Task 1: Verify /login voice

**Files:**
- Read: `app/src/app/login/page.tsx` (verify strings)

This is a verification task. No code change expected. The login page was reviewed in Plan A spec as already compliant.

- [ ] **Step 1: Verify strings in /login**

Open `app/src/app/login/page.tsx`. Confirm:
1. `<h1 className={`vv-brand ${styles.brand}`}>vorevault</h1>` — lowercase brand ✓
2. `<p className={styles.tagline}>the <strong>bullmoose</strong> clip archive</p>` — sentence case ✓, no exclamation ✓
3. `<a ... >Sign in with Discord</a>` — sentence case ✓
4. `<div className={styles.footnote}>You need the <strong>vorevault</strong> role in the Bullmoose server.</div>` — sentence case ✓, bold role ✓, period end ✓

- [ ] **Step 2: No commit — move to next task**

Record verification in the subagent report. No git commit needed. If any violation is found during verification (e.g., `!` in a string), fix it and commit with message `refactor(copy): sweep /login voice`.

---

### Task 2: Verify / home voice (stats signature pattern renders)

**Files:**
- Read: `app/src/app/page.tsx`

Plan A already migrated `<div className={styles.stats}>` to `<div className="vv-meta">`. The stats line already wraps numbers in `<strong>`: `<strong>{data.total}</strong> clip(s) · <strong>{formatBytes(totalBytes)}</strong> · last upload {relativeTime(lastUpload)}`. Task is to verify the signature pattern renders (auto-mono via `.vv-meta strong`) and to wrap `relativeTime(lastUpload)` in `<strong>` so "4h ago" also renders as mono.

- [ ] **Step 1: Wrap the relative time in `<strong>`**

In `app/src/app/page.tsx`, find the stats div (around line 64–69):

```tsx
<div className="vv-meta">
  <strong>{data.total}</strong> {data.total === 1 ? "clip" : "clips"} · <strong>{formatBytes(totalBytes)}</strong> · last upload {relativeTime(lastUpload)}
  {mineOnly && <> · <a href="/">view all</a></>}
</div>
```

Change the `last upload {relativeTime(lastUpload)}` portion so the time is bolded. Replace the inner content with:

```tsx
<strong>{data.total}</strong> {data.total === 1 ? "clip" : "clips"} · <strong>{formatBytes(totalBytes)}</strong> · last upload <strong>{relativeTime(lastUpload)}</strong>
{mineOnly && <> · <a href="/">view all</a></>}
```

- [ ] **Step 2: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault
git add app/src/app/page.tsx
git commit -m "refactor(copy): wrap home stats relative time in <strong> for mono"
```

---

### Task 3: /d/[id] meta — signature pattern

**Files:**
- Modify: `app/src/app/d/[id]/page.tsx`
- Modify: `app/src/app/d/[id]/page.module.css`

**What changes:**
- Wrap the subfolder and file counts in `<strong>` so they render as bold mono via `.vv-meta strong`.
- Replace the local `.meta` class with the global `.vv-meta` class in the JSX. Delete the local `.meta` rule from `page.module.css`.

- [ ] **Step 1: Update `page.module.css`**

In `app/src/app/d/[id]/page.module.css`, DELETE the `.meta` rule (currently at lines 40–43):

```css
.meta {
  font-size: 12px;
  color: var(--vv-ink-muted);
}
```

No replacement is needed — all typographic and color styling moves to `.vv-meta` globally.

- [ ] **Step 2: Update `page.tsx` JSX**

In `app/src/app/d/[id]/page.tsx`, find the meta line (currently around lines 36–38):

```tsx
<div className={styles.meta}>
  created by <strong>@{folder.creator_username}</strong> · {children.subfolders.length} subfolders · {children.files.length} files
</div>
```

Replace with:

```tsx
<div className="vv-meta">
  created by <strong>@{folder.creator_username}</strong> · <strong>{children.subfolders.length}</strong> {children.subfolders.length === 1 ? "subfolder" : "subfolders"} · <strong>{children.files.length}</strong> {children.files.length === 1 ? "file" : "files"}
</div>
```

Note: the pluralisation tweak (1 subfolder vs N subfolders) is a minor voice correction in the same edit.

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/d/[id]/page.tsx app/src/app/d/[id]/page.module.css
git commit -m "refactor(copy): /d/[id] meta signature pattern + .vv-meta"
```

---

### Task 4: /f/[id] by-line — signature pattern + noPreview period

**Files:**
- Modify: `app/src/app/f/[id]/page.tsx`
- Modify: `app/src/app/f/[id]/page.module.css`

**What changes:**
- Migrate `.by` to `.vv-meta`.
- Wrap the date in `<strong>` so it renders as bold mono.
- The "No preview available for …" string is missing a period — add one.

- [ ] **Step 1: Update `page.module.css`**

In `app/src/app/f/[id]/page.module.css`, DELETE:

```css
.by {
  color: var(--vv-ink-muted);
  font-style: italic;
  font-size: 14px;
}

.by strong {
  color: var(--vv-ink);
  font-style: normal;
  font-weight: 700;
}
```

No replacement needed — `.vv-meta` covers this and `.vv-meta strong` gives mono-bold-ink.

- [ ] **Step 2: Update `page.tsx` by-line (around lines 101–108)**

Change:

```tsx
<div className={styles.by}>
  uploaded by <strong>{file.uploader_name}</strong> ·{" "}
  {new Date(file.created_at).toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  })}
</div>
```

to:

```tsx
<div className="vv-meta">
  uploaded by <strong>{file.uploader_name}</strong> · <strong>{new Date(file.created_at).toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  })}</strong>
</div>
```

- [ ] **Step 3: Update the noPreview string (around lines 82–86)**

Change:

```tsx
<div className={styles.noPreview}>
  No preview available for <code>{file.mime_type}</code>
</div>
```

to:

```tsx
<div className={styles.noPreview}>
  No preview available for <code>{file.mime_type}</code>.
</div>
```

(Trailing period added.)

- [ ] **Step 4: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault
git add app/src/app/f/[id]/page.tsx app/src/app/f/[id]/page.module.css
git commit -m "refactor(copy): /f/[id] by-line to .vv-meta + noPreview period"
```

---

### Task 5: /search — add results count line

**Files:**
- Modify: `app/src/app/search/page.tsx`

**What changes:**
- Add a results-count line under the title in signature pattern: `<strong>N</strong> results for "q"`.
- Fix the "Query too short." copy to match voice expectations (already compliant, just verify).

- [ ] **Step 1: Add results count to the main render branch**

In `app/src/app/search/page.tsx`, after the `<h1>` (currently line 32), add a results-count line. The total count is `result.folders.length + fileCards.length`.

Change:

```tsx
<h1 className={`vv-title ${styles.title}`}>Search: <em>{q}</em></h1>
{result.folders.length > 0 && (
```

to:

```tsx
<h1 className={`vv-title ${styles.title}`}>Search: <em>{q}</em></h1>
<p className="vv-meta">
  <strong>{result.folders.length + fileCards.length}</strong> {result.folders.length + fileCards.length === 1 ? "result" : "results"} for <em>&ldquo;{q}&rdquo;</em>
</p>
{result.folders.length > 0 && (
```

Note: `&ldquo;` and `&rdquo;` render as curly quotes.

- [ ] **Step 2: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault
git add app/src/app/search/page.tsx
git commit -m "refactor(copy): /search add results count line in signature pattern"
```

---

### Task 6: /upload page + UploadClient signature pattern

**Files:**
- Modify: `app/src/app/upload/UploadClient.tsx`
- Modify: `app/src/app/upload/UploadClient.module.css`

**What changes:**
- The `.summary` line in UploadClient uses a custom `.summary` class. Migrate the `<div className={styles.summary}>` to `<div className="vv-meta">` and wrap the total bytes in `<strong>`.
- The heading `In flight` is fine (sentence case, no exclamation).

The upload page itself (`app/src/app/upload/page.tsx`) has voice-compliant copy after Plan A already migrated it. No change needed there.

- [ ] **Step 1: Update `UploadClient.module.css`**

In `app/src/app/upload/UploadClient.module.css`, DELETE both rules (currently lines 16–26):

```css
.summary {
  color: var(--vv-ink-muted);
  font-style: italic;
  font-size: 13px;
}

.summary strong {
  color: var(--vv-accent);
  font-style: normal;
  font-weight: 700;
}
```

No replacement — the JSX below drops the `styles.summary` reference in favor of `vv-meta`. LEAVE UNCHANGED: `.uploadsHeader`, `.uploadsHeader h2`, `.grid`, and all mobile rules.

Note: the original used `var(--vv-accent)` for the bold-number color; the new `.vv-meta strong` uses `var(--vv-ink)`. This is an intentional standardization — the design system uses ink (not accent) for numeric emphasis.

- [ ] **Step 2: Update `UploadClient.tsx` JSX**

In `app/src/app/upload/UploadClient.tsx`, find (around lines 65–70):

```tsx
<div className={styles.uploadsHeader}>
  <h2>In flight</h2>
  <div className={styles.summary}>
    <strong>{doneCount} of {uploads.length} done</strong> · total {formatTotalBytes(totalBytes)}
  </div>
</div>
```

Change to:

```tsx
<div className={styles.uploadsHeader}>
  <h2>In flight</h2>
  <div className="vv-meta">
    <strong>{doneCount}</strong> of <strong>{uploads.length}</strong> done · total <strong>{formatTotalBytes(totalBytes)}</strong>
  </div>
</div>
```

Note: the original wrapped the whole phrase in one `<strong>`; new version wraps the numeric values individually so mono applies to counts and total, not the prose.

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/upload/UploadClient.tsx app/src/app/upload/UploadClient.module.css
git commit -m "refactor(copy): UploadClient summary signature pattern"
```

---

### Task 7: /saved empty state rewrite

**Files:**
- Modify: `app/src/app/saved/page.tsx`

**What changes:**
- Empty state copy: `No saved files yet. Tap the star on any file to save it here.` → `Nothing saved yet. Tap ★ on any file to pin it here.`
- Replaces the word "star" with the ★ glyph (an approved control glyph), changes "save" to "pin" for voice variety, changes `"No"` to `"Nothing"` for dry voice.

- [ ] **Step 1: Update empty state**

In `app/src/app/saved/page.tsx`, change line 20 from:

```tsx
<p className={styles.empty}>No saved files yet. Tap the star on any file to save it here.</p>
```

to:

```tsx
<p className={styles.empty}>Nothing saved yet. Tap ★ on any file to pin it here.</p>
```

- [ ] **Step 2: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault
git add app/src/app/saved/page.tsx
git commit -m "refactor(copy): /saved empty state rewrite"
```

---

### Task 8: /p/[token] meta signature pattern

**Files:**
- Modify: `app/src/app/p/[token]/page.tsx`

**What changes:**
- The meta line currently joins parts with ` · ` in a plain string. Refactor to render as JSX so bytes and duration can be wrapped in `<strong>` for bold mono via `.vv-meta strong`.
- Migrate `.meta` class to `.vv-meta` (but see below — the page still has `.meta` defined in its module.css as layout).

- [ ] **Step 1: Update `page.module.css` — remove `.meta` typography**

In `app/src/app/p/[token]/page.module.css`, DELETE:

```css
.meta {
  font-size: 12px;
  color: var(--vv-ink-muted);
  font-style: italic;
  margin-bottom: 14px;
}

.meta strong {
  color: var(--vv-ink);
  font-style: normal;
  font-weight: 700;
}
```

Replace with layout-only:

```css
.meta {
  margin-bottom: 14px;
}
```

- [ ] **Step 2: Update `page.tsx` JSX**

In `app/src/app/p/[token]/page.tsx`, the current implementation builds `metaParts` as an array and joins them. Refactor to JSX with `<strong>` wrapping.

Change (around lines 35–39 and 62):

```tsx
const metaParts = [
  file.mime_type,
  formatBytes(file.size_bytes),
  file.duration_sec != null ? formatDuration(file.duration_sec) : null,
].filter(Boolean);
```

and line 62:

```tsx
<p className={styles.meta}>{metaParts.join(" · ")}</p>
```

To: delete the `metaParts` array and render JSX inline:

```tsx
<p className={`vv-meta ${styles.meta}`}>
  {file.mime_type} · <strong>{formatBytes(file.size_bytes)}</strong>
  {file.duration_sec != null && <> · <strong>{formatDuration(file.duration_sec)}</strong></>}
</p>
```

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/p/[token]/page.tsx app/src/app/p/[token]/page.module.css
git commit -m "refactor(copy): /p/[token] meta signature pattern"
```

---

### Task 9: /admin voice sweep

**Files:**
- Modify: `app/src/app/admin/page.tsx`

**What changes:**
- Section counts `Users ({users.length})` and `Folders ({folders.length})` are .vv-title headings, so `<strong>` inside them won't apply mono. Accept the plain parenthetical count as titlecase display — no change.
- The empty-state `<p>No folders yet.</p>` has no class; voice is fine. Add `className="vv-meta"` to style it consistently.

- [ ] **Step 1: Apply `.vv-meta` to the folders empty state**

In `app/src/app/admin/page.tsx`, find (around line 87):

```tsx
<p>No folders yet.</p>
```

Change to:

```tsx
<p className="vv-meta">No folders yet.</p>
```

- [ ] **Step 2: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault
git add app/src/app/admin/page.tsx
git commit -m "refactor(copy): /admin folders empty state uses .vv-meta"
```

Note: /admin's other strings (section titles, table headers, role pill text) are already voice-compliant after Plan A migrated section titles and the /admin `.adminLabel` was left as a custom display.

---

### Task 10: FileCard meta — signature pattern

**Files:**
- Modify: `app/src/components/FileCard.tsx`
- Modify: `app/src/components/FileCard.module.css`

**What changes:**
- `.sub` div (uploader · bytes · time) migrates to `.vv-meta` for italic-muted + bold-mono-number treatment.
- Wrap bytes and relative-time in `<strong>`.
- Leave `.title` alone — that's the filename, display-mode text, not meta.

- [ ] **Step 1: Update `FileCard.module.css`**

In `app/src/components/FileCard.module.css`, DELETE the `.sub` rule (currently at lines 119–124):

```css
.sub {
  font-size: 11px;
  color: var(--vv-ink-muted);
  margin-top: 2px;
  font-style: italic;
}
```

Replace with layout-only:

```css
.sub {
  margin-top: 2px;
  font-size: 11px;
}
```

We retain `font-size: 11px` because `.vv-meta`'s 13px would be too large for the card subcopy; the local override keeps density. The italic + color come from `.vv-meta`.

- [ ] **Step 2: Update `FileCard.tsx` JSX**

In `app/src/components/FileCard.tsx`, find (around line 65–67):

```tsx
<div className={styles.sub}>
  {file.uploader_name} · {formatBytes(file.size_bytes)} · {relativeTime(file.created_at)}
</div>
```

Change to:

```tsx
<div className={`vv-meta ${styles.sub}`}>
  {file.uploader_name} · <strong>{formatBytes(file.size_bytes)}</strong> · <strong>{relativeTime(file.created_at)}</strong>
</div>
```

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/components/FileCard.tsx app/src/components/FileCard.module.css
git commit -m "refactor(copy): FileCard meta signature pattern"
```

---

### Task 11: FolderTile counts — signature pattern

**Files:**
- Modify: `app/src/components/FolderTile.tsx`
- Modify: `app/src/components/FolderTile.module.css`

**What changes:**
- `.counts` (mono 12px) renders the counts all-in-mono. Spec wants italic prose with bold mono numbers. Migrate to `.vv-meta` + wrap numbers in `<strong>`.

- [ ] **Step 1: Update `FolderTile.module.css`**

In `app/src/components/FolderTile.module.css`, DELETE the `.counts` rule (currently at lines 30–34):

```css
.counts {
  font-size: 12px;
  color: var(--vv-ink-muted);
  font-family: var(--vv-font-mono);
}
```

Replace with layout-only:

```css
.counts {
  font-size: 12px;
}
```

The 12px size is retained (vs `.vv-meta`'s 13px) for tile density. Italic and muted color come from `.vv-meta`. Bold mono numbers come from `.vv-meta strong`.

- [ ] **Step 2: Update `FolderTile.tsx` JSX**

In `app/src/components/FolderTile.tsx`, change the current render (lines 7–15):

```tsx
const parts: string[] = [];
if (fileCount) parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"}`);
if (subfolderCount) parts.push(`${subfolderCount} subfolder${subfolderCount === 1 ? "" : "s"}`);
return (
  <Link href={`/d/${id}`} className={styles.tile}>
    <span className={styles.name}>{name}</span>
    {parts.length > 0 && <small className={styles.counts}>{parts.join(" · ")}</small>}
  </Link>
);
```

Change the body to render JSX with `<strong>` wrapping. Replace lines 7–15 with:

```tsx
const hasFiles = fileCount > 0;
const hasSubs = subfolderCount > 0;
return (
  <Link href={`/d/${id}`} className={styles.tile}>
    <span className={styles.name}>{name}</span>
    {(hasFiles || hasSubs) && (
      <small className={`vv-meta ${styles.counts}`}>
        {hasFiles && (
          <>
            <strong>{fileCount}</strong> {fileCount === 1 ? "file" : "files"}
          </>
        )}
        {hasFiles && hasSubs && " · "}
        {hasSubs && (
          <>
            <strong>{subfolderCount}</strong> {subfolderCount === 1 ? "subfolder" : "subfolders"}
          </>
        )}
      </small>
    )}
  </Link>
);
```

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/components/FolderTile.tsx app/src/components/FolderTile.module.css
git commit -m "refactor(copy): FolderTile counts signature pattern"
```

---

### Task 12: FolderPickerModal — replace 📁 emoji

**Files:**
- Modify: `app/src/components/FolderPickerModal.tsx`

**What changes:**
- The folder row icon `📁` is a persistent-UI emoji and violates the "no emoji" rule. Replace with the approved `›` glyph or simply drop the icon column since `›` is already used on the right side as a drill-in indicator. Decision: keep the left icon slot but use a minimal text glyph `—` (em-dash) or just remove it entirely for cleaner rows.

Per plan choice: remove the `📁` glyph and let the `.rowIcon` span render empty (cleaner) OR use a minimal unicode folder glyph. Going with removal — cleaner, less visual noise.

- [ ] **Step 1: Update `FolderPickerModal.tsx`**

In `app/src/components/FolderPickerModal.tsx`, find (around line 162):

```tsx
<span className={styles.rowIcon} aria-hidden="true">📁</span>
```

Change to:

```tsx
<span className={styles.rowIcon} aria-hidden="true">·</span>
```

(Uses a middle-dot character as a neutral leading glyph instead of the folder emoji.)

- [ ] **Step 2: Run FolderPickerModal tests**

Run: `cd app && npm test -- src/components/FolderPickerModal.test.tsx`
Expected: PASS (7 tests). If a test asserts the `📁` string, update it to assert `·` instead.

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/components/FolderPickerModal.tsx
git commit -m "refactor(copy): FolderPickerModal replace 📁 with neutral dot"
```

---

### Task 13: Misc voice fixes — ShareBanner + FileActions ellipsis

**Files:**
- Modify: `app/src/components/ShareBanner.tsx`
- Modify: `app/src/app/f/[id]/FileActions.tsx`

**What changes:**
- ShareBanner: `"Copied!"` → `"Copied"` (drop exclamation).
- FileActions: three-dot placeholder `"..."` → ellipsis char `"…"` (matching ellipsis voice rule). Occurs in two places: sharing button and renaming button.

- [ ] **Step 1: Update ShareBanner.tsx**

In `app/src/components/ShareBanner.tsx`, find line 20:

```tsx
{copied ? "Copied!" : "Copy"}
```

Change to:

```tsx
{copied ? "Copied" : "Copy"}
```

- [ ] **Step 2: Update FileActions.tsx ellipsis**

In `app/src/app/f/[id]/FileActions.tsx`, find (around line 121):

```tsx
{sharing ? "..." : shareUrl ? "Revoke public link" : "✦ Create public link"}
```

Change to:

```tsx
{sharing ? "…" : shareUrl ? "Revoke public link" : "✦ Create public link"}
```

And find (around line 130):

```tsx
{renaming ? "..." : "Rename"}
```

Change to:

```tsx
{renaming ? "…" : "Rename"}
```

And find (around line 144):

```tsx
{deleting ? "Deleting..." : "Delete"}
```

Change to:

```tsx
{deleting ? "Deleting…" : "Delete"}
```

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/components/ShareBanner.tsx app/src/app/f/[id]/FileActions.tsx
git commit -m "refactor(copy): drop exclamation in ShareBanner; use ellipsis char in FileActions"
```

---

### Task 14: Final sweep + build + PR

**Files:** none created; this is verification + PR.

- [ ] **Step 1: Sweep for exclamation marks in JSX**

Run (from `/root/vorevault`):
```bash
rg -n "![</\"\']" app/src/ --glob "*.tsx"
```

Or simpler, hunt for string literals with `!`:
```bash
rg -n '"[^"]*!"' app/src/app/ app/src/components/
```

Expected: zero hits in rendered strings. Any hit in comments or regex is fine; any hit in a JSX-string or template literal rendered to the DOM is a violation — fix inline and recommit.

- [ ] **Step 2: Sweep for uppercase brand**

Run:
```bash
rg -n "VoreVault|Vorevault|VOREVAULT" app/src/
```

Expected: zero hits. Brand is always lowercase `vorevault`. If any hit is found, fix inline.

- [ ] **Step 3: Sweep for persistent-UI emoji in JSX**

Run:
```bash
rg -n --pcre2 "[\p{Emoji_Presentation}]" app/src/ --glob "*.tsx"
```

Expected: only the following hits are acceptable:
- `app/src/components/StarButton.tsx` — `★` (control glyph, allowed)
- `app/src/components/TopBar.tsx` — `🔍` (search icon, deferred to Plan C)
- `app/src/app/f/[id]/FileActions.tsx` — `✦` in "Create public link" (approved glyph)
- `app/src/components/DropZone.tsx` — `✦` (approved glyph)
- `app/src/app/p/[token]/page.tsx` — `✦` in the footer "shared via vorevault ✦" (approved glyph)
- `app/src/components/FileCard.tsx` — `✦` in shared badge (approved glyph)
- `app/src/app/login/page.tsx` — Discord SVG (approved inline SVG)

Any other hit indicates a missed emoji — fix inline and recommit.

- [ ] **Step 4: Run tests**

Run: `cd app && npm test`
Expected: all previously-passing component tests still pass. Pre-existing ffprobe/testcontainers failures allowed.

- [ ] **Step 5: Run build**

Run: `cd app && npm run build`
Expected: green, all routes compile.

- [ ] **Step 6: Push branch and open PR**

```bash
cd /root/vorevault
git push -u origin feat/design-system-audit-plan-b
gh pr create --base feat/design-system-audit --title "feat(ui): design-system audit Plan B — copy & voice pass" --body "$(cat <<'EOF'
## Summary

Plan B of the design-system audit — copy & voice pass. Depends on Plan A (#30); this branch stacks on Plan A's branch.

Sweeps every user-facing string for voice compliance (sentence case, lowercase `vorevault`, no `!`, italic meta with bold mono stats), and applies the signature `.vv-meta` pattern to all count-bearing meta lines.

## What changed

- Page meta lines (`/d/[id]`, `/f/[id]`, `/p/[token]`, home stats) now use `.vv-meta` with numbers wrapped in `<strong>` for auto-mono.
- `/search` gained a "N results for 'q'" line in signature pattern.
- `/saved` empty state rewritten to "Nothing saved yet. Tap ★ on any file to pin it here."
- FileCard + FolderTile meta migrated to `.vv-meta` signature pattern.
- FolderPickerModal `📁` row icon replaced with a neutral `·` (no emoji in persistent UI).
- ShareBanner: `Copied!` → `Copied` (no exclamation).
- FileActions: `...` placeholders → `…` ellipsis char.

## Files touched

- Pages: `/`, `/d/[id]`, `/f/[id]`, `/search`, `/upload` (UploadClient), `/saved`, `/p/[token]`, `/admin`
- Components: `FileCard`, `FolderTile`, `FolderPickerModal`, `ShareBanner`
- `FileActions` (file detail page helper)

## Test plan

- [x] `npm test` — all component tests green (Modal / NewFolderDialog / FolderPickerModal).
- [x] `npm run build` — green.
- [x] `rg` sweeps: no stray `!` in JSX strings; no uppercase `VoreVault`; no persistent-UI emoji beyond the approved whitelist (★, ✦, Discord SVG, deferred 🔍).
- [ ] Manual QA desktop on all 9 pages.
- [ ] Manual QA mobile 375×667 on all 9 pages.

## Follow-up

Plan C (shadow/border/radius/icon audit — including TopBar `🔍` replacement) in a separate PR per the audit spec.

**Merge order:** merge Plan A (#30) first; this PR will then rebase onto main cleanly.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Note: the `--base feat/design-system-audit` flag targets Plan A's branch so the PR stacks. After Plan A merges to main, rebase this PR onto main and change base.

- [ ] **Step 7: Report PR URL + CI status**

After `gh pr create` succeeds, run:
```bash
gh pr view --json url,state,baseRefName
gh pr checks
```

Report both.

---

## Self-Review Checklist (already run by author)

- [x] Every task cites exact file paths and line ranges.
- [x] Every string change shows both "from" and "to" content verbatim.
- [x] `.vv-meta` signature pattern (italic meta + `<strong>` numbers) is applied consistently across pages and components that render count-bearing stats.
- [x] Emoji sweep covers all tasks where an emoji was swapped or tolerated.
- [x] No task references a component that doesn't exist or a line number that's stale relative to Plan A's merged state.
- [x] Mobile QA is called out in the final PR body (human responsibility).
- [x] Voice rules are listed once at the top and not repeated per task (DRY).
