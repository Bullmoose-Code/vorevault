# VoreVault — Master Context Document

> This document is the single source of truth for the VoreVault project. It contains all finalized decisions, architecture, data model, implementation notes, and build guidance. An AI agent assisting with this project should read this document in full before taking any action.

---

## Table of Contents

1. [Project Summary](#1-project-summary)
2. [Current Build Status](#2-current-build-status)
3. [Design Principles](#3-design-principles)
4. [All Architecture Decisions — Finalized](#4-all-architecture-decisions--finalized)
5. [Project Structure](#5-project-structure)
6. [Database Schema](#6-database-schema)
7. [API Design](#7-api-design)
8. [Upload Pipeline](#8-upload-pipeline)
9. [Transcoding Pipeline](#9-transcoding-pipeline)
10. [Sharing Model](#10-sharing-model)
11. [Authentication & Sessions](#11-authentication--sessions)
12. [Frontend — Design & Conventions](#12-frontend--design--conventions)
13. [CI/CD](#13-cicd)
14. [Deployment](#14-deployment)
15. [Future Milestones](#15-future-milestones)
16. [CLAUDE.md Contents](#16-claudemd-contents)
17. [Key Reference Links](#17-key-reference-links)

---

## 1. Project Summary

**What it is:** A self-hosted, Discord-gated file and clip sharing web app. The Discord server is the source of identity — there are no passwords and no separate account system. A member of the target Discord guild (with a configured role) signs in with Discord, lands on a grid of every file anyone in the group has uploaded, and can upload, watch, share, or download. Video uploads are transcoded in-browser-friendly formats automatically; image uploads get thumbnails; arbitrary files get a download link. Files can optionally be exposed via an unlisted public share link.

**Closest analog:** A single-tenant Google Drive for a small, closed friend group — but built around Discord identity, in-browser playback, and "everyone sees everything" as the default rather than per-file permissions.

**Target users:** One instance per friend group. The project was built for the Bullmoose group; it's open-source so others can self-host their own instance for their own Discord community.

**Why it exists:** Generic file hosts (Dropbox, Drive) don't understand Discord identity, and Discord itself has an 8/25/50 MB upload cap depending on boost level. Existing clip platforms (Medal, Outplayed) are public-facing and ad-supported. VoreVault is the private, self-hosted middle ground: a shared pool that lives on one machine you control, with the identity layer delegated to Discord so there's zero user-management burden.

**Primary developer:** self-hosted for a private friend group. Open to contributions that fit the design principles (Section 3).

---

## 2. Current Build Status

| Plan | Status | Shipped |
|---|---|---|
| Plan 1 — Infrastructure foundation (Docker stack, Postgres, Caddy, Cloudflare tunnel) | ✅ | 2026-04-15 |
| Plan 2 — Discord OAuth auth, sessions, middleware, user table | ✅ | 2026-04-15 |
| Plan 3 — Resumable uploads via tusd, post-finish hook, thumbnails, MIME detection | ✅ | 2026-04-15 |
| Plan 4 — File grid, file detail, video playback, stream/thumbnail endpoints | ✅ | 2026-04-15 |
| Plan 5 — Share links (opt-in per file, public/token-based) | ✅ | 2026-04-15 |
| Plan 6 — Background video transcoding (ffmpeg) | ✅ | 2026-04-16 |
| Plan 7 — Admin panel, soft-delete + cleanup, backups, uptime monitoring | ✅ | 2026-04-16 |
| Mobile / PWA | ✅ | 2026-04-17 |
| CI/CD — GitHub Actions → GHCR → Watchtower auto-deploy | ✅ | 2026-04-17 |
| **v1.0.0 — production-ready, live** | ✅ | **2026-04-16** |

**In design:**
- Folders + per-user bookmarks (replaces "folders/tags/FTS" on the original YAGNI list; tags explicitly rejected). Brainstorm in progress as of 2026-04-18.

---

## 3. Design Principles

The full principle list lives in [`DESIGN.md`](./DESIGN.md). It is the north star — changes require explicit discussion. Summary:

1. **Shared pool.** Everyone in the group sees everything. No per-file ACLs.
2. **Discord is the identity system.** We do not manage passwords. Auth = Discord OAuth + role check.
3. **Simple over clever.** Local filesystem > S3. Postgres > microservices. One container > Kubernetes.
4. **Polished playback matters.** In-browser video playback must feel good; download-only is a failure mode, not a default.
5. **Unlisted public links are opt-in per file.** Default private.
6. **Revocable.** Sessions and share links are both server-side rows that can be killed instantly.

**Non-goals (permanent YAGNI — reject PRs that add these without discussion):** per-user quotas, virus scanning, 2FA, native mobile app (the PWA covers it), object storage. Folders and bookmarks are planned; tags and FTS are off the table.

**Decision rules when in doubt:**
- **Scope:** say no. YAGNI wins.
- **Auth:** deny.
- **Unknown file type:** serve `application/octet-stream` with `Content-Disposition: attachment`.
- **Hard-to-write test:** the code is wrong, not the test.
- **File > ~400 lines:** split it.

---

## 4. All Architecture Decisions — Finalized

Every decision below is final. Do not propose alternatives unless explicitly asked.

| Concern | Decision | Rationale |
|---|---|---|
| Runtime | Node.js 22 + TypeScript strict | Single language end-to-end. `strict: true` on everything — no `any`, no `@ts-ignore` without a written reason. |
| App framework | Next.js 15 (App Router) | SSR + API routes in one process. App Router is the current-generation Next.js — no Pages Router legacy. |
| Database | PostgreSQL 16 | Relational fit for users/sessions/files/share_links. One container, no ORM tax. |
| DB client | `pg` (node-postgres) via a lazy `Pool` proxy | No ORM. Proxy defers actual connection until first query so `next build` works without `DATABASE_URL`. |
| Validation | `zod` | At every trust boundary: env parsing, API inputs, webhook payloads. |
| Upload protocol | [tus](https://tus.io) via [tusd](https://github.com/tus/tusd) | Resumable uploads survive flaky mobile connections. Separate container — the app never directly receives multipart bodies. |
| File storage | Local filesystem on a bind-mounted data volume | Per principle #3. Path layout: `uploads/<file-uuid>/<original-name>`, `thumbs/<file-uuid>.jpg`, `transcoded/<file-uuid>.mp4`, `tusd-tmp/` (cleared on post-finish). |
| Transcoding | In-app background worker running `fluent-ffmpeg` | Started from `instrumentation.ts` on boot. Polls every 30s. `ffprobe` skips files that are already h264 + aac in mp4. |
| Thumbnails | `sharp` (images), `ffmpeg` frame-grab (videos) | Generated in the post-finish hook so the file detail page has a poster immediately. |
| MIME detection | `file --mime-type` (via a child process) | Authoritative on upload finish. Client-supplied `Content-Type` is never trusted. SVG and HTML are never served inline — always `Content-Disposition: attachment`. |
| Reverse proxy | Caddy 2 | Auto TLS if exposed directly; we terminate TLS at a Cloudflare Tunnel instead, so Caddy runs HTTP-only on the internal network and handles routing between `app` and `tusd`. |
| Container orchestration | Docker Compose | Per principle #3 — no Kubernetes. Single `compose.yaml` + an `.env` is the full deploy story. |
| Auth | Discord OAuth 2.0 + guild-role check | At callback we call `GET /users/@me/guilds/<guild>/member` and require the configured role. No successful OAuth means no session. |
| Sessions | Server-side rows, sliding 30-day TTL, `HttpOnly`/`Secure`/`SameSite=Lax` cookie | The cookie is just a session UUID. Every lookup is a DB query that also pushes `expires_at` forward. Revocation = `DELETE FROM sessions`. |
| Background workers | Next.js `instrumentation.ts` | Spawns the transcode worker and the cleanup worker on `nodejs_server_startup` — same process as the app, so no extra container. |
| Public access | Cloudflare Tunnel (`cloudflared`) | TLS terminates at the Cloudflare edge. No inbound ports open on the host. |
| Auto-update | [Watchtower](https://github.com/nicholas-fedor/watchtower) with HTTP API enabled | CI pushes a new image to GHCR → a GitHub Action hits Watchtower's `/v1/update` with a bearer token → Watchtower pulls and recreates just the `app` service (label-opt-in). |
| Image registry | GitHub Container Registry (`ghcr.io`) | Free for public packages, integrated with GitHub Actions. |
| Testing | Vitest + `testcontainers` (Postgres) | **No database mocks in integration tests.** Every SQL query runs against a real ephemeral Postgres. |
| Styling | Tailwind-free — plain CSS Modules with a tokens file | A deliberate choice after the Plan 2 "styling TBD" gate: the brutalist parchment aesthetic is small enough to not need a utility framework, and CSS Modules give per-component scope without bundler tricks. |
| Aesthetic | Brutalist parchment, cream background + dense ink type | Committed to — the project's identity, not a swappable theme. See [`frontend-design`](https://github.com/anthropics/skills-frontend-design) skill guidance used during Plan 4. |

---

## 5. Project Structure

```
vorevault/
├── app/                                     # Next.js 15 app (App Router)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx                   # Root layout — fonts, metadata, SW registration
│   │   │   ├── page.tsx                     # / — file grid (home)
│   │   │   ├── icon.svg                     # File-based favicon (Next.js convention)
│   │   │   ├── login/page.tsx               # /login — Discord sign-in
│   │   │   ├── upload/page.tsx              # /upload — drag-and-drop zone
│   │   │   ├── f/[id]/page.tsx              # /f/<uuid> — file detail + playback
│   │   │   ├── p/[token]/page.tsx           # /p/<token> — unauthenticated share link
│   │   │   ├── admin/page.tsx               # /admin — moderation panel
│   │   │   └── api/
│   │   │       ├── health/route.ts          # Liveness probe
│   │   │       ├── auth/discord/route.ts    # Start OAuth
│   │   │       ├── auth/discord/callback/route.ts  # OAuth callback
│   │   │       ├── auth/logout/route.ts
│   │   │       ├── hooks/tus/route.ts       # tusd pre-create + post-finish webhook
│   │   │       ├── files/[id]/route.ts      # GET metadata
│   │   │       ├── files/[id]/delete/route.ts
│   │   │       ├── files/[id]/share/route.ts
│   │   │       ├── stream/[id]/route.ts     # Range-request video streaming
│   │   │       ├── thumbs/[id]/route.ts     # Thumbnail bytes
│   │   │       ├── public/[token]/route.ts  # Public-share file bytes
│   │   │       └── admin/{ban,hard-delete}/route.ts
│   │   ├── components/                      # Shared UI (TopBar, UserChip, DropZone, …)
│   │   ├── lib/                             # db, env, auth, sessions, users, discord,
│   │   │                                    # files, storage, thumbnails, transcode,
│   │   │                                    # share-links, upload-sessions, cleanup, admin
│   │   └── middleware.ts                    # Gates everything except /login, /api/auth/*,
│   │                                        # /api/health, /p/*, /api/public/*
│   ├── tests/                               # Cross-cutting integration tests (auth-flow, pg helpers)
│   ├── public/
│   │   ├── manifest.webmanifest             # PWA manifest
│   │   ├── sw.js                            # No-op service worker (install-only for iOS PWA)
│   │   └── icons/                           # PWA icons (180, 192, 512, maskable)
│   ├── Dockerfile                           # Multi-stage (deps → builder → runner, standalone)
│   ├── next.config.ts
│   └── package.json
│
├── db/
│   └── init/                                # Runs once on first Postgres startup
│       ├── 00-schema.sql
│       ├── 01-auth.sql                      # users, sessions
│       ├── 02-files.sql                     # files, upload_sessions
│       └── 03-share-links.sql
│
├── .github/workflows/ci-cd.yml              # Vitest + next build → GHCR push → Watchtower trigger
├── compose.yaml                             # app, postgres, tusd, caddy, watchtower
├── Caddyfile                                # /files/* → tusd, everything else → app
├── .env.example
├── DESIGN.md                                # North star — principles, YAGNI list, decision rules
├── CLAUDE.md                                # Agent working instructions
├── README.md
└── VOREVAULT_MASTER_CONTEXT.md              # This file
```

**File size rule:** any file past ~400 lines or with more than one responsibility gets split. This is enforced during review.

**Test layout:** tests colocate with source (`foo.ts` + `foo.test.ts`), except cross-cutting flows in `app/tests/`.

---

## 6. Database Schema

SQL lives in [`db/init/`](./db/init/) and runs once on first Postgres startup. The schema is hand-written SQL (no ORM migrations) — changes ship via new numbered files.

### `users`

```sql
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id    text UNIQUE NOT NULL,
  username      text NOT NULL,
  avatar_url    text,
  is_admin      boolean NOT NULL DEFAULT false,
  is_banned     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
```

`is_banned = true` means `getSessionUser()` returns null even with a valid cookie — an effective instant logout without touching the session table.

### `sessions`

```sql
CREATE TABLE sessions (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  user_agent  text
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
```

Sliding window: every successful `getSessionUser()` call pushes `expires_at` forward by `SESSION_TTL_SEC` (30 days) via a `WITH upd AS (UPDATE ... RETURNING)` CTE. Active users never log out; dormant sessions die after 30 days of no use.

### `files`

```sql
CREATE TABLE files (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  original_name     text NOT NULL,
  mime_type         text NOT NULL,
  size_bytes        bigint NOT NULL,
  storage_path      text NOT NULL,           -- uploads/<id>/<original-name>
  transcoded_path   text,                    -- transcoded/<id>.mp4 (or null)
  thumbnail_path    text,                    -- thumbs/<id>.jpg (or null)
  transcode_status  text NOT NULL DEFAULT 'pending',
                                             -- pending | running | done | skipped | failed
  duration_sec      int,
  width             int,
  height            int,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz              -- soft delete; hard-deleted by cleanup after 7d
);
CREATE INDEX files_created_at_idx ON files (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX files_uploader_idx  ON files (uploader_id);
```

**On-disk filenames are UUIDs, never the original name.** Original name is preserved only inside the file's UUID directory and is used for `Content-Disposition`.

### `upload_sessions`

```sql
CREATE TABLE upload_sessions (
  tus_id      text PRIMARY KEY,              -- tusd-assigned upload ID
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  file_id     uuid REFERENCES files(id) ON DELETE SET NULL
);
```

Joins a tus upload ID to the user that started it and, once complete, to the canonical `files` row. Orphans (`file_id IS NULL` after 1 day) are swept by the cleanup worker.

### `share_links`

```sql
CREATE TABLE share_links (
  token       text PRIMARY KEY,              -- URL-safe random
  file_id     uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,                   -- null = no expiry
  revoked_at  timestamptz                    -- null = active
);
CREATE INDEX share_links_file_id_idx ON share_links (file_id);
```

Per principle #6: a share link is a row, so revocation is a single `UPDATE` and takes effect instantly.

---

## 7. API Design

All routes live under `app/src/app/api/`. Every authenticated route is gated at the edge by `src/middleware.ts` (cookie-presence check) and at the handler by `getCurrentUser()` (cookie-value check — hits the DB). Anything that takes input is validated with a `zod` schema.

### Public (no auth)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness probe. Returns `{ ok: true }` plus a DB ping. |
| `GET` | `/api/auth/discord` | Redirect to Discord's OAuth authorize URL. |
| `GET` | `/api/auth/discord/callback` | Exchange code → guild/role check → upsert user → create session → set cookie → redirect to `/`. |
| `GET` | `/p/[token]` | Unauthenticated share page (HTML). |
| `GET` | `/api/public/[token]` | Unauthenticated file bytes for a share token. |

### Authenticated (session cookie required)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/logout` | Delete session, clear cookie, redirect to `/login`. |
| `POST` | `/api/hooks/tus` | Webhook from tusd (pre-create for authz, post-finish for finalization). |
| `GET` | `/api/files/[id]` | Metadata for one file. |
| `POST` | `/api/files/[id]/delete` | Soft delete (uploader or admin only). |
| `POST` | `/api/files/[id]/share` | Create or revoke a share link. |
| `GET` | `/api/stream/[id]` | Range-request video streaming — serves the transcoded file if present, else the original. |
| `GET` | `/api/thumbs/[id]` | Thumbnail bytes. |
| `POST` | `/api/admin/ban` | Admin-only: flip `is_banned`. |
| `POST` | `/api/admin/hard-delete` | Admin-only: bypass 7-day soft-delete window. |

### Error shape

All routes return JSON on error:

```json
{ "error": "short machine code", "message": "human text (optional)" }
```

Status codes: `400` for validation, `401` unauthenticated, `403` forbidden (e.g. not admin, not uploader), `404` not found, `5xx` for server errors.

---

## 8. Upload Pipeline

Uploads never hit the Next.js app directly. The client uploads to `tusd` via `tus-js-client`, and `tusd` calls back into the app twice.

```
Client ──PATCH /files/<id>──▶ tusd ──webhook──▶ app
                               │                  │
                               │◀─  200 OK  ──────┤
                               ▼                  │
                         /data/tusd-tmp/          │
                                                  │
                         upload complete          │
                               │                  │
                               └──webhook──▶ app ─┴──▶ finalize (move + parse + thumbnail + enqueue transcode)
```

### `pre-create` hook

- **Input:** forwarded `Cookie` header (the `-hooks-http-forward-headers=cookie` tusd flag).
- **Action:** resolve session → verify user is not banned → insert a row into `upload_sessions` keyed by tusd's proposed upload ID.
- **Output:** 200 to accept, non-200 to reject (tusd refuses the upload).

### `post-finish` hook

Runs after the full file is on disk at `/data/tusd-tmp/<tus-id>`:

1. **Look up the upload session** by `tus_id` → get the uploading user.
2. **Compute SHA-256** of the file (streamed; never buffered whole into memory).
3. **Detect real MIME** via `file --mime-type` on the actual bytes. Client `Content-Type` is discarded.
4. **Reject dangerous types** — `text/html` and `image/svg+xml` are never accepted. Unknown types are accepted but served with `application/octet-stream` + `attachment` disposition.
5. **Generate a new file UUID**, move the bytes to `uploads/<uuid>/<original-name>`.
6. **Generate a thumbnail** — `sharp` for images, `ffmpeg` single-frame for videos, skip otherwise.
7. **Insert the `files` row** and link it back to the `upload_sessions` row (`file_id = …`).
8. **Enqueue transcoding** for video MIME types — just sets `transcode_status = 'pending'`; the background worker picks it up.
9. Non-video files get `transcode_status = 'skipped'` immediately.

If any step fails after step 5, the on-disk move is rolled back so there are no orphan files. If it fails before step 5, the tusd temp file is left for tusd's own cleanup.

---

## 9. Transcoding Pipeline

A background worker lives in the same process as the app, spawned from `app/src/instrumentation.ts` on `nodejs_server_startup`. It exists to keep browser playback smooth — a file uploaded as `video/x-matroska` (MKV) is unplayable in Safari, so it gets re-muxed into MP4 with h264 video + AAC audio.

```
every 30s:
  SELECT id, mime_type, storage_path FROM files
    WHERE transcode_status = 'pending'
      AND mime_type LIKE 'video/%'
    ORDER BY created_at ASC
    LIMIT 1 FOR UPDATE SKIP LOCKED;

  if none: return

  ffprobe(storage_path):
    if already h264 + aac in mp4 → transcode_status = 'skipped', transcoded_path = null
    else → transcode_status = 'running'
           ffmpeg -i <original> -c:v libx264 -c:a aac -movflags +faststart /data/transcoded/<uuid>.mp4
           on success → transcode_status = 'done', transcoded_path = …, width/height/duration filled in
           on failure → transcode_status = 'failed'  (original still downloadable)
```

`FOR UPDATE SKIP LOCKED` means if multiple instances ever ran (they don't today), each would grab a different pending file instead of contending.

The stream endpoint (`/api/stream/[id]`) serves `transcoded_path` when present, otherwise `storage_path`. The client never sees which it is.

---

## 10. Sharing Model

Two access modes for a file:

1. **In-group (default).** Every signed-in group member sees every non-deleted file on the grid. This is principle #1. There are no per-file view permissions.
2. **Unlisted public link (opt-in per file).** The uploader (or an admin) can mint a `share_links` row for a file. Anyone with the token URL can view/download without signing in. Links can be revoked (`revoked_at`) instantly; the URL 404s the next request.

Public share pages (`/p/[token]`) render a minimal detail view — no grid, no admin, no UI for navigating to other files. Public file bytes come from `/api/public/[token]`, which does its own token lookup (no session required).

### Why share links are not ACLs

Even with share links, there are no per-user permissions on files. A share link is not "Alice can see this file." It's "anyone who has this URL can see this file." That preserves principle #1 (no ACLs) while still giving the opt-in escape hatch in principle #5.

---

## 11. Authentication & Sessions

### OAuth flow

```
/login   ──GET──▶  /api/auth/discord
                      │
                      └──302──▶  https://discord.com/oauth2/authorize
                                   │  scope=identify guilds.members.read
                                   │  prompt=none
                                   ▼
                                 user approves
                                   │
                        302 back to /api/auth/discord/callback?code=…&state=…
                                   │
  validate state (cookie-bound) ─── reject on mismatch → 400
                                   │
  POST /oauth2/token  (exchange code)  — retry on network error; no retry on 5xx
                                   │
  GET /users/@me/guilds/<guild>/member  — with bearer token
      404   → user not in guild       → 403
      no role → missing required role → 403
                                   │
  upsert users row (by discord_id)
  create sessions row (30d TTL)
  Set-Cookie vv_session=<uuid>; HttpOnly; Secure; SameSite=Lax; Max-Age=…
  302 → /
```

### Middleware (edge)

`app/src/middleware.ts` runs on every request and short-circuits to `/login` when the `vv_session` cookie is absent, unless the path is on the allowlist (`/login`, `/api/auth/*`, `/api/health`, `/p/*`, `/api/public/*`, static assets). The middleware only checks for cookie *presence* — validation happens in the route handler.

### Session lookup

Every authenticated request calls `getSessionUser(sessionId)` (in `lib/sessions.ts`), which runs a single query that does three things in one round trip: (1) checks the session exists and hasn't expired, (2) extends `expires_at` forward by 30 days (sliding window), (3) joins to `users` and filters out banned users.

```sql
WITH upd AS (
  UPDATE sessions SET expires_at = $2
   WHERE id = $1 AND expires_at > now()
   RETURNING user_id
)
SELECT u.* FROM upd
JOIN users u ON u.id = upd.user_id
WHERE u.is_banned = false
```

Banned users: cookie is still valid, but this query returns 0 rows, so `getSessionUser` returns `null` and the caller treats them as unauthenticated.

### Revocation

- **One user, all devices:** `DELETE FROM sessions WHERE user_id = ?`
- **Surgical (one device):** `DELETE FROM sessions WHERE id = ?`
- **Soft ban (keeps the row for audit):** `UPDATE users SET is_banned = true`
- **Remove guild role:** takes effect on their next session lookup — no, actually, the guild-role check happens at OAuth callback only. To force a role recheck you must also delete the session. Document this if you ever expose "kick user" in the admin panel.

---

## 12. Frontend — Design & Conventions

### Aesthetic

Brutalist parchment: cream (`#f4ead5`) background, dense serif display type (Fraunces italic) against Inter body copy, JetBrains Mono for accents. Black ink, zero rounded corners by default, heavy borders, no drop shadows. The one visible ornament is a hand-drawn moose silhouette used as the app icon and the empty-grid placeholder. This is intentional — it's the project's personality, not a swappable theme.

**Do not propose a design system change** (Tailwind, Material, shadcn/ui, Radix Themes, …) without explicit approval.

### Pages

| Route | Purpose |
|---|---|
| `/` | File grid. Reverse-chronological. Infinite scroll. Each card shows thumbnail, filename, uploader, relative time. Clicking opens `/f/[id]`. |
| `/login` | Single "Sign in with Discord" button. Shown when middleware redirects an unauthenticated user. |
| `/upload` | Drag-and-drop zone wired to tusd via `tus-js-client`. Multiple files in parallel. Copy changes on touch devices ("Drop files here" → "Tap to choose files"). |
| `/f/[id]` | File detail. Playback for video (via `<video>` and `/api/stream/[id]`), poster for image, download for everything else. Metadata panel (uploader, size, dimensions, duration). Action bar (share, delete). |
| `/p/[token]` | Public unlisted share page. Minimal — no grid navigation, no admin. Serves public bytes. |
| `/admin` | Admin-only. User list with ban toggle, file list with hard-delete. Linked from the user dropdown in the top bar (for admins only). |

### Components (in `app/src/components/`)

- `TopBar` — app-wide header. On mobile, the Admin link collapses into the user chip dropdown.
- `UserChip` — avatar + username, dropdown menu. Opens/closes with click, closes on `focusout` when focus leaves the menu (including when `relatedTarget` is null, which handles mobile dismissal).
- `DropZone` — upload surface. Hover-capable and touch-capable copy swapped via `@media (hover: none) and (pointer: coarse)`.
- File-detail subcomponents — `FileActions`, `MetaPanel`, `Playback`.

### PWA

- `public/manifest.webmanifest` — `display: standalone`, `orientation: portrait-primary`, `theme_color: #f4ead5`.
- `public/sw.js` — intentional no-op service worker. It exists only so iOS treats the site as installable; it registers itself (`clients.claim`) and passes through all fetches. **Do not add caching to this without a full plan** — the app's freshness model assumes no SW cache.
- `public/icons/` — 180px (apple-touch-icon), 192/512 (standard), maskable 512.
- `app/src/app/layout.tsx` explicitly declares all icon entries in `metadata.icons` — including the SVG and PNGs for desktop — so that Next.js's file-based icon auto-detection isn't overridden by a partial `icons` object.

### Mobile rules

Touch tap targets are at least 44 × 44 px. Safe-area insets (`env(safe-area-inset-*)`) are applied at `body` level. Body/html `min-height: 100dvh` so the grid fills the screen on mobile Safari.

---

## 13. CI/CD

### Workflow

[`.github/workflows/ci-cd.yml`](./.github/workflows/ci-cd.yml) — two jobs:

**`ci`** (runs on every PR and every push to `main`):
1. Checkout
2. Node 22 (with npm cache keyed on `app/package-lock.json`)
3. `apt-get install -y ffmpeg` (needed by the transcoding tests)
4. `npm ci` in `app/`
5. `npm run test` — Vitest + testcontainers (real Postgres, not mocks)
6. `npm run build` — `next build`

**`deploy`** (runs only on push to `main`, `needs: ci`):
1. Log in to GHCR using a write-scoped PAT (`GHCR_PAT` secret)
2. `docker buildx build --push` → `ghcr.io/<org>/vorevault:latest`
3. `curl -X POST` the Watchtower update endpoint with a bearer token (`WATCHTOWER_TOKEN_VAULT` secret) — the curl has `--retry 5 --retry-all-errors` to tolerate transient tunnel reconnects.

`paths-ignore` covers `**.md` and `docs/**`, so docs-only changes don't trigger a build.

### Auto-merge

The repo is configured so that when a PR is opened with `gh pr merge --auto --squash` and `ci` passes, GitHub auto-merges with no human interaction. Branch protection on `main` requires the `ci` status check, so nothing red can ever reach `main`.

### Rollback

Roll back to a specific image digest by pinning `compose.yaml`:

```yaml
services:
  app:
    image: ghcr.io/<org>/vorevault@sha256:<digest>
    labels:
      - com.centurylinklabs.watchtower.enable=false   # freeze on this digest
```

`docker compose up -d` and the app is pinned. Un-freeze by reverting to `:latest` + re-adding the Watchtower label.

---

## 14. Deployment

VoreVault is designed to run on any Docker host. The reference deployment runs on a small Linux container behind Cloudflare Tunnel, but none of that is required — any host that can run Docker Compose and expose HTTP works.

### Environment variables

See [`.env.example`](./.env.example) for the canonical list with descriptions. Required:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — for the Postgres container.
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` — from your Discord application. Register one at https://discord.com/developers.
- `DISCORD_GUILD_ID` — the numeric ID of the Discord server whose members can sign in.
- `DISCORD_REQUIRED_ROLE_ID` — the numeric ID of the role required for access. Members without this role are refused at OAuth callback.
- `DISCORD_REDIRECT_URI` — `https://your-domain/api/auth/discord/callback`. Must match a redirect URI registered on your Discord application.
- `SESSION_SECRET` — 32 random bytes, base64. `openssl rand -base64 32`. Used for OAuth state cookies.
- `APP_PUBLIC_URL` — canonical base URL (e.g. `https://vault.example.com`). Used to build share links.
- `WATCHTOWER_TOKEN_VAULT` — random hex, also set in your repo's GitHub Actions secrets. `openssl rand -hex 32`.

### Data layout

Mount a host directory at `/data` in the `app`, `tusd`, and (optionally) any transcoder container:

```
/data/
├── uploads/      0775  canonical files — uploads/<file-uuid>/<original-name>
├── thumbs/       0775  thumbnails — thumbs/<file-uuid>.jpg
├── transcoded/   0775  transcoded outputs — transcoded/<file-uuid>.mp4
├── tusd-tmp/     0775  tusd working dir; cleared on post-finish
└── backups/      (optional) pg_dump targets if you cron a nightly backup script
```

If you run in an unprivileged container, make sure host-side UID/GID match the container UIDs (e.g. `100000:100000` for a Proxmox LXC).

### Docker Compose

[`compose.yaml`](./compose.yaml) brings up five services:

| Service | Image | Purpose |
|---|---|---|
| `app` | `ghcr.io/<org>/vorevault:latest` | Next.js + API. Watchtower label-opted in. |
| `postgres` | `postgres:16-alpine` | Primary DB. |
| `tusd` | `tusproject/tusd:v2` | Resumable upload endpoint. |
| `caddy` | `caddy:2-alpine` | Reverse proxy (HTTP-only; TLS terminates upstream). |
| `watchtower` | `ghcr.io/nicholas-fedor/watchtower` | HTTP-API triggered auto-update for the `app` service. |

DNS inside the compose network uses Docker's embedded resolver. If your Docker bridge has unreliable upstream DNS (seen occasionally on Cloudflare-tunneled LXC setups), override with `dns: [8.8.8.8, 8.8.4.4]` on the `app` service — that eliminates `EAI_AGAIN` errors during OAuth callback.

### TLS

The reference setup terminates TLS at Cloudflare via a tunnel, so Caddy runs HTTP-only and the host never opens port 443. If you'd rather expose directly, change Caddy to listen on `:443` with `auto_https` — Let's Encrypt issuance is one-line in a Caddyfile.

### Operator runbook

Host-specific operational detail (exact IPs, container IDs, bind-mount paths, shell commands for starting/stopping, backup cron, recovery procedures, known issues) belongs in an operator-local runbook, **not** this document. The `.ops-private/` directory in this repo is gitignored for that purpose — keep your site's runbook there, or in a separate private repository.

---

## 15. Future Milestones

Documented here so today's architecture stays compatible.

### Folders + per-user bookmarks (design in progress, 2026-04-18)

Two orthogonal features:

- **Folders** — shared organizational hierarchy on shared files. Example target layout: a `Clips` folder with game-specific subfolders (`Apex`, `Valorant`, …) and a `Golf` folder with outing-specific subfolders. Files live in one folder at a time; a file's folder can be changed by its uploader or an admin. This does not affect who can see the file — principle #1 still holds.
- **Bookmarks** — per-user saved-list of files, independent of folder structure. A private "my saved clips" view without introducing per-file ACLs.

**Explicitly rejected:** tags (deliberate — folders + bookmarks cover the "find it again" use cases without the tagging UX debt), full-text search (may revisit if file count grows past the point where folders are enough).

Design spec will land in `docs/superpowers/specs/` before any code ships.

### Nice-to-have, no active plan

- **Partial video transcoding resumption** — today a failed transcode just leaves the file as-is; a worker restart re-picks it up but starts from scratch. Chunked transcoding would be strictly nicer but isn't a real user pain.
- **Client-side upload pause/resume UI** — tusd supports it; our upload page doesn't expose it beyond the built-in resilience of `tus-js-client`.
- **Per-file stats** (view count, download count) — genuinely easy, just no one has asked.

### Explicitly off the roadmap

Per [`DESIGN.md`](./DESIGN.md): per-user quotas, virus scanning, 2FA, native mobile app (the PWA is the answer), object storage. Don't pitch these without proposing a DESIGN.md change first.

---

## 16. CLAUDE.md Contents

The working instructions for AI agents operating on this repo live in [`CLAUDE.md`](./CLAUDE.md) at the repo root. It's intentionally terse — principles and conventions only, no operational detail. If you're an agent: read `CLAUDE.md` + `DESIGN.md` before any architecturally meaningful change; read this file when you need to understand *why* a system is shaped the way it is.

---

## 17. Key Reference Links

| Resource | URL |
|---|---|
| Next.js 15 App Router docs | https://nextjs.org/docs/app |
| tusd (resumable uploads) | https://github.com/tus/tusd |
| tus-js-client | https://github.com/tus/tus-js-client |
| `pg` (node-postgres) | https://node-postgres.com |
| Vitest | https://vitest.dev |
| testcontainers (Node) | https://node.testcontainers.org |
| Caddy 2 | https://caddyserver.com/docs |
| Watchtower (HTTP API) | https://github.com/nicholas-fedor/watchtower |
| Cloudflare Tunnel | https://developers.cloudflare.com/cloudflare-one/connections/connect-networks |
| Discord OAuth2 docs | https://discord.com/developers/docs/topics/oauth2 |
| Discord Guild Member object | https://discord.com/developers/docs/resources/guild#guild-member-object |
| `sharp` (image processing) | https://sharp.pixelplumbing.com |
| `fluent-ffmpeg` | https://github.com/fluent-ffmpeg/node-fluent-ffmpeg |
| `file` utility (MIME detection) | https://man7.org/linux/man-pages/man1/file.1.html |

---

*Last updated: 2026-04-18. v1.0.0 in production. Next: folders + bookmarks.*
