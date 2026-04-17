# VoreVault Redesign — Design Spec

**Date:** 2026-04-16
**Status:** Approved (brainstorm phase); pending implementation plan
**Scope:** All user-facing pages + admin panel. Visual-only — no backend/data changes.
**Brainstorm artifacts:** `.superpowers/brainstorm/3963629-1776429463/content/*.html` — the approved mockups are the pixel-level source of truth.

---

## 1. Purpose & Scope

Replace VoreVault's placeholder inline-styled UI with a cohesive, distinctive visual identity across every page. Current UI works but looks utilitarian and generic. New design lands a specific aesthetic — "warm earthy clip archive with moose mascot" — that feels like a Bullmoose-group product rather than a dashboard template.

### In scope
- All 6 user-facing routes: `/`, `/f/[id]`, `/upload`, `/login`, `/p/[token]`, `/admin`
- Shared components (TopBar, FileCard, UserChip, Pills/Buttons, ProgressBar, ShareBanner, MetaPanel)
- Brand identity: moose-head SVG logo, typography system, color tokens
- Web font loading via `next/font`

### Out of scope
- Backend routes, data models, business logic — all unchanged
- Mobile-specific layouts (keep responsive via CSS grid, but desktop-first; no dedicated mobile breakpoints)
- Dark mode (cream light mode only per brainstorm decision)
- Localization / i18n

---

## 2. Aesthetic Direction

**"V1 Warm & Earthy"** — chosen over dark, playful-retro, editorial, and brutalist alternatives. Warm cream background + Fraunces italic display type + hard-shadow chunky cards + moose-head mark. Cheerful and distinctive without being juvenile.

### Color tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--vv-bg` | `#f4ead5` | Primary background (warm cream) |
| `--vv-bg-panel` | `#fff8e6` | Elevated panels (upload rows, dropzone) |
| `--vv-bg-sunken` | `#e8dcc0` | Sunken/muted panels (sidebar, user chip) |
| `--vv-ink` | `#2a1810` | Primary ink — text, borders, hard shadows |
| `--vv-ink-muted` | `#7c5e3c` | Secondary text, italic body |
| `--vv-ink-subtle` | `#b8a07a` | Dashed borders, dividers |
| `--vv-accent` | `#c2410c` | Burnt orange — brand, primary CTAs, links |
| `--vv-accent-soft` | `#d97706` | Amber — video thumbnail tint, progress |
| `--vv-success` | `#84cc16` | Lime — done/approved states, share-created |
| `--vv-info` | `#0891b2` | Cyan — secondary accents |
| `--vv-danger` | `#be185d` | Magenta — errors, bans, delete hover |
| `--vv-warn` | `#fde68a` | Warm yellow — share banners, tip cards |
| `--vv-discord` | `#5865F2` | Discord blurple (login button only) |

### Typography

Load via `next/font/google`:
- **`Fraunces`** (italic, weights 700/900) — display, headings, brand wordmark, greetings
- **`Inter`** (weights 400/600/700) — body, UI labels, sans-serif everything
- **`JetBrains Mono`** (weight 700) — URLs, percentages, technical values (size bytes, file counts)

Type scale (desktop):
- Hero brand / page hero heading: Fraunces italic 900, 36–40px, letter-spacing -1 to -1.5px
- Section heading (Fraunces): italic 900, 20–24px
- Body heading (Fraunces): italic 900, 16–18px (table section titles, detail panel)
- Card title (Inter): 700, 13px
- Body text (Inter): 400, 14px
- Meta/label (Inter): 400, 11–12px, often italic color `--vv-ink-muted`
- Micro label (Inter): 700, 10–11px, uppercase, letter-spacing 0.5px — column headers, stat keys
- Mono values (JetBrains): 700, 11px — used for URLs and `%` counters

### Shape and elevation system

- **Borders:** 2px (default) or 2.5–3px (emphasized cards, player). Always `var(--vv-ink)` solid.
- **Hard shadow:** `3px 3px 0 var(--vv-ink)` (subtle), `4px 4px 0 var(--vv-ink)` (cards), `5px 5px 0 var(--vv-ink)` or `6px 6px 0 var(--vv-ink)` (hero elements). Offset, zero blur, ink color — no soft drop shadows anywhere.
- **Border radius:** 6px (small buttons, tiles), 8–10px (cards, panels), 12–16px (page frames, dropzone), 999px (pills, chips, avatars).
- **Avatar gradient:** `linear-gradient(135deg, #d97706, #be185d)` as default; per-user randomization acceptable later.

### Iconography

- **Moose mark** — inline SVG, 44×38 viewBox. Two antlers (6-point each, stroke `--vv-accent`, 1.8px stroke), cylindrical head in `--vv-ink`, cream pupils (`--vv-bg`), orange nose (`--vv-accent`). Scales from 22px (favicon) to 72px (login hero).
- **Star ornament `✦`** — used for share-created state, brand flourish on tips, public-share footer.
- **Arrow characters** `↑` `↓` `←` `→` — used for Upload, Download, back, view respectively. No icon library; Unicode only.

---

## 3. Shared Components

Each component lives in `app/src/components/` and imports the same token set from a shared CSS file.

### 3.1 `<MooseLogo size="header" | "favicon" | "hero" />`
Inline SVG, renders the moose mark at the requested size. Used in every TopBar and the login hero.

### 3.2 `<TopBar user={...} showUpload={true} />`
Appears on `/`, `/f/[id]`, `/upload`, `/admin`. Contains:
- **Left:** `MooseLogo` + "vorevault" Fraunces italic wordmark
- **Right:** Optional `Upload` primary pill, `UserChip` with avatar + username + ▾ affordance

### 3.3 `<UserChip user={user} />`
Rounded pill with gradient avatar, username, and dropdown caret. Click expands a menu (profile/admin/logout). For Plan scope, treat as plain link cluster; full dropdown is a nice-to-have.

### 3.4 `<Pill variant="primary" | "ghost" />` and `<Button variant="primary" | "ghost" | "success" | "danger" />`
- **Pill**: fully-rounded, 8–9px vertical padding, 16–18px horizontal, 12–13px font
- **Button**: rectangular, 6px radius, same padding scale
- **Primary**: orange bg, cream text, 3px hard shadow
- **Success**: lime bg, ink text, 3px hard shadow
- **Danger**: transparent, magenta fill on hover
- **Ghost**: transparent, ink border

### 3.5 `<FileCard file={...} />`
Used on home grid. Structure:
- Thumbnail (16:10 aspect ratio) — uses `thumbnail_path` via `/api/thumbs/:id`, falls back to color-gradient by type
- Top-left: uppercase type badge (mp4/png/gif) on cream background
- Bottom-right: duration badge (MM:SS) on black with cream text, for videos
- Top-right: `✦ shared` pill on orange if actively shared
- Meta strip (ink background, cream border-top): title (Inter 700 13px, ellipsis) + "uploader · size · relative time" (italic muted)

### 3.6 `<ShareBanner url={...} onCopy={...} />`
Warm yellow banner, hard shadow, Fraunces italic "Public link" label, monospace URL in a cream-backed code box, dark "Copy" button. Shows when an active share link exists.

### 3.7 `<MetaPanel rows={[{k, v}...]} />`
Sunken cream sidebar panel with 2px ink border + 4px hard shadow, Fraunces italic "Details" title in orange, key/value rows separated by dashed lines. Used on `/f/[id]`.

### 3.8 `<StatCard label value />`
Used on admin. Small cream panel, uppercase 10px label (muted), big Fraunces italic 22px orange value. 4 of them in a grid row.

### 3.9 `<DropZone onDrop={...} />`
Upload page centerpiece. 3px dashed ink border, 16px radius, warm cream bg, 64px vertical padding. Hover/active state switches bg to yellow `--vv-warn`, border to orange. Contains orange star icon, Fraunces italic heading "Drop files here", subtext, and a "Choose files" primary pill.

### 3.10 `<UploadRow upload={{name, size, pct, status, speed}} />`
Warm-cream card with ink border + 3px shadow. Top row: filename (truncate), size (italic muted), status pill (uploading=yellow/brown, done=lime, error=magenta). Bottom row: orange progress bar (becomes lime on done), percentage in mono, speed in mono, per-status action link (cancel/view→/retry→).

---

## 4. Per-Page Design

All pages follow the same base frame (12px radius page container with 2px ink border and 6px hard shadow is a **brainstorm preview only** — the real deployed pages render full-bleed on the warm cream background, no inner page frame). TopBar is a horizontal band with a 2px ink bottom border separating it from content.

### 4.1 Home `/`
1. **TopBar** (Upload pill + UserChip)
2. **Greeting row:** "Welcome back, **{user}**." (Fraunces italic 36px, user in orange 900) on the left; "**N** clips · **SIZE** · last upload Xh ago" stat ribbon on the right (muted italic, numbers in ink 700)
3. **3-column FileCard grid** (collapses to 2 cols under ~720px viewport, 1 col under ~480px — simple `grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))`)
4. **Empty state:** if grid is empty, replace with a centered "Drop the first clip in the vault." Fraunces heading + orange Upload pill
5. **Pagination:** simple `← Prev · Page N of M · Next →` centered below grid, muted

### 4.2 File view `/f/[id]`
1. **TopBar** (Upload pill + UserChip)
2. **"← back to vault"** muted italic link
3. **Two-column layout** (2fr : 1fr, collapses to single column under ~720px):
   - **Left column:** video/audio/image player with hard shadow + 2.5px border (use native `<video controls>`, `<audio controls>`, or `<img>` — the mockup's fake play button is decorative, the real control comes from the browser). Below player: Fraunces italic title (28px, 900), "uploaded by **X** · relative time" muted italic, then action buttons row, then ShareBanner if a share link is active.
   - **Right column:** `MetaPanel` with Type, Size, Resolution (if known), Duration (if known), Transcode status pill, Uploaded timestamp (ET), Uploader.
4. **Transcode banners** (as today) — amber "Processing video..." for `transcode_status='pending'` on videos, magenta "Transcoding failed" for `transcode_status='failed'`. Placed between player and title.

### 4.3 Upload `/upload`
1. **TopBar** (no Upload pill — we're already here)
2. **"← back to vault"** link
3. **Header row:** "Drop something in the vault." Fraunces 40px left + "Up to **10 GB** per file · resumable" on right
4. **DropZone** full-width (content block width; page still padded)
5. **"In flight"** Fraunces heading + summary ("**N of M done** · total X MB")
6. **2-column UploadRow grid** — auto-fill, min 340px per column
7. **Tip banner:** sunken cream strip, orange star icon, muted italic "**Heads up:** videos that aren't already h264 mp4 will auto-transcode..."

### 4.4 Login `/login`
1. No TopBar — fully bare
2. **Radial cream glow** background effect (`radial-gradient(ellipse at center, #fff8e6 0%, #f4ead5 70%)`)
3. **Centered content:**
   - Large `MooseLogo` (72×62)
   - "vorevault" Fraunces italic 40px orange
   - Tagline: "the **bullmoose** clip archive" (Fraunces italic, muted, bullmoose in ink 900 normal-style)
   - Discord button: blurple `#5865F2` bg, cream text, 2.5px ink border, 4px hard shadow, Discord SVG icon + "Sign in with Discord"
   - Footnote: "You need the **vorevault** role in the Bullmoose server." (small muted italic)

### 4.5 Public share `/p/[token]`
1. No TopBar, no user chrome — reachable anonymously
2. **Centered, max-width ~880px content:**
   - Player (cyan gradient placeholder during load) with 2.5px ink border + 4px hard shadow
   - Fraunces italic title (22px, 900)
   - Meta line (11px muted italic): `mime · size · duration · shared by **uploader**`
   - **Single action:** orange "↓ Download" button (the share page is view-only — no share/delete for non-owners)
   - **Footer** (top-bordered dashed): Fraunces italic small: `shared via **vorevault ✦** · the bullmoose archive`

### 4.6 Admin `/admin`
1. **Thin admin top strip** — dark `--vv-ink` bg, cream text, "admin · vorevault" in Fraunces orange, "← back to vault" link right
2. **Disk usage section:** Fraunces italic section title, 4-column StatCard row (Active files, Total size, Pending transcode, Deleted pending cleanup)
3. **Users (N) section:** Fraunces section title, full-width user table with cream card frame, hard shadow, ink border. Columns: Username (avatar + name + role pills), Files, Size, Role, Last login, Actions. Admin pill is orange-filled; "banned" pill is magenta-filled. Actions column: red "Ban" button or lime "Unban" button depending on state (own row: no button).

---

## 5. Implementation Notes

### File-level impact (existing files to modify)

```
app/src/app/layout.tsx            — add <html> font classes, global CSS import
app/src/app/globals.css (NEW)     — token variables + a few base resets
app/src/app/page.tsx              — rewrite home with new grid + greeting
app/src/app/f/[id]/page.tsx       — rewrite with two-column, use new components
app/src/app/f/[id]/FileActions.tsx — restyle, keep behavior
app/src/app/upload/page.tsx       — restyle server component
app/src/app/upload/UploadClient.tsx — restyle drop zone + upload rows
app/src/app/login/page.tsx        — rewrite
app/src/app/p/[token]/page.tsx    — rewrite
app/src/app/admin/page.tsx        — rewrite with stats + table
app/src/app/admin/AdminActions.tsx — restyle ban buttons
```

### New files

```
app/src/components/MooseLogo.tsx
app/src/components/TopBar.tsx
app/src/components/UserChip.tsx
app/src/components/FileCard.tsx
app/src/components/Pill.tsx
app/src/components/Button.tsx
app/src/components/ShareBanner.tsx
app/src/components/MetaPanel.tsx
app/src/components/StatCard.tsx
app/src/components/DropZone.tsx
app/src/components/UploadRow.tsx
app/src/components/ProgressBar.tsx
app/src/app/globals.css
```

### Styling approach

- **CSS Modules** (per-component `.module.css`) — Next.js-idiomatic, scoped, zero new dependencies. Tailwind is NOT introduced (decision from `DESIGN.md`: "do not unilaterally pick Tailwind/CSS-in-JS without asking").
- **Tokens** live in `globals.css` as CSS custom properties on `:root`, referenced from component modules via `var(--vv-*)`.
- **Replace existing inline-style JSX** in every touched page — no lingering `style={{...}}` attributes after migration, except for truly dynamic values (progress bar width %, per-user avatar gradient).
- **CSS `:hover` only** for interactive feedback — no JS-driven hover state.

### Accessibility

- Color contrast: ink on cream = ~13:1 (AAA). Orange on cream = ~5.5:1 (AA for large text only — headings are fine, avoid small-text orange on cream). Cream on orange = ~5.5:1 (AA large); cream on ink = ~13:1 (AAA). Always check small text stays on cream or ink, not orange.
- Focus rings: default browser outlines are fine as a starting point; add a custom 2px ink outline on pills/buttons if the default is suppressed.
- Semantic HTML: actual `<button>` for buttons, `<a>` for navigation, `<video controls>` / `<audio controls>` / `<img alt>` for media.

### Fonts

Load in `app/src/app/layout.tsx`:

```tsx
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
```

Declare variables, apply to `<html className={...}>`. All components use `var(--font-fraunces)` / `var(--font-inter)` / `var(--font-mono)` via `font-family`.

---

## 6. Non-goals (deliberately deferred)

- **Dark mode toggle** — light cream only; dark is a future feature if friends ask
- **Hover animations / micro-interactions** — plain CSS transitions (0.1–0.15s) only; no Framer Motion
- **Icon library** — Unicode + inline SVG for the moose suffices
- **Responsive mobile design** — grid collapses gracefully but no dedicated mobile treatment; we ship desktop-first
- **Logo variants / brand guidelines doc** — the moose SVG is the mark, end of story
- **Favicon generation** — replace manually after first deploy if desired (moose SVG rasterized)

---

## 7. Success criteria

- All 6 routes rendered in the new aesthetic, indistinguishable in feel from the approved mockups
- Home grid, file view, upload, login, public share, admin all using shared components (no page re-implementing the TopBar, for example)
- `npm test` passes (existing ~105 tests; no new tests required for purely visual changes)
- Lighthouse / manual check: contrast meets AA, fonts load without FOUT flash, no layout shift on thumbnail load
- Deployed to production at vault.bullmoosefn.com
