# VoreVault Mobile / PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make VoreVault installable as a PWA and comfortable on phones (≤640px portrait), while preserving the desktop UI and brutalist-parchment aesthetic.

**Architecture:** All work is additive — a new `public/manifest.webmanifest`, a no-op service worker, three PNG icons, a small client-side SW-registration component mounted in `layout.tsx`, and responsive CSS media queries under a single `@media (max-width: 640px)` breakpoint across existing stylesheets. One small TS change (UserChip gains an `isAdmin` prop; Admin pill is removed from TopBar).

**Tech Stack:** Next.js 15 App Router, TypeScript strict, CSS Modules. Icon generation via ImageMagick `convert` (already installed). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-04-17-vorevault-mobile-design.md`

**Branch:** `feat/mobile-pwa` (already created off `origin/main`)

**Testing note:** This repo has no React component testing infra (no @testing-library/react, no jsdom). All API/lib logic uses Vitest; components are verified via `npm run build` + manual QA. We follow that convention — no new test infra for the `isAdmin` conditional. Adding it would violate the spec's "no new dependencies" rule for a single boolean branch.

---

## Task 1: PWA manifest + icons

**Files:**
- Create: `app/public/icons/icon-192.png`
- Create: `app/public/icons/icon-512.png`
- Create: `app/public/icons/icon-maskable-512.png`
- Create: `app/public/icons/icon-maskable.svg`
- Create: `app/public/manifest.webmanifest`
- Modify: `app/src/app/layout.tsx`

- [ ] **Step 1: Create a padded maskable SVG source**

The existing `app/src/app/icon.svg` has the moose filling the full 44×38 frame — Android's adaptive icon mask would crop the antlers. Create a separate maskable source with the moose centered at ~60% of a square canvas on the brand cream background.

Create `app/public/icons/icon-maskable.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#f4ead5"/>
  <g transform="translate(110 148) scale(6.66)">
    <path d="M7 8 L3 3 L5 8 L1 6 L4 10 L0 11 L6 12 M7 8 L10 4 L10 9 L13 6 L12 11 L15 10" stroke="#c2410c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M37 8 L41 3 L39 8 L43 6 L40 10 L44 11 L38 12 M37 8 L34 4 L34 9 L31 6 L32 11 L29 10" stroke="#c2410c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M14 14 C14 12, 16 11, 22 11 C28 11, 30 12, 30 14 L30 22 C30 26, 28 30, 26 33 L28 36 L24 35 L22 36 L20 35 L16 36 L18 33 C16 30, 14 26, 14 22 Z" fill="#2a1810"/>
    <circle cx="19" cy="18" r="1.2" fill="#f4ead5"/>
    <circle cx="25" cy="18" r="1.2" fill="#f4ead5"/>
    <ellipse cx="22" cy="30" rx="2.5" ry="1.2" fill="#c2410c"/>
  </g>
</svg>
```

The `translate(110 148) scale(6.66)` centers the 44×38 moose inside a 512×512 canvas and scales it to ~40% of canvas width so the safe zone around a circular mask still contains the full mark.

- [ ] **Step 2: Generate PNG icons from SVG sources**

Run from repo root:

```bash
mkdir -p app/public/icons
convert -background none -resize 192x192 app/src/app/icon.svg app/public/icons/icon-192.png
convert -background none -resize 512x512 app/src/app/icon.svg app/public/icons/icon-512.png
convert -background '#f4ead5' -resize 512x512 app/public/icons/icon-maskable.svg app/public/icons/icon-maskable-512.png
```

Expected: three PNGs created. Verify:
```bash
file app/public/icons/*.png
```
Expected output lists each PNG with its dimensions (192×192, 512×512, 512×512).

- [ ] **Step 3: Create the manifest**

Create `app/public/manifest.webmanifest`:

```json
{
  "name": "VoreVault",
  "short_name": "Vault",
  "description": "The Bullmoose clip archive.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#f4ead5",
  "theme_color": "#f4ead5",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 4: Wire manifest + PWA metadata into layout**

Replace the `metadata` and `RootLayout` blocks at the bottom of `app/src/app/layout.tsx` (currently lines ~30-44) with:

```tsx
export const metadata: Metadata = {
  title: "vorevault",
  description: "The Bullmoose clip archive",
  manifest: "/manifest.webmanifest",
  applicationName: "VoreVault",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vault",
  },
  icons: {
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f4ead5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
```

Add the `Viewport` import to the top of the file — change the existing `import type { Metadata } from "next";` line to:

```tsx
import type { Metadata, Viewport } from "next";
```

- [ ] **Step 5: Verify build**

Run:
```bash
cd app && npm run build
```
Expected: build succeeds. No new warnings. Confirm `app/.next/` gets generated and `app/public/manifest.webmanifest` is served at `/manifest.webmanifest` (Next.js serves `public/` at the root automatically — no explicit route needed).

- [ ] **Step 6: Commit**

```bash
git add app/public/icons app/public/manifest.webmanifest app/src/app/layout.tsx
git commit -m "feat(pwa): add manifest and installable icons"
```

---

## Task 2: Service worker + registration

**Files:**
- Create: `app/public/sw.js`
- Create: `app/src/components/SWRegister.tsx`
- Modify: `app/src/app/layout.tsx`

- [ ] **Step 1: Create the no-op service worker**

Create `app/public/sw.js`:

```js
// VoreVault service worker.
// Zero caching by design — files are large and private; this SW exists only to
// satisfy the PWA install criterion on Chromium and iOS.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch. Required so the browser treats this as a "real" SW.
self.addEventListener("fetch", () => {});
```

- [ ] **Step 2: Create the registration component**

Create `app/src/components/SWRegister.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("SW registration failed", err);
    });
  }, []);
  return null;
}
```

- [ ] **Step 3: Mount SWRegister in the root layout**

Edit `app/src/app/layout.tsx`. Add the import near the top with the other imports:

```tsx
import { SWRegister } from "@/components/SWRegister";
```

In the `RootLayout` return, replace `<body>{children}</body>` with:

```tsx
<body>
  <SWRegister />
  {children}
</body>
```

- [ ] **Step 4: Verify build**

```bash
cd app && npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Verify registration in dev (spot check)**

Because the component skips registration outside production, a true end-to-end check only happens post-deploy. Lightweight local verification:

```bash
cd app && npm run dev
```

Open `http://localhost:3000`, open DevTools → Application → Service Workers. In dev mode the SW is intentionally NOT registered — you should see an empty list. This confirms the dev-mode guard works.

- [ ] **Step 6: Commit**

```bash
git add app/public/sw.js app/src/components/SWRegister.tsx app/src/app/layout.tsx
git commit -m "feat(pwa): register no-op service worker in production"
```

---

## Task 3: Global mobile primitives

**Files:**
- Modify: `app/src/app/globals.css`

- [ ] **Step 1: Add tokens and base mobile rules**

Append to `app/src/app/globals.css`:

```css
/* ---- Mobile primitives ---- */

:root {
  --vv-mobile: 640px;
  --vv-safe-top: env(safe-area-inset-top, 0px);
  --vv-safe-bottom: env(safe-area-inset-bottom, 0px);
  --vv-safe-left: env(safe-area-inset-left, 0px);
  --vv-safe-right: env(safe-area-inset-right, 0px);
}

html, body {
  min-height: 100dvh;
}

/* Respect iOS notch and home indicator, especially in standalone PWA mode. */
body {
  padding-top: var(--vv-safe-top);
  padding-left: var(--vv-safe-left);
  padding-right: var(--vv-safe-right);
  padding-bottom: var(--vv-safe-bottom);
}

/* Comfortable tap targets on touch devices. */
@media (hover: none) and (pointer: coarse) {
  button, a, input[type="submit"], label[role="button"] {
    min-height: 44px;
  }
}
```

- [ ] **Step 2: Verify build**

```bash
cd app && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/src/app/globals.css
git commit -m "feat(mobile): add breakpoint token, safe-area handling, tap targets"
```

---

## Task 4: TopBar mobile layout + remove standalone Admin pill

**Files:**
- Modify: `app/src/components/TopBar.tsx`
- Modify: `app/src/components/TopBar.module.css`

- [ ] **Step 1: Remove the standalone Admin pill from TopBar**

Edit `app/src/components/TopBar.tsx`. The Admin link moves into the UserChip menu (Task 5), so delete that pill and pass `isAdmin` through to `UserChip` instead. Replace the whole file contents:

```tsx
import { MooseLogo } from "./MooseLogo";
import { Pill } from "./Pill";
import { UserChip } from "./UserChip";
import styles from "./TopBar.module.css";

export function TopBar({
  username,
  avatarUrl,
  showUpload = true,
  isAdmin = false,
}: {
  username: string;
  avatarUrl?: string | null;
  showUpload?: boolean;
  isAdmin?: boolean;
}) {
  return (
    <header className={styles.topbar}>
      <a className={styles.brand} href="/">
        <MooseLogo size="header" />
        vorevault
      </a>
      <div className={styles.actions}>
        {showUpload && (
          <Pill variant="primary" href="/upload" className={styles.uploadPill}>
            <span className={styles.uploadIcon} aria-hidden="true">↑</span>
            <span className={styles.uploadLabel}>Upload</span>
          </Pill>
        )}
        <UserChip username={username} avatarUrl={avatarUrl} isAdmin={isAdmin} />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Add responsive rules to TopBar.module.css**

Append to `app/src/components/TopBar.module.css`:

```css
.uploadPill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.uploadIcon {
  display: inline-block;
  font-weight: 900;
}

@media (max-width: 640px) {
  .topbar {
    padding: 12px 16px;
  }

  .brand {
    font-size: 22px;
    gap: 8px;
  }

  .actions {
    gap: 10px;
  }

  /* Upload pill becomes icon-only on narrow screens. */
  .uploadPill {
    padding: 0;
    width: 44px;
    height: 44px;
    justify-content: center;
  }

  .uploadLabel {
    display: none;
  }
}
```

- [ ] **Step 3: Verify build**

```bash
cd app && npm run build
```
Expected: build succeeds. The next task updates `UserChip` to accept the new `isAdmin` prop; until then `UserChip` ignores it (TypeScript will not error because we're about to add it).

Actually — that's a TypeScript error waiting to happen. To keep the build green **between tasks**, add the prop to `UserChip` first. Reorder: do Task 5 before this, or do them in the same commit. Choose the latter for atomicity.

**Merge Task 4 Step 1–2 with Task 5 into a single commit.** Do Task 5's code changes next, then commit both together.

- [ ] **Step 4: Continue to Task 5 before committing.**

---

## Task 5: UserChip Admin link (committed with Task 4)

**Files:**
- Modify: `app/src/components/UserChip.tsx`
- Modify: `app/src/components/UserChip.module.css`

- [ ] **Step 1: Add the `isAdmin` prop and Admin menu item**

Replace the whole contents of `app/src/components/UserChip.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./UserChip.module.css";

export function UserChip({
  username,
  avatarUrl,
  isAdmin = false,
}: {
  username: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.chip}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={styles.avatar}>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : null}
        </span>
        <span className={styles.username}>{username}</span>
        <span className={styles.caret}>▾</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.header}>@{username}</div>
          <a className={styles.item} href="/?mine=1" role="menuitem">
            ↑ My uploads
          </a>
          {isAdmin && (
            <a className={styles.item} href="/admin" role="menuitem">
              Admin
            </a>
          )}
          <div className={styles.divider} />
          <form action="/api/auth/logout" method="post" className={styles.logoutForm}>
            <button type="submit" className={styles.item} role="menuitem">
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Style the new header, divider, and hide username on mobile**

Append to `app/src/components/UserChip.module.css`:

```css
.header {
  padding: 6px 12px 8px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--vv-ink-muted);
  font-weight: 700;
  border-bottom: 1px dashed var(--vv-ink-subtle);
  margin-bottom: 4px;
}

.divider {
  height: 1px;
  background: var(--vv-ink-subtle);
  margin: 4px 6px;
}

@media (max-width: 640px) {
  .chip {
    padding: 3px 8px 3px 3px;
    gap: 4px;
  }

  /* Hide the username text on the chip — avatar + caret is enough.
     The full username still appears in the open menu header. */
  .username {
    display: none;
  }

  .avatar {
    width: 30px;
    height: 30px;
  }

  .menu {
    min-width: 220px;
  }

  .item {
    padding: 12px 14px;
    font-size: 14px;
  }
}
```

- [ ] **Step 3: Verify build**

```bash
cd app && npm run build
```
Expected: build succeeds. Types are now consistent — `TopBar` passes `isAdmin` and `UserChip` accepts it.

- [ ] **Step 4: Quick visual spot-check in dev**

```bash
cd app && npm run dev
```
Open `http://localhost:3000` at desktop width and ≤640px (use DevTools device toolbar). Verify:
- Desktop: topbar shows moose + wordmark, "↑ Upload" pill with label, user chip with name + caret.
- Mobile (≤640px): topbar shows compact moose + wordmark, circular "↑" upload button, avatar-only chip.
- Clicking the avatar opens the menu. If you have an admin session, "Admin" appears between "My uploads" and "Log out". If not, only "My uploads" and "Log out".

- [ ] **Step 5: Commit both Task 4 and Task 5 together**

```bash
git add app/src/components/TopBar.tsx app/src/components/TopBar.module.css app/src/components/UserChip.tsx app/src/components/UserChip.module.css
git commit -m "feat(mobile): responsive TopBar, move Admin into user menu"
```

---

## Task 6: Home grid mobile

**Files:**
- Modify: `app/src/app/page.module.css`

- [ ] **Step 1: Add mobile media queries**

Append to `app/src/app/page.module.css`:

```css
@media (max-width: 640px) {
  .subheader {
    padding: 20px 16px 16px;
    gap: 8px;
  }

  .greeting {
    font-size: 26px;
    letter-spacing: -0.5px;
  }

  .stats {
    font-size: 13px;
  }

  .grid {
    grid-template-columns: 1fr;
    gap: 16px;
    padding: 0 16px 24px;
  }

  .empty {
    padding: 48px 16px;
  }

  .empty h2 {
    font-size: 22px;
  }

  .pagination {
    padding: 0 16px 32px;
    gap: 14px;
    flex-wrap: wrap;
  }
}
```

- [ ] **Step 2: Verify build**

```bash
cd app && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Visual check**

```bash
cd app && npm run dev
```
Open `http://localhost:3000` at 390×844 (iPhone emulation). Verify:
- Single-column file grid.
- Greeting wraps cleanly and reads at a comfortable size.
- Stats row does not overflow.
- Pagination buttons have room to breathe.

- [ ] **Step 4: Commit**

```bash
git add app/src/app/page.module.css
git commit -m "feat(mobile): responsive home grid"
```

---

## Task 7: Upload page mobile

**Files:**
- Modify: `app/src/components/DropZone.tsx`
- Modify: `app/src/components/DropZone.module.css`
- Modify: `app/src/app/upload/UploadClient.module.css`
- Modify: `app/src/app/upload/page.module.css`

- [ ] **Step 1: Add two copy variants to DropZone**

Edit `app/src/components/DropZone.tsx`. Replace the inner content block (currently lines ~42-46 — the `.inner` div) with:

```tsx
<div className={styles.inner}>
  <div className={styles.icon}>✦</div>
  <h3 className={styles.heading}>
    <span className={styles.hoverCopy}>Drop files here</span>
    <span className={styles.touchCopy}>Tap to choose files</span>
  </h3>
  <div className={styles.limit}>
    mp4, mov, png, jpg, gif, anything really
  </div>
  <label className={styles.picker} onClick={(e) => e.stopPropagation()}>
    Choose files
    <input
      ref={inputRef}
      type="file"
      multiple
      className={styles.hiddenInput}
      onChange={handlePick}
    />
  </label>
</div>
```

The two spans swap via CSS (next step). The "or pick them manually" limit line is simplified — the distinction between drag-and-drop vs tap is already clear from the heading, so the extra phrase was redundant.

- [ ] **Step 2: Style the copy variants and mobile layout**

Replace the full contents of `app/src/components/DropZone.module.css`:

```css
.zone {
  border: 3px dashed var(--vv-ink);
  border-radius: var(--vv-radius-xl);
  padding: 64px 32px;
  text-align: center;
  background: var(--vv-bg-panel);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.zone.dragging {
  background: var(--vv-warn);
  border-color: var(--vv-accent);
}

.inner {
  max-width: 520px;
  margin: 0 auto;
}

.icon {
  font-size: 56px;
  line-height: 1;
  margin-bottom: 14px;
  color: var(--vv-accent);
}

.heading {
  font-family: var(--vv-font-display);
  font-style: italic;
  font-size: 28px;
  margin: 0 0 8px;
  font-weight: 900;
  color: var(--vv-ink);
}

/* Default: show drag copy, hide tap copy. */
.hoverCopy { display: inline; }
.touchCopy { display: none; }

/* Touch devices: show tap copy, hide drag copy. */
@media (hover: none) and (pointer: coarse) {
  .hoverCopy { display: none; }
  .touchCopy { display: inline; }
}

.limit {
  color: var(--vv-ink-muted);
  font-style: italic;
  font-size: 13px;
  margin-bottom: 22px;
}

.picker {
  display: inline-block;
  padding: 12px 22px;
  background: var(--vv-accent);
  color: var(--vv-bg);
  border: 2px solid var(--vv-ink);
  border-radius: 999px;
  font-weight: 700;
  font-size: 14px;
  box-shadow: var(--vv-shadow);
  cursor: pointer;
  font-family: var(--vv-font-ui);
}

.hiddenInput {
  display: none;
}

@media (max-width: 640px) {
  .zone {
    padding: 40px 20px;
    border-width: 2px;
  }

  .icon {
    font-size: 44px;
    margin-bottom: 10px;
  }

  .heading {
    font-size: 22px;
  }
}
```

- [ ] **Step 3: Stack upload rows on mobile**

Append to `app/src/app/upload/UploadClient.module.css`:

```css
@media (max-width: 640px) {
  .uploadsHeader {
    margin: 24px 0 10px;
    gap: 4px;
    flex-direction: column;
    align-items: flex-start;
  }

  .uploadsHeader h2 {
    font-size: 20px;
  }

  .grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}
```

- [ ] **Step 4: Tighten the upload page shell on mobile**

Append to `app/src/app/upload/page.module.css`:

```css
@media (max-width: 640px) {
  .main {
    padding: 8px 16px 32px;
  }

  .header {
    gap: 8px;
    margin: 6px 0 16px;
  }

  .heading {
    font-size: 28px;
    letter-spacing: -0.5px;
  }

  .tip {
    padding: 14px 16px;
    font-size: 12px;
    gap: 10px;
  }

  .tipIcon {
    font-size: 22px;
  }
}
```

- [ ] **Step 5: Verify build**

```bash
cd app && npm run build
```
Expected: build succeeds.

- [ ] **Step 6: Visual check on mobile emulation**

```bash
cd app && npm run dev
```
Open `http://localhost:3000/upload` at 390×844. Verify:
- DropZone reads "Tap to choose files" (not "Drop files here"). On a desktop browser with hover capability, it still reads "Drop files here".
- Tapping the zone opens the native file picker once (not twice — previously-fixed bug).
- Heading and tip panel fit without horizontal overflow.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/DropZone.tsx app/src/components/DropZone.module.css app/src/app/upload/UploadClient.module.css app/src/app/upload/page.module.css
git commit -m "feat(mobile): responsive upload page and drop zone copy"
```

---

## Task 8: File detail (`/f/[id]`) mobile polish

**Files:**
- Modify: `app/src/app/f/[id]/page.module.css`
- Modify: `app/src/components/MetaPanel.module.css`
- Modify: `app/src/components/ShareBanner.module.css`

- [ ] **Step 1: Read current MetaPanel and ShareBanner styles**

Run:
```bash
cat app/src/components/MetaPanel.module.css
cat app/src/components/ShareBanner.module.css
```
Scan for any fixed widths, large paddings, or horizontal layouts that will overflow at 360px width.

- [ ] **Step 2: Lower the detail-page collapse threshold and add mobile tightening**

Edit `app/src/app/f/[id]/page.module.css`. Change the existing `@media (max-width: 820px)` block to include mobile-specific tightening, and add a new narrow breakpoint:

```css
@media (max-width: 820px) {
  .content {
    grid-template-columns: 1fr;
    padding: 16px 16px 32px;
    gap: 20px;
  }

  .back {
    padding: 12px 16px 0;
  }

  .title {
    font-size: 24px;
    line-height: 1.2;
  }
}

@media (max-width: 640px) {
  .player {
    border-width: 2px;
    box-shadow: var(--vv-shadow);
  }

  .image {
    border-width: 2px;
    box-shadow: var(--vv-shadow);
  }

  .title {
    font-size: 22px;
    margin: 16px 0 4px;
  }

  .banner {
    padding: 10px 12px;
    font-size: 12px;
  }
}
```

- [ ] **Step 3: Make MetaPanel single-column on mobile**

Append the file, tailoring selectors to whatever class names you found in Step 1. A representative pattern — replace any `display: flex` / `justify-content: space-between` rows with wrapping or column layout below 640px:

```css
@media (max-width: 640px) {
  /* Root wrapper: use whatever the current class is, commonly .panel */
  /* Tighten padding to match the other mobile breakpoints. */
  .panel {
    padding: 16px;
  }

  /* Action button rows: stack under ~380px so Delete / Download / Copy link
     never squeeze together illegibly. */
  .actions {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .actions button,
  .actions a {
    width: 100%;
    justify-content: center;
  }
}
```

**Important:** the selectors `.panel` and `.actions` assume those class names exist in `MetaPanel.module.css`. Confirm after Step 1 — if they're different, substitute the real names. Do not guess.

- [ ] **Step 4: Make ShareBanner wrap on mobile**

Similar pattern — append to `app/src/components/ShareBanner.module.css`:

```css
@media (max-width: 640px) {
  /* Root container — tighten padding and allow inner rows to wrap. */
  .banner {
    padding: 12px 14px;
    flex-wrap: wrap;
    gap: 10px;
  }

  /* If the banner has a url-row + button-row, make the url row take full width
     and wrap text. Use the actual class names from the file. */
  .urlBox {
    width: 100%;
    min-width: 0;
    word-break: break-all;
  }
}
```

Same caveat: confirm the class names against the file contents.

- [ ] **Step 5: Verify build**

```bash
cd app && npm run build
```
Expected: build succeeds.

- [ ] **Step 6: Visual check**

```bash
cd app && npm run dev
```
Open any file detail at 390×844. Verify:
- Video player does not overflow horizontally.
- Title wraps cleanly and stays readable.
- MetaPanel sits below the player, comfortably padded.
- Action buttons stack full-width under ~380px.
- ShareBanner (if an active share exists) wraps without overflow; the URL breaks at character boundaries.

- [ ] **Step 7: Commit**

```bash
git add app/src/app/f/[id]/page.module.css app/src/components/MetaPanel.module.css app/src/components/ShareBanner.module.css
git commit -m "feat(mobile): responsive file detail page"
```

---

## Task 9: Public share page (`/p/[token]`) mobile

**Files:**
- Modify: `app/src/app/p/[token]/page.module.css` (if it has its own styles)
- Or: no changes if it reuses `/f/[id]` styles

- [ ] **Step 1: Inspect the public share page**

```bash
ls app/src/app/p/\[token\]/
cat app/src/app/p/\[token\]/page.tsx
```
Determine whether it reuses `/f/[id]`'s stylesheet or has its own.

- [ ] **Step 2: Apply the same pattern as Task 8**

If it has its own module CSS, append an equivalent `@media (max-width: 640px)` block that tightens padding, reduces title size, and thins borders/shadows on the player or image, mirroring Task 8 Step 2. If it reuses `/f/[id]` styles, no changes needed.

- [ ] **Step 3: Verify build**

```bash
cd app && npm run build
```

- [ ] **Step 4: Visual check**

Generate a share link from a real file (use the UI on `/f/[id]`), open `/p/<token>` at 390×844. Verify the same criteria as Task 8 apply here — nothing overflows.

- [ ] **Step 5: Commit (if changes were made)**

```bash
git add app/src/app/p/\[token\]/page.module.css
git commit -m "feat(mobile): responsive public share page"
```

If no changes were needed, skip the commit and move on.

---

## Task 10: Admin page mobile

**Files:**
- Modify: `app/src/app/admin/page.module.css`
- Modify: `app/src/app/admin/AdminActions.module.css`

- [ ] **Step 1: Make admin header, stats grid, and table responsive**

Append to `app/src/app/admin/page.module.css`:

```css
@media (max-width: 640px) {
  .adminStrip {
    padding: 10px 16px;
    font-size: 11px;
  }

  .adminLabel {
    font-size: 14px;
  }

  .main {
    padding: 20px 16px 32px;
  }

  .sectionTitle {
    font-size: 18px;
  }

  .statsGrid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 20px;
  }

  /* Table is wide by nature — allow horizontal scroll inside its rounded box
     rather than squeezing columns illegibly. */
  .tableWrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .table {
    min-width: 560px;
  }

  .table th, .table td {
    padding: 8px 10px;
  }
}

@media (max-width: 400px) {
  .statsGrid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Make AdminActions buttons tap-friendly**

Append to `app/src/app/admin/AdminActions.module.css`:

```css
@media (max-width: 640px) {
  .banBtn {
    padding: 8px 14px;
    font-size: 12px;
  }
}
```

- [ ] **Step 3: Verify build**

```bash
cd app && npm run build
```

- [ ] **Step 4: Visual check (admin session required)**

```bash
cd app && npm run dev
```
Open `http://localhost:3000/admin` at 390×844 (you must be logged in as an admin). Verify:
- Stats cards collapse to a 2-column grid, then to 1 column under 400px.
- User table is scrollable horizontally; rows remain legible.
- Ban/Unban buttons are tap-friendly.

- [ ] **Step 5: Commit**

```bash
git add app/src/app/admin/page.module.css app/src/app/admin/AdminActions.module.css
git commit -m "feat(mobile): responsive admin panel"
```

---

## Task 11: Real-device QA + deploy

**Files:**
- None (manual verification)

- [ ] **Step 1: Open PR**

```bash
git push -u origin feat/mobile-pwa
gh pr create --title "feat(mobile): installable PWA + responsive layouts" --body "$(cat <<'EOF'
## Summary
- Installable PWA: manifest + icons + no-op service worker
- Responsive layouts for home, upload, file detail, public share, admin
- Admin link moved into user profile dropdown
- Preserves desktop UI and aesthetic unchanged

## Test plan
- [ ] Chrome DevTools iPhone 14 Pro (390px) — all routes render, no overflow
- [ ] Chrome DevTools Pixel 7 (412px) — all routes render, no overflow
- [ ] Lighthouse PWA audit on deployed build — "Installable" green
- [ ] Install to iPhone home screen, confirm launches standalone
- [ ] Install to Android home screen, confirm adaptive icon renders correctly
- [ ] End-to-end on phone: login → upload → view → copy share link → open share link

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Wait for CI + merge**

Wait for CI to go green. Merge the PR. Watchtower picks up the new image within ~4 minutes per the existing CI/CD pipeline.

- [ ] **Step 3: Lighthouse audit on production**

Open `https://vault.bullmoosefn.com` in Chrome, run Lighthouse → Progressive Web App. Expected: "Installable" passes. Any failing criterion — investigate before declaring done.

- [ ] **Step 4: Real-device install**

On iPhone Safari: visit `https://vault.bullmoosefn.com`, Share → Add to Home Screen. Launch from home screen: should open without Safari chrome, show the Vault icon, respect the notch.

On Android Chrome: visit the same URL, accept install prompt (or use Install button). Launch from home screen: should open standalone with the maskable icon rendering correctly inside the adaptive mask.

- [ ] **Step 5: End-to-end mobile smoke test**

On one of the real devices:
1. Log in with Discord.
2. Upload a small video from the camera roll.
3. Wait for processing, open the file detail.
4. Create a share link, copy it, open in a private window.
5. Confirm the clip plays back.

Any regression — open a bug and fix before closing the task.

---

## Self-review checklist

Before declaring the plan done, walk through:

1. **Spec coverage** — every spec section has a task (✓ PWA shell → T1–2, primitives → T3, TopBar/UserMenu → T4–5, home → T6, upload → T7, file detail → T8, public share → T9, admin → T10, QA → T11).
2. **Placeholders** — none. Every code block is complete.
3. **Type consistency** — `isAdmin` is typed the same (`boolean`, optional, default `false`) in TopBar and UserChip. The `Viewport` type is imported from `next`.
4. **Build stays green between commits** — Tasks 4 + 5 are bundled into one commit to avoid a type error window.
