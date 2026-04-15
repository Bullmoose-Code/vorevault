# VoreVault — Design Spec

**Date:** 2026-04-15
**Status:** Approved (brainstorm phase); pending implementation plan
**Domain:** `vault.bullmoosefn.com`
**Host:** Proxmox node `pve` (192.168.2.2) — new LXC 105
**Repo org:** `Bullmoose-Code` (GitHub)

---

## 1. Purpose & Scope

VoreVault is a self-hosted, Discord-gated file- and clip-sharing app for the Bullmoose friend group (~10–20 people, ~1–2 TB storage target). It lets group members upload files (especially video clips and screenshots), watch/view them in-browser with polished playback, and optionally generate public share links to paste outside the group.

### Core requirements
- Shared-pool sharing: any logged-in user can see everything uploaded by the group
- Auth: Discord OAuth2; user must have a designated role in the Bullmoose Discord guild
- Public share links: default private; owner can toggle to generate an unlisted public URL
- Polished in-browser playback for video clips (native `<video>` + transcoding fallback via Tdarr)
- Large-file support with resumable uploads (tus protocol)
- Nice, distinctive frontend — not a generic-AI-looking site

### Non-goals (YAGNI — deliberately deferred)
- Per-user quotas (trusted group)
- Folder hierarchy / tags / full-text search (iterate later based on usage)
- Virus scanning / ClamAV
- 2FA (Discord handles it)
- Upload notifications to Discord (can add later)
- Mobile app (PWA is enough)
- S3/MinIO object storage (local FS is simpler and sufficient)

---

## 2. Architecture

```
Internet
   │
   ▼
Cloudflared tunnel (LXC 250) ──►  vault.bullmoosefn.com
                                        │
                                        ▼
                            ┌──────────────────────────┐
                            │  LXC 105 (new)           │
                            │  Docker Compose stack:   │
                            │   - app (Next.js)        │  UI + API routes
                            │   - postgres 16          │  users, files, shares, sessions
                            │   - tusd                 │  resumable uploads
                            │   - caddy                │  internal reverse proxy
                            │                          │
                            │  /data/uploads/          │  raw uploaded files
                            │  /data/transcoded/       │  web-friendly versions
                            │  /data/thumbs/           │  thumbnails
                            └──────────┬───────────────┘
                                       │ (bind-mount of host dataset)
                                       ▼
                            ┌──────────────────────────┐
                            │  LXC 104 (Tdarr)         │
                            │  watches /data/uploads/  │
                            │  writes /data/transcoded │
                            └──────────────────────────┘
```

### Key architectural choices
- **One new LXC (105)** — Debian 12 unprivileged, 2 CPU / 4 GB RAM / 20 GB root. Isolation from VM 101 limits blast radius and makes resize/backup/migrate easier.
- **Local-FS storage** on a host ZFS dataset bind-mounted into LXC 105 *and* LXC 104, so Tdarr transcodes in place with no cross-LXC copies.
- **tusd** handles resumable uploads (required for multi-GB clips on flaky connections).
- **Postgres** (not SQLite) — sessions, files, shares, `LISTEN/NOTIFY` for transcode-complete signals.
- **Caddy inside the stack** terminates the internal HTTP for Cloudflared and adds baseline security headers; Cloudflared handles public TLS.
- **No Redis** — Postgres covers sessions + any queueing at this scale.
- **Sessions stored server-side** (Postgres rows), not JWTs — allows instant revocation.

---

## 3. Components

### Frontend (Next.js App Router)
- `/login` — Sign-in-with-Discord button
- `/` — clip grid, newest first, infinite scroll
- `/f/[id]` — single-file view: inline player/image, metadata, download, copy-link, delete (owner only), toggle public
- `/upload` — drag-and-drop upload zone wired to tusd
- `/p/[token]` — public share page (no auth required)
- `/admin` — minimal admin panel (list users, ban user, hard-delete file, disk usage)

### API routes (Next.js)
- `POST /api/auth/discord/callback` — OAuth callback; verifies guild role; creates session
- `POST /api/auth/logout`
- `GET  /api/files` — paginated list
- `GET  /api/files/:id`
- `DELETE /api/files/:id` — owner-only (admins too)
- `POST /api/files/:id/share` — generate/revoke public token
- `GET  /api/stream/:id` — authenticated byte-range streaming for `<video>`
- `GET  /api/public/:token` — public byte-range streaming for share links
- `POST /api/hooks/tus-pre`, `POST /api/hooks/tus-post` — tusd webhook endpoints
- `GET  /api/health` — DB ping + disk-free check (for Uptime Kuma)

### tusd (separate container)
- Listens internally on port 1080
- Pre-create hook → Next.js validates session + disk space; returns OK or rejection
- Post-finish hook → Next.js moves file to `/data/uploads/<uuid>/<original-name>`, inserts `files` row, triggers thumbnail + Tdarr pickup

### Tdarr integration (existing LXC 104)
- Watches `/data/uploads/` via bind mount
- Skips files that are already web-friendly (h264/aac in mp4)
- Transcodes others to h264 mp4 in `/data/transcoded/`
- Post-process hook runs `psql -c "NOTIFY file_transcoded, '<uuid>'"` (or writes `.done` file for polling fallback)

---

## 4. Data Model (Postgres)

```sql
users (
  id            uuid pk,
  discord_id    text unique not null,
  username      text not null,
  avatar_url    text,
  is_admin      boolean not null default false,
  is_banned     boolean not null default false,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
)

sessions (
  id          uuid pk,                 -- cookie value
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  user_agent  text
)

files (
  id                uuid pk,
  uploader_id       uuid not null references users(id),
  original_name     text not null,
  mime_type         text not null,
  size_bytes        bigint not null,
  storage_path      text not null,
  transcoded_path   text,
  thumbnail_path    text,
  transcode_status  text not null default 'pending',  -- pending|skipped|done|failed
  duration_sec      int,
  width             int,
  height            int,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
)

share_links (
  token       text pk,                 -- 22+ chars crypto.randomBytes, url-safe
  file_id     uuid not null references files(id) on delete cascade,
  created_by  uuid not null references users(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,             -- nullable = never
  revoked_at  timestamptz
)

upload_sessions (
  tus_id      text pk,
  user_id     uuid not null references users(id),
  created_at  timestamptz not null default now(),
  file_id     uuid references files(id)
)
```

---

## 5. Data Flows

### 5.1 Login
1. User clicks "Sign in with Discord"
2. Redirect → `discord.com/oauth2/authorize` with scopes `identify guilds.members.read` and CSRF `state`
3. Callback exchanges `code` for access token
4. Server calls `GET /users/@me/guilds/{BULLMOOSE_GUILD_ID}/member`
   - 404 → 403 "Must be in Bullmoose server"
   - missing required role → 403 "Need X role"
5. Upsert `users` row, create `sessions` row, set httpOnly Secure cookie
6. Redirect → `/`

### 5.2 Upload (resumable)
1. Client creates tus upload to `/files/` on tusd (cookie forwarded)
2. tusd pre-create → `/api/hooks/tus-pre` (validate session; reject if disk free < 10 GB or file > max size)
3. Resumable chunk upload
4. tusd post-finish → `/api/hooks/tus-post`
   - Move from tusd temp → `/data/uploads/<uuid>/<original-name>`
   - Run `file --mime-type` to detect real type (never trust client)
   - Insert `files` row with `transcode_status = 'pending'`
   - Generate thumbnail inline (ffmpeg)
5. Client redirects to `/f/<id>`

### 5.3 Transcode (async)
1. Tdarr picks up new file in `/data/uploads/`
2. Web-friendly already → mark skipped (transcoded_path = storage_path, status = skipped)
3. Otherwise transcode to `/data/transcoded/<uuid>.mp4`, status = done
4. On failure → status = failed; UI falls back to download-only
5. Tdarr post-process: `pg_notify('file_transcoded', '<uuid>')`; Next.js listener updates row

### 5.4 Stream (authenticated)
1. `<video src="/api/stream/<id>">` sends range request
2. Server verifies session → looks up file → picks `transcoded_path` if set else `storage_path`
3. Streams range with proper `Content-Range`, `206`, `Accept-Ranges: bytes`

### 5.5 Public share
1. Owner toggles public → 22+ char token inserted in `share_links`
2. `vault.bullmoosefn.com/p/<token>` renders public player (no auth)
3. `/api/public/<token>` streams with byte-range
4. Revoke → set `revoked_at` → subsequent requests 404

### 5.6 Delete
1. Owner clicks delete → `files.deleted_at = now()`; active `share_links` revoked
2. Nightly cron hard-deletes files where `deleted_at < now() - 7 days` (7-day undo window)

---

## 6. Error Handling

- **Upload**: tus auto-resumes on network drops. Orphan tusd temp files + dead `upload_sessions` cleaned nightly (24h threshold). Disk-full pre-check returns 507. Oversize rejected in pre-create.
- **Transcode**: failure sets status `failed`; UI shows download-only warning banner. Tdarr down → files stuck `pending`; alert if queue grows.
- **Auth**: Discord API outage → 503 with retry. Role removal after login is honored only on next session expiry (24h). Admin can revoke sessions instantly.
- **Stream**: missing file on disk with existing row → 410 Gone + surface in admin. Invalid range → 416.
- **DB down**: all API routes return 503; health endpoint reflects this.

---

## 7. Security

- **Secrets** in `.env` at `/opt/stacks/vorevault/`, never in git. `.env.example` in repo.
- **Cookies**: httpOnly, Secure, SameSite=Lax, 24h expiry.
- **CSRF**: OAuth `state` param; SameSite cookies; mutating routes validate `Origin`.
- **MIME sniffing**: server runs `file --mime-type`; stored type is detected, not claimed.
- **Filename safety**: on-disk names are UUIDs; original names kept only as display metadata.
- **Share tokens**: `crypto.randomBytes` 22+ chars (~128 bits entropy).
- **Rate limits** (in-app): 10 uploads/min/user, 30 logins/hour/IP, 100 stream requests/min/token.
- **Content-Disposition**: `attachment` by default; `inline` only for confident-safe image/video types. Unknown types served `application/octet-stream`. No HTML/SVG rendered from user uploads.
- **TLS** terminated at Cloudflared; internal traffic is LAN. Caddy adds HSTS, X-Content-Type-Options, Referrer-Policy.

---

## 8. Testing Strategy

- **Unit (Vitest)**: auth/role check, session lifecycle, share-token gen/revoke, file service, quota & rate limits.
- **Integration (Vitest + testcontainers Postgres)**: upload → DB → delete cycle, share-token lifecycle, byte-range streaming headers.
- **E2E (Playwright, small suite)**: mocked-Discord login → upload small file → appears on grid → plays; share link opens in fresh context.
- **Manual checklist** in repo, run before each deploy.
- **TDD default** via superpowers:test-driven-development skill during implementation.

---

## 9. Deployment

### LXC 105 provisioning (via Proxmox MCP)
- Debian 12 unprivileged LXC, 2 CPU, 4 GB RAM, 20 GB root disk
- `/data` bind-mount of host ZFS dataset sized for ~2 TB growth
- Same dataset bind-mounted into LXC 104 (Tdarr) at identical path for atomic transcode
- Docker + compose plugin installed

### Docker Compose stack (`/opt/stacks/vorevault/`)
- `app` — Next.js (port 3000 internal)
- `postgres` — 16-alpine, volume `./pgdata`
- `tusd` — port 1080 internal, hooks configured to app
- `caddy` — reverse proxy, binds LXC port 80

### Networking
- Cloudflared (LXC 250) ingress: `vault.bullmoosefn.com` → `http://192.168.2.105:80`
- DNS: Cloudflare CNAME `vault` on `bullmoosefn.com` → tunnel ID

### Deploy flow (MVP)
- Push to GitHub `Bullmoose-Code/vorevault`
- `git pull && docker compose up -d --build` on LXC 105
- CI/CD deferred

### Backups
- Postgres: nightly `pg_dump` → `/var/lib/vz/dump/vorevault/`, weekly off-node copy
- Files: Proxmox backup job on LXC 105 nightly; host dataset snapshotted weekly (ZFS)
- Monitoring: Uptime Kuma hits `/api/health`

---

## 10. Project Documentation Files

Three docs live in the repo and guide all future work:

### `DESIGN.md` — the north star
- Product & technical principles (shared pool, Discord-gated, simple over clever)
- Architecture diagram + data model (mirror of this spec's relevant sections)
- Non-goals list — anchor against scope creep
- UX tenets (fast, polished playback, one-click share, no wizards)
- Decision rules ("if in doubt, do X")
- Changes to DESIGN.md require explicit discussion

### `VOREVAULT_MASTER_CONTEXT.md` — living ground truth
- Current deployed version & last deploy date
- Infrastructure details: LXC 105 specs, mount points, ports, domain
- All env vars and purposes
- External IDs: Discord app ID, guild ID, required role ID
- Common ops commands (restart, logs, backup, restore)
- Known issues / workarounds
- Runbook: "how to add a new friend"
- Updated as reality changes

### `CLAUDE.md` — instructions for Claude Code in this repo
- Project structure & where things live
- Tech stack & conventions (TypeScript strict, Zod validation, DB layer TBD during planning)
- Testing rules (TDD; use testcontainers for DB; don't mock the DB)
- References `DESIGN.md` as constraint, `VOREVAULT_MASTER_CONTEXT.md` as ground truth
- Forbidden: bypassing auth for convenience, committing secrets, force-push
- Pointers to relevant superpowers skills (TDD, verification-before-completion, executing-plans, using-git-worktrees)

---

## 11. Skills used during build
- `superpowers:writing-plans` — next step, produces the implementation plan from this spec
- `superpowers:test-driven-development` — during implementation
- `superpowers:executing-plans` — working the plan
- `superpowers:using-git-worktrees` — isolating feature work
- `superpowers:verification-before-completion` — before merging/deploying
- `frontend-design` — when building UI to avoid generic aesthetics

---

## 12. Open items to resolve during planning
- Exact Next.js DB layer choice (Drizzle vs. Kysely) — TBD in implementation plan
- Host storage dataset name and ZFS/LVM-thin choice — confirmed at deploy time based on current pool layout
- Whether to include Discord-bot upload notifications in MVP or defer (current: deferred)
- Whether to re-verify Discord role on every request (current: only on login + session expiry)
