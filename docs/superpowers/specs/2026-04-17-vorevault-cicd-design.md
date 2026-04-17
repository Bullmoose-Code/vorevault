# VoreVault CI/CD — Design

**Date:** 2026-04-17
**Status:** Spec approved, plan pending
**Repo:** `Bullmoose-Code/vorevault`
**Deploy target:** LXC 105 on `pve` (`192.168.2.105`), path `/opt/stacks/vorevault`

---

## Goal

Stand up a GitHub Actions CI/CD pipeline for VoreVault that mirrors the existing pls-bot pattern: lint + test + build on every push and pull request to `main`, then publish a production image to `ghcr.io/bullmoose-code/vorevault:latest` on merge to `main` and trigger an automatic rolling update on LXC 105 via a locally-hosted Watchtower.

Success criteria:
- Every push to `main` that passes CI results in a running container on LXC 105 within ~4 minutes, with no manual SSH.
- Every pull request targeting `main` runs lint + vitest + `next build` and blocks merge on failure.
- Rolling back is a one-line compose change (pin to a prior digest).
- No new secrets in the repo tree; no expansion of Cloudflare Access surface beyond what pls-bot already uses.

## Non-Goals

- Dev-only image tag (`dev-ryan` equivalent). Deferred — we have no dev LXC for vorevault yet.
- Dependabot / automated dependency PRs. Deferred.
- Per-PR preview environments.
- Discord notifications on build result.
- Cloudflare Access policy in front of the Watchtower endpoint. Watchtower's bearer token is the gate, matching pls-bot.

## Current State

- **Image source:** built locally on LXC 105 on every `git pull && docker compose up -d --build`. Slow, no immutable audit trail, no rollback.
- **Tests:** `vitest` with `@testcontainers/postgresql` — spins a real Postgres 16 per run. Suites: `schema.test.ts`, `files-schema.test.ts`, `share-schema.test.ts`, `auth-flow.test.ts`, `pg.smoke.test.ts`. Never run automatically.
- **Branches:** only `main`. No protection rules. Every push lands directly to what will become prod.
- **Watchtower:** present on VM 101 (for pls-bot + other Docker stacks). Not present on LXC 105.
- **Cloudflared:** LXC 250 runs two tunnels. `bullmoosefn-tunnel` (ID `387e2e20-1bfc-4473-8775-6e8fe018c734`) already routes `vault.bullmoosefn.com → 192.168.2.105:80`; its public-hostname list is managed via the Zero Trust dashboard.

## Architecture

### Pipeline shape

Single workflow file `.github/workflows/ci-cd.yml` with two jobs:

1. **`ci`** — runs on `push` to `main` and `pull_request` targeting `main`.
   - Checkout.
   - `actions/setup-node@v4` with Node 22.
   - `npm ci` inside `app/`.
   - `npm run lint`.
   - `npm run test` (vitest uses Docker-in-Docker on the `ubuntu-latest` runner — testcontainers spawns its own Postgres).
   - `npm run build` (catches Next.js build errors before prod).

2. **`deploy`** — depends on `ci`. Gated by `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`.
   - `docker/login-action@v4` to `ghcr.io` using `secrets.GHCR_PAT`.
   - `docker/build-push-action@v7` builds `app/` and pushes `ghcr.io/bullmoose-code/vorevault:latest`.
   - `curl` the Watchtower HTTP API on LXC 105 with bearer token `secrets.WATCHTOWER_TOKEN_VAULT` to trigger a targeted update.

Path filter on both triggers: `paths-ignore: ['**.md', 'docs/**']`.

No matrix, no parallelism on the CI side — the test run is the slow step (~60s cold Postgres) and parallelizing would be false economy at this scale.

### LXC 105 Watchtower service

Added to `/opt/stacks/vorevault/compose.yaml` on LXC 105 as a new service:

- **Image:** `ghcr.io/nicholas-fedor/watchtower` (identical to VM 101 — shared mental model).
- **Mounts:**
  - `/var/run/docker.sock:/var/run/docker.sock` — required for Docker API access.
  - `/root/.docker/config.json:/config.json:ro` — so Watchtower can pull private GHCR images using the creds set up by the one-time `docker login`.
- **Command/flags:**
  - `--http-api-update` — enable the HTTP trigger.
  - `--http-api-token <value>` — shared bearer token (matches `WATCHTOWER_TOKEN_VAULT` in the GHA secret).
  - `--label-enable` — only update containers that opt in via the `com.centurylinklabs.watchtower.enable=true` label.
  - `--cleanup` — remove the old image after a successful update so LXC 105's disk doesn't bloat.
- **Port binding:** `127.0.0.1:8080:8080`. Not exposed on the LAN directly; reached via cloudflared.
- **Label opt-in:** only the `app` service gets `com.centurylinklabs.watchtower.enable=true`. Watchtower must not touch `postgres`, `tusd`, or `caddy` — those are updated intentionally, not on image push.
- **Polling:** `--interval 86400` (24h). Updates are driven by the HTTP trigger from GHA; the long background interval exists as a belt-and-suspenders backup if a webhook is ever missed. Setting it tight would defeat the "deploys are intentional" goal.

### Cloudflared route

Add one public hostname to `bullmoosefn-tunnel` via Cloudflare Zero Trust dashboard:

- **Hostname:** `watchtower-vault.vvhq.net`
- **Service:** `http://192.168.2.105:8080`
- **Access policy:** none — the route is protected solely by Watchtower's bearer token, matching pls-bot's `watchtower.vvhq.net` setup.

No file changes on LXC 250. `cloudflared-bullmoosefn.service` runs in dashboard-config mode and picks up the new hostname automatically.

### GHCR credentials on LXC 105

One-time setup: run `docker login ghcr.io` on LXC 105 with a read-only PAT (or the deploy-key PAT from the repo). This writes `/root/.docker/config.json`. The Watchtower container mounts that file read-only so it can `docker pull` private images when the HTTP update fires.

### Image model change

The `app` service in `compose.yaml` switches from building locally to pulling from GHCR:

```yaml
app:
  image: ghcr.io/bullmoose-code/vorevault:latest
  labels:
    - com.centurylinklabs.watchtower.enable=true
  restart: unless-stopped
  user: "0:0"
  env_file: .env
  environment:
    DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
    NODE_ENV: production
  dns:
    - 8.8.8.8
    - 8.8.4.4
  volumes:
    - /data:/data
  depends_on:
    postgres:
      condition: service_healthy
  networks: [internal]
```

The `build:` block is removed. Local development on a laptop can still run `docker compose build app` explicitly if needed, but the default `docker compose up -d` pulls the image. This also means `app/Dockerfile` is no longer invoked on LXC 105 at deploy time — it's only invoked in GHA.

## Data Flow

```
PR opened or push to main
        │
        ▼
  GitHub Actions: ci job
  (lint → vitest → next build)
        │
   ┌────┴─────┐
   │ PR only  │ push to main only
   │          │
  merge       ▼
  allowed   deploy job
            │
            ├─ docker buildx build app/ → push ghcr.io/.../vorevault:latest
            │
            └─ curl -H "Authorization: Bearer $TOKEN" https://watchtower-vault.vvhq.net/v1/update
                        │
                        ▼
            Cloudflared tunnel → LXC 105:8080
                        │
                        ▼
            Watchtower: pull :latest, stop+recreate `vorevault-app-1`, remove old image
                        │
                        ▼
            App reachable at vault.bullmoosefn.com
```

## Files

### New

- `.github/workflows/ci-cd.yml` — the workflow described above.

### Modified

- `compose.yaml` — `app` service switched to `image:`, label added; new `watchtower` service block.
- `VOREVAULT_MASTER_CONTEXT.md` — adds a "CI/CD" section documenting:
  - Where the pipeline lives.
  - The image tag (`:latest`).
  - The Watchtower service + port + token-secret location.
  - The cloudflared route `watchtower-vault.vvhq.net`.
  - The one-time `docker login` step (so future-us remembers).
- `README.md` — short "Deploying" section: "push to `main`, wait ~4 minutes. Manual override: `docker compose pull && docker compose up -d` on LXC 105."

### Not committed (manual steps done once)

- `docker login ghcr.io` on LXC 105 → writes `/root/.docker/config.json`.
- Cloudflare Zero Trust dashboard edit → new public hostname.
- GitHub repo → Settings → Secrets: `GHCR_PAT`, `WATCHTOWER_TOKEN_VAULT`.

## Secrets

Two new GitHub Actions secrets on `Bullmoose-Code/vorevault`:

| Secret | Scope | Source |
|---|---|---|
| `GHCR_PAT` | PAT with `write:packages` scope on `Bullmoose-Code` org (classic PAT works; fine-grained PAT works if your org has GHCR support enabled for them). NOT reused from pls-bot — minted fresh. | User creates via github.com → Settings → Developer settings. |
| `WATCHTOWER_TOKEN_VAULT` | 32+ char random. Same value goes into the Watchtower container env on LXC 105 (via `.env` or inline). | `openssl rand -hex 32` on LXC 105 at setup time. |

A read-only **image pull** credential on LXC 105 (written to `/root/.docker/config.json` by the one-time `docker login`) does not live in GHA secrets. It can be the same PAT as `GHCR_PAT` if scoped for read+write, or a separate read-only PAT — either works.

## Error Handling / Failure Modes

- **CI fails on PR** → PR shows red check, merge blocked by branch protection (set up manually in GitHub UI; not part of this spec's code changes).
- **CI passes, image push fails** → deploy job is one action step, so the failure is visible in the Actions tab. Nothing on LXC 105 changes. Next push retries.
- **Image push succeeds, Watchtower curl fails** → image is live on GHCR but not deployed. Manual recovery: SSH LXC 105, `docker compose pull app && docker compose up -d app`. Next push also re-triggers.
- **Watchtower pulls a broken image** → `app` container crash-loops. `postgres`, `tusd`, `caddy` are unaffected (labels restrict Watchtower's scope). Rollback: edit `compose.yaml` to pin `image: ghcr.io/bullmoose-code/vorevault:latest@sha256:<prior-digest>`, `docker compose up -d app`. Subsequent pushes will still pull `:latest`; re-remove the pin once fixed.
- **GHCR auth expires on LXC 105** → Watchtower's `docker pull` fails with 401; container keeps running the old image. Visible in `docker logs watchtower`. Fix: re-run `docker login ghcr.io` with a fresh PAT.
- **Testcontainers flaky on GHA runner** → vitest retries are not configured; a flake fails the build. Acceptable for now — if this becomes a problem, we'll add `--retry 1` to the vitest invocation.

## Testing Plan

1. **PR smoke** — open a throwaway PR with a trivial change. Verify `ci` job runs lint + test + build, verify `deploy` is skipped, verify PR check gate is green.
2. **Dry-run image build** — merge a no-op commit to `main`. Verify `ghcr.io/bullmoose-code/vorevault:latest` appears in the org's Packages tab. Pull it manually on LXC 105 and boot it with the existing `docker compose` (before the `compose.yaml` switch) to confirm it runs.
3. **Cutover** — land the `compose.yaml` change + new Watchtower service. SSH LXC 105, `docker compose up -d`. Expect: `vorevault-app-1` pulls from GHCR, `vorevault-watchtower-1` starts. Hit `https://vault.bullmoosefn.com/api/health` to confirm.
4. **End-to-end** — push a visible change (a footer string) to `main`. Watch:
   - GHA workflow run goes green.
   - Watchtower HTTP log shows the incoming update request.
   - `docker ps` on LXC 105 shows `vorevault-app-1` restarted seconds later.
   - The change is live at `vault.bullmoosefn.com`.
   Target wall-clock: under 4 minutes from push to visible.
5. **Rollback rehearsal** — pick a prior image digest from ghcr.io, pin it in `compose.yaml`, `docker compose up -d app`. Confirm the site serves the older version. Un-pin, push to main again, verify we're back on `:latest`.

## Rollout Order

Chosen so that any step can be aborted without breaking the live site.

1. Create `GHCR_PAT` + `WATCHTOWER_TOKEN_VAULT` secrets in the repo. Nothing is used yet.
2. Land `.github/workflows/ci-cd.yml` — but with the `deploy` job's `if:` gate set to `false` initially. CI runs on PRs + pushes; no images are pushed yet.
3. Open a throwaway PR, verify CI runs and passes.
4. Remove the `if: false` gate. Push a no-op to `main` → image lands on GHCR. Pull it manually on LXC 105 to sanity-check.
5. On LXC 105: `docker login ghcr.io`. Add Cloudflared public hostname via dashboard. `curl -H "Authorization: Bearer $TOKEN" https://watchtower-vault.vvhq.net/v1/update` after the Watchtower service is up — expect 200.
6. Commit the `compose.yaml` switch (build→image + new watchtower service) to `main`. Image build fires; on LXC 105 run `docker compose up -d` once manually to apply the compose change (Watchtower can't update itself via label-opt-in). From this point on, future `app` updates are automatic.
7. End-to-end test (step 4 in testing plan above).

## Open Questions

None — all decisions captured above. If implementation surfaces something unexpected (e.g. testcontainers doesn't work on the runner), the plan step handling it will call it out.
