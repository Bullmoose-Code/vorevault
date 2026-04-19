# VoreVault Design System

A design system for **VoreVault** — a self-hosted, Discord-gated file/clip sharing web app for the Bullmoose friend group. Single-tenant, Discord identity, in-browser playback, "everyone sees everything" by default.

## Source material

- Codebase: `Bullmoose-Code/vorevault` — Next.js 15 / TS strict / CSS Modules
- Canonical tokens: `app/src/app/globals.css`
- Fonts: Fraunces (display, italic), Inter (UI), JetBrains Mono (stats)

## CONTENT FUNDAMENTALS

### Voice & tone
- Second-person, direct. "Drop the first clip in the vault."
- Dry, understated, occasionally wry. ("mp4, mov, png, jpg, gif, anything really")
- Insider-y but not impenetrable.
- Warm-greeting style. `Welcome back, Riley.` (period, not exclamation)

### Casing
- Sentence case for everything.
- Lowercase brand mark: `vorevault`, always.
- ALL-CAPS only for the tiny italic section-label bar (FOLDERS, RECENT UPLOADS).
- Badges, pills, table headers: sentence/lowercase in Inter — never caps. File-type badges use JetBrains Mono at their natural lowercase.

### Grammar tics
- **Bold role names in running copy.** `You need the **vorevault** role in the Bullmoose server.`
- **Italic meta, bold mono stats.** `*12 clips · 3.4 GB · last upload 4h ago*` with numbers in bold mono.
- Em-dash / ellipsis for quiet status. `Processing…`, `just now`, `—`.
- Periods end greetings, never exclamations.

### Avoid
- No emoji in persistent UI (StarButton's ★/☆ is a control glyph, allowed).
- No exclamation marks.
- No "Welcome!" / "Let's get started!" / "Awesome!" onboarding language.
- No corporate hedging.

## VISUAL FOUNDATIONS

Aesthetic: **"brutalist parchment"** — cream bg, warm ink, burnt-orange accent, heavy borders, hard offset sticker-shadows, zero gradients-as-backgrounds.

### Colors (`--vv-*` tokens)
- **Parchment:** `--vv-bg #f4ead5` · `--vv-bg-panel #fff8e6` · `--vv-bg-sunken #e8dcc0`
- **Ink:** `--vv-ink #2a1810` · `--vv-ink-muted #7c5e3c` · `--vv-ink-subtle #b8a07a`
- **Accent:** `--vv-accent #c2410c` (burnt orange) · `--vv-accent-soft #d97706`
- **Semantic:** `--vv-success #84cc16` · `--vv-info #0891b2` · `--vv-danger #be185d` · `--vv-warn #fde68a`
- **Discord button only:** `--vv-discord #5865F2`
- All "muted" tones are warm browns — no cool greys.

### Typography
- **Fraunces italic 700/900** — display only. Brand, greetings, file titles, dialog titles, folder names. Always italic.
- **Inter 400/600/700** — UI, body, buttons, inputs, card titles.
- **JetBrains Mono 700** — ONLY for numeric stats. Never for body.
- Signature pattern: italic muted meta with bold mono numbers embedded.
- Negative letter-spacing on display (-0.5 to -1.5px), neutral on UI.

### Layout
- Main column caps at `1200px`, centered. `32px` gutters, `16px` on ≤640px.
- Grid: `auto-fill, minmax(260px, 1fr)` @ 20px gap. Single column ≤640px.
- Folder grid: `minmax(200px, 1fr)` @ 12px gap.
- Top bar fixed, 2px ink bottom border. No sidebars. No footers in auth'd app.

### Borders
- Default `2px solid var(--vv-ink)`. Cards/players `2.5px`. Drop-zone `3px dashed`. Inputs `1.5px`.
- Borders ARE the separation — no subtle hairlines on neutral surfaces.
- **Internal dividers** (table row separators, menu separators, key/value row rules): `1.5px solid var(--vv-ink-subtle)`. Never `1px dashed`.

### Shadows
- Hard offset "sticker" only: `Npx Npx 0 var(--vv-ink)` where N is 2/3/4/5/6.
- No blur. No color other than ink.
- Hover = translate(-1px, -1px) + step up one shadow. Element lifts toward top-left.
- NEVER soft shadows like `0 4px 12px rgba(0,0,0,0.1)`.

### Radii
- `4px` inputs/badges · `6px` default · `8px` cards/player · `12–16px` drop-zone only. Pills `999px`.

### Animation
- Minimal. `transition: transform 0.1s` on buttons/pills. `background/border 0.15s` on drop-zone.
- Browser-default easing. No bounces, springs, or keyframe ornaments.
- No backdrop-filter / no frosted glass.

### Cards
- **FileCard:** ink bg thumb + cream meta strip below, 2.5px ink border, 8px radius, 4px shadow.
- **FolderTile:** panel bg, 2px border, 4px radius, 2px shadow. Hover bg = `--vv-warn`.
- No: rounded corners >12px, gradients, left-border color accents, inner shadows, hover glows.

## ICONOGRAPHY

- **The moose logo is the ONLY illustrated asset.** Don't invent more.
- Glyphs used as icons: `↑` upload, `↓` download, `← →` pagination, `✦` drop-zone, `★/☆` star, `×` close, `+` new folder.
- Discord logo is inline SVG on the login button.
- **No icon library.** No Heroicons / Lucide / Feather / Phosphor.
- **No emoji** in persistent UI.
- When a new icon is needed: reach for a unicode glyph first, then an inline SVG in the ink-stroked moose style (2px round-cap), then flag before importing an icon set.
