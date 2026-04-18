# UI Consistency Pass — Design

**Date:** 2026-04-18
**Status:** Approved
**Author:** Ryan + Claude

## Problem

Recent feature work (search, folders, rename/move) has introduced visual
inconsistency and UX friction:

- The `SearchBar` uses hardcoded colors (`#222`, `#faf4e6`, `#fff`) that
  bypass the design tokens in `globals.css`, so it doesn't match the rest
  of the retro aesthetic.
- The TopBar has no responsive handling for the search input — on phones
  the search input, brand, upload pill, and user chip all squeeze into
  one row and no single element gets enough room.
- `FolderPicker` renders an inline tree dropdown with hardcoded colors
  and uses raw `window.prompt`, `window.alert`, `window.confirm` for
  creating folders and resolving conflicts. The UX is crude and it works
  poorly on mobile.
- The main page has no way to create a folder. Users are told to
  "create one from the upload page" even when they have no files to
  upload. Same limitation exists on folder detail pages.
- Individual pages (`/search`, `/d/[id]`, `/f/[id]`) have drifted in
  small ways — stray hardcoded colors, inconsistent section spacing.

## Goals

1. Restore visual consistency across header, folder UI, and page
   layouts — everything uses `globals.css` tokens.
2. Make folder creation a first-class action on the main page and folder
   detail pages (not gated behind the upload flow).
3. Replace the crude inline FolderPicker + `prompt()` flow with a
   dedicated modal that is mobile-friendly (bottom sheet) and handles
   both "pick an existing folder" and "create a new folder" modes.
4. Give the TopBar a proper mobile treatment (collapsed-search pattern
   matching modern apps).
5. Maintain the existing retro aesthetic — hard shadows, Fraunces
   italic display font, warm palette. Nothing gets "modernized" into
   generic AI flatness.

## Non-Goals

- Replacing `window.confirm` for file deletion. Could reuse the new
  `Modal` primitive later; not in this pass.
- Dark mode.
- Animations (slide/fade transitions on modal open). Kept snappy and
  retro.
- Drag-to-dismiss on the mobile bottom sheet.
- Keyboard shortcut for focusing search (e.g. `/`).
- Any server-side / API changes. All endpoints already exist.
- New major dependencies (Radix, Headless UI, etc.). Hand-built modal.

## Architecture

### New components

**`src/components/Modal.tsx`** + `.module.css`
Primitive. Renders via `createPortal` into `document.body` when
`open={true}`. Props:
```ts
type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: "sm" | "md";  // default "md"
  children: React.ReactNode;
};
```
Behavior:
- Overlay: fixed, `inset: 0`, semi-transparent `var(--vv-ink)` at ~40%
  alpha. Click on overlay calls `onClose`.
- ESC key calls `onClose`.
- Focus trap while open. First focusable element inside the sheet gets
  focus on mount. Previously-active element receives focus again on
  close.
- `overflow: hidden` set on `<html>` while open to lock background
  scroll.
- Accessibility: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
  pointing at the title element.

Layout:
- **≥640px**: centered card, `max-width: 480px` for `size="sm"`, `560px`
  for `size="md"`. `border: 2px solid var(--vv-ink)`, hard shadow
  (`--vv-shadow-lg`), `background: var(--vv-bg-panel)`,
  `border-radius: var(--vv-radius-md)`.
- **<640px**: bottom sheet — full-width, slides up from the bottom,
  `max-height: 85dvh`, respects `--vv-safe-bottom` inset, rounded only
  on top corners. (No slide animation — appears instantly in keeping
  with the retro aesthetic.)

Header: title in `--vv-font-display` italic 20px + a `×` close button
on the right. `1.5px solid var(--vv-ink)` separator underneath.

**`src/components/FolderPickerModal.tsx`** + `.module.css`
Body component that sits inside a `<Modal>`. Not exported directly —
consumed by `FolderPicker`.

UX is drill-down, not tree-dump:
- **Breadcrumb strip** across the top: `Home / .ryan / clips`. Each
  crumb is tappable; tapping jumps the "current level" back to that
  folder.
- **Row list** shows only direct children of the current level.
  Tapping a folder name drills into it (becomes the new current level).
- Below the list, one inline action row:
  - `+ Create folder here` — expands into
    `[text input] [Create] [Cancel]` in place. Enter submits. On 201,
    the new folder appears in the list and becomes the current level.
    On 409, an inline error with "use existing" action surfaces.
- Footer: `Cancel` and `Select` buttons. `Select` picks the **current
  level** (shown in the breadcrumb) — not a highlighted row; there is
  no highlight interaction. To pick a specific folder, drill into it
  (or tap it in the breadcrumbs), then tap `Select`.
- Picking root: tap `Home` in the breadcrumbs → current level becomes
  root → tap `Select` (fires `onChange(null)`).

**`src/components/FolderPicker.tsx`** *(rewritten, same external API)*
Still exports `<FolderPicker value onChange />`. Internals become:
- A trigger button — styled as a hard-shadow card-like button that
  reads `📁 Folder: <name>` (or `Folder: None (root)` when null).
- Click opens `<FolderPickerModal>` inside a `<Modal>`.
- Callers (`UploadClient`, `FileActions`) need no changes.

**`src/components/NewFolderDialog.tsx`** + `.module.css`
Small `Modal`-based dialog for creating a folder at a specific parent.
Props:
```ts
type Props = {
  open: boolean;
  onClose: () => void;
  parentId: string | null;
  parentName: string | null;  // for title: "New folder in <parentName>"
  onCreated: (folder: {id: string; name: string}) => void;
};
```
- Title: `New folder in root` when `parentId === null`, else
  `New folder in "<parentName>"`.
- Body: label + text input.
- Footer: `Cancel` + `Create`. Enter submits.
- On 201: calls `onCreated`, closes.
- On 409: shows inline error `A folder named "X" already exists here.`
  (No "use it" action here — that's picker territory.)

**`src/components/NewFolderButton.tsx`**
Button + dialog wrapper. Props:
```ts
type Props = {
  parentId: string | null;
  parentName: string | null;
};
```
Renders a `+ New folder` button. Clicking opens a `NewFolderDialog`
with the current parent. On success, calls
`useRouter().refresh()` so the server-rendered page re-fetches and
shows the new folder.

### Modified components

**`src/components/SearchBar.tsx`** + `.module.css`
- Tokenize: replace hardcoded `#222`, `#faf4e6`, `#fff` with
  `var(--vv-ink)`, `var(--vv-bg-panel)`, etc.
- Add hard shadow (`--vv-shadow-sm`) to match other card-like
  elements.
- The `kind` label in dropdown hits uses `--vv-font-display` italic
  with `--vv-ink-muted`.
- Accept a `variant?: "inline" | "overlay"` prop. In `"overlay"` mode
  it renders for the mobile full-screen search overlay (no shadow,
  larger input). Default is `"inline"`.

**`src/components/TopBar.tsx`** + `.module.css`
- Adds a mobile-only search icon button (44px square) that replaces
  the inline SearchBar below `640px`.
- Clicking the icon opens a full-screen overlay:
  - Fixed, `inset: 0`, `background: var(--vv-bg)`.
  - Top row: `[×] [SearchBar variant="overlay" autoFocus]`.
  - The SearchBar's dropdown hits fill the remaining space.
  - ESC or tapping `×` closes the overlay.
- Desktop layout unchanged.
- Not using the `Modal` primitive — overlay covers the entire viewport
  with no card or shadow, different visual treatment. Still has dialog
  semantics for a11y (see Accessibility section).

**`src/components/FolderTile.tsx`** + `.module.css`
- Hover state: shadow shifts from `--vv-shadow-sm` to `--vv-shadow`,
  `transform: translate(-1px, -1px)`. Mirrors `FileCard`.
- Mobile: `min-height: 64px` for comfortable tap target.
- Tokenize any remaining hardcoded colors.

**`src/app/page.tsx`**
- Adds `<NewFolderButton parentId={null} parentName={null} />` in the
  "Folders" section header (next to the section label).

**`src/app/d/[id]/page.tsx`**
- Audit header to match the main page subheader pattern: folder name
  in `--vv-font-display` italic 36px (26px on mobile).
- Adds `<NewFolderButton parentId={folderId} parentName={folder.name} />`
  in the folder header.
- Verify mobile padding matches main page (`16px` horizontal on
  `<640px`).

**`src/app/search/page.module.css`** (and `page.tsx` if needed)
- Audit for hardcoded colors; replace with tokens.
- Match main page grid spacing and section-label styling.

**`src/app/f/[id]/page.module.css`** and `FileActions.module.css`
- Audit for hardcoded colors; replace with tokens.
- Verify `back` link styling matches breadcrumbs.

**`src/app/upload/UploadClient.tsx`**
- No code change — still renders `<FolderPicker>`. New visual
  treatment comes for free from the rewritten component.

**`src/app/f/[id]/FileActions.tsx`**
- No code change — still renders `<FolderPicker>` inside the move
  panel. Same deal.

### Removed / replaced

- The old `FolderPicker.tsx` inline dropdown implementation is deleted
  (replaced). The file is rewritten rather than removed.
- `FolderPicker.module.css` is rewritten to style only the trigger
  button.

## Data flow

Unchanged.

- `GET /api/folders/tree` — fetched by `FolderPickerModal` once on
  first open, cached in component state.
- `POST /api/folders` `{name, parentId}` — called by
  `FolderPickerModal` inline-create and by `NewFolderDialog`.
- `POST /api/files/[id]/move` `{folderId}` — unchanged.
- Main/folder detail pages call `router.refresh()` after successful
  folder creation to re-fetch server data.

## Error handling

- `Modal`: none at primitive level — it's a display component.
- `FolderPickerModal`:
  - `fetch("/api/folders/tree")` failure: show inline error at top of
    modal body; user can close and retry.
  - `POST /api/folders` 409: show inline "Already exists — use it?"
    with a button that selects the existing folder.
  - `POST /api/folders` 4xx (other): show inline error with message.
- `NewFolderDialog`:
  - 409: inline error under input; input stays editable.
  - 4xx (other): inline error under input.

## Accessibility

- `Modal`: proper dialog semantics (`role="dialog"`, `aria-modal`,
  labeled by title id), focus trap, focus restore.
- All new buttons have accessible names.
- The mobile search overlay has `role="dialog"` with
  `aria-label="Search"`.
- Tap targets ≥44px on touch devices (already enforced in
  `globals.css`).
- Both overlays close on ESC.

## Testing

- **`Modal`**: Vitest + React Testing Library.
  - Renders children when `open={true}`.
  - Does not render when `open={false}`.
  - Calls `onClose` on ESC.
  - Calls `onClose` on overlay click.
  - Does not call `onClose` on sheet click.
  - Focus moves into sheet on open; restored to trigger on close.
- **`FolderPickerModal`**:
  - Drill-down: tapping a folder name updates breadcrumbs and list.
  - Tapping a breadcrumb jumps back.
  - Inline create: submits to `POST /api/folders`; new folder appears
    in list and becomes current.
  - 409 path: inline error, "use existing" button works.
  - `Select` calls `onChange` with the current-level folder id (or
    `null` at Home) and closes.
- **`NewFolderDialog`**:
  - Submits `POST /api/folders` with correct `{name, parentId}`.
  - On 201 calls `onCreated` and closes.
  - On 409 surfaces inline error, stays open.
  - Enter key submits.
- **`SearchBar`**: already has coverage from earlier search work;
  adjust if tests assert on hardcoded colors/classes.
- **TopBar mobile overlay**: visual check; no unit test needed for the
  overlay state machine (trivial).
- **Manual mobile QA**: per CLAUDE.md — start dev server, verify on
  375×667 and 414×896 viewports that TopBar collapses, modal becomes
  bottom sheet, tap targets ≥44px, safe-area insets respected.
- **No server-side tests needed** — nothing server-side changes.

Tests live colocated with components (`Modal.test.tsx` next to
`Modal.tsx`, etc.), matching the pattern established in the app.
`fetch` is mocked as elsewhere in the codebase (no testcontainers
needed for these pure UI components).

## Build order

Laid out as discrete steps for the implementation plan:

1. `Modal` primitive + CSS + tests.
2. `NewFolderDialog` + CSS + tests (uses `Modal`).
3. `NewFolderButton` + wire into main page `/` and folder detail
   `/d/[id]`. `router.refresh()` path verified manually.
4. `FolderPickerModal` body + CSS + tests.
5. Rewrite `FolderPicker` to use trigger-button + `FolderPickerModal`.
   Verify existing `UploadClient` and `FileActions` still work
   (same external API).
6. `SearchBar` tokenization + `overlay` variant.
7. `TopBar` mobile search overlay.
8. `FolderTile` polish.
9. Audit pass: `/search`, `/d/[id]`, `/f/[id]` module CSS — replace
   hardcoded colors with tokens, normalize spacing.
10. Manual mobile QA on dev server. Type-check + tests + docker
    build per CLAUDE.md before PR.

## Risks & mitigations

- **Regression on existing upload / move flows**: `FolderPicker`
  external API is identical (`value`, `onChange`), so `UploadClient`
  and `FileActions` don't change. Existing upload/move tests continue
  to pass. Manual check on dev server before merge.
- **Modal focus trap bugs**: subtle to get right. Mitigation: unit
  tests for focus move + restore; manual keyboard-only testing on
  desktop.
- **iOS safe-area**: `<Modal>` bottom sheet must not hide the
  `Create` button under the home indicator. Mitigation: CSS uses
  `padding-bottom: max(16px, var(--vv-safe-bottom))`.
- **Scope creep during the audit pass**: the `/search`, `/d/[id]`,
  `/f/[id]` audit is intentionally narrow — only token/spacing fixes.
  If any audit turns up a structural issue, it's a follow-up PR, not
  part of this one.

## Stack context

Per `CLAUDE.md`: Next.js 15 App Router, TypeScript strict, no `any`.
Vitest for tests, colocated. Postgres untouched. No new deps. Work on
a feature branch, PR to `main`. CI builds docker image; Watchtower
auto-deploys on merge (~4 min).
