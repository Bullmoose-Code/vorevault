# VoreVault Design System — Master

> Single source of truth for VoreVault's visual language, component patterns, interaction rules, and anti-patterns. Read this before any UI work. If the code disagrees with this document, that's a bug — the code is wrong or this doc is out of date, pick one and fix it.

**Canonical CSS:** `app/src/app/globals.css` (tokens) + component CSS modules (patterns).
**Canonical tests:** unit + component tests in `app/src/{lib,components,app}/**/*.test.ts(x)`.

---

## 1. Identity

**Product.** VoreVault is a Discord-gated file vault for a small friend group. Shared pool — everyone sees everything. Not a Google Drive clone, not enterprise software. It's a focused personal tool.

**Feel.** Warm, editorial, playful, hand-made. Sticker-shadow brutalism. Pieces that look like they were printed, cut out, and pasted onto the page.

**Voice.**
- Brand is **lowercase**: `vorevault`, never `VoreVault` in UI.
- **Sentence case** in copy, not Title Case.
- **No exclamation marks.** Ever.
- Terse. "move to trash" not "Move this item to the trash bin."
- First-person natural when it fits ("drop the first file in the vault").

---

## 2. Palette

### 2.1 Light (default)

| Token | Hex | Role |
|---|---|---|
| `--vv-bg` | `#f4ead5` | Page background — warm cream |
| `--vv-bg-panel` | `#fff8e6` | Cards and panels |
| `--vv-bg-sunken` | `#e8dcc0` | Subtler containers, hover states |
| `--vv-ink` | `#2a1810` | Primary text, borders, shadows — dark brown |
| `--vv-ink-muted` | `#7c5e3c` | Secondary text |
| `--vv-ink-subtle` | `#b8a07a` | Tertiary text, disabled |
| `--vv-accent` | `#c2410c` | Brand accent, primary CTA, focus rings — rust |
| `--vv-accent-soft` | `#d97706` | Secondary accent |
| `--vv-success` | `#84cc16` | Success toasts, success icon-tiles |
| `--vv-info` | `#0891b2` | Info toasts, audio icon-tiles |
| `--vv-danger` | `#be185d` | Destructive actions, error toasts |
| `--vv-warn` | `#fde68a` | Warning backgrounds |
| `--vv-ink-warn` | `#7c2d12` | Warning text |
| `--vv-discord` | `#5865F2` | Discord brand only |

### 2.2 Dark (explicit `[data-theme="dark"]` OR system preference)

| Token | Hex | Notes |
|---|---|---|
| `--vv-bg` | `#1a0f08` | Near-black warm undertone |
| `--vv-bg-panel` | `#2a1c12` | Slightly raised for cards |
| `--vv-bg-sunken` | `#120a05` | Subtlest containers |
| `--vv-ink` | `#f4ead5` | Cream — inverted ink |
| `--vv-ink-muted` | `#c9a87a` | |
| `--vv-ink-subtle` | `#8a7353` | |
| `--vv-accent` | `#ea580c` | Brighter rust |
| `--vv-accent-soft` | `#fb923c` | |
| `--vv-success` | `#a3e635` | |
| `--vv-info` | `#22d3ee` | |
| `--vv-danger` | `#f472b6` | |
| `--vv-warn` | `#fde68a` | Unchanged |
| `--vv-ink-warn` | `#fcd34d` | |
| `--vv-discord` | `#5865F2` | Unchanged (Discord brand) |

### 2.3 Theme selection

- Default: `@media (prefers-color-scheme: dark) :root:not([data-theme="light"]) { ... }` — follow OS.
- Explicit `[data-theme="dark"]` forces dark regardless of OS.
- Explicit `[data-theme="light"]` forces light regardless of OS.
- User toggle (`<ThemeToggle>` in UserChip menu) cycles `system → light → dark → system` and persists to `localStorage.vv:theme`.
- FOUC prevention: `public/theme-init.js` loaded synchronously from `<head>` sets the attribute before first paint.

### 2.4 Contrast

Every palette pair meets WCAG AA (4.5:1 for body text; 3:1 for large text). Cream-on-dark-brown exceeds 7:1 in dark mode. Do not introduce new pairs without verifying.

---

## 3. Typography

Three families, each with a specific job:

| Variable | Family | Use |
|---|---|---|
| `--vv-font-display` | Fraunces italic (900, sometimes 700) | Greetings, titles, section labels |
| `--vv-font-ui` | Inter (400/600/700) | Body, buttons, menu items, metadata |
| `--vv-font-mono` | JetBrains Mono (700) | Numbers, counts, file-size / duration / count stats |

Italic Fraunces is the signature — use it for anything declarative (`vorevault`, `welcome back, <strong>alice</strong>.`, `all files`). UI chrome stays Inter.

### 3.1 Semantic classes (defined in `globals.css`)

- `.vv-brand` — 48px italic 900, lowercase, accent color (brand logotype)
- `.vv-greeting` — 36px italic 400 (`welcome back, alice.`)
- `.vv-title` — 28px italic 900 (page titles)
- `.vv-dialog-title` — 20px italic 700 (Modal / dialog headers)
- `.vv-section-label` — 14px italic 700, uppercase, bottom-bordered (`all files`, `folders`)
- `.vv-body` — 14px Inter 400
- `.vv-label` — 12px Inter 600
- `.vv-meta` — 13px Inter 400 italic (metadata rows — uploader · size · relative time)
- `.vv-meta strong` — JetBrains Mono 700 (numbers inside metadata get promoted to mono)
- `.vv-mono` — 12px JetBrains Mono 700
- `.vv-button-label` — 13px Inter 700

Responsive: display sizes shrink on `max-width: 640px`.

---

## 4. Spacing

Spacing uses a 4/8px grid. Common increments: `4, 8, 10, 12, 14, 16, 20, 24, 32`. Prefer these over arbitrary values. No spacing tokens yet — literal `px` in CSS modules is fine as long as it lands on the grid.

---

## 5. Radii

| Token | px |
|---|---|
| `--vv-radius-sm` | 4 |
| `--vv-radius` | 6 |
| `--vv-radius-md` | 8 |
| `--vv-radius-lg` | 12 |
| `--vv-radius-xl` | 16 |

Cards use `md` (8). Menu items use `sm` (4). Dialogs use `md`–`lg`. Never use circles except the selection-check indicator on cards.

---

## 6. Shadows (sticker aesthetic)

**All shadows are hard-offset solid, colored by `var(--vv-ink)`.** There are no soft / blurred / inset shadows anywhere. The sticker effect IS the brand.

| Token | Value | Use |
|---|---|---|
| `--vv-shadow-sm` | `2px 2px 0 var(--vv-ink)` | Small badges |
| `--vv-shadow` | `3px 3px 0 var(--vv-ink)` | Most buttons, tiles |
| `--vv-shadow-md` | `4px 4px 0 var(--vv-ink)` | Cards, toolbars |
| `--vv-shadow-lg` | `5px 5px 0 var(--vv-ink)` | Hover-lifted cards |
| `--vv-shadow-xl` | `6px 6px 0 var(--vv-ink)` | Rare, emphasis |

In dark mode, `--vv-ink` is cream — shadows become cream-on-dark. The sticker effect inverts. This is deliberate.

---

## 7. Iconography

**No icon libraries.** No Lucide, no Heroicons, no Phosphor, no emoji. Every icon is hand-authored inline SVG.

### 7.1 SVG conventions

```svg
<svg
  role="img"
  aria-label="<what this represents>"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  strokeWidth="2"
  strokeLinecap="round"
  strokeLinejoin="round"
>
  <!-- paths -->
</svg>
```

- 24×24 viewbox.
- `stroke="currentColor"` so the parent's CSS color cascades.
- Stroke width 2 consistently.
- Round caps and joins.
- `aria-label` for decorative-free icons; `aria-hidden="true"` if the surrounding control already has an accessible name.

### 7.2 File kind icons

`<FileIcon>` exports a single SVG per file kind. The 11 kinds and their tile background tokens:

| Kind | Tile background | Tile glyph color | Example labels |
|---|---|---|---|
| `video` | `--vv-accent` | `--vv-bg` | MP4, WEBM, MOV |
| `audio` | `--vv-info` | `--vv-bg` | MP3, WAV, FLAC |
| `image` | `--vv-success` | `--vv-ink` | PNG, JPG, GIF |
| `document` | `--vv-bg-panel` | `--vv-ink` | PDF, DOCX, TXT, MD |
| `code` | `--vv-ink` | `--vv-bg` | JS, TS, PY, HTML |
| `archive` | `--vv-accent-soft` | `--vv-bg` | ZIP, 7Z, TAR |
| `executable` | `--vv-danger` | `--vv-bg` | EXE, MSI, APK |
| `disk-image` | `--vv-ink-muted` | `--vv-bg` | ISO, DMG, IMG |
| `font` | `--vv-warn` | `--vv-ink-warn` | TTF, OTF, WOFF |
| `data` | `--vv-bg-sunken` | `--vv-ink` | JSON, CSV, XML |
| `other` | `--vv-ink-muted` | `--vv-bg` | fallback |

Classification rule: extension-first precedence (because uploads often arrive with `application/octet-stream`). MIME fallback. See `lib/fileKind.ts`.

---

## 8. Component patterns

### 8.1 Sticker card chassis

The base shape used for `FileCard` and (a flatter variant) `FolderTile`:

```
background: var(--vv-bg-panel)   (or var(--vv-ink) for thumbnail cards)
border: 2.5px solid var(--vv-ink)
border-radius: var(--vv-radius-md)
box-shadow: var(--vv-shadow-md)
transition: transform 100ms
```

Hover lifts by `translate(-1px, -1px)` and bumps to `--vv-shadow-lg`. Focus state uses a `3px solid var(--vv-accent)` outline offset by 2px.

### 8.2 FileCard variants

- **Thumbnailable** (video, image with thumbnail_path): renders `<img>` inside the 16:10 thumb.
- **Icon-forward** (document, code, archive, etc.): renders kind-colored `.iconTile` with centered `<FileIcon>` at 48px.
- Duration badge only for `video` and `audio` kinds.
- Type label (e.g. `MP4`, `MD`, `ISO`) top-left, in cream on ink pill.

### 8.3 FolderTile

Flatter than FileCard — no thumbnail area. Name + counts (`3 files · 2 subfolders`). Selected state fills the whole tile with `--vv-accent` (not just an outline).

### 8.4 Selection state

- **Selected card**: `3px solid var(--vv-accent)` outline, 2px offset + a 20px circular corner marker with a cream check glyph.
- **Selected folder**: same outline + full-tile accent fill with cream text.
- Applied via `.selected` class, not inline styles.

### 8.5 Focus ring (keyboard)

Every interactive element must show a visible focus ring:

```css
:focus-visible {
  outline: 3px solid var(--vv-accent);
  outline-offset: 2px;
}
```

Applied to cards, tiles, toolbar buttons, menu items, inputs.

### 8.6 Context menu

Radix `ContextMenu`. The content panel inherits the sticker chassis: `--vv-bg-panel` background, 2.5px ink border, `--vv-shadow-md`. Menu items get 8px×10px padding and a 2-color hover (ink background, cream text). Destructive items (Trash) use `--vv-danger`.

### 8.7 Dialogs

Three shared dialog components, all with the sticker chassis:

- `<Modal>` — generic shell with `role="dialog"`, ESC to close, focus trap.
- `<ConfirmDialog>` — title + message + confirm/cancel, `variant="danger"` flips accent to `--vv-danger`.
- `<PromptDialog>` — title + single input + confirm/cancel; throws from `onConfirm` to show inline error.

### 8.8 Toast

Stacks bottom-right with safe-area padding. Auto-dismiss after 3s (per-toast timer, not list-level). Max 3 visible — oldest drops when a 4th arrives. Variants: `info`, `success`, `error`.

### 8.9 Selection toolbar

Pinned below TopBar when selection is non-empty. Sticker panel with ink background + cream text. Shows count, clear button, and contextual actions (Move to…, Move to trash, Download as zip).

---

## 9. Interaction patterns

### 9.1 Click semantics

- **Plain click** on a card/tile → navigate (open file detail or enter folder).
- **Cmd/Ctrl+click** → toggle item in selection (no nav).
- **Shift+click** → select range from `selection.anchorId` to clicked item (no nav).
- **Right-click** or **long-press** on touch → context menu.
- **Esc** → clear selection (global handler).
- **Plain click elsewhere** does NOT clear selection — only Esc or the Clear toolbar button.

### 9.2 Keyboard grid navigation

When a card has focus:

- **Arrows** move focus spatially (`findNextInDirection` uses `getBoundingClientRect`).
- **Shift+Arrow** moves focus AND adds the new-focused item to selection.
- **Space** toggles focused item in selection.
- **Enter** — NOT intercepted; browser's native `<a>` navigation runs.

When anywhere (not typing in an input):

- **Cmd/Ctrl+A** selects all navigable items on the page.
- **Delete / Backspace** dispatches `vv:batch-trash` event, opening the toolbar's confirm dialog.
- **`/`** focuses `#vv-search`.

Text inputs take priority — all the "when not typing" handlers check `document.activeElement` and bail if it's an `<input>` / `<textarea>` / `<select>` / `contenteditable`.

### 9.3 Drag-and-drop

- **Source**: FileCard + FolderTile with `draggable={canManage}`. Dragging a selected item drags the whole selection; dragging an unselected item drags just that one.
- **Target**: FolderTile + VaultTree nodes accept drops.
- **Payload MIME**: `application/x-vorevault-drag` (custom type; doesn't collide with file-from-desktop drags which the upload `DropZone` handles).
- **Self-drop** (dropping a folder onto itself) is rejected client-side. Cycle-into-descendant is rejected server-side via `FolderCycleError` and surfaces as an error toast.
- **Visual**: source fades to `opacity: 0.4`; target gets a dashed `--vv-accent` outline.

### 9.4 Permission gating

`canManage = user.isAdmin || item.owner_id === user.id`. Rename / Move / Trash actions are gated on this everywhere — context menu, selection toolbar, drag source. Download and "Copy public link" are **intentionally available to all authenticated group members** per the shared-pool principle (`DESIGN.md`). This is not a bug — do not add owner-only gating to `POST /api/files/:id/share` or `GET /api/stream/:id`.

---

## 10. Accessibility commitments

- **Contrast**: every palette pair ≥ 4.5:1 (AA). Pre-verified.
- **Focus rings** visible on every interactive element, both themes.
- **`aria-label`** on every icon-only button or SVG that carries meaning.
- **`aria-pressed`** on toggleable cards reflecting selection state.
- **`aria-live="polite"`** on toast region; individual toasts have `role="status"`.
- **Keyboard reachable**: every action is reachable without a mouse (Tab + arrow + modifiers + shortcuts from §9.2).
- **`prefers-color-scheme`** respected as the default; explicit toggle overrides.
- **`prefers-reduced-motion`** — globally wired in `globals.css`: transitions and animations drop to `0.01ms` when the user prefers reduced motion. Hover color changes still land; movement is suppressed.

---

## 11. Anti-patterns (forbidden)

1. **Emoji as UI icons.** Hand-authored SVG only.
2. **Icon libraries.** No Lucide, Heroicons, Phosphor, Tabler, etc. Authored assets only.
3. **Soft / blurred shadows.** Only the sticker formula.
4. **Gradients as backgrounds.** Solid fills only.
5. **Raw hex / rgba in component CSS** — use `--vv-*` tokens. Four documented exceptions exist (see §13); don't add more without a justification comment.
6. **Generic blue-SaaS aesthetic.** The ui-ux-pro-max generator tried to push us toward `#2563EB` in Phase 1. We rejected it.
7. **Title Case in copy.** Sentence case. Lowercase brand name.
8. **Exclamation marks.** Never.
9. **Text below 12px.** Mobile minimum is 16px for body; 11px is the absolute floor for non-essential metadata.
10. **Hover-only affordances.** Everything has a keyboard or tap-accessible equivalent.

---

## 12. File-kind color map quick reference

Same table as §7.2, pulled out for copy-paste:

```
kind_video      → background var(--vv-accent)       color var(--vv-bg)
kind_audio      → background var(--vv-info)         color var(--vv-bg)
kind_image      → background var(--vv-success)      color var(--vv-ink)
kind_document   → background var(--vv-bg-panel)     color var(--vv-ink)
kind_code       → background var(--vv-ink)          color var(--vv-bg)
kind_archive    → background var(--vv-accent-soft)  color var(--vv-bg)
kind_executable → background var(--vv-danger)       color var(--vv-bg)
kind_disk_image → background var(--vv-ink-muted)    color var(--vv-bg)
kind_font       → background var(--vv-warn)         color var(--vv-ink-warn)
kind_data       → background var(--vv-bg-sunken)    color var(--vv-ink)
kind_other      → background var(--vv-ink-muted)    color var(--vv-bg)
```

CSS class names use underscores (`kind_disk_image`, not `kind_disk-image`). The runtime mapping uses `kind.replaceAll("-", "_")`.

---

## 13. Ledger of intentional exceptions

Four raw-color values exist in component CSS. Each is deliberate and should NOT be tokenized:

| Location | Value | Justification |
|---|---|---|
| `FileCard.module.css` `.duration` | `background: rgba(0,0,0,0.85)` | Video-duration overlay on thumbnail. Must stay dark regardless of theme — readable white text on dark scrim over arbitrary image content. |
| `FileCard.module.css` `.tileFallback` (placeholder text) | `color: rgba(255,255,255,0.3)` | Very subtle text-on-color on kind tiles. Intentionally theme-independent because the tile backgrounds are saturated colors, not theme surfaces. |
| `FileCard.module.css` `.selected::after` | SVG data URI with `stroke='%23f4ead5'` | Corner selection-check glyph. Uses cream hex literally because CSS custom properties don't interpolate into data-URI SVG. Update both the token and this literal together if the cream value ever changes. |
| `login/page.module.css` `.discordBtn` | `color: #fff` | Discord brand button. White text is Discord brand styling; stays white in both themes. |

Any new raw color needs an entry here with a justification — otherwise tokenize it.

---

## 14. What's intentionally NOT specified (open questions)

- ~~`prefers-reduced-motion` support~~ — shipped. Global override in `globals.css`.
- **Motion/easing tokens** (`--vv-ease`, `--vv-duration-short`, etc.). Today we inline `100ms` / `150ms` / `transition: transform 0.1s`. Tokenize if motion becomes a larger concern.
- **Iconography scale** (sm / md / lg icon sizes). Today FileIcon defaults to 24 and accepts a `size` prop. Formalize if more sizes proliferate.
- **Empty states**. No shared empty-state component; each page rolls its own. Candidate for extraction.
- **Error boundaries** beyond the existing dialog-inline error. No app-level ErrorBoundary yet.

Bring these up when they start to matter. Until then, don't over-engineer.

---

## 15. How to make changes to this document

- **Add a new token or component pattern** → update the relevant section.
- **Change the palette** → update §2 AND `app/src/app/globals.css`. Both must stay in lockstep.
- **Add a new anti-pattern** → §11. Explain why in a sentence.
- **Add a new raw-color exception** → §13, with justification. If it's just decorative, tokenize instead.
- **Remove a rule** → explain why in the PR description. Rules here represent earned decisions; don't delete them casually.

This file supersedes the earlier planned three-file layout (README.md / colors_and_type.css / ui_kits/...). One master document is simpler to keep current.
