# VoreVault

Self-hosted, Discord-gated file and clip sharing for small friend groups. Discord is the identity system — sign in, land on a shared pool of every file the group has uploaded, upload more, share, or mint unlisted links.

- **Architecture & decisions:** [`VOREVAULT_MASTER_CONTEXT.md`](./VOREVAULT_MASTER_CONTEXT.md)
- **Design principles (north star):** [`DESIGN.md`](./DESIGN.md)
- **AI agent instructions:** [`CLAUDE.md`](./CLAUDE.md)
- **Security disclosure:** [`SECURITY.md`](./SECURITY.md)

## Stack

Next.js 15 (App Router, TypeScript strict) · PostgreSQL 16 · [tusd](https://github.com/tus/tusd) for resumable uploads · `ffmpeg` for video transcoding · Caddy for reverse proxy · Docker Compose · Discord OAuth for auth · Cloudflare Tunnel (optional) for public TLS · GitHub Actions + GHCR + Watchtower for auto-deploy.

See the master context document for the full architecture decision table.

## Quickstart (self-hosting)

```bash
# 1. Clone
git clone https://github.com/Bullmoose-Code/vorevault.git
cd vorevault

# 2. Configure
cp .env.example .env
# Fill in Discord OAuth credentials, session secret, Postgres password, etc.
# See .env.example for descriptions of each variable.

# 3. Prepare the data directory (host path bind-mounted as /data in the containers)
sudo mkdir -p /srv/vorevault/data/{uploads,thumbs,transcoded,tusd-tmp}
# Adjust the mount path in compose.yaml if you want a different host location.

# 4. Bring it up
docker compose up -d
```

Expose the `caddy` service's port 80 behind whatever TLS terminator you prefer — Cloudflare Tunnel, a second Caddy with `auto_https`, a separate reverse proxy. The reference deployment uses Cloudflare Tunnel so no host ports are open.

You'll also need a Discord application (https://discord.com/developers/applications) with an OAuth2 redirect URI pointing at `https://your-domain/api/auth/discord/callback` and the `identify guilds.members.read` scopes enabled.

## Deploying

CI (Vitest + `next build`) runs on every PR and every push to `main`. CD runs only on push to `main`: it builds and pushes `ghcr.io/<org>/vorevault:latest`, then triggers Watchtower on the deployment host to pull and restart the `app` container. Typical merge-to-live is a few minutes.

For rollback, pin the image to a specific digest in `compose.yaml` — see the CI/CD section of the master context.

## Contributing

This is a hobby project for a specific friend group, but contributions that fit the design principles in `DESIGN.md` are welcome. File an issue before opening a PR for anything larger than a bug fix or small enhancement — the YAGNI list in `DESIGN.md` covers a lot of the "why not …" ground.

## License

Not yet chosen. Treat as all-rights-reserved until a `LICENSE` file is added.
