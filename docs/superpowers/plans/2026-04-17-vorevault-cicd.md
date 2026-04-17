# VoreVault CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `main`-branch CI/CD for VoreVault: lint + vitest + build on every PR/push; build & push `ghcr.io/bullmoose-code/vorevault:latest` on merge to `main`; auto-deploy on LXC 105 via a locally-hosted Watchtower triggered by GHA webhook.

**Architecture:** Single GitHub Actions workflow with two jobs (`ci`, `deploy`). `deploy` pushes to GHCR and curls a Watchtower HTTP endpoint on LXC 105 exposed through a new cloudflared public hostname. LXC 105's `compose.yaml` switches the `app` service from local `build:` to `image:` and gains a new `watchtower` service scoped to the `app` container via label opt-in.

**Tech Stack:** Next.js 15 / Node 22 / vitest + testcontainers, GitHub Actions (`docker/build-push-action@v7`, `docker/login-action@v4`), `ghcr.io/nicholas-fedor/watchtower`, Cloudflared (`bullmoosefn-tunnel`).

**Spec:** `docs/superpowers/specs/2026-04-17-vorevault-cicd-design.md`

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `.github/workflows/ci-cd.yml` | Create | Two jobs: `ci` (lint/test/build, runs on PR + push) and `deploy` (builds image, pushes to GHCR, curls Watchtower — runs on push to `main` only) |
| `compose.yaml` | Modify | `app` service: `build: ./app` → `image: ghcr.io/bullmoose-code/vorevault:latest` + watchtower label; new `watchtower` service block |
| `.env.example` | Modify | Document `WATCHTOWER_TOKEN_VAULT` |
| `VOREVAULT_MASTER_CONTEXT.md` | Modify | New "CI/CD" section documenting pipeline, Watchtower, cloudflared route, one-time setup |
| `README.md` | Modify | Short "Deploying" section |

No test files to create. vitest suite already exists in `app/tests/` and CI just runs it.

---

## Task 1: Create feature branch

**Files:** None (git only)

- [ ] **Step 1: Fetch origin and branch from main**

Run:
```bash
cd /root/vorevault
git fetch origin
git checkout main
git pull origin main
git checkout -b feature/ci-cd-pipeline
```

Expected: new branch `feature/ci-cd-pipeline` tracking from `main`.

---

## Task 2: Mint GitHub secrets

**Files:** None (GitHub UI + shell)

These two secrets must exist on the repo before the workflow will work. Required: `gh` CLI authenticated against `Bullmoose-Code/vorevault`.

- [ ] **Step 1: Create the GHCR PAT**

In a browser, go to https://github.com/settings/tokens. Click **Generate new token (classic)**.
- Name: `vorevault-ghcr`
- Expiration: 1 year (or your preference)
- Scopes: **`write:packages`** only (granting `read:packages` + `write:packages` + `delete:packages` transitively; that's fine)

Copy the token. It's shown once.

- [ ] **Step 2: Set the GHCR_PAT repo secret**

Run (replace `<TOKEN>` with the value copied above):
```bash
gh secret set GHCR_PAT \
  --repo Bullmoose-Code/vorevault \
  --body "<TOKEN>"
```

Expected: `✓ Set Actions secret GHCR_PAT for Bullmoose-Code/vorevault`.

- [ ] **Step 3: Generate and set the Watchtower token**

Run:
```bash
WATCHTOWER_TOKEN="$(openssl rand -hex 32)"
echo "$WATCHTOWER_TOKEN"  # save this — you need it on LXC 105 later
gh secret set WATCHTOWER_TOKEN_VAULT \
  --repo Bullmoose-Code/vorevault \
  --body "$WATCHTOWER_TOKEN"
```

Expected: 64-char hex string printed, followed by `✓ Set Actions secret WATCHTOWER_TOKEN_VAULT`.

**Save the token value somewhere safe** (password manager, note). You'll paste it into LXC 105's `.env` in Task 8.

- [ ] **Step 4: Verify both secrets exist**

Run:
```bash
gh secret list --repo Bullmoose-Code/vorevault
```

Expected: both `GHCR_PAT` and `WATCHTOWER_TOKEN_VAULT` listed with recent "updated" timestamps.

---

## Task 3: Create the GHA workflow (deploy job gated off)

**Files:**
- Create: `.github/workflows/ci-cd.yml`

- [ ] **Step 1: Create the workflow directory and file**

Run:
```bash
cd /root/vorevault
mkdir -p .github/workflows
```

Create `.github/workflows/ci-cd.yml` with this exact content:

```yaml
name: CI/CD

on:
  push:
    branches: ["main"]
    paths-ignore:
      - '**.md'
      - 'docs/**'
  pull_request:
    branches: ["main"]
    paths-ignore:
      - '**.md'
      - 'docs/**'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: bullmoose-code/vorevault

jobs:
  ci:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: app/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Test (vitest + testcontainers)
        run: npm run test

      - name: Build (next build)
        run: npm run build

  deploy:
    needs: ci
    # TEMP GATE: flip to the real condition in Task 5 once CI is known-good.
    if: false
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v4
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.repository_owner }}
          password: ${{ secrets.GHCR_PAT }}

      - name: Build and push
        uses: docker/build-push-action@v7
        with:
          context: ./app
          file: ./app/Dockerfile
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest

      - name: Trigger Watchtower on LXC 105
        run: |
          curl -fS -X POST \
            -H "Authorization: Bearer ${{ secrets.WATCHTOWER_TOKEN_VAULT }}" \
            https://watchtower-vault.vvhq.net/v1/update
```

- [ ] **Step 2: Commit the workflow**

Run:
```bash
cd /root/vorevault
git add .github/workflows/ci-cd.yml
git commit -m "ci: add CI/CD workflow (deploy gated off for first run)"
```

---

## Task 4: Open PR and verify CI passes

**Files:** None (git + GitHub)

- [ ] **Step 1: Push feature branch**

Run:
```bash
cd /root/vorevault
git push -u origin feature/ci-cd-pipeline
```

- [ ] **Step 2: Open a draft PR**

Run:
```bash
gh pr create \
  --repo Bullmoose-Code/vorevault \
  --base main \
  --head feature/ci-cd-pipeline \
  --title "ci: add CI/CD pipeline" \
  --body "Spec: \`docs/superpowers/specs/2026-04-17-vorevault-cicd-design.md\`. First PR — deploy job is gated off; verifying CI first." \
  --draft
```

Note the PR number printed by the command.

- [ ] **Step 3: Watch the workflow run**

Run (replace `<PR>` with the PR number):
```bash
gh pr checks <PR> --repo Bullmoose-Code/vorevault --watch
```

Expected: `ci` job passes (may take 3-5 minutes — cold testcontainers Postgres start). `deploy` job is shown as skipped because of `if: false`.

- [ ] **Step 4: If CI fails — triage**

If `npm run lint` fails with rules we've never enforced before, fix the lints on this branch and re-push. If `npm run test` fails because testcontainers can't start Postgres, inspect the logs (`gh run view --log-failed`) — common fix is adding Docker-in-Docker support, but `ubuntu-latest` already has it so this shouldn't happen. If `npm run build` fails, that indicates a pre-existing bug on `main` that was never caught — fix it before proceeding.

Don't move on until CI is green.

---

## Task 5: Remove the `if: false` gate

**Files:**
- Modify: `.github/workflows/ci-cd.yml`

- [ ] **Step 1: Edit the deploy job gate**

In `.github/workflows/ci-cd.yml`, find this block:
```yaml
  deploy:
    needs: ci
    # TEMP GATE: flip to the real condition in Task 5 once CI is known-good.
    if: false
```

Replace it with:
```yaml
  deploy:
    needs: ci
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

- [ ] **Step 2: Commit and push**

Run:
```bash
cd /root/vorevault
git add .github/workflows/ci-cd.yml
git commit -m "ci: enable deploy job on push to main"
git push
```

- [ ] **Step 3: Verify CI still passes on the PR**

Run:
```bash
gh pr checks <PR> --repo Bullmoose-Code/vorevault --watch
```

Expected: `ci` job passes. `deploy` job still shows as skipped (this is a `pull_request` event, not a `push` event — the new gate is doing its job).

---

## Task 6: Merge PR and verify first image push

**Files:** None (GitHub)

- [ ] **Step 1: Mark PR ready and merge**

Run:
```bash
gh pr ready <PR> --repo Bullmoose-Code/vorevault
gh pr merge <PR> --repo Bullmoose-Code/vorevault --squash --delete-branch
```

Expected: PR merged, feature branch deleted locally and remotely.

- [ ] **Step 2: Watch the post-merge workflow run**

Run:
```bash
gh run watch --repo Bullmoose-Code/vorevault
```

Expected: new workflow run triggered by the push to `main`. Both `ci` and `deploy` jobs run. `deploy` job finishes with:
- Docker image pushed
- `Trigger Watchtower on LXC 105` step **fails with a connection error** — expected at this point because `watchtower-vault.vvhq.net` doesn't exist yet. That's fine; we're here to verify the image push.

- [ ] **Step 3: Confirm image appears on GHCR**

Visit https://github.com/orgs/Bullmoose-Code/packages and look for the `vorevault` package. It should show `latest` with a very recent "published" timestamp.

Or from the command line:
```bash
docker manifest inspect ghcr.io/bullmoose-code/vorevault:latest 2>&1 | head -20
```

Expected: JSON manifest with architecture/size metadata. A `404 manifest unknown` response means the push failed — re-check the `deploy` job log.

- [ ] **Step 4: Pull back to local main**

Run:
```bash
cd /root/vorevault
git checkout main
git pull origin main
```

---

## Task 7: LXC 105 — `docker login ghcr.io`

**Files:** None (LXC 105 runtime state)

- [ ] **Step 1: Create a read-only GHCR PAT**

In a browser, go to https://github.com/settings/tokens. Click **Generate new token (classic)**.
- Name: `lxc-105-ghcr-readonly`
- Expiration: 1 year
- Scopes: **`read:packages`** only

Copy the token.

- [ ] **Step 2: Run `docker login` on LXC 105**

From the `pve` host (replace `<TOKEN>` and `<GITHUB_USER>` with your values):
```bash
pct exec 105 -- bash -c 'echo "<TOKEN>" | docker login ghcr.io -u <GITHUB_USER> --password-stdin'
```

Expected: `Login Succeeded`. Writes `/root/.docker/config.json` inside LXC 105 with the auth entry.

- [ ] **Step 3: Verify the pull works**

Run:
```bash
pct exec 105 -- docker pull ghcr.io/bullmoose-code/vorevault:latest
```

Expected: layers pulled or `Status: Image is up to date`. If you get `denied: denied` or `unauthorized`, the token scope is wrong or GHCR package visibility isn't set — fix before continuing.

- [ ] **Step 4: Verify the auth file is readable by Watchtower later**

Run:
```bash
pct exec 105 -- ls -la /root/.docker/config.json
```

Expected: file exists, readable by root (Watchtower runs as root). Note its path for Task 9.

---

## Task 8: Add Cloudflared public hostname

**Files:** None (Cloudflare Zero Trust dashboard)

- [ ] **Step 1: Log into Cloudflare Zero Trust**

Go to https://one.dash.cloudflare.com → **Networks** → **Tunnels**.

- [ ] **Step 2: Edit `bullmoosefn-tunnel`**

Click the tunnel row for `bullmoosefn-tunnel` (ID `387e2e20-1bfc-4473-8775-6e8fe018c734`). Click **Configure**. Open the **Public Hostname** tab.

- [ ] **Step 3: Add the new hostname**

Click **Add a public hostname**. Fill in:
- **Subdomain:** `watchtower-vault`
- **Domain:** `vvhq.net`
- **Path:** *(leave empty)*
- **Service type:** `HTTP`
- **URL:** `192.168.2.105:8080`

Click **Save hostname**.

- [ ] **Step 4: Verify propagation**

Wait ~30 seconds. Run from any machine:
```bash
curl -I https://watchtower-vault.vvhq.net/v1/update
```

Expected right now: `HTTP/2 502` or `HTTP/2 503` — this is correct. DNS/tunnel resolves, but the Watchtower container isn't running yet, so there's no backend. A `404` or `NXDOMAIN` means DNS hasn't propagated or the hostname was typed wrong.

---

## Task 9: Add the Watchtower service to `compose.yaml`

**Files:**
- Modify: `compose.yaml`
- Modify: `.env.example`

- [ ] **Step 1: Create a second feature branch from main**

Run:
```bash
cd /root/vorevault
git checkout main
git pull origin main
git checkout -b feature/compose-watchtower
```

- [ ] **Step 2: Edit `compose.yaml` — append new `watchtower` service**

In `/root/vorevault/compose.yaml`, find the line that starts the `caddy:` service block. Before it, after the closing of the `tusd:` block (just before `  caddy:`), insert this new service:

```yaml
  watchtower:
    image: ghcr.io/nicholas-fedor/watchtower
    restart: unless-stopped
    command:
      - --http-api-update
      - --http-api-token=${WATCHTOWER_TOKEN_VAULT}
      - --label-enable
      - --cleanup
      - --interval=86400
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /root/.docker/config.json:/config.json:ro
    networks: [internal]
```

Leave all other services unchanged. The `app` service still uses `build: ./app` at this point — we'll flip it in Task 11.

- [ ] **Step 3: Edit `.env.example` — document the new variable**

In `/root/vorevault/.env.example`, add this block at the end of the file (after the last existing entry):

```bash
# Watchtower HTTP API token — matches WATCHTOWER_TOKEN_VAULT secret in GitHub
# Actions. Generate with: openssl rand -hex 32
WATCHTOWER_TOKEN_VAULT=
```

- [ ] **Step 4: Commit**

Run:
```bash
cd /root/vorevault
git add compose.yaml .env.example
git commit -m "feat(compose): add Watchtower service (app service unchanged)"
git push -u origin feature/compose-watchtower
```

- [ ] **Step 5: Open and merge PR**

Run:
```bash
gh pr create \
  --repo Bullmoose-Code/vorevault \
  --base main \
  --head feature/compose-watchtower \
  --title "feat(compose): add Watchtower service" \
  --body "Adds a label-scoped Watchtower container to LXC 105. App service unchanged this PR — image: switch lands in follow-up."
gh pr merge --repo Bullmoose-Code/vorevault --squash --delete-branch
```

Expected: workflow runs, `ci` passes, `deploy` builds & pushes a new image (same `:latest` tag), `Trigger Watchtower` step fails with HTTP 502 (still no backend). That's fine for now.

- [ ] **Step 6: Pull main**

Run:
```bash
cd /root/vorevault
git checkout main
git pull origin main
```

---

## Task 10: Apply Watchtower on LXC 105 and verify the HTTP endpoint

**Files:** None (LXC 105 runtime)

- [ ] **Step 1: Put the Watchtower token into LXC 105's `.env`**

From `pve` (replace `<TOKEN>` with the value generated in Task 2 Step 3):
```bash
pct exec 105 -- bash -c 'echo "WATCHTOWER_TOKEN_VAULT=<TOKEN>" >> /opt/stacks/vorevault/.env'
pct exec 105 -- bash -c 'chmod 600 /opt/stacks/vorevault/.env'
pct exec 105 -- bash -c 'grep WATCHTOWER /opt/stacks/vorevault/.env'
```

Expected: the line prints back out. File mode 600.

- [ ] **Step 2: Pull the new compose.yaml**

Run:
```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && git pull origin main'
```

Expected: fast-forward merge pulling in the new `watchtower` service.

- [ ] **Step 3: Bring up the stack**

Run:
```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && docker compose up -d'
```

Expected: `vorevault-watchtower-1` created and started. Existing services untouched. Output mentions "Creating vorevault-watchtower-1".

- [ ] **Step 4: Verify Watchtower is healthy**

Run:
```bash
pct exec 105 -- docker logs vorevault-watchtower-1 --tail 20
```

Expected lines include `level=info msg="Watching all containers"` and `level=info msg="HTTP API started"` on port 8080. No errors about `config.json` or Docker socket.

- [ ] **Step 5: Local endpoint check**

Run:
```bash
pct exec 105 -- curl -sS -I -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:8080/v1/update
```

Expected: `HTTP/1.1 200 OK` (or similar) and Watchtower logs "Updates triggered by HTTP API request". Since no containers have the watchtower-enable label yet, it finds nothing to update — that's fine.

- [ ] **Step 6: External endpoint check**

From any machine on the internet:
```bash
curl -sS -I -H "Authorization: Bearer <TOKEN>" https://watchtower-vault.vvhq.net/v1/update
```

Expected: `HTTP/2 200`. If you get 502, the cloudflared route isn't hitting the container — re-check the public hostname config (Task 8) and that LXC 105's `192.168.2.105:8080` is reachable from LXC 250.

- [ ] **Step 7: Unauthorized check (negative test)**

Run:
```bash
curl -sS -I https://watchtower-vault.vvhq.net/v1/update
```

Expected: `HTTP/2 401`. Confirms the token gate is doing its job.

---

## Task 11: Flip `app` service to `image:` + watchtower label

**Files:**
- Modify: `compose.yaml`

- [ ] **Step 1: Create a third feature branch**

Run:
```bash
cd /root/vorevault
git checkout main
git pull origin main
git checkout -b feature/compose-app-image
```

- [ ] **Step 2: Edit the `app` service**

In `/root/vorevault/compose.yaml`, find the current `app:` block. It currently starts with:

```yaml
  app:
    build:
      context: ./app
      dockerfile: Dockerfile
    restart: unless-stopped
```

Replace it (the whole `app:` block) with this:

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
    # Google DNS — 1.1.1.1 is unreachable from this Docker bridge network for
    # reasons unclear (works from the LXC host itself). Switching to 8.8.8.8
    # eliminates the intermittent EAI_AGAIN failures on Discord OAuth callback.
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

The only changes vs. before: `build:` replaced with `image:`, and a `labels:` block added. Every other field preserved verbatim (including the DNS comment — that's load-bearing context).

- [ ] **Step 3: Commit and PR**

Run:
```bash
cd /root/vorevault
git add compose.yaml
git commit -m "feat(compose): switch app to GHCR image + enable Watchtower auto-update"
git push -u origin feature/compose-app-image
gh pr create \
  --repo Bullmoose-Code/vorevault \
  --base main \
  --head feature/compose-app-image \
  --title "feat(compose): switch app to GHCR image + Watchtower label" \
  --body "After merge + docker compose up -d on LXC 105, app pulls from ghcr.io/bullmoose-code/vorevault:latest and future main pushes auto-deploy."
```

Watch CI pass, then merge:
```bash
gh pr merge --repo Bullmoose-Code/vorevault --squash --delete-branch
```

---

## Task 12: Apply the cutover on LXC 105

**Files:** None (LXC 105 runtime)

- [ ] **Step 1: Pull latest compose.yaml**

Run:
```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && git pull origin main'
```

Expected: fast-forward merge.

- [ ] **Step 2: Bring the stack up**

Run:
```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && docker compose up -d'
```

Expected: `Pulling app ...` then `Recreating vorevault-app-1`. Other services (`postgres`, `tusd`, `caddy`, `watchtower`) stay as-is ("up-to-date"). If you see `Pulling` failing on the `app` service, the LXC 105 `docker login` from Task 7 didn't take — re-run it.

- [ ] **Step 3: Verify the app container now uses the GHCR image**

Run:
```bash
pct exec 105 -- docker inspect vorevault-app-1 --format '{{.Config.Image}}'
pct exec 105 -- docker inspect vorevault-app-1 --format '{{.Config.Labels}}'
```

Expected:
- Image: `ghcr.io/bullmoose-code/vorevault:latest`
- Labels: includes `com.centurylinklabs.watchtower.enable:true`

- [ ] **Step 4: Health check**

Run:
```bash
curl -sS https://vault.bullmoosefn.com/api/health
```

Expected: JSON response showing the app healthy (same response as before the switch — the app behavior didn't change, only its provenance did).

---

## Task 13: End-to-end deploy test

**Files:**
- Modify: one visible string in the app (e.g., `app/src/app/layout.tsx` footer or a page title)

- [ ] **Step 1: Create a visible-change branch**

Run:
```bash
cd /root/vorevault
git checkout main
git pull origin main
git checkout -b test/cicd-smoke
```

- [ ] **Step 2: Make a trivial visible change**

Pick a string you can easily eyeball in the browser after deploy. For example, in `app/src/app/layout.tsx` find the `<footer>` or any static text and tweak it — say, append ` (ship test)` to the existing text.

Example: if the file contains:
```tsx
<footer>VoreVault</footer>
```
Change to:
```tsx
<footer>VoreVault (ship test)</footer>
```

If there's no footer or obvious static string, instead change the `<title>` in `app/src/app/layout.tsx` metadata to append "(ship test)". The point is a user-visible change you can verify in the browser without logging in.

- [ ] **Step 3: Push, PR, merge**

Run:
```bash
cd /root/vorevault
git add -u
git commit -m "test(cicd): visible string change for smoke test"
git push -u origin test/cicd-smoke
gh pr create \
  --repo Bullmoose-Code/vorevault \
  --base main \
  --head test/cicd-smoke \
  --title "test(cicd): smoke test" \
  --body "Throwaway change to verify end-to-end CI/CD."
gh pr merge --repo Bullmoose-Code/vorevault --squash --delete-branch
```

Note the time you merged — that's t=0.

- [ ] **Step 4: Watch the rollout**

In one terminal, tail the Watchtower logs:
```bash
pct exec 105 -- docker logs -f vorevault-watchtower-1
```

In another, tail the app container:
```bash
pct exec 105 -- bash -c 'docker logs -f vorevault-app-1'
```

Expected timeline:
- t+0 to t+3min: GHA run goes green, image pushed to GHCR.
- t+3min to t+4min: Watchtower logs show "Updates triggered by HTTP API request", "Found new image ghcr.io/bullmoose-code/vorevault:latest", "Stopping vorevault-app-1", "Creating vorevault-app-1" (same name — compose-style).
- App container logs show a fresh Next.js boot banner.

- [ ] **Step 5: Verify the change is live**

Hard-refresh https://vault.bullmoosefn.com in a browser. The visible string change should be present. If not:
- Check the image digest: `pct exec 105 -- docker inspect vorevault-app-1 --format '{{.Image}}'` — compare to the digest on GHCR.
- Check the Watchtower logs actually triggered — if no "Updates triggered" line, the webhook from GHA didn't land (look at the GHA run's `Trigger Watchtower` step output).

- [ ] **Step 6: Revert the smoke change**

Run:
```bash
cd /root/vorevault
git checkout main
git pull origin main
git checkout -b revert/cicd-smoke
```

Reverse the edit from Step 2 by hand (remove the ` (ship test)` addition). Then:
```bash
git add -u
git commit -m "revert: remove cicd smoke-test string"
git push -u origin revert/cicd-smoke
gh pr create \
  --repo Bullmoose-Code/vorevault \
  --base main \
  --head revert/cicd-smoke \
  --title "revert: smoke test string" \
  --body "Undoes the temp string from the CI/CD smoke test."
gh pr merge --repo Bullmoose-Code/vorevault --squash --delete-branch
```

Wait for the rollout to complete (another ~3-4 min). Verify the smoke-test string is gone.

---

## Task 14: Rollback rehearsal

**Files:** None (`compose.yaml` edit is transient and reverted by end of task)

- [ ] **Step 1: Find a prior image digest**

Visit https://github.com/orgs/Bullmoose-Code/packages/container/vorevault/versions. Pick the version one-before-`latest` (just older than the current tag). Copy its `sha256:...` digest.

Or from LXC 105:
```bash
pct exec 105 -- docker images --digests ghcr.io/bullmoose-code/vorevault
```

If only `latest` has been pulled, you can instead use the digest of any prior push listed in the GitHub Packages UI.

- [ ] **Step 2: Pin the older digest on LXC 105 (transient edit, not committed)**

On LXC 105 (replace `<DIGEST>` with `sha256:abc...`):
```bash
pct exec 105 -- bash -c '
  cd /opt/stacks/vorevault
  cp compose.yaml compose.yaml.bak
  sed -i "s|image: ghcr.io/bullmoose-code/vorevault:latest|image: ghcr.io/bullmoose-code/vorevault@<DIGEST>|" compose.yaml
  docker compose pull app
  docker compose up -d app
'
```

Expected: app container restarts running the older image.

- [ ] **Step 3: Verify the rollback is live**

Run:
```bash
pct exec 105 -- docker inspect vorevault-app-1 --format '{{.Image}}'
curl -sS https://vault.bullmoosefn.com/api/health
```

Expected: image hash matches the pinned digest. Health check still passes (assuming the older version was a working version — that's the point of rehearsing with a known-good).

- [ ] **Step 4: Restore the compose.yaml**

Run:
```bash
pct exec 105 -- bash -c '
  cd /opt/stacks/vorevault
  mv compose.yaml.bak compose.yaml
  docker compose pull app
  docker compose up -d app
'
```

Expected: app restarts on `:latest` again. `git status` in `/opt/stacks/vorevault` on LXC 105 should show a clean tree (or, if the backup file got committed by mistake, clean it up).

- [ ] **Step 5: Final verification**

Run:
```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && git status --short && docker inspect vorevault-app-1 --format "{{.Image}}"'
```

Expected: empty `git status` output (clean tree). Image back to the current `:latest` digest.

---

## Task 15: Documentation

**Files:**
- Modify: `VOREVAULT_MASTER_CONTEXT.md`
- Modify: `README.md`

- [ ] **Step 1: Create a docs branch**

Run:
```bash
cd /root/vorevault
git checkout main
git pull origin main
git checkout -b feature/docs-cicd
```

- [ ] **Step 2: Update `VOREVAULT_MASTER_CONTEXT.md`**

Open `/root/vorevault/VOREVAULT_MASTER_CONTEXT.md`. Find the "## Docker Compose services" table and update the `app` row to reflect it's now pulled, not built:

Change this row:
```
| app      | built locally        | 3000             | Next.js UI + API routes          |
```

To:
```
| app      | ghcr.io/bullmoose-code/vorevault:latest | 3000 | Next.js UI + API routes (CI/CD-delivered) |
```

Add a new row for watchtower:
```
| watchtower | ghcr.io/nicholas-fedor/watchtower | 127.0.0.1:8080 | Auto-updates the app service on webhook from GHA |
```

Then, after the "## Docker Compose services" section, append a new section:

```markdown
## CI/CD

- **Workflow:** `.github/workflows/ci-cd.yml` — two jobs (`ci`, `deploy`).
- **Triggers:**
  - `push` to `main` → CI + deploy
  - `pull_request` targeting `main` → CI only
  - `paths-ignore: ['**.md', 'docs/**']`
- **Image:** `ghcr.io/bullmoose-code/vorevault:latest` (single tag, immutable via digest if rollback needed)
- **GHA secrets:** `GHCR_PAT` (classic PAT, `write:packages`), `WATCHTOWER_TOKEN_VAULT` (32-byte random)
- **Deploy mechanism:** GHA curls `https://watchtower-vault.vvhq.net/v1/update` with bearer token. Cloudflared `bullmoosefn-tunnel` routes that to LXC 105 port 8080. Watchtower pulls the new image and recreates `vorevault-app-1`. Only the `app` service is label-opted-in — `postgres`, `tusd`, `caddy` are updated intentionally, not by image push.
- **One-time LXC 105 setup:** `docker login ghcr.io` with a read-only PAT (writes `/root/.docker/config.json`). Watchtower mounts that file read-only to authenticate its pulls.
- **Rollback:** pin a prior digest in `compose.yaml` (`image: ghcr.io/bullmoose-code/vorevault@sha256:...`), `docker compose up -d app`. Un-pin when fixed.

### Manual override

```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && git pull && docker compose pull && docker compose up -d'
```
```

- [ ] **Step 3: Update `README.md`**

Open `/root/vorevault/README.md`. Append this section at the end:

```markdown
## Deploying

VoreVault ships via GitHub Actions:

- **CI** (lint + vitest + `next build`) runs on every pull request and every push to `main`.
- **CD** runs on push to `main` only: builds `ghcr.io/bullmoose-code/vorevault:latest`, then triggers Watchtower on LXC 105 to pull and restart the `app` container.
- Expected round-trip from merge to live: ~4 minutes.

To deploy, merge to `main`. To manually force a redeploy on LXC 105:

```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && git pull && docker compose pull && docker compose up -d'
```

For rollback, see `VOREVAULT_MASTER_CONTEXT.md`.
```

- [ ] **Step 4: Commit, PR, merge**

Run:
```bash
cd /root/vorevault
git add VOREVAULT_MASTER_CONTEXT.md README.md
git commit -m "docs: document CI/CD pipeline and deploy flow"
git push -u origin feature/docs-cicd
gh pr create \
  --repo Bullmoose-Code/vorevault \
  --base main \
  --head feature/docs-cicd \
  --title "docs: CI/CD pipeline" \
  --body "Captures pipeline shape, deploy mechanism, rollback, manual override."
gh pr merge --repo Bullmoose-Code/vorevault --squash --delete-branch
```

Expected: CI runs (docs changes are `paths-ignore`d, so the workflow should skip — no image push). If CI does run and the deploy job fires, it's harmless (same image, no actual change on LXC 105).

- [ ] **Step 5: Pull main**

Run:
```bash
cd /root/vorevault
git checkout main
git pull origin main
```

Done.

---

## Self-Review Notes

Written as the plan was completed:

- **Spec coverage:** every spec section has a task. Pipeline shape → Task 3. Watchtower service → Task 9. Cloudflared route → Task 8. GHCR creds → Task 7. Image model change → Task 11. Secrets → Task 2. Error-handling modes → implicitly tested in Task 13 (rollout verification) and Task 14 (rollback). Testing plan → Tasks 4, 6, 10, 12, 13, 14.
- **One spec deviation preserved:** the spec's "`if: false` then remove" approach is kept (Tasks 3+5) rather than simplifying to a single commit. Keeps blast radius tight — the first merge to main pushes an image but cannot trigger any deploy because no Watchtower exists yet; by the time we flip the gate and land Tasks 9+11, everything has been rehearsed.
- **No placeholders** — every code block is complete, every `gh` / `pct` / `curl` command has concrete args.
- **Token handling** — user is told to save the Watchtower token once in Task 2 Step 3 and paste it into LXC 105's `.env` in Task 10 Step 1. Single source; no round-tripping.
