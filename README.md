# VoreVault

Self-hosted, Discord-gated file/clip sharing for the Bullmoose group.

- **Live:** https://vault.bullmoosefn.com
- **Host:** LXC 105 on `pve` (192.168.2.105)
- **Design:** see [`DESIGN.md`](./DESIGN.md)
- **Ops runbook:** see [`VOREVAULT_MASTER_CONTEXT.md`](./VOREVAULT_MASTER_CONTEXT.md)
- **Agent instructions:** see [`CLAUDE.md`](./CLAUDE.md)

## Quickstart (on LXC 105)

```bash
cd /opt/stacks/vorevault
cp .env.example .env  # fill in secrets
docker compose up -d --build
```

## Deploying

VoreVault ships via GitHub Actions:

- **CI** (vitest + `next build`) runs on every pull request and every push to `main`.
- **CD** runs on push to `main` only: builds `ghcr.io/bullmoose-code/vorevault:latest`, then triggers Watchtower on LXC 105 to pull and restart the `app` container.
- Expected round-trip from merge to live: ~4 minutes.

To deploy, merge to `main`. To force a redeploy manually on LXC 105:

```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && git pull && docker compose pull && docker compose up -d'
```

For rollback, see `VOREVAULT_MASTER_CONTEXT.md`.
