# Plan A — Type System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `.vv-*` semantic type classes from `app/design-system/colors_and_type.css` to `app/src/app/globals.css`, then migrate every page and component that currently redefines display typography to use the classes in markup.

**Architecture:** Global stylesheet owns typography; module.css files own layout only. Per page, remove the typographic rules (font-family, font-style, weight, size, letter-spacing, color, border-bottom-for-section-label) and apply the matching `.vv-*` class on the JSX element. Compose with module classes when layout-specific rules (margin, padding) remain. No component API changes; no copy changes.

**Tech Stack:** Next.js 15 App Router, CSS Modules + global stylesheet, TypeScript strict, vitest (existing tests only — no new tests; class migration is caught by `npm run build` + `rg` sweep + existing component/integration tests).

**Spec reference:** `docs/superpowers/specs/2026-04-18-design-system-audit-design.md` (Plan A section).

---

## File Structure

**Create:** none.

**Modify:**

Foundation
- `app/src/app/globals.css` — append semantic type classes + mobile overrides.

Pages
- `app/src/app/login/page.tsx` + `page.module.css`
- `app/src/app/page.tsx` + `page.module.css`
- `app/src/app/d/[id]/page.tsx` + `page.module.css`
- `app/src/app/f/[id]/page.tsx` + `page.module.css`
- `app/src/app/search/page.tsx` + `page.module.css`
- `app/src/app/upload/page.tsx` + `page.module.css`
- `app/src/app/saved/page.tsx` + `page.module.css`
- `app/src/app/admin/page.tsx` + `page.module.css`
- `app/src/app/p/[token]/page.tsx` + `page.module.css`

Components
- `app/src/components/Modal.tsx` + `Modal.module.css`
- `app/src/components/MetaPanel.module.css`

**Composition rule:** when a JSX element needs a global class and a layout class, compose as template literal: `` className={`vv-section-label ${styles.sectionLabel}`} ``. Global class (typography) + module class (margin/padding).

---

### Task 1: Add semantic type classes to globals.css

**Files:**
- Modify: `app/src/app/globals.css` (append after existing mobile primitives block).

**Why no test:** global CSS classes have no behavior. Success is verified by downstream page migrations compiling and rendering unchanged. Mechanical check is the final `rg` sweep in Task 12.

- [ ] **Step 1: Append the semantic type classes**

Append to the end of `app/src/app/globals.css`:

```css
/* ---- Semantic type classes (from design-system/colors_and_type.css) ---- */

.vv-brand {
  font: italic 900 48px/1 var(--vv-font-display);
  letter-spacing: -1.5px;
  color: var(--vv-accent);
}

.vv-greeting {
  font: italic 400 36px/1.1 var(--vv-font-display);
  letter-spacing: -1px;
  color: var(--vv-ink);
}

.vv-greeting strong {
  font-weight: 900;
  color: var(--vv-accent);
}

.vv-title {
  font: italic 900 28px/1.15 var(--vv-font-display);
  letter-spacing: -0.5px;
  color: var(--vv-ink);
}

.vv-dialog-title {
  font: italic 700 20px/1.2 var(--vv-font-display);
  color: var(--vv-ink);
}

.vv-section-label {
  font: italic 700 14px var(--vv-font-display);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-bottom: 1.5px solid var(--vv-ink);
  padding: 4px 0;
}

.vv-body {
  font: 400 14px/1.5 var(--vv-font-ui);
  color: var(--vv-ink);
}

.vv-label {
  font: 600 12px/1 var(--vv-font-ui);
  color: var(--vv-ink);
}

.vv-meta {
  font: italic 400 13px/1.4 var(--vv-font-ui);
  color: var(--vv-ink-muted);
}

.vv-meta strong {
  font-family: var(--vv-font-mono);
  font-style: normal;
  font-weight: 700;
  color: var(--vv-ink);
}

.vv-mono {
  font: 700 12px var(--vv-font-mono);
  color: var(--vv-ink);
}

.vv-button-label {
  font: 700 13px/1 var(--vv-font-ui);
}

@media (max-width: 640px) {
  .vv-brand    { font-size: 36px; letter-spacing: -1px; }
  .vv-greeting { font-size: 26px; letter-spacing: -0.5px; }
  .vv-title    { font-size: 22px; }
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd app && npm run build`
Expected: PASS, no CSS parse errors.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault
git add app/src/app/globals.css
git commit -m "feat(ui): add .vv-* semantic type classes to globals

From app/design-system/colors_and_type.css. No call sites yet; per-page
migrations follow in subsequent commits."
```

---

### Task 2: Migrate /login page

**Files:**
- Modify: `app/src/app/login/page.tsx`
- Modify: `app/src/app/login/page.module.css`

**What changes:** The `<h1 className={styles.brand}>` gets the global `.vv-brand` class; the `.brand` rule is deleted from the module. `.tagline`, `.discordBtn`, `.footnote` are not semantic-class roles — leave them unchanged.

- [ ] **Step 1: Remove the `.brand` rule from `login/page.module.css`**

Delete this block from `app/src/app/login/page.module.css` (currently lines 15–24):

```css
.brand {
  font-family: var(--vv-font-display);
  font-style: italic;
  font-weight: 900;
  font-size: 48px;
  color: var(--vv-accent);
  letter-spacing: -1.5px;
  line-height: 1;
  margin: 18px 0 10px;
}
```

Replace with a layout-only rule (preserves the margin around the logo/tagline):

```css
.brand {
  margin: 18px 0 10px;
}
```

- [ ] **Step 2: Apply the global class in `login/page.tsx`**

Change the `<h1>` on line 11 from:

```tsx
<h1 className={styles.brand}>vorevault</h1>
```

to:

```tsx
<h1 className={`vv-brand ${styles.brand}`}>vorevault</h1>
```

- [ ] **Step 3: Verify build passes**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/login/page.tsx app/src/app/login/page.module.css
git commit -m "refactor(ui): migrate /login brand title to .vv-brand"
```

---

### Task 3: Migrate / (home) page

**Files:**
- Modify: `app/src/app/page.tsx`
- Modify: `app/src/app/page.module.css`

**What changes:**
- `.greeting` → `.vv-greeting`
- `.stats` → `.vv-meta`
- `.sectionLabel` → `.vv-section-label`
- `.empty h2` → `.vv-title` (applied inline on the h2)

Layout-only margin/padding on `.sectionLabel` is preserved as a local class composed with the global.

- [ ] **Step 1: Update `page.module.css`**

Delete the following blocks from `app/src/app/page.module.css`:
- `.greeting { ... }` (lines 16–24)
- `.greeting strong { ... }` (lines 26–29)
- `.stats { ... }` (lines 31–35)
- `.stats strong { ... }` (lines 37–42)
- `.empty h2 { ... }` (lines 56–62)
- `.sectionLabel { ... }` (lines 84–93) — replace with the layout-only version below
- `.foldersSection .sectionLabel { margin: 0 0 12px; padding: 4px 0; }` (line 95)
- `.foldersHeader .sectionLabel { margin: 0; flex: 1; }` (lines 113–116)
- Inside `@media (max-width: 640px)`: `.greeting { font-size: 26px; letter-spacing: -0.5px; }` (lines 129–132), `.sectionLabel { margin: 8px 16px 8px; }` (line 120), `.empty h2 { font-size: 22px; }` (lines 148–150), `.stats { font-size: 13px; }` (lines 134–136).

Add (or replace in-place) the layout-only section-label helper:

```css
.sectionLabel {
  margin: 12px 32px 12px;
}

.foldersSection .sectionLabel {
  margin: 0 0 12px;
}

.foldersHeader .sectionLabel {
  margin: 0;
  flex: 1;
}

@media (max-width: 640px) {
  .sectionLabel { margin: 8px 16px 8px; }
}
```

The rest of `page.module.css` (`.main`, `.subheader`, `.grid`, `.empty`, `.pagination`, `.foldersSection`, `.folderGrid`, `.foldersEmpty`, `.foldersHeader`, all non-typographic mobile rules) stays unchanged.

- [ ] **Step 2: Update `page.tsx` JSX**

In `app/src/app/page.tsx`:

Change line 57 from:
```tsx
<h1 className={styles.greeting}>
```
to:
```tsx
<h1 className="vv-greeting">
```

Change line 65 from:
```tsx
<div className={styles.stats}>
```
to:
```tsx
<div className="vv-meta">
```

Change line 75 from:
```tsx
<h2 className={styles.sectionLabel}>Folders</h2>
```
to:
```tsx
<h2 className={`vv-section-label ${styles.sectionLabel}`}>Folders</h2>
```

Change lines 97 and 102 (inside the `.empty` block) — wrap the `<h2>` text with the title class:

From:
```tsx
<h2>You haven&apos;t uploaded anything yet.</h2>
```
to:
```tsx
<h2 className="vv-title">You haven&apos;t uploaded anything yet.</h2>
```

And:
```tsx
<h2>Drop the first clip in the vault.</h2>
```
to:
```tsx
<h2 className="vv-title">Drop the first clip in the vault.</h2>
```

Change line 110 from:
```tsx
<h2 className={styles.sectionLabel}>Recent uploads</h2>
```
to:
```tsx
<h2 className={`vv-section-label ${styles.sectionLabel}`}>Recent uploads</h2>
```

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/page.tsx app/src/app/page.module.css
git commit -m "refactor(ui): migrate / home page to .vv-* type classes"
```

---

### Task 4: Migrate /d/[id] folder detail page

**Files:**
- Modify: `app/src/app/d/[id]/page.tsx`
- Modify: `app/src/app/d/[id]/page.module.css`

**What changes:**
- `.folderTitle` → `.vv-greeting` (matches home greeting, as spec says folder names use the same treatment).
- `.sectionLabel` → `.vv-section-label`.
- `.meta` stays as-is for now (Plan B touches meta copy); do not migrate to `.vv-meta` here unless the typography mismatches. The current `.meta` is 12px / `--vv-ink-muted` — close to `.vv-meta` but a smaller font. Since this is a layout-level meta line, keep the local class.

- [ ] **Step 1: Update `page.module.css`**

In `app/src/app/d/[id]/page.module.css`, delete:
- `.folderTitle { ... }` (lines 16–26)
- `.sectionLabel { ... }` (lines 45–55)
- Inside `@media (max-width: 640px)`: `.folderTitle { font-size: 26px; letter-spacing: -0.5px; }` (lines 74–77), `.sectionLabel { margin: 16px 16px 8px; }` (lines 82–84)

Replace with layout-only versions:

```css
.folderTitle {
  margin: 0;
  flex: 1;
}

.sectionLabel {
  margin: 16px 32px 8px;
}

@media (max-width: 640px) {
  .sectionLabel { margin: 16px 16px 8px; }
}
```

The rest of `page.module.css` (`.page`, `.folderHeader`, `.toolbar`, `.meta`, `.folderGrid`, `.fileGrid`, other mobile rules) stays unchanged.

- [ ] **Step 2: Update `page.tsx` JSX**

In `app/src/app/d/[id]/page.tsx`:

Change line 31 from:
```tsx
<h1 className={styles.folderTitle}>{folder.name}</h1>
```
to:
```tsx
<h1 className={`vv-greeting ${styles.folderTitle}`}>{folder.name}</h1>
```

Change line 44 from:
```tsx
<h2 className={styles.sectionLabel}>Subfolders</h2>
```
to:
```tsx
<h2 className={`vv-section-label ${styles.sectionLabel}`}>Subfolders</h2>
```

Change line 56 from:
```tsx
<h2 className={styles.sectionLabel}>Files in this folder</h2>
```
to:
```tsx
<h2 className={`vv-section-label ${styles.sectionLabel}`}>Files in this folder</h2>
```

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/d/[id]/page.tsx app/src/app/d/[id]/page.module.css
git commit -m "refactor(ui): migrate /d/[id] folder detail to .vv-* type classes"
```

---

### Task 5: Migrate /f/[id] file detail page

**Files:**
- Modify: `app/src/app/f/[id]/page.tsx`
- Modify: `app/src/app/f/[id]/page.module.css`

**What changes:**
- `.title` → `.vv-title`.
- `.by` stays as a local class (it's a by-line meta, closer to 14px than `.vv-meta`'s 13px — Plan B will decide if it should collapse). For now only migrate the title.

- [ ] **Step 1: Update `page.module.css`**

In `app/src/app/f/[id]/page.module.css`, delete:
- `.title { ... }` (lines 105–113)
- Mobile override `.title { font-size: 24px; line-height: 1.2; }` (lines 37–40 inside the 820px media query) and `.title { font-size: 22px; margin: 16px 0 4px; }` (lines 54–57 inside the 640px media query).

Replace with a layout-only class that preserves margin and retains the mobile margin tweak:

```css
.title {
  margin: 20px 0 4px;
}

@media (max-width: 640px) {
  .title {
    margin: 16px 0 4px;
  }
}
```

The rest (`.back`, `.content`, `.player`, `.audio`, `.image`, `.noPreview`, `.by`, `.banner` variants, unrelated mobile overrides) stays unchanged.

- [ ] **Step 2: Update `page.tsx` JSX**

Change line 100 from:
```tsx
<h1 className={styles.title}>{file.original_name}</h1>
```
to:
```tsx
<h1 className={`vv-title ${styles.title}`}>{file.original_name}</h1>
```

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/f/[id]/page.tsx app/src/app/f/[id]/page.module.css
git commit -m "refactor(ui): migrate /f/[id] file detail title to .vv-title"
```

---

### Task 6: Migrate /search page

**Files:**
- Modify: `app/src/app/search/page.tsx`
- Modify: `app/src/app/search/page.module.css`

**What changes:**
- `.title` → `.vv-title` (the "Search: <em>q</em>" heading).
- `.sectionLabel` → `.vv-section-label`.

- [ ] **Step 1: Update `page.module.css`**

In `app/src/app/search/page.module.css`, delete:
- `.title { ... }` (lines 8–14)
- `.sectionLabel { ... }` (lines 16–26)
- Mobile override `.title { font-size: 24px; }` (lines 50–52)

Replace with layout-only rules:

```css
.title {
  margin: 16px 0 8px;
}

.sectionLabel {
  margin: 16px 0 8px;
}
```

The rest (`.page`, `.folderGrid`, `.fileGrid`, `.empty`, non-title mobile rules) stays unchanged.

- [ ] **Step 2: Update `page.tsx` JSX**

Change line 32 from:
```tsx
<h1 className={styles.title}>Search: <em>{q}</em></h1>
```
to:
```tsx
<h1 className={`vv-title ${styles.title}`}>Search: <em>{q}</em></h1>
```

Change line 35 from:
```tsx
<h2 className={styles.sectionLabel}>Folders</h2>
```
to:
```tsx
<h2 className={`vv-section-label ${styles.sectionLabel}`}>Folders</h2>
```

Change line 45 from:
```tsx
<h2 className={styles.sectionLabel}>Files</h2>
```
to:
```tsx
<h2 className={`vv-section-label ${styles.sectionLabel}`}>Files</h2>
```

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/search/page.tsx app/src/app/search/page.module.css
git commit -m "refactor(ui): migrate /search to .vv-* type classes"
```

---

### Task 7: Migrate /upload page

**Files:**
- Modify: `app/src/app/upload/page.tsx`
- Modify: `app/src/app/upload/page.module.css`

**What changes:**
- `.heading` is currently Fraunces italic 40px (bigger than `.vv-title` at 28px). It's the primary page heading for a top-level action. Closest semantic class is `.vv-greeting` (36px) — that's the right role per spec. Migrate to `.vv-greeting`.
- `.lede` is italic muted meta — migrate to `.vv-meta`.

- [ ] **Step 1: Update `page.module.css`**

In `app/src/app/upload/page.module.css`, delete:
- `.heading { ... }` (lines 29–36)
- `.lede { ... }` (lines 38–42)
- `.lede strong { ... }` (lines 44–48)
- Mobile override `.heading { font-size: 28px; letter-spacing: -0.5px; }` (lines 85–88).

Replace with layout-only:

```css
.heading {
  margin: 0;
}
```

The rest (`.main`, `.back`, `.header`, `.tip`, `.tipIcon`, mobile rules not relating to .heading/.lede) stays unchanged.

- [ ] **Step 2: Update `page.tsx` JSX**

Change line 25 from:
```tsx
<h1 className={styles.heading}>Drop something in the vault.</h1>
```
to:
```tsx
<h1 className={`vv-greeting ${styles.heading}`}>Drop something in the vault.</h1>
```

Change line 26 from:
```tsx
<div className={styles.lede}>Up to <strong>10 GB</strong> per file · resumable</div>
```
to:
```tsx
<div className="vv-meta">Up to <strong>10 GB</strong> per file · resumable</div>
```

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/upload/page.tsx app/src/app/upload/page.module.css
git commit -m "refactor(ui): migrate /upload heading + lede to .vv-* classes"
```

---

### Task 8: Migrate /saved page

**Files:**
- Modify: `app/src/app/saved/page.tsx`
- Modify: `app/src/app/saved/page.module.css`

**What changes:**
- `.title` → `.vv-title`. The saved page `.title` uses `var(--font-fraunces)` (the Next font variable) rather than `var(--vv-font-display)` — it predates the token convention. After migration, typography comes from `.vv-title` which uses the canonical token.

- [ ] **Step 1: Update `page.module.css`**

Replace the entire contents of `app/src/app/saved/page.module.css` with:

```css
.page { padding: 16px 24px; max-width: 1200px; margin: 0 auto; }
.title { margin: 16px 0 12px; }
.empty { font-size: 14px; color: var(--vv-ink-muted); padding: 24px 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
```

(`.title` loses its custom typography; `.empty` gets the token color instead of `opacity: 0.7`.)

- [ ] **Step 2: Update `page.tsx` JSX**

Change line 18 from:
```tsx
<h1 className={styles.title}>Saved</h1>
```
to:
```tsx
<h1 className={`vv-title ${styles.title}`}>Saved</h1>
```

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/saved/page.tsx app/src/app/saved/page.module.css
git commit -m "refactor(ui): migrate /saved title to .vv-title + token cleanup"
```

---

### Task 9: Migrate /admin page

**Files:**
- Modify: `app/src/app/admin/page.tsx`
- Modify: `app/src/app/admin/page.module.css`

**What changes:**
- `.adminLabel` is a unique small italic brand stamp — it does NOT match any semantic class (it's 16px, custom, accent-colored). Leave unchanged.
- `.sectionTitle` (Fraunces italic 22px 900) is closest to `.vv-title` (28px) but deliberately smaller to work in the denser admin layout. Compromise: migrate to `.vv-title` and let the admin layout breathe a little more. If it looks visibly too big after QA, we can scale it via the `.sectionTitle` layout class.

- [ ] **Step 1: Update `page.module.css`**

In `app/src/app/admin/page.module.css`, delete:
- `.sectionTitle { ... }` (lines 33–39)
- Mobile override `.sectionTitle { font-size: 18px; }` (lines 145–147)

Replace with a layout-only class:

```css
.sectionTitle {
  margin: 4px 0 14px;
}
```

The rest (`.adminStrip`, `.adminLabel`, `.main`, `.statsGrid`, `.tableWrap`, `.table`, `.name`, `.avatar`, `.rolePill`, `.bannedPill`, all unrelated mobile rules) stays unchanged.

- [ ] **Step 2: Update `page.tsx` JSX**

Change lines 34, 42, 85 (all `<h2 className={styles.sectionTitle}>`):

```tsx
<h2 className={`vv-title ${styles.sectionTitle}`}>Disk usage</h2>
```
```tsx
<h2 className={`vv-title ${styles.sectionTitle}`}>Users ({users.length})</h2>
```
```tsx
<h2 className={`vv-title ${styles.sectionTitle}`}>Folders ({folders.length})</h2>
```

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/admin/page.tsx app/src/app/admin/page.module.css
git commit -m "refactor(ui): migrate /admin section titles to .vv-title"
```

---

### Task 10: Migrate /p/[token] public share page

**Files:**
- Modify: `app/src/app/p/[token]/page.tsx`
- Modify: `app/src/app/p/[token]/page.module.css`

**What changes:**
- `.title` → `.vv-title`.
- `.meta` stays as the local layout-styled meta (12px is intentional for a dense player page; keep).
- `.footer` retains its decorative italic treatment — it's the brand footer, not a semantic class role. Leave unchanged.

- [ ] **Step 1: Update `page.module.css`**

In `app/src/app/p/[token]/page.module.css`, delete:
- `.title { ... }` (lines 46–53)
- Mobile override `.title { font-size: 20px; margin: 14px 0 2px; }` (lines 108–111)

Replace with layout-only:

```css
.title {
  margin: 18px 0 2px;
}

@media (max-width: 640px) {
  .title {
    margin: 14px 0 2px;
  }
}
```

The rest (`.page`, `.player`, `.audio`, `.image`, `.noPreview`, `.meta`, `.download`, `.footer`, unrelated mobile rules) stays unchanged.

- [ ] **Step 2: Update `page.tsx` JSX**

Change line 61 from:
```tsx
<h1 className={styles.title}>{file.original_name}</h1>
```
to:
```tsx
<h1 className={`vv-title ${styles.title}`}>{file.original_name}</h1>
```

- [ ] **Step 3: Verify build**

Run: `cd app && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/p/[token]/page.tsx app/src/app/p/[token]/page.module.css
git commit -m "refactor(ui): migrate /p/[token] file title to .vv-title"
```

---

### Task 11: Migrate Modal + MetaPanel to `.vv-dialog-title`

**Files:**
- Modify: `app/src/components/Modal.tsx`
- Modify: `app/src/components/Modal.module.css`
- Modify: `app/src/components/MetaPanel.module.css`

**What changes:**
- `Modal` renders a `<h2 className={styles.title}>` at 20px Fraunces italic 700 — exact match for `.vv-dialog-title`. Migrate.
- `MetaPanel.module.css .title` renders panel heading ("Details") at 18px italic accent — closer to `.vv-dialog-title` but smaller + accent color. The design system doesn't give a named role for a panel title; it's in the same family as the dialog title. Decision: migrate to `.vv-dialog-title` and let the accent color come back via a local rule (`.title { color: var(--vv-accent); }`). Accept the 20px size uplift; it's consistent with the dialog hierarchy.

- [ ] **Step 1: Update `Modal.module.css`**

In `app/src/components/Modal.module.css`, delete:
- `.title { ... }` (lines 41–48)

Replace with a layout-only rule (removes display typography; keeps structural margin):

```css
.title {
  margin: 0;
}
```

The rest of `Modal.module.css` stays unchanged.

- [ ] **Step 2: Update `Modal.tsx` JSX**

Change the `<h2>` at lines 104–106 from:
```tsx
<h2 id={titleId} className={styles.title}>
  {title}
</h2>
```
to:
```tsx
<h2 id={titleId} className={`vv-dialog-title ${styles.title}`}>
  {title}
</h2>
```

- [ ] **Step 3: Run Modal tests**

Run: `cd app && npm test -- src/components/Modal.test.tsx`
Expected: PASS (8 tests). If a test fails because it asserts a specific class name rather than behavior, update the test to assert the composed class (`vv-dialog-title`) or role/text only.

- [ ] **Step 4: Update `MetaPanel.module.css`**

Delete these rules from `app/src/components/MetaPanel.module.css` (lines 10–17):

```css
.title {
  font-family: var(--vv-font-display);
  font-style: italic;
  font-size: 18px;
  margin: 0 0 12px;
  font-weight: 900;
  color: var(--vv-accent);
}
```

Replace with a layout + color-only rule:

```css
.title {
  margin: 0 0 12px;
  color: var(--vv-accent);
}
```

The rest of `MetaPanel.module.css` stays unchanged.

- [ ] **Step 5: Update `MetaPanel.tsx` JSX**

In `app/src/components/MetaPanel.tsx`, change line 8 from:

```tsx
<h3 className={styles.title}>{title}</h3>
```

to:

```tsx
<h3 className={`vv-dialog-title ${styles.title}`}>{title}</h3>
```

- [ ] **Step 6: Verify build + run all component tests**

Run: `cd app && npm run build && npm test -- src/components/`
Expected: build PASS, all component tests PASS.

- [ ] **Step 7: Commit**

```bash
cd /root/vorevault
git add app/src/components/Modal.tsx app/src/components/Modal.module.css \
        app/src/components/MetaPanel.module.css app/src/components/MetaPanel.tsx
git commit -m "refactor(ui): migrate Modal + MetaPanel titles to .vv-dialog-title"
```

---

### Task 12: Final sweep + build + PR

**Files:** none created; this is verification + PR.

- [ ] **Step 1: Sweep for Fraunces/display-font leaks**

Run: `rg "font-family.*Fraunces|font-family.*var\(--vv-font-display" app/src/`

Expected: zero hits in `app/src/`. The only hit anywhere in the repo should be in `app/src/app/globals.css` (inside `.vv-*` class rules). If any module.css still references the display font, that page was missed — go back and migrate it before proceeding.

Acceptable exception: `app/src/components/FolderTile.module.css .name` and `app/src/components/FileCard.module.css` thumb fallback use `var(--vv-font-display)`/`var(--vv-font-mono)` legitimately as in-situ display styling; these are non-semantic roles (small tile name, tile fallback label) and stay as-is. If the sweep returns only those two files' non-title rules, that's fine.

- [ ] **Step 2: Sweep for stale `.sectionLabel` typography**

Run: `rg -A3 "^\.sectionLabel\s*\{" app/src/`

Expected: every hit's body contains ONLY margin/padding/flex rules — no `font-family`, `font-size`, `text-transform`, `border-bottom`, or `letter-spacing`. If any still has typographic rules, that file was missed.

- [ ] **Step 3: Run the full test + build**

Run: `cd app && npm test && npm run build`
Expected: all pre-existing tests still PASS, build succeeds with zero new warnings.

Note: `thumbnails.test.ts` requires ffprobe and is a known pre-existing failure. Other Docker/testcontainers-dependent tests also pre-existing. Only new failures are blockers.

- [ ] **Step 4: Manual spot-check (desktop)**

Open in a local browser (or deployed preview):
- `/login` — brand still reads as large burnt-orange italic "vorevault"
- `/` — greeting still italic, section labels still uppercase-italic-with-underline
- `/d/[id]` — folder title italic, section labels match home
- `/f/[id]` — file title italic, meta unchanged
- `/search` — results title italic, section labels match
- `/upload` — big italic heading unchanged
- `/saved` — "Saved" italic
- `/admin` — section titles italic, slightly larger than before (intentional)
- `/p/[token]` — file title italic

If anything looks broken (wrong size, wrong color, weight change), revert the offending commit and investigate before pushing.

- [ ] **Step 5: Manual spot-check (mobile 375×667)**

Same page set; confirm greetings/titles scale to the mobile overrides defined in Task 1. Section labels' padding on narrow screens: 16px gutters.

- [ ] **Step 6: Push branch and open PR**

```bash
cd /root/vorevault
git push -u origin feat/design-system-audit
gh pr create --title "feat(ui): design-system audit Plan A — semantic type classes" \
  --body "$(cat <<'EOF'
## Summary

Plan A of the design-system audit (spec: `docs/superpowers/specs/2026-04-18-design-system-audit-design.md`).

- Adds `.vv-*` semantic type classes to `globals.css` (from `app/design-system/colors_and_type.css`).
- Migrates every page and a handful of components to use the classes in markup.
- Deletes per-module typography rules; modules now carry only layout (margin, padding, flex).

No copy changes, no behavior changes, no new dependencies.

## Files touched

- `app/src/app/globals.css` — added classes
- 9 pages (`/login`, `/`, `/d/[id]`, `/f/[id]`, `/search`, `/upload`, `/saved`, `/admin`, `/p/[token]`)
- `Modal`, `MetaPanel` components

## Test plan

- [x] `npm test` — existing suite passes (pre-existing ffprobe/testcontainers failures only)
- [x] `npm run build` — green
- [x] `rg` sweep: no stray `Fraunces` / `--vv-font-display` in modules
- [x] Manual QA desktop + mobile 375×667 across all 9 pages
- [ ] Merge → Watchtower deploys to LXC 105 — visual spot-check on https://vault.bullmoosefn.com

## Follow-up

Plan B (copy & voice pass) and Plan C (shadow/border/radius/icon audit) in separate PRs per the audit spec.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Mark Plan A complete**

After the PR is open and CI is green, merge. Watchtower auto-deploys to LXC 105 in ~4 min. After deploy, revisit https://vault.bullmoosefn.com and confirm the live page renders match local QA. Record any drift and either hotfix or add a follow-up task.

---

## Self-Review Checklist (already run by author)

- [x] Every task cites exact file paths + line numbers where available.
- [x] Every CSS change shows the block being deleted AND the replacement.
- [x] Every JSX change shows both "from" and "to" snippets.
- [x] Commands are complete (`cd` prefix, exact `git add` paths).
- [x] Class names used consistently across tasks (`vv-greeting`, `vv-section-label`, `vv-title`, `vv-dialog-title`, `vv-brand`, `vv-meta`).
- [x] Mobile override block added to globals in Task 1 — referenced but not redefined in per-page tasks.
- [x] Layout composition pattern (`` `vv-class ${styles.localClass}` ``) used uniformly where a local margin/padding survives migration.
- [x] No task references a function/type/class defined elsewhere in a later task.
- [x] Final sweep in Task 12 verifies the overall success criterion from the spec.
