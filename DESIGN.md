# VoreVault — Design Principles (North Star)

This document defines *what* VoreVault is and the rules that guide every change. Changes to this file require explicit discussion — do not modify silently.

## Product
VoreVault is a Discord-gated file/clip sharing app for the Bullmoose group. It is NOT a Google Drive clone. It is NOT enterprise software. It is a focused tool: upload, watch/view, share.

## Core principles
1. **Shared pool.** Everyone in the group sees everything. No per-file ACLs.
2. **Discord is the identity system.** We do not manage passwords. Auth = Discord OAuth + role check.
3. **Simple over clever.** Local filesystem > S3. Postgres > microservices. One LXC > Kubernetes.
4. **Polished playback matters.** In-browser video playback must feel good; download-only is a failure mode, not a default.
5. **Unlisted public links are opt-in per file.** Default private.
6. **Revocable.** Sessions and share links are both server-side rows that can be killed instantly.

## Architecture (summary — source of truth is the design spec)
- LXC 105 on Proxmox `pve` (192.168.2.105), Docker Compose stack: Next.js app, Postgres, tusd, Caddy.
- `/data` bind-mounted from host ZFS dataset `tank/data/vorevault`, also mounted into Tdarr LXC 104 for in-place transcoding.
- Dedicated Cloudflared tunnel `bullmoosefn-tunnel` (in LXC 250) terminates public TLS at `vault.bullmoosefn.com`.

See [`docs/superpowers/specs/2026-04-15-vorevault-design.md`](./docs/superpowers/specs/2026-04-15-vorevault-design.md) for full architecture, data model, and flows.

## UX tenets
- First screen after login is the grid. No dashboard.
- Upload is drag-and-drop. No modal wizards.
- Share is one toggle + copy button.
- "Processing..." state is acceptable. Broken playback is not — fall back to download with a visible warning.

## Non-goals (YAGNI list — reject PRs that add these without discussion)
- Per-user quotas
- Folders / tags / full-text search
- Virus scanning
- 2FA
- Mobile app
- Object storage (S3/MinIO)
- CI/CD (until manual deploy becomes painful)

## Decision rules
- **If in doubt about scope:** say no. YAGNI wins.
- **If in doubt about auth:** deny.
- **If in doubt about a file type:** serve `application/octet-stream` with `Content-Disposition: attachment`.
- **If a test is hard to write:** the code is wrong, not the test.
- **If a file is > ~400 lines:** split it.
