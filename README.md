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
