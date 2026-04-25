# Prev/Next File Navigation — Design

Implements **Theme 2.2** of `docs/superpowers/specs/2026-04-25-roadmap-design.md`: prev/next navigation inside a file detail view, with `←/→` keys + on-screen buttons that walk the same list the user came from.

## Goal

Let a user binge through the files in their current list (folder, recent, mine, starred, or tag-filtered home) without bouncing back to the grid between every file.

## Scope

**In scope (the contexts that get prev/next):**
- Folder detail (`/d/[id]`) — files within the folder, in `created_at DESC` order, subfolders excluded
- Recent (`/recent`) — all top-level files in `created_at DESC` order
- Mine (`/mine`) — files uploaded by the current user, `created_at DESC`
- Starred (`/starred`) — current user's bookmarked files, in bookmark `created_at DESC` order
- Home with active tag filter (`/?tag=<id>`) — files carrying that tag, `created_at DESC`

**Out of scope:**
- Search (`/search`) — trigram-similarity ordering doesn't binge well; defer until Theme 3 stabilizes search
- Trash (`/trash`) — soft-deleted, not a binge target
- Share-link pages (`/p/[token]`) — public, no user context to preserve
- Wraparound at boundaries (last → first)
- Mobile swipe gestures (conflict with vertical scroll + video player taps)
- `j`/`k` Vim-style keys
- Prefetching the prev/next files (can add later if perceived perf is an issue)
- A "shuffle"/random-next button

## Architecture

Three small, well-bounded units:

1. **URL context plumbing.** Each grid passes a `from` descriptor to the `FileCard`s it renders. The descriptor becomes a query string on the file-detail link. The file-detail page reads the descriptor from `searchParams` and uses it to compute neighbors. Real anchor `href`s — right-click "open in new tab" works and the link is shareable in Discord.
2. **Server-side neighbor query.** A new `app/src/lib/neighbors.ts` exports `getNeighbors(currentFileId, ctx)` returning `{ prev, next }`. Two SQL queries (one per direction) with `LIMIT 1`, using the same `ORDER BY` as the source grid plus a deterministic `(created_at, id)` tie-breaker.
3. **Two new UI components.** `PrevNextNav.tsx` (server) renders two anchors with the right `href`s and disabled state. `PrevNextKeys.tsx` (`"use client"`) listens for `←`/`→` keydown and calls `router.push()`. Both are dropped into `app/src/app/(shell)/f/[id]/page.tsx`.

This deliberately mirrors the back-link helper from Theme 2.1: pure server-side derivation + a tiny client component for the keyboard hook only.

### URL shape

The file-detail link gains a single `from=` query parameter (and one optional `tag=` partner for the tag context):

| Origin grid | URL on file detail |
|---|---|
| Folder `/d/<folderId>` | `/f/<id>?from=folder/<folderId>` |
| Recent `/recent` | `/f/<id>?from=recent` |
| Mine `/mine` | `/f/<id>?from=mine` |
| Starred `/starred` | `/f/<id>?from=starred` |
| Tagged home `/?tag=<tagId>` | `/f/<id>?from=tagged&tag=<tagId>` |
| Anywhere else (search, public, direct link) | no `from=` — prev/next row hidden |

The home page **without** a filter (`/`) does not pass `from`. The home grid mixes the recent strip + folders + paginated files, and the user's natural "back" target is the home page itself; `from=recent` would walk a different (full, unfiltered) list and feel inconsistent. If a future iteration adds a "use home as a binge context," it can add `from=home`.

### Neighbor query

```ts
// app/src/lib/neighbors.ts
export type NeighborContext =
  | { kind: "folder"; folderId: string }
  | { kind: "recent" }
  | { kind: "mine"; uploaderId: string }
  | { kind: "starred"; userId: string }
  | { kind: "tagged"; tagId: string };

export type Neighbors = {
  prev: { id: string } | null;
  next: { id: string } | null;
};

export async function getNeighbors(
  currentFileId: string,
  ctx: NeighborContext,
): Promise<Neighbors>;
```

**SQL pattern (illustrative — actual implementation lives in plan):**

For the `recent` context:

```sql
-- prev (file just before the current in the list)
SELECT id FROM files
WHERE deleted_at IS NULL
  AND folder_id IS NULL  -- top-level only, matches listTopLevelItems' file rows
  AND (created_at, id) > ($curCreatedAt, $curId)
ORDER BY created_at ASC, id ASC
LIMIT 1;

-- next (file just after)
SELECT id FROM files
WHERE deleted_at IS NULL
  AND folder_id IS NULL
  AND (created_at, id) < ($curCreatedAt, $curId)
ORDER BY created_at DESC, id DESC
LIMIT 1;
```

Note that `prev` (visually "the older direction" since the grid sorts `created_at DESC`) walks toward larger timestamps, because in `created_at DESC` ordering, the row that appears *before* the current is the *newer* one. The contract is "prev = the row immediately before this one in the visible grid order, next = the row immediately after."

For each context, the WHERE clause is parametrized:

| Context | Extra WHERE |
|---|---|
| `folder` | `folder_id = $folderId` |
| `recent` | `folder_id IS NULL` |
| `mine` | `uploader_id = $uploaderId` |
| `starred` | `id IN (SELECT file_id FROM bookmarks WHERE user_id = $userId)` and the `(created_at, id)` ordering is on the *bookmark's* `created_at`, not the file's |
| `tagged` | `id IN (SELECT file_id FROM file_tags WHERE tag_id = $tagId)` |

`deleted_at IS NULL` applies to every context. `created_at = $cur AND id < $cur_id` style tie-breaker is included so two files with the exact same timestamp resolve deterministically.

**Cost:** two indexed queries per file-detail page render. With existing indexes on `(folder_id, created_at, id)`, `(uploader_id, created_at, id)`, and the bookmark/tag join tables, both should be index-scan + LIMIT 1 — sub-millisecond. No measurable impact.

### UI components

#### `app/src/components/PrevNextNav.tsx` (server component)

```ts
type Props = {
  prev: { id: string } | null;
  next: { id: string } | null;
  fromQuery: string;  // e.g. "from=folder/abc-123" — appended verbatim to neighbor links
};
```

Renders a `<nav>` row with two anchors:

```tsx
<nav className={styles.row} aria-label="prev/next file">
  {prev ? (
    <a href={`/f/${prev.id}?${fromQuery}`} className={styles.button}>← prev</a>
  ) : (
    <span className={`${styles.button} ${styles.disabled}`} aria-disabled="true">← prev</span>
  )}
  {next ? (
    <a href={`/f/${next.id}?${fromQuery}`} className={styles.button}>next →</a>
  ) : (
    <span className={`${styles.button} ${styles.disabled}`} aria-disabled="true">next →</span>
  )}
</nav>
```

Visual placement: top of the content area, opposite the back link. Tile-style buttons with the standard hard-offset sticker shadow per `design-system/MASTER.md`. Disabled state uses `--vv-ink-muted` text and removes the shadow (matches existing disabled-button conventions).

#### `app/src/components/PrevNextKeys.tsx` (`"use client"`)

Tiny effect-only component. Receives the same `prev`/`next`/`fromQuery` props.

```ts
useEffect(() => {
  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.key === "ArrowLeft" && prev) router.push(`/f/${prev.id}?${fromQuery}`);
    if (e.key === "ArrowRight" && next) router.push(`/f/${next.id}?${fromQuery}`);
  }
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [prev, next, fromQuery, router]);
```

Renders nothing. Strict-mode-safe (cleanup removes the listener).

### File-detail page integration

In `app/src/app/(shell)/f/[id]/page.tsx`:

1. Read `from` and (optional) `tag` from `searchParams`.
2. Parse it into a `NeighborContext | null` via a small parser in `neighbors.ts` (`parseFromParam`). Unknown/malformed → `null`, prev/next row hidden.
3. If non-null, call `getNeighbors(file.id, ctx)` in the existing `Promise.all`.
4. Compute `fromQuery` (the URL-encoded original `from`/`tag` pair) for re-use.
5. Render `<PrevNextNav>` and `<PrevNextKeys>` near the existing back link / breadcrumb area.

The change to existing logic is additive — no current behavior moves.

### Grid changes (FileCard prop wiring)

`FileCard` (`app/src/components/FileCard.tsx`) already builds `<a href={`/f/${file.id}`}>`. Add an optional `from?: string` prop and append it to the href. Each grid passes the appropriate value:

| Grid | Value passed |
|---|---|
| `app/src/app/(shell)/d/[id]/page.tsx` | `from={`folder/${folder.id}`}` |
| `app/src/app/(shell)/recent/page.tsx` | `from="recent"` |
| `app/src/app/(shell)/mine/page.tsx` | `from="mine"` |
| `app/src/app/(shell)/starred/page.tsx` | `from="starred"` |
| `app/src/app/(shell)/page.tsx` (home) | `from={tagId ? `tagged&tag=${tagId}` : undefined}` |
| `app/src/app/(shell)/search/page.tsx` | `from` omitted (out of scope) |

The `RecentStrip` component (used on home) is also a place users click into files. It does **not** pass `from` — clicks from the recent strip on home behave like other home-grid clicks (no prev/next), keeping the "home is its own thing" rule consistent.

## Behavior matrix

| Situation | Behavior |
|---|---|
| File at the start of the list | `← prev` disabled. `next →` works. |
| File at the end of the list | `← prev` works. `next →` disabled. |
| File is the only one in context | Both buttons disabled. |
| User lands on `/f/<id>` with no `from=` | Prev/next row not rendered. |
| `from=` value is malformed or unknown | Treat as no `from` — row not rendered. No error, no log noise. |
| User came from filtered home `?tag=...` | `from=tagged&tag=<id>` preserved across all prev/next clicks. |
| Folder context, file moved out of folder mid-session | Stale `from=folder/<id>` — neighbor query simply finds no neighbors there. User reaches a dead-end. Acceptable. |
| Current file deleted/trashed mid-session | Page already returns `notFound()` before prev/next renders. |
| User opens prev/next link in new tab | Real `<a href>`, works perfectly; new tab inherits `from` and binges the same context. |
| `from=tagged` and the tag was deleted | Neighbor query returns no rows → both buttons disabled. User navigates away normally. |
| Stale `from=mine` on someone else's file (e.g., shared link) | Neighbor query scoped to current user; no neighbors → buttons disabled. |
| `from=starred` and the file is no longer bookmarked by the user | Neighbor query returns no rows for that side → that side disabled. |

## Testing

- **Unit tests** for `parseFromParam` (every valid shape, every invalid shape).
- **Integration tests** (testcontainers + real Postgres) for `getNeighbors` covering each context kind: empty list, single item, middle item, first item, last item, deleted-file exclusion, tie-breaker on identical `created_at`. Follows the existing `files.topLevel.integration.test.ts` pattern.
- **Component test** for `PrevNextNav` (renders disabled span when `prev` or `next` is null; renders anchor with `from=` preserved when not null).
- **Component test** for `PrevNextKeys` (`←`/`→` triggers `router.push`; ignores when typing in inputs; ignores when modifier held; ignores when corresponding neighbor is null).
- **No automated browser test for the page itself.** Manual smoke test on production after Watchtower deploy is the final verification step (consistent with the Theme 2.1 ship path).

## File structure

| Path | Status | Responsibility |
|---|---|---|
| `app/src/lib/neighbors.ts` | **Create** | `NeighborContext` types, `parseFromParam`, `getNeighbors` |
| `app/src/lib/neighbors.test.ts` | **Create** | Unit tests for `parseFromParam` |
| `app/src/lib/neighbors.integration.test.ts` | **Create** | Testcontainers integration tests for `getNeighbors` |
| `app/src/components/PrevNextNav.tsx` | **Create** | Server component, two anchors with disabled state |
| `app/src/components/PrevNextNav.module.css` | **Create** | Styles matching the design system |
| `app/src/components/PrevNextNav.test.tsx` | **Create** | Component tests |
| `app/src/components/PrevNextKeys.tsx` | **Create** | Client component, keyboard hook |
| `app/src/components/PrevNextKeys.test.tsx` | **Create** | Component tests |
| `app/src/components/FileCard.tsx` | **Modify** | Accept optional `from?: string`, append to href |
| `app/src/app/(shell)/f/[id]/page.tsx` | **Modify** | Parse `from`, fetch neighbors, render components |
| `app/src/app/(shell)/d/[id]/page.tsx` | **Modify** | Pass `from={`folder/${folder.id}`}` to FileCards |
| `app/src/app/(shell)/recent/page.tsx` | **Modify** | Pass `from="recent"` to FileCards |
| `app/src/app/(shell)/mine/page.tsx` | **Modify** | Pass `from="mine"` to FileCards |
| `app/src/app/(shell)/starred/page.tsx` | **Modify** | Pass `from="starred"` to FileCards |
| `app/src/app/(shell)/page.tsx` (home) | **Modify** | Pass `from={`tagged&tag=${tagId}`}` only when filter active |
