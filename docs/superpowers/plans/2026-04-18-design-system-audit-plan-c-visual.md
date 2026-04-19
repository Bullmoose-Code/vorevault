# Plan C — Visual Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining design-system violations found by sweeping shadows, borders, radii, gradients, iconography, and numeric typography against the spec. Small, surgical pass — most of the repo is already clean after Plans A and B.

**Architecture:** Each task is a scoped CSS/JSX edit on one or two files. No new components, no API changes. The final task runs the full sweep suite to confirm nothing slipped.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, CSS Modules + `.vv-*` global tokens/classes from Plan A.

**Depends on:** Plans A and B (stacked). This branch (`feat/design-system-audit-plan-c`) is off Plan B's branch.

**Spec reference:** `docs/superpowers/specs/2026-04-18-design-system-audit-design.md` (Plan C section).

---

## Violations found by sweeps

Verified by running:

```
rg -n "box-shadow" app/src/ | grep -v "var(--vv-shadow" | grep -v "none"
rg -n "border:" app/src/ --glob "*.css" | grep -v "var(--vv-" | grep -v " none"
rg -n --pcre2 "[\p{Emoji_Presentation}]" app/src/ --glob "*.tsx"
rg -n "background:.*gradient" app/src/ --glob "*.css"
```

- `StarButton.module.css` — hardcoded `#222`, `#f4ead5`, non-token shadow
- `FileCard.module.css` — `.card:hover` uses literal `6px 6px 0 var(--vv-ink)` (should be `--vv-shadow-xl`); six `.tile1..tile6` classes use hardcoded hex gradient pairs (gradient-as-background violation)
- `login/page.module.css` — `.page` uses `radial-gradient(...)` as page background
- `StatCard.module.css` — `.value` renders numeric stats in Fraunces display; spec says JetBrains Mono for numeric stats
- `TopBar.tsx` — uses `🔍` emoji for search icon (persistent UI emoji)

Acceptable (not violations):
- `SearchBar.module.css .dropdownOverlay { border-radius: 0 }` — intentional flush-to-edge styling on mobile overlay.
- Avatar gradient backgrounds in `admin/page.module.css` and `UserChip.module.css` — small circular identifier placeholders, not surface-level gradients. Out of scope.
- Component-scoped `font-family: var(--vv-font-display)` uses in `login .tagline`, `upload .uploadsHeader h2`, `admin .adminLabel`, `DropZone .heading`, `ShareBanner .label`, `FolderTile .name`, `SearchBar .kind`, `FolderPickerModal .breadcrumbs`, `TopBar .brand`, `p/[token] .footer` — these are small component-scoped display roles; spec allows the display font for "folder names" / "brand" / decorative labels.
- PWA `applicationName: "VoreVault"` in `app/src/app/layout.tsx` — OS-level home-screen label, flagged in Plan B sweep. Left as-is; changing to lowercase would produce awkward PWA icon label. Called out in PR body for user decision.

---

## File Structure

**Create:** none.

**Modify:**
- `app/src/components/StarButton.module.css`
- `app/src/components/FileCard.module.css`
- `app/src/app/login/page.module.css`
- `app/src/components/StatCard.module.css`
- `app/src/components/StatCard.tsx`
- `app/src/components/TopBar.tsx`

---

### Task 1: StarButton — tokenize colors, border, shadow

**Files:**
- Modify: `app/src/components/StarButton.module.css`

**What changes:**
- Replace hardcoded `#222` (near-black) with `var(--vv-ink)`.
- Replace hardcoded `#f4ead5` (cream) with `var(--vv-bg)`.
- Replace `font-family: serif` with `var(--vv-font-ui)` — star glyph (U+2605) renders correctly in UI font.
- Replace non-token hover shadow `2px 2px 0 #222` with `var(--vv-shadow-sm)`.

- [ ] **Step 1: Replace module.css**

Replace the contents of `app/src/components/StarButton.module.css` with:

```css
.star {
  border: 1.5px solid var(--vv-ink);
  background: var(--vv-bg);
  color: var(--vv-ink);
  width: 32px;
  height: 32px;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  font-family: var(--vv-font-ui);
}
.star.on { background: var(--vv-ink); color: var(--vv-bg); }
.star:disabled { opacity: 0.5; cursor: wait; }
.star:hover { transform: translate(-1px, -1px); box-shadow: var(--vv-shadow-sm); }
```

- [ ] **Step 2: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault
git add app/src/components/StarButton.module.css
git commit -m "refactor(ui): StarButton tokenize colors + shadow"
```

---

### Task 2: FileCard — tokenize hover shadow + replace gradient tiles

**Files:**
- Modify: `app/src/components/FileCard.module.css`

**What changes:**
- `.card:hover` literal `6px 6px 0 var(--vv-ink)` → `var(--vv-shadow-xl)` (same value, token name).
- `.tile1`..`.tile6` hardcoded hex gradient pairs → solid token fills (no gradients).

Mapping:
- `.tile1` (orange gradient) → `var(--vv-accent)`
- `.tile2` (green gradient) → `var(--vv-success)`
- `.tile3` (teal gradient) → `var(--vv-info)`
- `.tile4` (magenta gradient) → `var(--vv-danger)`
- `.tile5` (dark brown gradient) → `var(--vv-ink-muted)`
- `.tile6` (orange gradient) → `var(--vv-accent-soft)`

- [ ] **Step 1: Update `.card:hover` shadow**

In `app/src/components/FileCard.module.css`, change line 17 from:

```css
box-shadow: 6px 6px 0 var(--vv-ink);
```

to:

```css
box-shadow: var(--vv-shadow-xl);
```

- [ ] **Step 2: Replace tile backgrounds**

In the same file, replace lines 53–58:

```css
.tile1 { background: linear-gradient(135deg, #d97706, #b45309); }
.tile2 { background: linear-gradient(135deg, #84cc16, #4d7c0f); }
.tile3 { background: linear-gradient(135deg, #0891b2, #155e75); }
.tile4 { background: linear-gradient(135deg, #be185d, #831843); }
.tile5 { background: linear-gradient(135deg, #7c2d12, #431407); }
.tile6 { background: linear-gradient(135deg, #c2410c, #9a3412); }
```

with:

```css
.tile1 { background: var(--vv-accent); }
.tile2 { background: var(--vv-success); }
.tile3 { background: var(--vv-info); }
.tile4 { background: var(--vv-danger); }
.tile5 { background: var(--vv-ink-muted); }
.tile6 { background: var(--vv-accent-soft); }
```

LEAVE UNCHANGED: the rest of FileCard.module.css (`.card` base, `.thumb`, `.thumb img`, `.tileFallback`, `.typeBadge`, `.duration`, `.sharedBadge`, `.meta`, `.title`, `.sub`).

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/components/FileCard.module.css
git commit -m "refactor(ui): FileCard tokenize hover shadow + flatten gradient tiles"
```

---

### Task 3: Login — flatten radial gradient background

**Files:**
- Modify: `app/src/app/login/page.module.css`

**What changes:**
- `.page` uses `radial-gradient(ellipse at center, var(--vv-bg-panel) 0%, var(--vv-bg) 70%)` for the full page background. Per spec: "zero gradients-as-backgrounds". Replace with solid `var(--vv-bg)`.

- [ ] **Step 1: Update `.page` background**

In `app/src/app/login/page.module.css`, change line 6 from:

```css
background: radial-gradient(ellipse at center, var(--vv-bg-panel) 0%, var(--vv-bg) 70%);
```

to:

```css
background: var(--vv-bg);
```

LEAVE UNCHANGED: everything else in the file (`.card`, `.brand` margin, `.tagline`, `.discordBtn`, `.footnote`).

- [ ] **Step 2: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault
git add app/src/app/login/page.module.css
git commit -m "refactor(ui): /login flatten radial gradient background"
```

---

### Task 4: StatCard — numeric value to mono

**Files:**
- Modify: `app/src/components/StatCard.module.css`
- Modify: `app/src/components/StatCard.tsx`

**What changes:**
- Per spec: "JetBrains Mono 700 — ONLY for numeric stats." StatCard is the primary numeric-stat display on /admin. Migrate `.value` typography to the global `.vv-mono` class; keep local `.value` for size + accent color override.

- [ ] **Step 1: Update `StatCard.module.css`**

Replace the `.value` rule (currently lines 17–26):

```css
.value {
  font-family: var(--vv-font-display);
  font-style: italic;
  font-weight: 900;
  font-size: 24px;
  color: var(--vv-accent);
  letter-spacing: -0.5px;
  line-height: 1.2;
  margin-top: 4px;
}
```

with:

```css
.value {
  font-size: 24px;
  color: var(--vv-accent);
  line-height: 1.2;
  margin-top: 4px;
}
```

The global `.vv-mono` provides `font-family: var(--vv-font-mono)`, `font-weight: 700`. Local `.value` overrides size (24px vs global 12px) and color (accent vs global ink).

- [ ] **Step 2: Update `StatCard.tsx`**

Change line 7 from:

```tsx
<div className={styles.value}>{value}</div>
```

to:

```tsx
<div className={`vv-mono ${styles.value}`}>{value}</div>
```

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/components/StatCard.module.css app/src/components/StatCard.tsx
git commit -m "refactor(ui): StatCard value to .vv-mono (numeric stat)"
```

---

### Task 5: TopBar — replace 🔍 emoji with inline SVG magnifier

**Files:**
- Modify: `app/src/components/TopBar.tsx`

**What changes:**
- Replace `🔍` emoji (persistent UI violation + iOS colored-emoji inconsistency) with a 2px-stroke inline SVG magnifier matching the moose ink-stroked style.

- [ ] **Step 1: Replace the icon span**

In `app/src/components/TopBar.tsx`, find (around line 43–50):

```tsx
<button
  type="button"
  className={styles.searchIconBtn}
  aria-label="Open search"
  onClick={() => setMobileSearchOpen(true)}
>
  <span aria-hidden="true">🔍</span>
</button>
```

Replace the inner `<span>` with an inline SVG:

```tsx
<button
  type="button"
  className={styles.searchIconBtn}
  aria-label="Open search"
  onClick={() => setMobileSearchOpen(true)}
>
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </svg>
</button>
```

The SVG uses `currentColor` so it inherits from the button's `color` (ink). 2px stroke with round caps/joins matches the moose ink-stroke aesthetic.

- [ ] **Step 2: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault
git add app/src/components/TopBar.tsx
git commit -m "refactor(ui): TopBar replace 🔍 emoji with inline SVG magnifier"
```

---

### Task 6: Final sweep + build + PR

**Files:** none; verification + PR.

- [ ] **Step 1: Re-run all sweeps**

Run (from `/root/vorevault`):
```bash
echo "=== SHADOWS ===" && rg -n "box-shadow" app/src/ | grep -v "var(--vv-shadow" | grep -v "none" | grep -v "inherit" || echo "clean"
echo "=== BORDERS ===" && rg -n "border:" app/src/ --glob "*.css" | grep -v "var(--vv-" | grep -v " none" | grep -v " inherit" || echo "clean"
echo "=== EMOJI (JSX) ===" && rg -n --pcre2 "[\p{Emoji_Presentation}]" app/src/ --glob "*.tsx" || echo "clean"
echo "=== GRADIENTS ===" && rg -n "background:.*gradient" app/src/ --glob "*.css" | grep -v "admin/page.module.css" | grep -v "UserChip.module.css" || echo "clean"
echo "=== NON-TOKEN BRAND HEX ===" && rg -n "#222|#f4ead5|#fff8e6|#2a1810|#c2410c" app/src/ --glob "*.css" | grep -v "/\* token value \*/" || echo "clean"
```

Expected results:
- **Shadows:** clean (after Tasks 1 + 2).
- **Borders:** clean (after Task 1).
- **Emoji:** only the approved whitelist — `★` in StarButton, `✦` in DropZone / FileCard (shared badge) / FileActions / `/p/[token]` page. NO `🔍`. The whitelist `★ ✦` are *not* matched by `\p{Emoji_Presentation}` so the sweep should return zero hits in TSX.
- **Gradients:** only the two avatar-placeholder gradients (UserChip, admin) are acceptable; sweep output is filtered to exclude them. Expect "clean".
- **Non-token brand hex:** some hits in `design-system/colors_and_type.css` (that file IS the token source) and `globals.css` are fine. Any hit in a module.css is a violation.

Report what each sweep found.

- [ ] **Step 2: Run tests**

Run: `cd app && npm test`
Expected: same pass/fail profile as Plans A and B — component tests green, pre-existing ffprobe/testcontainers failures allowed.

- [ ] **Step 3: Run build**

Run: `cd app && npm run build`
Expected: green.

- [ ] **Step 4: Push branch and open PR**

```bash
cd /root/vorevault
git push -u origin feat/design-system-audit-plan-c
gh pr create --base feat/design-system-audit-plan-b --title "feat(ui): design-system audit Plan C — visual details" --body "$(cat <<'EOF'
## Summary

Plan C of the design-system audit — shadow, border, radius, gradient, and iconography cleanup. Stacks on Plan B (#31).

## What changed

- **StarButton:** tokenize hardcoded `#222` / `#f4ead5` → `var(--vv-ink)` / `var(--vv-bg)`; non-token hover shadow → `var(--vv-shadow-sm)`; generic `serif` font-family → `var(--vv-font-ui)`.
- **FileCard:** `.card:hover` literal shadow → `var(--vv-shadow-xl)` token; `.tile1..tile6` fallback thumb gradients → solid token fills (no gradients-as-backgrounds).
- **/login:** flatten full-page radial gradient → solid `var(--vv-bg)`.
- **StatCard:** numeric `.value` migrated from Fraunces display to `.vv-mono` + local size/color override. Matches spec rule: "JetBrains Mono 700 — ONLY for numeric stats."
- **TopBar:** `🔍` emoji → inline SVG magnifier (2px stroke, currentColor) matching the ink-stroke moose aesthetic.

## Files touched

- `app/src/components/StarButton.module.css`
- `app/src/components/FileCard.module.css`
- `app/src/app/login/page.module.css`
- `app/src/components/StatCard.module.css` + `StatCard.tsx`
- `app/src/components/TopBar.tsx`

## Known out-of-scope items

- **Avatar gradients** in `admin/page.module.css` and `UserChip.module.css` — small circular identifier placeholders, not surface backgrounds. Spec rule targets gradients-as-backgrounds; avatars are an allowed pattern. If you want them flattened, open a follow-up.
- **PWA `applicationName: "VoreVault"`** in `app/src/app/layout.tsx` line 32 — OS-level home-screen icon label. Lowercasing would yield an awkward "vorevault" PWA icon. **Judgment call for you.** Trivial one-char edit if you want it changed.

## Test plan

- [x] `npm test` — all component tests green.
- [x] `npm run build` — green.
- [x] `rg` sweeps: zero non-token shadows, borders, persistent-UI emoji (beyond approved whitelist), or gradient backgrounds.
- [ ] Manual QA desktop: /login (flat bg), /admin (StatCard values mono), home (FileCard tile colors on thumbnails without thumbs), TopBar mobile search icon.
- [ ] Manual QA mobile 375×667.

## Merge order

1. Plan A (#30) → main
2. Rebase Plan B (#31) onto main → merge
3. Rebase this PR onto main → merge

All three plans together complete the design-system audit per `docs/superpowers/specs/2026-04-18-design-system-audit-design.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Report PR + CI status**

```bash
gh pr view --json url,state,baseRefName
gh pr checks
```

Report both.

---

## Self-Review Checklist (already run by author)

- [x] Every violation found by sweep has a task that fixes it.
- [x] Task 1 (StarButton) covers all four hardcoded-color/shadow hits in that file.
- [x] Task 2 (FileCard) covers both the hover shadow and all six tile gradients.
- [x] Task 3 (login) covers the radial gradient.
- [x] Task 4 (StatCard) covers the numeric-mono spec rule (previously missed by Plans A/B since StatCard wasn't in the migration list).
- [x] Task 5 (TopBar) covers the only remaining persistent-UI emoji.
- [x] Task 6 re-runs all sweeps to catch anything that regresses.
- [x] Out-of-scope items (avatar gradients, PWA applicationName) are explicitly called out in the PR body, not silently left.
- [x] No placeholder text; every code block shows full before/after.
