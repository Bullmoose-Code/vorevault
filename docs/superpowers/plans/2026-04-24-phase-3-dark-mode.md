# Phase 3: Dark Mode (Warm Dark)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dark mode that keeps the warm sticker aesthetic — dark brown backgrounds with cream ink, not inverted black-on-white. Three-mode toggle (system / light / dark) in the UserChip menu, persisted in localStorage, no flash-of-wrong-theme on reload.

**Architecture:**
- CSS-only palette swap: dark values live in `globals.css` behind `@media (prefers-color-scheme: dark)` (system default) and `[data-theme="dark"]` (explicit toggle). Explicit `[data-theme="light"]` re-asserts the light palette so "force light on a dark-system user" works. Base `:root` stays light.
- Pure helper module `lib/theme.ts` — stringly-typed state `ThemeChoice = "system" | "light" | "dark"`, `readStored()` / `writeStored()` / `applyChoice()` / `cycleChoice()`. No React.
- New `<ThemeToggle>` client component — cycles through the three modes, applies to DOM, writes localStorage. Rendered inside UserChip's dropdown menu.
- FOUC prevention: a static `public/theme-init.js` loaded from the `<head>` of `layout.tsx` runs before first paint, reads localStorage, and sets `document.documentElement.dataset.theme`. Using an external file (not inline `dangerouslySetInnerHTML`) sidesteps XSS lint concerns while still fetching synchronously from `<head>`.
- Sticker shadows unchanged: `var(--vv-shadow)` = `Npx Npx 0 var(--vv-ink)` — in dark mode `--vv-ink` is cream, so the shadow inverts along with the ink. Intentional — preserves the brutalist vibe.

**Tech Stack:** Next.js 15 App Router, React 19, TS strict, Vitest + jsdom, CSS Modules with `--vv-*` tokens.

**Branch:** `feat/phase-3-dark-mode` — off `main`.

---

## Palette (dark values)

Warm-dark, not inverted black/white. Values tuned for AA contrast against the new ink color.

| Token | Light | Dark |
|---|---|---|
| `--vv-bg` | `#f4ead5` | `#1a0f08` |
| `--vv-bg-panel` | `#fff8e6` | `#2a1c12` |
| `--vv-bg-sunken` | `#e8dcc0` | `#120a05` |
| `--vv-ink` | `#2a1810` | `#f4ead5` |
| `--vv-ink-muted` | `#7c5e3c` | `#c9a87a` |
| `--vv-ink-subtle` | `#b8a07a` | `#8a7353` |
| `--vv-accent` | `#c2410c` | `#ea580c` |
| `--vv-accent-soft` | `#d97706` | `#fb923c` |
| `--vv-success` | `#84cc16` | `#a3e635` |
| `--vv-info` | `#0891b2` | `#22d3ee` |
| `--vv-danger` | `#be185d` | `#f472b6` |
| `--vv-warn` | `#fde68a` | `#fde68a` |
| `--vv-ink-warn` | `#7c2d12` | `#fcd34d` |
| `--vv-discord` | `#5865F2` | `#5865F2` |

`--vv-warn` and `--vv-discord` stay constant in both modes.

Shadow / radius tokens unchanged — shadow using `var(--vv-ink)` naturally inverts along with ink.

---

## Three-mode toggle semantics

| Choice | Storage | DOM | CSS effect |
|---|---|---|---|
| `system` (default) | no key | no `data-theme` attribute | Uses `@media (prefers-color-scheme: dark)` to follow OS setting |
| `light` | `"light"` | `data-theme="light"` | Forces light palette regardless of system |
| `dark` | `"dark"` | `data-theme="dark"` | Forces dark palette regardless of system |

Toggle cycles: `system` → `light` → `dark` → `system`. Icon reflects current choice.

---

## File Structure

**Created:**
- `app/src/lib/theme.ts` — pure helpers. Exports `ThemeChoice`, `THEME_STORAGE_KEY`, `readStored()`, `writeStored(choice)`, `applyChoice(choice)`, `cycleChoice(current)`.
- `app/src/lib/theme.test.ts`
- `app/src/components/ThemeToggle.tsx` — client component.
- `app/src/components/ThemeToggle.module.css`
- `app/src/components/ThemeToggle.test.tsx`
- `app/public/theme-init.js` — static JS, loaded from `<head>` before first paint.

**Modified:**
- `app/src/app/globals.css` — add dark-mode overrides.
- `app/src/app/layout.tsx` — add `<script src="/theme-init.js" />` to head; update `viewport.themeColor` to emit both media variants.
- `app/src/components/UserChip.tsx` — render `<ThemeToggle />` inside the dropdown.

**Not touched:**
- Existing component CSS — everything already uses `--vv-*` tokens. The two raw-rgba values in `FileCard.module.css` (tile placeholder text + duration scrim) are intentional and stay dark regardless of theme. The `color: #fff` in `login/page.module.css` is on the Discord brand button and stays white.
- `DESIGN.md`.

---

## Task 1: Branch + baseline

- [ ] **Step 1**
  ```bash
  git -C /root/vorevault fetch origin
  git -C /root/vorevault checkout main && git -C /root/vorevault pull --ff-only
  git -C /root/vorevault checkout -b feat/phase-3-dark-mode
  ```

- [ ] **Step 2: Baseline**
  ```bash
  cd /root/vorevault/app && npm test -- 'src/components' 'src/app/(shell)' 'src/app/login' 'src/lib/zip' 'src/lib/gridNav' 'src/lib/moveItems' 'src/lib/dragDrop' 2>&1 | tail -5
  cd /root/vorevault/app && npm run build 2>&1 | tail -4
  ```
  Expected: all green, clean build.

---

## Task 2: `lib/theme.ts` — pure helpers

**Files:**
- Create: `app/src/lib/theme.ts`
- Create: `app/src/lib/theme.test.ts`

### Step 1: Write the failing test

Write `app/src/lib/theme.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readStored, writeStored, applyChoice, cycleChoice, THEME_STORAGE_KEY } from "./theme";

describe("theme helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  describe("readStored", () => {
    it("returns 'system' when no value stored", () => {
      expect(readStored()).toBe("system");
    });

    it("returns stored choice when valid", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      expect(readStored()).toBe("dark");
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      expect(readStored()).toBe("light");
      localStorage.setItem(THEME_STORAGE_KEY, "system");
      expect(readStored()).toBe("system");
    });

    it("returns 'system' on invalid stored value", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "purple");
      expect(readStored()).toBe("system");
    });
  });

  describe("writeStored", () => {
    it("stores 'light' and 'dark' explicitly", () => {
      writeStored("dark");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
      writeStored("light");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    });

    it("removes the key for 'system'", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      writeStored("system");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });
  });

  describe("applyChoice", () => {
    it("sets data-theme=dark on dark choice", () => {
      applyChoice("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("sets data-theme=light on light choice", () => {
      applyChoice("light");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("removes data-theme on system choice", () => {
      document.documentElement.setAttribute("data-theme", "dark");
      applyChoice("system");
      expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    });
  });

  describe("cycleChoice", () => {
    it("system → light → dark → system", () => {
      expect(cycleChoice("system")).toBe("light");
      expect(cycleChoice("light")).toBe("dark");
      expect(cycleChoice("dark")).toBe("system");
    });
  });
});
```

### Step 2: Run, confirm fail

```bash
cd /root/vorevault/app && npm test -- theme
```

### Step 3: Implement

Write `app/src/lib/theme.ts`:

```ts
export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "vv:theme";

export function readStored(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
    return "system";
  } catch {
    return "system";
  }
}

export function writeStored(choice: ThemeChoice): void {
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // storage may be blocked (private browsing, etc.) — ignore
  }
}

export function applyChoice(choice: ThemeChoice): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

export function cycleChoice(current: ThemeChoice): ThemeChoice {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}
```

### Step 4: Run tests + commit

```bash
cd /root/vorevault/app && npm test -- theme
cd /root/vorevault
git add app/src/lib/theme.ts app/src/lib/theme.test.ts
git commit -m "feat(lib): theme helpers — read/write/apply/cycle ThemeChoice"
```

---

## Task 3: Dark palette in globals.css + viewport theme-color

**Files:**
- Modify: `app/src/app/globals.css`
- Modify: `app/src/app/layout.tsx` (viewport block only — FOUC script comes in Task 4)

### Step 1: Read current globals

```bash
cat /root/vorevault/app/src/app/globals.css
```

The file has one `:root { ... }` block with the light palette.

### Step 2: Append dark overrides

Directly after the existing `:root { /* light values */ }` block and before the `*` universal selector, insert:

```css
:root[data-theme="dark"] {
  --vv-bg: #1a0f08;
  --vv-bg-panel: #2a1c12;
  --vv-bg-sunken: #120a05;
  --vv-ink: #f4ead5;
  --vv-ink-muted: #c9a87a;
  --vv-ink-subtle: #8a7353;
  --vv-accent: #ea580c;
  --vv-accent-soft: #fb923c;
  --vv-success: #a3e635;
  --vv-info: #22d3ee;
  --vv-danger: #f472b6;
  --vv-ink-warn: #fcd34d;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --vv-bg: #1a0f08;
    --vv-bg-panel: #2a1c12;
    --vv-bg-sunken: #120a05;
    --vv-ink: #f4ead5;
    --vv-ink-muted: #c9a87a;
    --vv-ink-subtle: #8a7353;
    --vv-accent: #ea580c;
    --vv-accent-soft: #fb923c;
    --vv-success: #a3e635;
    --vv-info: #22d3ee;
    --vv-danger: #f472b6;
    --vv-ink-warn: #fcd34d;
  }
}
```

### Step 3: Update viewport.themeColor in layout.tsx

In `app/src/app/layout.tsx`, find the `viewport` export:

```ts
export const viewport: Viewport = {
  themeColor: "#f4ead5",
  ...
};
```

Change `themeColor` to an array:

```ts
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4ead5" },
    { media: "(prefers-color-scheme: dark)", color: "#1a0f08" },
  ],
  ...
};
```

Keep the other viewport properties unchanged.

### Step 4: Build

```bash
cd /root/vorevault/app && npm run build 2>&1 | tail -5
```

Expected: clean compile.

### Step 5: Commit

```bash
cd /root/vorevault
git add app/src/app/globals.css app/src/app/layout.tsx
git commit -m "feat(ui): dark palette + prefers-color-scheme hookup"
```

---

## Task 4: FOUC-prevention static script

**Files:**
- Create: `app/public/theme-init.js`
- Modify: `app/src/app/layout.tsx` (add the `<script src=...>` to head)

### Step 1: Create the static script

Write `app/public/theme-init.js`:

```js
(function () {
  try {
    var t = localStorage.getItem("vv:theme");
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) { /* storage blocked — noop */ }
})();
```

This is a static asset served from `/theme-init.js`. Next.js serves the `public/` directory at the site root.

### Step 2: Reference it from `<head>`

In `app/src/app/layout.tsx`, add a `<head>` element to the returned JSX if it doesn't exist. Inside, add a `<script src="/theme-init.js" />`. Place it so it runs before any render-blocking resources. Next.js may automatically inject additional head elements, but ours can coexist.

Read the current `return (...)` of the default export. The pattern today is likely:

```tsx
return (
  <html lang="en" className={...}>
    <body>
      {children}
    </body>
  </html>
);
```

Update to:

```tsx
return (
  <html lang="en" className={...}>
    <head>
      <script src="/theme-init.js" />
    </head>
    <body>
      {children}
    </body>
  </html>
);
```

Note on `<script src>` vs inline: loading from `public/` keeps the script tiny but out-of-band. On first load it blocks on fetching the file (< 300 bytes, same origin, typically cached after first visit). Acceptable trade for avoiding inline-script XSS lint.

If Next's build complains about `<head>` children in `layout.tsx`: an alternative is to return a raw `<script>` element as the FIRST child of `<body>` — the FOUC risk is then marginal because the attribute is set before any `<div>` renders. But the head placement is the standard pattern.

### Step 3: Build + verify

```bash
cd /root/vorevault/app && npm run build 2>&1 | tail -5
```

Expected: clean build.

Optional post-build sanity: the static file should be served from `/theme-init.js` — check that `app/public/theme-init.js` exists (it's served as-is, not bundled):

```bash
ls -l /root/vorevault/app/public/theme-init.js
```

### Step 4: Commit

```bash
cd /root/vorevault
git add app/public/theme-init.js app/src/app/layout.tsx
git commit -m "feat(ui): theme-init script prevents FOUC on dark-mode reload"
```

---

## Task 5: `<ThemeToggle>` component

**Files:**
- Create: `app/src/components/ThemeToggle.tsx`
- Create: `app/src/components/ThemeToggle.module.css`
- Create: `app/src/components/ThemeToggle.test.tsx`

### Step 1: Write failing test

Write `app/src/components/ThemeToggle.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("renders with the current choice indicated", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toMatch(/dark/i);
  });

  it("clicking cycles system → light → dark → system", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");

    // Initial: system (no stored key)
    expect(btn.getAttribute("aria-label")).toMatch(/system/i);

    await user.click(btn);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    await user.click(btn);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    await user.click(btn);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });
});
```

### Step 2: Run, confirm fail

```bash
cd /root/vorevault/app && npm test -- ThemeToggle
```

### Step 3: Implement

Write `app/src/components/ThemeToggle.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { readStored, writeStored, applyChoice, cycleChoice, type ThemeChoice } from "@/lib/theme";
import styles from "./ThemeToggle.module.css";

const LABEL: Record<ThemeChoice, string> = {
  system: "theme: system",
  light: "theme: light",
  dark: "theme: dark",
};

const GLYPH: Record<ThemeChoice, string> = {
  system: "◐",
  light: "☀",
  dark: "☾",
};

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    setChoice(readStored());
  }, []);

  function onClick() {
    const next = cycleChoice(choice);
    setChoice(next);
    writeStored(next);
    applyChoice(next);
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={onClick}
      aria-label={LABEL[choice]}
    >
      <span className={styles.glyph} aria-hidden="true">{GLYPH[choice]}</span>
      <span className={styles.text}>{LABEL[choice]}</span>
    </button>
  );
}
```

### Step 4: CSS

Write `app/src/components/ThemeToggle.module.css`:

```css
.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: var(--vv-ink);
  font: 600 13px/1 var(--vv-font-ui);
  text-align: left;
  cursor: pointer;
  border-radius: var(--vv-radius-sm);
}

.toggle:hover,
.toggle:focus-visible {
  background: var(--vv-bg-sunken);
  outline: none;
}

.glyph {
  font-size: 16px;
  width: 18px;
  display: inline-block;
  text-align: center;
}

.text {
  flex: 1;
}
```

### Step 5: Tests + commit

```bash
cd /root/vorevault/app && npm test -- ThemeToggle
cd /root/vorevault
git add app/src/components/ThemeToggle.tsx app/src/components/ThemeToggle.module.css app/src/components/ThemeToggle.test.tsx
git commit -m "feat(ui): ThemeToggle component with system/light/dark cycle"
```

Expected: 2 tests pass.

---

## Task 6: Wire ThemeToggle into UserChip menu

**Files:**
- Modify: `app/src/components/UserChip.tsx`

### Step 1: Read UserChip

The dropdown `<div className={styles.menu} role="menu">` contains the header and a logout form. Insert `<ThemeToggle />` between the header and the existing divider.

### Step 2: Edit

Add the import near other imports:

```tsx
import { ThemeToggle } from "./ThemeToggle";
```

Update the menu JSX:

```tsx
<div className={styles.menu} role="menu">
  <div className={styles.header}>@{username}</div>
  <ThemeToggle />
  <div className={styles.divider} />
  <form action="/api/auth/logout" method="post" className={styles.logoutForm}>
    <button type="submit" className={styles.item} role="menuitem">
      Log out
    </button>
  </form>
</div>
```

### Step 3: Full sweep

```bash
cd /root/vorevault/app && npm test -- UserChip ThemeToggle 2>&1 | tail -6
cd /root/vorevault/app && npm test -- 'src/components' 'src/app/(shell)' 'src/app/login' 2>&1 | tail -6
cd /root/vorevault/app && npm run build 2>&1 | tail -5
```

Expected: all green, clean build.

### Step 4: Commit

```bash
cd /root/vorevault
git add app/src/components/UserChip.tsx
git commit -m "feat(ui): render ThemeToggle inside UserChip dropdown"
```

---

## Task 7: Verification + PR

- [ ] **Step 1: Full unit suite**
  ```bash
  cd /root/vorevault/app && npm test -- 'src/components' 'src/app/(shell)' 'src/app/login' 'src/lib' 2>&1 | tail -8
  ```
  Expected: all green.

- [ ] **Step 2: Build**
  ```bash
  cd /root/vorevault/app && npm run build 2>&1 | tail -5
  ```

- [ ] **Step 3: Manual browser checks** (requires dev session)
  - Fresh visit with system = light → light palette.
  - Fresh visit with system = dark → dark palette.
  - Click UserChip → menu opens → ThemeToggle visible.
  - Click ThemeToggle → cycles system → light → dark → system. Glyph + label update per click.
  - Reload after picking dark → no FOUC, loads directly in dark palette.
  - Force-light on a dark-system machine → stays light after reload.
  - All surfaces look coherent in dark mode: grid, cards, icon tiles, sidebar, breadcrumbs, toolbar, dialogs, toasts, context menu. No unreadable text, no invisible borders.
  - Focus rings still visible (3px accent outline reads against both themes).
  - Thumbnail duration badges + tile placeholder text stay legible (intentional raw dark rgba).

- [ ] **Step 4: Commit plan + push + open PR**
  ```bash
  cd /root/vorevault
  git add docs/superpowers/plans/2026-04-24-phase-3-dark-mode.md
  git commit -m "docs: Phase 3 dark mode implementation plan"
  git push -u origin feat/phase-3-dark-mode
  gh pr create --title "feat: Phase 3 — dark mode (warm dark, three-mode toggle)" --body "$(cat <<'EOF'
## Summary

Dark mode that keeps the warm sticker aesthetic — dark brown backgrounds with cream ink, not inverted black/white. Three-mode toggle (system / light / dark) in the UserChip dropdown, persisted in localStorage, no flash-of-wrong-theme on reload.

- Dark palette added to globals.css behind \`[data-theme=\"dark\"]\` (explicit) and \`@media (prefers-color-scheme: dark):not([data-theme=\"light\"])\` (system default, respecting explicit override).
- New \`lib/theme.ts\` — pure helpers for read/write/apply/cycle.
- New \`<ThemeToggle>\` component in UserChip menu — icon + label, cycles on click.
- Static \`public/theme-init.js\` loaded from \`<head>\` reads localStorage before first paint to prevent FOUC.
- Viewport \`themeColor\` now emits both light + dark media variants.

## Design decisions

- \"Warm dark\" palette — cream-ink / dark-brown-bg keeps brand warmth.
- Sticker shadows (\`3px 3px 0 var(--vv-ink)\`) naturally invert to cream-on-dark — intentional, preserves the brutalist vibe.
- Three modes (not two): many users want \"force light\" / \"force dark\" without matching OS.
- Two raw-rgba values in FileCard stay dark regardless of theme (thumbnail scrim + placeholder text); Discord login button's \`#fff\` stays white for brand.
- External \`theme-init.js\` (not inline script) — avoids inline-XSS lint and keeps head clean. Tradeoff: extra sub-resource fetch on first visit; static file, cached after.

## Test plan

- [x] \`lib/theme\` unit tests — read/write/apply/cycle + invalid stored value handling.
- [x] \`<ThemeToggle>\` tests — cycle behavior updates both localStorage and DOM attribute.
- [x] \`npm run build\` clean; theme-color meta tag emits for both media queries.
- [ ] Manual: system / light / dark paths; reload-no-FOUC; all surfaces coherent in dark mode.
EOF
)"
  ```

---

## Self-review

**1. Spec coverage.** Dark palette, three-mode toggle, FOUC prevention via external script, UserChip integration, viewport theme-color. Covered across tasks 2–6.

**2. Placeholder scan.** No TBD. Every task has concrete code, exact commands, exact CSS values.

**3. Type consistency.** `ThemeChoice` defined in `lib/theme.ts`, consumed by `ThemeToggle.tsx`. `THEME_STORAGE_KEY` exported so tests import the same constant.

**4. A11y.** Toggle has `aria-label` that changes with state. Glyph is `aria-hidden="true"`. Lives inside the existing `role="menu"` dropdown. Contrast: palette pairs meet WCAG AA — cream on dark brown is comfortably >7:1; accent orange on dark is legible.

**5. FOUC strategy.** Static `public/theme-init.js` runs synchronously from `<head>`. Sets `data-theme` attribute before first paint. No-stored-key falls through to the `@media` query that handles system preference. The one caveat: the first-ever visit pays an extra sub-resource fetch for the 200-byte file; cached afterward.

**6. Sticker-shadow aesthetic in dark mode.** `--vv-shadow = 3px 3px 0 var(--vv-ink)` resolves to `3px 3px 0 cream` on dark — the shadow becomes the bright element. Inverts the sticker effect deliberately.

**7. Scope compromise.** Three raw-color exceptions noted and justified: `FileCard` placeholder text rgba, `FileCard` duration-scrim rgba, `login` Discord button `#fff`. All three are intentionally theme-independent (overlays on colored tiles or brand chrome).

**8. Follow-up risk.** Design-system persistence (Phase 3 next) will want both palettes in `design-system/MASTER.md`. Straightforward addition; no refactor.
