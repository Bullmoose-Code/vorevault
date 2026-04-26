# VoreVault — Post-v1 Roadmap (2026-04-25)

A living, prioritized wishlist for VoreVault after v1.0.0 + the post-launch polish wave (folders, drive-redesign, trash, dark mode, multi-select, tags, search). Themed mini-roadmaps; each item is one line with a size tag (S/M/L) and a one-line "why."

## How to use this document

- **Themes are ordered top → bottom by recommended priority.** The first theme is what to tackle next.
- **Items inside a theme are also priority-ordered**, but the ordering is softer than across themes.
- **Sizes** are rough effort estimates: S ≈ a session or two, M ≈ a few sessions or a small PR series, L ≈ a multi-PR feature.
- **Adding to this doc** is fine; pulling items out is also fine. Treat it as a living wishlist, not a contract.

## What this roadmap is NOT

Per [`DESIGN.md`](../../../DESIGN.md), the following are permanently off the roadmap and should be rejected without an explicit `DESIGN.md` change first:

- Per-user quotas
- Virus scanning
- 2FA (Discord identity is the source of truth)
- Native mobile app (the PWA is the answer; see Theme 4)
- Object storage (S3/MinIO)
- Full-text search (folders + tags + trigram search are the answer)
- Comments / reactions / activity feed (explicitly out of scope per the 2026-04-25 brainstorm)

---

## Theme 1 — Desktop & integration

The biggest new bet on the roadmap. Pulls VoreVault out of the browser so clip uploads happen automatically while gaming. Stack call: **Tauri** (Rust shell, small binary, low idle footprint — important because the target user is mid-game when uploads happen).

| # | Item | Size | Why |
|---|---|---|---|
| 1.1 | **Tray watcher app** (cross-platform, Win + Mac). Silent auto-upload from one watched folder. Sign in once via system-browser Discord OAuth, store session token in OS keychain. Tray toast on each upload with "view in vault" link. Uses the existing tus endpoint, so nothing changes server-side. **In progress, decomposed into 5 sub-projects:** A (scaffold + auth + keychain) ✅ shipped 2026-04-26 as v0.1.0 of `vorevault-desktop`; B (watcher + upload pipeline), C (native notifications), D (settings window), E (signed installers + releases) remain. | L | Core "capture-clip-during-game → it's in the vault" flow |
| 1.2 | **Per-watched-folder destination & tags** (follow-up to 1.1). User can configure "this folder uploads to *Apex* with tags `apex,clips`" — multiple watched folders, each with its own routing. | M | Lets people organize at the source, not after |
| 1.3 | **`vorevault://` deep-link protocol handler** registered by the watcher app. Tray toasts and Discord links open straight to the file detail page in the user's default browser. | S | Closes the loop from "uploaded" → "watch it" |

**Explicitly rejected for this theme:** Discord slash-command upload — Discord's upload cap is the original reason VoreVault exists; routing uploads back through Discord is self-defeating.

---

## Theme 2 — Navigation & context polish

Small fixes that compound. Mostly S-sized; pick one or two for each PR. **Recommended next focus** because items are quick wins and they fix the user's stated current pain.

| # | Item | Size | Status | Why |
|---|---|---|---|---|
| 2.1 | **Contextual back button on file detail** — "Back to *Apex Clips*" when the user came from a folder, "Back to vault" otherwise. | S | ✅ shipped 2026-04-25 (PR #68) | Stated current pain — back button always dumps to vault root |
| 2.2 | **Prev/next navigation inside file detail** — `←/→` keys + on-screen buttons to jump to the next file in the current grid (folder, recent, mine, starred, tagged home). | S | ✅ shipped 2026-04-25 (PR #69) | Lets users binge a folder without re-clicking grid → file → back |
| 2.3 | **Folder breadcrumb on file detail header** — show `Vault › Clips › Apex › <filename>` so context is always visible. | S | ✅ already implemented (file detail page already renders `<Breadcrumbs>` when the file is in a folder) | Removes ambiguity about which folder a file belongs to |
| 2.4 | ~~**URL-state for filters/sort/search**~~ — explicitly dropped 2026-04-25. Filter (`?tag=`), pagination (`?page=`), and search query (`?q=`) are already URL-stateful via existing `FilterBar` / `SearchBar` / page searchParams, and shareable in Discord today. Sort UI doesn't exist and wasn't a concrete product ask; revisit only if a real need arises. | — | ❌ dropped (already delivered) | Original framing turned out to be already live |
| 2.5 | **Scroll-position restore on browser back** — verify the pagination focus restore from PR #58 also restores scroll, not just focus. Audit and fix gaps. | S | open | Already mostly works; finishing the job |

---

## Theme 3 — Discovery & feed quality

Things that help finding stuff as the file count grows. Most valuable after the watcher app starts producing more uploads.

| # | Item | Size | Why |
|---|---|---|---|
| 3.1 | **"Untagged" filter chip** on home + folder views — surfaces files that need tags so the auto-uploader-tag isn't carrying everything alone. | S | Self-correcting tag hygiene |
| 3.2 | **Tag suggestions on upload** — based on filename keywords, MIME type, and the uploader's most-used tags from the last N uploads. Pre-checked, dismissible. | M | Reduces friction of tagging at upload time |
| 3.3 | **Tag chips with counts** in the filter bar (e.g. `apex (47)`) and a "recent tags" row at the top. | S | Faster scanning of the tag space |
| 3.4 | **Batch labeling on home feed** — already batch-aware (PR #63); add a label like "April 24 — 3 clips by ryan" for context. | S | Makes the recent feed read like an activity log without being one |

---

## Theme 4 — Mobile & PWA polish

The PWA is shipped. These items close the gap with the desktop experience for the "clip on PC, watch on phone in bed" flow.

| # | Item | Size | Why |
|---|---|---|---|
| 4.1 | **Web Share Target API** — register VoreVault as a share destination on iOS/Android. Long-press an image/video in any app → "Share" → "VoreVault" → uploads. | M | Brings phone uploads in line with desktop drag-drop |
| 4.2 | **Camera-roll multi-select upload** — let users pick 20 photos at once and queue them all. | S | Vacation/event dump becomes one tap |
| 4.3 | **Pull-to-refresh** on home/folder/recent views. | S | Native-app instinct on mobile |
| 4.4 | **iOS native fullscreen + AirPlay + PiP** for the video player — verify these work and aren't blocked by custom controls. | S/M | The "polished playback" principle says this matters |
| 4.5 | **Long-press parity audit** — confirm long-press on mobile = right-click on desktop everywhere. Fix gaps. | S | Already mostly there from PR #48 |
| 4.6 | **Offline shell cache** — service worker caches app shell so the PWA at least loads when the network is flaky (shows "no connection" instead of a blank page). | M | Polish, not load-bearing |

---

## Theme 5 — Operator confidence

Things noticeable as the host. The stack runs hands-off today; this makes it *verifiably* hands-off. Recommended before file count grows much further.

| # | Item | Size | Why |
|---|---|---|---|
| 5.1 | **Restore drill** — script that pulls latest backup → restores to a temp dir → checksums files vs. DB → reports diff. Run quarterly via cron. | M | Backups exist but have never been verified |
| 5.2 | **Orphan detection** — admin tool that finds files on disk with no DB row, and DB rows whose file is missing. Report-only first, manual cleanup second. | S | Inevitable drift over years |
| 5.3 | **Deeper `/api/health`** — also checks tusd reachability, transcoder queue depth, free disk, Postgres connection count. Gate Watchtower auto-deploy on it being green. | S | Better signal on "is the stack healthy right now" |
| 5.4 | **Per-uploader & per-folder storage breakdown** in admin — extends the existing storage stats. Shows who/what is eating space. | S | Practical when storage gets tight |
| 5.5 | **Re-process buttons in admin** — "redo thumbnail," "redo transcode" per file. Useful when ffmpeg flubs a frame grab or a transcode fails silently. | S | Saves a manual `pct exec` when it happens |
| 5.6 | **Watchtower deploy notifications** — small webhook posts `vorevault deployed: <commit>` to a Discord channel after a successful image swap. | S | Closes the CI/CD loop |
| 5.7 | **Audit log view** — admin sees "ryan deleted file X at <ts>", "alice moved folder Y." (Likely already partly captured in DB; needs a UI.) | M | After-the-fact accountability without per-file ACLs |

---

## Theme 6 — Quiet wins / nice-to-haves

Small, self-contained, no real urgency. Pull from when there's an afternoon to spare.

| # | Item | Size | Why |
|---|---|---|---|
| 6.1 | **Per-file view & download counts.** | S | Cheap to add, surfaces what's actually being watched |
| 6.2 | **Subtitle/caption upload** (`.vtt`/`.srt` sidecar). Detect by filename match, attach as a track on the video player. | M | Once you have it you wonder why it took so long |
| 6.3 | **Custom thumbnail upload** — override the auto-generated frame grab when ffmpeg picks a black/loading frame. | S | Rare but always painful when it happens |
| 6.4 | **Audio waveform thumbnail** for audio uploads. | S | Audio currently gets a generic icon; waveform looks much better |
| 6.5 | **Multi-image / album view** for an upload batch — a batch of screenshots renders as one tile that opens to a lightbox carousel. | M | Natural extension of the batch-aware home feed |
| 6.6 | **Client-side upload pause/resume UI.** tusd supports it; the upload page doesn't expose it. | S | Polish for flaky connections |
| 6.7 | **Chunked transcoding resume.** Strictly nicer; no actual user pain today. | M | Skip until storage or transcode failures become a real problem |

---

## Recommended ordering

1. **Theme 2 — Navigation polish.** One or two PRs; very high ratio of value-to-effort; fixes a known pain point.
2. **Theme 1 — Desktop watcher.** The big bet. Changes the product the most. Tackle after polish quick-wins clear the deck.
3. **Theme 5 — Operator confidence.** Bake the foundations before file count or user count grows further. 5.1 (restore drill) and 5.2 (orphan detection) should land before things scale.
4. **Theme 3 — Discovery & feed quality.** Most useful once the watcher app is producing more uploads.
5. **Theme 4 — Mobile/PWA polish.** Important for the "watch on phone" use case, not blocking.
6. **Theme 6 — Quiet wins.** Pull from opportunistically.

This order favors: (a) clearing the user-visible pain first, (b) shipping the largest new capability second, (c) hardening the foundation before piling more on top, (d) leaving open-ended polish for last.
