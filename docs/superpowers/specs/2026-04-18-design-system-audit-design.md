# VoreVault Design System Audit — Design Spec

**Date:** 2026-04-18
**Branch strategy:** spec + Plan A doc ship on `feat/design-system-audit` (Plan A branch). Plan B and Plan C each get their own branch when that phase starts — one plan doc per branch, committed alongside the implementation it drives. This keeps each PR self-contained.
**Source material:** `app/design-system/README.md`, `app/design-system/colors_and_type.css`, `CLAUDE.md` design-system section.

## Goal

Audit VoreVault's UI against the authoritative design system (`app/design-system/`) and close the gaps. No structural rethink — keep existing layouts. Raise the visual polish ceiling and lock the "brutalist parchment" aesthetic across every page.

## Scope

**In:** `/login`, `/` (home), `/d/[id]` (folder), `/f/[id]` (file), `/search`, `/upload`, `/saved`, `/p/[token]` (public share), `/admin`, plus every component in `app/src/components/`.

**Out:** New features, layout restructures, API changes, new dependencies, a moose-logo expansion beyond `/login`, visual regression tooling.

## Architecture

Three sequential plans. Each plan = its own branch, PR, and Watchtower deploy.

### Plan A: Type System (foundation — ships first)

Add the semantic type classes from `design-system/colors_and_type.css` to `app/src/app/globals.css`, then migrate every module.css that redefines display typography to use the class in markup.

**Classes added (verbatim from `colors_and_type.css`):**

```css
.vv-brand        { font: italic 900 48px/1 var(--vv-font-display); letter-spacing: -1.5px; color: var(--vv-accent); }
.vv-greeting     { font: italic 400 36px/1.1 var(--vv-font-display); letter-spacing: -1px; color: var(--vv-ink); }
.vv-greeting strong { font-weight: 900; color: var(--vv-accent); }
.vv-title        { font: italic 900 28px/1.15 var(--vv-font-display); letter-spacing: -0.5px; color: var(--vv-ink); }
.vv-dialog-title { font: italic 700 20px/1.2 var(--vv-font-display); color: var(--vv-ink); }
.vv-section-label{ font: italic 700 14px var(--vv-font-display); letter-spacing: 0.04em; text-transform: uppercase;
                   border-bottom: 1.5px solid var(--vv-ink); padding: 4px 0; }
.vv-body         { font: 400 14px/1.5 var(--vv-font-ui); color: var(--vv-ink); }
.vv-label        { font: 600 12px/1 var(--vv-font-ui); color: var(--vv-ink); }
.vv-meta         { font: italic 400 13px/1.4 var(--vv-font-ui); color: var(--vv-ink-muted); }
.vv-meta strong  { font-family: var(--vv-font-mono); font-style: normal; font-weight: 700; color: var(--vv-ink); }
.vv-mono         { font: 700 12px var(--vv-font-mono); color: var(--vv-ink); }
.vv-button-label { font: 700 13px/1 var(--vv-font-ui); }
```

**Mobile overrides** (add a single `@media (max-width: 640px)` block in `globals.css`):
- `.vv-brand → 36px`
- `.vv-greeting → 26px`
- `.vv-title → 22px`

Dialog title, body, meta, label, mono, button-label stay desktop sizes on mobile.

**Migration map** (current → new class):

| Location | Current pattern | New class |
|---|---|---|
| `login/page.module.css .brand` | italic 900 48px Fraunces, -1.5px, accent | `.vv-brand` |
| `page.module.css .greeting` | italic 36px Fraunces, -1px | `.vv-greeting` |
| `d/[id]/page.module.css .folderTitle` | italic 36px Fraunces (matches greeting) | `.vv-greeting` |
| `f/[id]/page.module.css` file title | italic 28px Fraunces | `.vv-title` |
| `NewFolderDialog`, `Modal` titles | italic 20px Fraunces | `.vv-dialog-title` |
| every `.sectionLabel` across 6+ modules | italic upper 14px + 1.5px ink bottom border | `.vv-section-label` |
| every stats/meta line with counts | italic muted + bold numbers | `.vv-meta` + `<strong>N</strong>` |

**Rule after migration.** No module CSS may set `font-family: var(--vv-font-display)` or redefine the section-label pattern. Display type comes from a class. New class = escalation (must update design system first).

**Success check.** `rg "font-family.*Fraunces|font-family.*var\(--vv-font-display" app/src/` returns only `globals.css`.

**Testing.** No new tests. Existing Modal/NewFolderDialog/FolderPickerModal component tests catch DOM regressions. Mechanical check = the `rg` above.

### Plan B: Copy & Voice Pass

Audit every user-facing string across all 9 pages + component strings for voice compliance. Depends on Plan A (classes applied) so markup changes are minimal.

**Voice rules (condensed from README):**
1. Sentence case everywhere.
2. Brand always lowercase `vorevault`.
3. No exclamation marks. Greetings end in periods.
4. Bold role names in running copy (`**vorevault** role`).
5. Italic meta with bold mono numbers: `*12 clips · 3.4 GB · last upload 4h ago*`.
6. Em-dash / ellipsis for quiet status (`Processing…`, `just now`, `—`).
7. No emoji in persistent UI. No corporate hedging. No onboarding cheerleading.

**Page-by-page targets** (one task per page):

- **`/login`** — already compliant; re-verify after Plan A class swap.
- **`/` (home)** — confirm greeting, stats line uses `.vv-meta` with bold mono counts. `mine=1` variant: `Your uploads, **Riley**.` Empty state: `Drop the first clip in the vault.` (keep).
- **`/d/[id]`** — meta: `created by @user · 3 subfolders · 12 files` in signature pattern.
- **`/f/[id]`** — file title as `.vv-title`. Meta strip: size / duration / uploader / date in signature pattern.
- **`/search`** — `42 results for "moose"` in signature pattern.
- **`/upload`** — drop-zone copy (`Drop files here, or click to choose.`), supported types line (`mp4, mov, png, jpg, gif, anything really.`), progress string (`Processing…`).
- **`/saved`** — section label `SAVED`, empty state: `Nothing saved yet. Tap ★ on any file to pin it here.`
- **`/p/[token]`** — public share: lowercase brand, terse, no marketing.
- **`/admin`** — same rules; no "internal tool" voice exception. Section labels, button labels, table headers all voice-compliant.

**Components to sweep in the same pass** (strings live here, not in page.tsx):
`TopBar`, `NewFolderDialog`, `FolderPickerModal`, `DropZone`, `FileCard`, `FolderTile`, `SearchBar`, `Pill`, `Breadcrumbs`.

**Signature pattern application.** Every card/header showing counts uses `<span class="vv-meta">... <strong>N</strong> ...</span>`. Numbers wrapped in `<strong>` render as bold mono automatically via the `.vv-meta strong` rule from Plan A.

**Out of scope.** API JSON error messages, Discord/email notifications (none exist), OpenGraph meta titles.

**Testing.** Component tests that assert specific strings will catch drift; update them in the same commit as the copy change — don't split.

### Plan C: Visual Details

Shadow / border / radius / iconography / layout audit. Can parallelize with B but cleaner sequentially.

**Shadow audit.**
- Sweep: `rg "box-shadow" app/src/ | grep -v "var(--vv-shadow"` → every hit is a violation.
- Replace with correct token by element weight: `FileCard` = `md`, `FolderTile` = `sm`, player/dialog = `md`, tooltip/pill = `sm`.
- Hover pattern: `translate(-1px, -1px)` + step-up one shadow — applied uniformly to clickable cards and pills.

**Border audit.**
- Defaults per spec: `2px solid var(--vv-ink)` default · `2.5px` cards/player · `3px dashed` drop-zone · `1.5px` inputs.
- Sweep: `rg "border:" app/src/ | grep -v "var(--vv-"` → anything not using a token is suspect.
- Delete hairline borders on neutral surfaces; either use full 2px ink or no border.

**Radius audit.**
- `4px` inputs/badges · `6px` default · `8px` cards/player · `12–16px` drop-zone only · `999px` pills.
- Sweep: `rg "border-radius" app/src/` → anything `≥ 12px` outside DropZone needs justification.

**Iconography audit.**
- Sweep: `rg -n --pcre2 "[\p{Emoji_Presentation}]" app/src/` (ripgrep with PCRE2 for Unicode class support).
- Exceptions: `★/☆` StarButton (control glyph, allowed), Discord SVG on login.
- If `🔍` in `TopBar` renders colored on iOS, swap to a 2px-stroke inline SVG magnifier in the moose style. Otherwise keep.

**Moose logo.** Stays login-only. TopBar's lowercase `vorevault` brand carries the identity in-app. Adding the moose elsewhere would compete with FileCard thumbnails.

**Layout sanity.** Every `<main>` caps at 1200px, 32px gutters (16px ≤ 640px). Audit each `page.module.css`; tighten as needed on `/upload`, `/admin`, `/p/[token]`.

**Animation audit.** Sweep: `rg "animation:|@keyframes|backdrop-filter" app/src/` → nothing should appear. Transitions limited to `transform 0.1s` on buttons/pills and `background/border 0.15s` on drop-zone.

**Testing.** CSS-only changes. No unit coverage possible. Mitigations:
- `npm run build` before each commit (catches syntax + type errors).
- Manual QA checklist per PR: desktop + mobile 375×667, golden path (upload → browse → play → search → move → star).
- No visual regression tool added; YAGNI.

## Sequencing & Deployment

1. **Plan A** ships first. Unblocks Plan B's copy work by removing inline typography noise from diffs.
2. **Plan B** ships second. Copy is stable before we polish CSS around it.
3. **Plan C** ships last. Pure CSS tightening on a finalized baseline.

Each plan PR gets its own Watchtower deploy to LXC 105. No batching.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Class migration introduces visual drift (e.g. wrong letter-spacing) | Diff globals.css `.vv-*` against `colors_and_type.css` byte-for-byte before commit; run `npm run build`; manual QA on 2 pages per commit |
| Copy changes break a component test asserting a literal string | Update the test in the same commit as the copy change (enforced by skill workflow) |
| Mobile font sizes too small after global size reduction | Manual QA on 375×667 for home, folder, file detail, upload |
| Emoji sweep flags StarButton ★/☆ as violations | Document the exception in the plan; grep excludes StarButton.tsx |
| Moose logo decision regretted later | Reversible — spec explicitly keeps it a placement decision not a design-system change |

## Success Criteria

- `rg "font-family.*Fraunces|font-family.*var\(--vv-font-display" app/src/` returns only `globals.css`.
- `rg "box-shadow" app/src/ | grep -v "var(--vv-shadow"` returns no hits.
- `rg "border:" app/src/ | grep -v "var(--vv-"` returns only rules that legitimately omit a color token (e.g. `border: none`, `border: inherit`) — no hardcoded hexes or named colors.
- Every page audited against the voice rules checklist; no `!` outside JSX expression braces; brand always lowercase.
- `npm test` green; `npm run build` green.
- Manual QA passes desktop + mobile 375×667 on all 9 pages.

## Open Questions

None. Open items from Section 4 (moose logo placement, search icon handling) were resolved during brainstorming.
