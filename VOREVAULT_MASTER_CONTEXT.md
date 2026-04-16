# VoreVault — Master Context (Living Ground Truth)

Update this file whenever reality changes. If it's out of date, fix it immediately.

## Current state
- **Version:** 0.6.0 (Plan 6 — background video transcoding)
- **Last deploy:** 2026-04-15
- **Status:** Full group-pool sharing with polished playback. Non-web-friendly videos auto-transcode to h264 mp4 in the background.

## Public endpoint
- **URL:** https://vault.bullmoosefn.com
- **TLS:** terminated at Cloudflare edge
- **DNS:** managed by `bullmoosefn-tunnel` Public Hostname rule (auto-generates the CNAME)

## Infrastructure

### LXC 105 (VoreVault host)
- **VMID:** 105
- **Hostname:** `vorevault`
- **IP:** 192.168.2.105
- **OS:** Debian 12 (unprivileged LXC, `nesting=1,keyctl=1`)
- **Resources:** 2 CPU / 4 GB RAM / 512 MB swap / 20 GB rootfs (`local-lvm`)
- **DNS:** `1.1.1.1, 1.0.0.1` (the gateway `192.168.2.1` does not respond to DNS from this container — do not change back)
- **Storage bind mount:** `/tank/data/vorevault` (host) → `/data` (container), mode 0770, owner `100000:100000` (unprivileged LXC root mapping)
- **App dir:** `/opt/stacks/vorevault` (cloned from `git@github.com:Bullmoose-Code/vorevault.git`)
- **SSH:** uses GitHub via port 443 (`ssh.github.com:443`) — port 22 is blocked outbound from this LXC. Config in `/root/.ssh/config`.
- **Deploy key:** ed25519 in `/root/.ssh/id_ed25519`, registered as read-only deploy key `lxc-105-vorevault` on the GitHub repo.

### LXC 104 (Tdarr) — Plan 1 changes
- Added bind mount `mp0: /tank/data/vorevault → /data` so Tdarr can transcode VoreVault uploads in place. Existing `mp1: /tank/media → /media` untouched.

### LXC 250 (Cloudflared) — Plan 1 changes
- Added new systemd unit **`cloudflared-bullmoosefn.service`** running tunnel `bullmoosefn-tunnel` (ID `387e2e20-1bfc-4473-8775-6e8fe018c734`) via token mode.
  - Token stored in `/etc/cloudflared/bullmoosefn.env` (chmod 600).
  - Routes `vault.bullmoosefn.com → http://192.168.2.105:80` via the dashboard-managed Public Hostnames list (Zero Trust → Networks → Tunnels → bullmoosefn-tunnel).
- Pre-existing `cloudflared-tunnel.service` (vvhq-tunnel, ID `f457d409-5e01-49dd-aef3-6148bb14790f`) untouched apart from one transient restart on 2026-04-15.

## Docker Compose services (LXC 105, in `/opt/stacks/vorevault/`)
| Service  | Image                | Ports (internal) | Purpose                          |
|----------|----------------------|------------------|----------------------------------|
| app      | built locally        | 3000             | Next.js UI + API routes          |
| postgres | postgres:16-alpine   | 5432             | Primary DB (volume `./pgdata/`)  |
| tusd     | tusproject/tusd:v2   | 8080             | Resumable uploads (tus protocol) |
| caddy    | caddy:2-alpine       | 80 (host-exposed)| Reverse proxy, security headers  |

## Data layout (host: `/tank/data/vorevault/` ↔ container: `/data/`)
| Subdir       | Owner         | Mode | Purpose                                                    |
|--------------|---------------|------|------------------------------------------------------------|
| uploads/     | 100000:100000 | 0775 | Final canonical files: `uploads/<file-uuid>/<original-name>` |
| thumbs/      | 100000:100000 | 0775 | JPEG thumbnails: `thumbs/<file-uuid>.jpg`                  |
| transcoded/  | 100000:100000 | 0775 | (Plan 6) Tdarr-transcoded files                            |
| tusd-tmp/    | 100000:100000 | 0775 | tusd's resumable-upload working dir; cleared on post-finish |

## Environment variables (`/opt/stacks/vorevault/.env`)
See `.env.example` in repo for the full list with descriptions. Never commit real values.

Currently populated:
- `POSTGRES_USER`, `POSTGRES_DB` = `vorevault`
- `POSTGRES_PASSWORD` = random 32-char (generated 2026-04-15)
- `SESSION_SECRET` = random 32-byte base64 (generated 2026-04-15)
- `APP_PUBLIC_URL` = `https://vault.bullmoosefn.com`
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `DISCORD_REQUIRED_ROLE_ID`, `DISCORD_REDIRECT_URI` — all set on LXC 105 (.env, chmod 600)

## External IDs
- **GitHub repo:** `Bullmoose-Code/vorevault` (private)
- **bullmoosefn-tunnel ID:** `387e2e20-1bfc-4473-8775-6e8fe018c734`
- **Discord app / client ID:** `931632754582495265` (shared with the Bullmoose `pls-bot` app — same Discord application, different OAuth redirect URI)
- **Discord guild ID:** `934160898828931143` (Bullmoose server)
- **Discord required role ID:** `1494136690309070868` (`VoreVault` role)
- **Discord client secret:** stored in `/opt/stacks/vorevault/.env` on LXC 105 only — never committed
- **Discord OAuth redirect URI registered:** `https://vault.bullmoosefn.com/api/auth/discord/callback`

### Auth model
- Sessions: server-side rows in `sessions` table; cookie `vv_session` is the session UUID (HttpOnly/Secure/SameSite=Lax, 24h TTL)
- Middleware (`app/src/middleware.ts`) gates everything except `/login`, `/api/auth/*`, `/api/health` based on cookie *presence*; routes re-validate the cookie against the DB via `getCurrentUser()`
- Role check happens at OAuth callback; revocation = `DELETE FROM sessions WHERE id = ...` or set `users.is_banned = true` (banned users can't get a valid session even with a valid cookie)

## Common ops commands

Run from `pve` host:
```bash
# Enter LXC
pct enter 105

# Stack control
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && docker compose ps'
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && docker compose logs -f app'
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && docker compose restart app'

# Pull + rebuild after a git push
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && git pull && docker compose up -d --build'

# DB shell
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && docker compose exec postgres psql -U vorevault -d vorevault'

# Health
curl -s https://vault.bullmoosefn.com/api/health

# Tunnel control (LXC 250)
pct exec 250 -- systemctl status cloudflared-bullmoosefn
pct exec 250 -- journalctl -u cloudflared-bullmoosefn -f
```

## Transcoding
- Background worker runs inside the `app` container (started via `instrumentation.ts` on boot)
- Polls every 30s for `files WHERE transcode_status = 'pending' AND mime_type LIKE 'video/%'`
- Probes with ffprobe: if already h264+aac in mp4 → `skipped`; otherwise → transcode to `/data/transcoded/<uuid>.mp4` → `done`
- On failure → `failed` (original file still available for download)
- Non-video files marked `skipped` immediately on upload (post-finish hook)
- **NOT using Tdarr** (LXC 104) for VoreVault — direct ffmpeg is simpler. Tdarr remains for the Jellyfin media library.

## Backups
- *TBD in Plan 7 — Postgres nightly pg_dump + LXC 105 Proxmox backup job + ZFS snapshot of `tank/data/vorevault`.*

## Known issues / workarounds
- LXC 105 cannot use the gateway `192.168.2.1` for DNS — it does not respond to DNS queries from this container. Configured `1.1.1.1` instead. (Other LXCs may have the same issue — investigate if you spin up new ones.)
- LXC 105 outbound port 22 to GitHub is blocked. Working around via SSH-over-443 (`ssh.github.com:443`) configured in `/root/.ssh/config`.
- LXC 104 snapshots fail (`snapshot feature is not available`) due to bind-mount + LVM-thin combination. Use rollback via re-mount instead if needed.
- **Stale ARP after LXC 105 rebuild/reboot:** Something on `192.168.2.x` (MAC `94:9f:3e:8c:78:dc`) was previously assigned `192.168.2.105`. After LXC 105 reboots, both `pve` and LXC 250 may keep the stale MAC in their ARP tables, breaking TCP to LXC 105 even though ICMP works. Fix: `ip neigh del 192.168.2.105 dev <iface>; ping -c1 192.168.2.105` on each affected host. Long-term fix: identify the conflicting device and re-IP it, or set a static ARP for 192.168.2.105 on `pve` and `LXC 250`.
- **Orphan tusd uploads:** Abandoned mid-flight uploads leave files in `/data/tusd-tmp/` and rows in `upload_sessions` (with `file_id IS NULL`). No auto-cleanup yet. Manual: `find /tank/data/vorevault/tusd-tmp -mtime +1 -delete` and `DELETE FROM upload_sessions WHERE file_id IS NULL AND created_at < now() - interval '1 day'`.

## Running tests
Tests need Docker (testcontainers spins up Postgres). Run them inside LXC 105:
```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault/app && npm install --no-fund --no-audit && npm test'
```
Node 22 is installed in LXC 105 alongside Docker for this purpose. The `pve` host deliberately has no Docker / no Node.

## Adding a new friend
1. Make sure they're in the Bullmoose Discord server (guild ID `934160898828931143`).
2. Grant them the `VoreVault` role (ID `1494136690309070868`).
3. Send them https://vault.bullmoosefn.com — first login auto-creates their `users` row.

## Revoking access
- Remove the `VoreVault` role in Discord, OR
- `UPDATE users SET is_banned = true WHERE discord_id = '...'` (immediate; their cookie still exists but `getSessionUser()` returns null), OR
- `DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE discord_id = '...')` (forces re-login on next request)
