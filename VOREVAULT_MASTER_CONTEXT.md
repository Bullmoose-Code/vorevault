# VoreVault — Master Context (Living Ground Truth)

Update this file whenever reality changes. If it's out of date, fix it immediately.

## Current state
- **Version:** 0.1.0 (Plan 1 — infra foundation)
- **Last deploy:** 2026-04-15
- **Status:** Placeholder site live at https://vault.bullmoosefn.com; no features yet.

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
| caddy    | caddy:2-alpine       | 80 (host-exposed)| Reverse proxy, security headers  |

## Environment variables (`/opt/stacks/vorevault/.env`)
See `.env.example` in repo for the full list with descriptions. Never commit real values.

Currently populated:
- `POSTGRES_USER`, `POSTGRES_DB` = `vorevault`
- `POSTGRES_PASSWORD` = random 32-char (generated 2026-04-15)
- `SESSION_SECRET` = random 32-byte base64 (generated 2026-04-15)
- `APP_PUBLIC_URL` = `https://vault.bullmoosefn.com`

Empty (populated in Plan 2):
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `DISCORD_REQUIRED_ROLE_ID`

## External IDs
- **GitHub repo:** `Bullmoose-Code/vorevault` (private)
- **bullmoosefn-tunnel ID:** `387e2e20-1bfc-4473-8775-6e8fe018c734`
- **Discord app ID:** *(populated in Plan 2)*
- **Discord guild ID:** *(populated in Plan 2)*
- **Discord required role ID:** *(populated in Plan 2)*

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

## Backups
- *TBD in Plan 7 — Postgres nightly pg_dump + LXC 105 Proxmox backup job + ZFS snapshot of `tank/data/vorevault`.*

## Known issues / workarounds
- LXC 105 cannot use the gateway `192.168.2.1` for DNS — it does not respond to DNS queries from this container. Configured `1.1.1.1` instead. (Other LXCs may have the same issue — investigate if you spin up new ones.)
- LXC 105 outbound port 22 to GitHub is blocked. Working around via SSH-over-443 (`ssh.github.com:443`) configured in `/root/.ssh/config`.
- LXC 104 snapshots fail (`snapshot feature is not available`) due to bind-mount + LVM-thin combination. Use rollback via re-mount instead if needed.

## Adding a new friend
- *TBD in Plan 2 once auth is live — will be "add them to Bullmoose Discord + grant the VoreVault role".*
