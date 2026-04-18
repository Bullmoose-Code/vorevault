# VoreVault Mobile / PWA Design

**Status:** Approved
**Date:** 2026-04-17
**Scope:** Make VoreVault usable on phones as an installable PWA while preserving the existing brutalist-parchment aesthetic.

## Goals

- Every route works comfortably on a 360px-wide phone in portrait orientation.
- The site installs to a phone home screen and launches in standalone mode (no browser chrome).
- The existing desktop UI is untouched — all mobile work is additive via responsive breakpoints.
- No new dependencies, no new frameworks, no visual redesign.

## Non-goals

- Offline caching of files or pages. Files are large and private; users expect "no signal = can't upload." Service worker exists only to satisfy the PWA install criterion.
- Push notifications.
- Native-feel chrome (bottom tab bar, swipe navigation, share-sheet integration). Revisit if mobile becomes the primary use case.
- Landscape layout. Locked to portrait via manifest.
- Dark mode.

## Aesthetic direction

Preserve the existing language:
- Warm parchment palette (`--vv-bg: #f4ead5`, `--vv-bg-panel: #fff8e6`)
- Fraunces italic display + Inter UI, burnt-orange accent (`--vv-accent: #c2410c`)
- Hard 3px offset shadows (`--vv-shadow`, no blur)
- Generous rounded corners on pills and cards

Mobile adaptations *are* the design — not a replacement of it. Headings scale up slightly on narrow viewports so they still feel assertive; hit targets grow; layouts collapse to single-column but cards keep their shadow/border personality.

## PWA shell

### `app/public/manifest.webmanifest`
```json
{
  "name": "VoreVault",
  "short_name": "Vault",
  "description": "The Bullmoose clip vault.",
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

### Icons
- Three PNGs generated from the existing `MooseLogo` SVG (192, 512, 512-maskable).
- Maskable variant has the moose centered at ~60% of the canvas so Android adaptive masks don't crop it.
- iOS `apple-touch-icon` at 180px referenced in `<head>`.

### Service worker
- `app/public/sw.js` — registers, installs, activates, passes through all `fetch` events unchanged. Zero caching. Exists only so Chrome/Safari offer the install prompt.
- Registered from `layout.tsx` client boundary using a small `"use client"` helper that calls `navigator.serviceWorker.register('/sw.js')` inside a `useEffect`.
- Dev-mode guard: skip registration when `process.env.NODE_ENV !== "production"` so HMR isn't confused.

### Metadata in `layout.tsx`
- `viewport` export: `width=device-width, initial-scale=1, viewport-fit=cover` so content respects the notch.
- `themeColor` set from palette.
- `manifest: "/manifest.webmanifest"` in the Next.js `metadata` export.
- `appleWebApp`: `{ capable: true, statusBarStyle: "default", title: "Vault" }`.

## Layout primitives

### Tokens (added to `globals.css`)
- `--vv-mobile: 640px` — single mobile breakpoint, used consistently.
- `--vv-safe-top`, `--vv-safe-bottom`: map to `env(safe-area-inset-*)` so layout respects iOS safe areas.

### Base rules
- `html, body`: `min-height: 100dvh` (handles iOS Safari URL bar retract).
- `body`: add `padding-top: env(safe-area-inset-top)` for standalone mode where the TopBar sits under the status bar.
- Interactive elements (`.pill`, buttons, links that function as buttons) get `min-height: 44px` on mobile.

## TopBar (responsive)

### Desktop (unchanged)
`[ moose | vorevault ]                            [ ↑ Upload ] [ Admin ] [ UserChip ]`

### Mobile (`<= 640px`)
`[ moose | vorevault ]                  [ ↑ ] [ avatar ▾ ]`

- Brand shrinks from 28px → 22px; the moose mark stays, wordmark stays.
- Upload pill collapses to icon-only (44×44) but keeps primary styling.
- Admin pill is removed from the header entirely — moves into the avatar menu.
- `UserChip` becomes a button that opens a dropdown menu below it.

## User menu (new)

`UserMenu.tsx` replaces the current static `UserChip` render. Structure:

```
button[aria-haspopup="menu"]
  avatar  username ▾
menu (absolutely positioned, card with shadow)
  header   @username
  link     ↑ My uploads     → /?mine=1
  link     Admin            → /admin        (only if isAdmin)
  divider
  form     Log out          → POST /api/auth/logout
```

Behavior:
- Click/tap toggles open.
- `Escape`, outside click, and route change close it.
- Focus trap within menu while open.
- Menu is rendered for both desktop and mobile — same component, same behavior. Simpler than two UIs.

Visual: same card language as elsewhere — 2px ink border, 3px offset shadow, cream panel background, 8px radius. Items get 44px hit height on touch devices.

## Per-page adaptations

### `/` home
- Grid: CSS grid auto-fills at `minmax(260px, 1fr)` on desktop. On mobile collapse to single column, full-width cards.
- Subheader greeting: wraps cleanly, stats row allows `flex-wrap` so "24 clips · 1.2 GB · last upload 3h ago" doesn't overflow.
- Pagination row: centered, buttons grow to 44px tap targets.

### `/login`
- Already a single card. Verify: card max-width caps at viewport minus 32px padding. Discord button full-width on mobile. Nothing else to change.

### `/upload`
- `DropZone`: copy adapts — "Drop files here" stays on desktop, "Tap to choose files" becomes the primary line on mobile (using a `@media (hover: none)` check). Icon + heading scale down slightly; zone height shrinks so it doesn't dominate the viewport.
- In-flight upload rows stack vertically on mobile with the progress bar taking the full row width; filename truncates with ellipsis.

### `/f/[id]`
- Already collapses at 820px. Refinements:
  - Video player `max-width: 100%`, native controls (already present); ensure no horizontal scroll on small devices.
  - `MetaPanel` padding tightens on mobile, becomes full-width below the video.
  - Delete/download/share buttons stack full-width below ~380px; stay inline above.

### `/p/[token]`
- Same adaptations as `/f/[id]` (this route reuses the same visual primitives). Share banner wraps to two lines instead of overflowing.

### `/admin`
- Stats cards collapse from a row to a 2-column grid on mobile, 1-column below 400px.
- Action buttons stack.

## Implementation order

1. **PWA shell + icons + manifest** — verifies install flow works end-to-end before we polish individual pages.
2. **Global primitives** — tokens, safe-area handling, base hit target rule, viewport meta.
3. **TopBar + UserMenu** — touches every page, so doing it early catches layout issues everywhere.
4. **Home grid + subheader**.
5. **Upload (DropZone + UploadClient).**
6. **File detail / public share polish.**
7. **Admin.**
8. **Manual QA pass** on a real phone (install flow, all six routes).

Each step is its own commit. Small, reviewable.

## Testing

- Unit tests: only where logic changes (UserMenu open/close + outside-click behavior). The rest is CSS — visual, not unit-testable.
- Manual QA in Chrome DevTools device emulation: iPhone 14 Pro (390×844) and Pixel 7 (412×915), both portrait.
- Real-device QA after deploy: install to iOS and Android home screen, walk through login → upload → view → share.
- Lighthouse PWA audit on a deployed build: expect "Installable" + PWA-optimized green.

## Risks

- **iOS PWA quirks:** iOS Safari requires the SW plus the `apple-touch-icon` plus `apple-mobile-web-app-capable`. If any are missing the install flow silently degrades. Mitigate by testing on a real iPhone before declaring done.
- **SW cache poisoning:** zero caching means zero risk today. If we add caching later, versioned cache names + skipWaiting discipline will matter.
- **Safe-area insets in standalone mode:** easy to forget, leads to TopBar under the status bar. Mitigated by the `--vv-safe-top` token applied at body level.

## Out of scope (explicit)

- Bottom tab bar / hamburger menu — unnecessary for three destinations.
- Swipe gestures.
- Offline file access.
- Landscape layout.
- Push notifications.
- Changing the visual identity.
