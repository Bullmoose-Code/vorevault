# Plan 1 — VoreVault Infra Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the VoreVault infrastructure skeleton — LXC 105 on Proxmox running a Docker Compose stack (empty Next.js + Postgres + Caddy), reachable at `https://vault.bullmoosefn.com` through the existing Cloudflared tunnel, with a working `/api/health` endpoint and all three project docs committed. End state: a placeholder site with no features yet, but the full deploy pipeline is live.

**Architecture:** New unprivileged Debian 12 LXC (VMID 105) on `pve`, with `/data` bind-mounted from a host ZFS dataset. Docker Compose stack: Next.js `app`, `postgres` 16, `caddy` reverse proxy. Cloudflared LXC 250 adds ingress rule `vault.bullmoosefn.com → http://192.168.2.105:80`. Repo pushed to `Bullmoose-Code/vorevault` on GitHub.

**Tech Stack:** Next.js 15 (App Router) + TypeScript strict, Postgres 16, Caddy 2, Docker + Compose, Vitest for tests, Debian 12 LXC, Proxmox MCP for provisioning.

---

## File Structure (created by this plan)

Repo root `vorevault/`:

```
vorevault/
├── .env.example                 # Documents every env var
├── .gitignore
├── CLAUDE.md                    # Claude Code instructions for this repo
├── DESIGN.md                    # North-star design principles
├── VOREVAULT_MASTER_CONTEXT.md  # Living ground-truth doc
├── README.md                    # One-pager: what this is + quickstart
├── compose.yaml                 # Docker Compose stack
├── Caddyfile                    # Internal reverse proxy config
├── app/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx       # Root layout (placeholder)
│   │   │   ├── page.tsx         # Placeholder landing page
│   │   │   └── api/
│   │   │       └── health/
│   │   │           ├── route.ts           # GET /api/health
│   │   │           └── route.test.ts      # Vitest integration test
│   │   └── lib/
│   │       └── db.ts            # Postgres client (pg Pool) used by /health
│   └── tests/
│       └── setup.ts
├── db/
│   └── init/
│       └── 00-schema.sql        # Empty-for-now init (just CREATE EXTENSION pgcrypto)
└── docs/
    └── superpowers/
        ├── specs/2026-04-15-vorevault-design.md  # already exists
        └── plans/2026-04-15-plan-1-infra-foundation.md  # this file
```

Each file's responsibility:
- `compose.yaml` — stack orchestration only; no app logic
- `Caddyfile` — routes LXC port 80 → `app:3000`; adds security headers
- `app/src/app/api/health/route.ts` — verifies DB reachability + returns JSON; the *only* real feature this plan ships
- `app/src/lib/db.ts` — minimal Pool export, shared by future routes
- Three doc files — product/ops/agent context

---

## Task 1: Verify Proxmox prerequisites

**Files:** none (verification only)

- [ ] **Step 1: Confirm available VMID and storage pool**

Run:
```bash
pvesh get /cluster/nextid
pvesm status
```
Expected: next VMID returned (should be `105` or higher — if 105 is taken, use next free and update this plan's references); storage list shows at least one ZFS or LVM-thin pool (commonly `local-zfs` or `local-lvm`). **Record the pool name used by other LXCs** (e.g. check LXC 100/104 config: `pct config 100 | grep rootfs`).

- [ ] **Step 2: Confirm Debian 12 template available**

Run:
```bash
pveam list local | grep debian-12
```
Expected: at least one `debian-12-standard_*.tar.zst` line. If absent:
```bash
pveam update && pveam download local debian-12-standard_12.7-1_amd64.tar.zst
```

- [ ] **Step 3: Identify host dataset for `/data` bind mount**

Run:
```bash
zfs list
```
Expected: a pool with enough free space for 2 TB growth. Pick a dataset (e.g. `rpool/data/vorevault`). Create it:
```bash
zfs create rpool/data/vorevault
chmod 0770 /rpool/data/vorevault
```
Adjust pool name to whatever exists. If the node uses LVM-thin instead of ZFS, create `/srv/vorevault` on a suitable LV. **Record the chosen host path** — call it `$HOST_DATA` below.

- [ ] **Step 4: Confirm Tdarr LXC 104 is running and its current bind mounts**

Run:
```bash
pct config 104 | grep -E '^(mp|rootfs)'
```
Record existing mount points; we'll add `/data` alongside them in a later task.

---

## Task 2: Create LXC 105

**Files:** none (infra)

- [ ] **Step 1: Create unprivileged LXC 105**

Run (substituting `$POOL` with the storage pool from Task 1 and `$TEMPLATE` with the exact template filename):
```bash
pct create 105 local:vztmpl/$TEMPLATE \
  --hostname vorevault \
  --cores 2 \
  --memory 4096 \
  --swap 512 \
  --rootfs $POOL:20 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.2.105/24,gw=192.168.2.1 \
  --nameserver 192.168.2.1 \
  --onboot 1 \
  --unprivileged 1 \
  --features nesting=1,keyctl=1 \
  --ostype debian
```
Expected: `extracting archive ... Container 105 created`. `nesting=1` and `keyctl=1` are required for Docker inside unprivileged LXC.

- [ ] **Step 2: Add `/data` bind mount to LXC 105**

Run:
```bash
pct set 105 -mp0 $HOST_DATA,mp=/data
```
Expected: no output, exit 0. Verify:
```bash
pct config 105 | grep mp0
```

- [ ] **Step 3: Add same bind mount to LXC 104 (Tdarr)**

Run:
```bash
pct set 104 -mpN $HOST_DATA,mp=/data
```
Where `N` is the next free mount index (check Task 1 Step 4 output). Expected: no output.

- [ ] **Step 4: Start LXC 105**

Run:
```bash
pct start 105 && sleep 3 && pct status 105
```
Expected: `status: running`.

- [ ] **Step 5: Verify network**

Run:
```bash
pct exec 105 -- ping -c 2 1.1.1.1
```
Expected: 2 packets received.

- [ ] **Step 6: Restart LXC 104 to pick up new mount**

Run:
```bash
pct restart 104 && sleep 5 && pct exec 104 -- ls /data
```
Expected: empty listing (dataset is empty), no error.

- [ ] **Step 7: Commit infra state to ops notes**

No git commit yet (repo doesn't exist). Record in a scratch note (for the Task 12/13 docs):
- LXC 105 VMID, IP 192.168.2.105, hostname `vorevault`
- Host dataset path chosen
- LXC 104 mount index used

---

## Task 3: Install Docker + Compose in LXC 105

**Files:** none

- [ ] **Step 1: Update apt and install prerequisites**

Run:
```bash
pct exec 105 -- bash -c 'apt-get update && apt-get install -y ca-certificates curl gnupg git vim'
```
Expected: exit 0.

- [ ] **Step 2: Install Docker via official repo**

Run:
```bash
pct exec 105 -- bash -c '
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
'
```
Expected: docker packages installed.

- [ ] **Step 3: Verify Docker works in unprivileged LXC**

Run:
```bash
pct exec 105 -- docker run --rm hello-world
```
Expected: "Hello from Docker!" output. If this fails with cgroup errors, confirm `features nesting=1,keyctl=1` is set in the LXC config and restart the LXC.

- [ ] **Step 4: Create app directory**

Run:
```bash
pct exec 105 -- mkdir -p /opt/stacks/vorevault
```

---

## Task 4: Scaffold repo locally and on GitHub

**Files:**
- Create: `/root/vorevault/.gitignore`
- Create: `/root/vorevault/README.md`

- [ ] **Step 1: Initialize git in `/root/vorevault`**

Run:
```bash
cd /root/vorevault && git init -b main
```

- [ ] **Step 2: Write `.gitignore`**

Create `/root/vorevault/.gitignore`:
```gitignore
# deps
node_modules/
.pnp
.pnp.*

# build
.next/
out/
dist/

# env / secrets
.env
.env.local
.env.*.local

# logs
*.log
npm-debug.log*

# editor / OS
.DS_Store
.vscode/
.idea/

# docker volumes (local dev)
pgdata/

# test output
coverage/
```

- [ ] **Step 3: Write minimal `README.md`**

Create `/root/vorevault/README.md`:
```markdown
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
```

- [ ] **Step 4: First commit**

```bash
cd /root/vorevault && git add .gitignore README.md docs/
git commit -m "chore: initial repo with design spec"
```

- [ ] **Step 5: Create GitHub repo in Bullmoose-Code org and push**

```bash
gh repo create Bullmoose-Code/vorevault --private --source=/root/vorevault --remote=origin --push
```
Expected: repo created, push succeeds. If `gh` is not authenticated as a user with access to Bullmoose-Code, run `gh auth login` first.

---

## Task 5: Scaffold Next.js app

**Files:**
- Create: `/root/vorevault/app/package.json`
- Create: `/root/vorevault/app/tsconfig.json`
- Create: `/root/vorevault/app/next.config.ts`
- Create: `/root/vorevault/app/src/app/layout.tsx`
- Create: `/root/vorevault/app/src/app/page.tsx`

- [ ] **Step 1: Create `app/package.json`**

```json
{
  "name": "vorevault",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "15.0.3",
    "pg": "8.13.1",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "@types/node": "22.9.0",
    "@types/pg": "8.11.10",
    "@types/react": "19.0.0",
    "@types/react-dom": "19.0.0",
    "typescript": "5.6.3",
    "vitest": "2.1.5"
  }
}
```

- [ ] **Step 2: Create `app/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": "./src",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `app/next.config.ts`**

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
};

export default config;
```

- [ ] **Step 4: Create `app/src/app/layout.tsx`**

```tsx
export const metadata = {
  title: "VoreVault",
  description: "Bullmoose clip vault",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Create `app/src/app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>VoreVault</h1>
      <p>Placeholder — features coming. See /api/health.</p>
    </main>
  );
}
```

- [ ] **Step 6: Install deps locally (smoke check)**

```bash
cd /root/vorevault/app && npm install
```
Expected: installs without errors. (We won't run `next build` locally on `pve` — that happens in Docker.)

- [ ] **Step 7: Commit**

```bash
cd /root/vorevault && git add app/
git commit -m "feat: scaffold Next.js app skeleton"
```

---

## Task 6: Write `/api/health` route (TDD)

**Files:**
- Create: `/root/vorevault/app/vitest.config.ts`
- Create: `/root/vorevault/app/tests/setup.ts`
- Create: `/root/vorevault/app/src/lib/db.ts`
- Create: `/root/vorevault/app/src/app/api/health/route.ts`
- Test: `/root/vorevault/app/src/app/api/health/route.test.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 2: Create `tests/setup.ts`**

```ts
// Placeholder: global test hooks go here in later plans.
export {};
```

- [ ] **Step 3: Write failing test at `src/app/api/health/route.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  pool: { query: vi.fn() },
}));

import { GET } from "./route";
import { pool } from "@/lib/db";

describe("GET /api/health", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 and status ok when DB is reachable", async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("up");
  });

  it("returns 503 and status degraded when DB is unreachable", async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("down");
  });
});
```

- [ ] **Step 4: Run the test — expect failure**

```bash
cd /root/vorevault/app && npm test
```
Expected: fails because `./route` does not exist / `@/lib/db` does not exist.

- [ ] **Step 5: Create `src/lib/db.ts`**

```ts
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({ connectionString, max: 10 });
```

- [ ] **Step 6: Create `src/app/api/health/route.ts`**

```ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await pool.query("SELECT 1 AS ok");
    return NextResponse.json({ status: "ok", db: "up" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
```

- [ ] **Step 7: Run the test — expect PASS**

The test mocks `@/lib/db`, so DATABASE_URL is not required at test time. If vitest complains that the real `db.ts` throws on import in other contexts, add a test-env guard later. For this test, the mock wins.

```bash
cd /root/vorevault/app && npm test
```
Expected: 2 passed.

- [ ] **Step 8: Commit**

```bash
cd /root/vorevault && git add app/
git commit -m "feat(health): add /api/health with DB ping"
```

---

## Task 7: Docker image for the app

**Files:**
- Create: `/root/vorevault/app/Dockerfile`
- Create: `/root/vorevault/app/.dockerignore`

- [ ] **Step 1: Create `app/.dockerignore`**

```
node_modules
.next
npm-debug.log
tests
.env*
```

- [ ] **Step 2: Create `app/Dockerfile` (multi-stage)**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Generate `package-lock.json` and commit everything**

```bash
cd /root/vorevault/app && npm install --package-lock-only
cd /root/vorevault && git add app/
git commit -m "build: add Dockerfile for app"
```

---

## Task 8: Compose stack + Caddy + Postgres init

**Files:**
- Create: `/root/vorevault/compose.yaml`
- Create: `/root/vorevault/Caddyfile`
- Create: `/root/vorevault/db/init/00-schema.sql`
- Create: `/root/vorevault/.env.example`

- [ ] **Step 1: Create `compose.yaml`**

```yaml
services:
  app:
    build:
      context: ./app
      dockerfile: Dockerfile
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      NODE_ENV: production
    depends_on:
      postgres:
        condition: service_healthy
    networks: [internal]

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - ./pgdata:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 20
    networks: [internal]

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app
    networks: [internal]

networks:
  internal:

volumes:
  caddy_data:
  caddy_config:
```

- [ ] **Step 2: Create `Caddyfile`**

```
:80 {
    encode zstd gzip

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }

    reverse_proxy app:3000
}
```

- [ ] **Step 3: Create `db/init/00-schema.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Real tables added in Plan 2.
```

- [ ] **Step 4: Create `.env.example`**

```dotenv
# Postgres
POSTGRES_USER=vorevault
POSTGRES_PASSWORD=change-me-to-a-long-random-string
POSTGRES_DB=vorevault

# Discord OAuth (populated in Plan 2)
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_GUILD_ID=
DISCORD_REQUIRED_ROLE_ID=
DISCORD_REDIRECT_URI=https://vault.bullmoosefn.com/api/auth/discord/callback

# Session
SESSION_SECRET=change-me-32-bytes-base64

# App
APP_PUBLIC_URL=https://vault.bullmoosefn.com
```

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault && git add compose.yaml Caddyfile db/ .env.example
git commit -m "feat: compose stack with app, postgres, caddy"
```

---

## Task 9: Deploy stack to LXC 105

**Files:** none (remote ops)

- [ ] **Step 1: Push latest commits**

```bash
cd /root/vorevault && git push origin main
```

- [ ] **Step 2: Clone repo into LXC 105**

```bash
pct exec 105 -- bash -c 'cd /opt/stacks && git clone https://github.com/Bullmoose-Code/vorevault.git vorevault-tmp && mv vorevault-tmp/* vorevault-tmp/.[!.]* /opt/stacks/vorevault/ 2>/dev/null; rmdir vorevault-tmp'
```
(Using a temp dir because `/opt/stacks/vorevault` was pre-created in Task 3.) If the repo is private, set up a deploy key or use `gh auth login` inside the LXC — document whichever you used in `VOREVAULT_MASTER_CONTEXT.md`.

- [ ] **Step 3: Create `.env`**

```bash
pct exec 105 -- bash -c '
cd /opt/stacks/vorevault
cp .env.example .env
sed -i "s|change-me-to-a-long-random-string|$(openssl rand -base64 32)|" .env
sed -i "s|change-me-32-bytes-base64|$(openssl rand -base64 32)|" .env
chmod 600 .env
'
```

- [ ] **Step 4: Build and start stack**

```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && docker compose up -d --build'
```
Expected: three services `Started`. Watch logs if anything fails:
```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && docker compose logs --tail=100'
```

- [ ] **Step 5: Smoke test from host**

```bash
curl -s http://192.168.2.105/api/health | jq .
```
Expected: `{ "status": "ok", "db": "up" }`.

- [ ] **Step 6: Smoke test landing page**

```bash
curl -s http://192.168.2.105/ | head
```
Expected: HTML containing "VoreVault".

---

## Task 10: Cloudflared ingress

**Files:** LXC 250 config only

- [ ] **Step 1: Inspect current cloudflared config**

```bash
pct exec 250 -- cat /etc/cloudflared/config.yml
```
Record the tunnel ID, credentials file path, and existing `ingress:` entries. If cloudflared is configured differently on this host (e.g. runs as a systemd service with a different path), adapt paths accordingly.

- [ ] **Step 2: Add `vault.bullmoosefn.com` ingress rule**

Add this entry to the `ingress:` list *before* the final `- service: http_status:404` catch-all:
```yaml
  - hostname: vault.bullmoosefn.com
    service: http://192.168.2.105:80
```

- [ ] **Step 3: Validate and restart cloudflared**

```bash
pct exec 250 -- cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
pct exec 250 -- systemctl restart cloudflared
pct exec 250 -- systemctl status cloudflared --no-pager | head -20
```
Expected: validation OK; service active.

- [ ] **Step 4: Create DNS route in Cloudflare**

Two options:
- `cloudflared tunnel route dns <tunnel-name-or-id> vault.bullmoosefn.com` inside LXC 250 (auto-creates the CNAME), OR
- Manually create CNAME `vault` → `<tunnel-id>.cfargotunnel.com` (proxied) in Cloudflare dashboard.

- [ ] **Step 5: Verify external access**

From your workstation (or Bash on `pve` with DNS available):
```bash
curl -s https://vault.bullmoosefn.com/api/health
```
Expected: `{"status":"ok","db":"up"}`.

---

## Task 11: Write `DESIGN.md`

**Files:**
- Create: `/root/vorevault/DESIGN.md`

- [ ] **Step 1: Create `DESIGN.md`**

```markdown
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
- LXC 105 on Proxmox `pve`, Docker Compose stack: Next.js app, Postgres, tusd, Caddy.
- `/data` bind-mounted from host ZFS dataset, shared with Tdarr LXC 104 for in-place transcoding.
- Cloudflared tunnel (LXC 250) terminates public TLS at `vault.bullmoosefn.com`.

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
```

- [ ] **Step 2: Commit**

```bash
cd /root/vorevault && git add DESIGN.md && git commit -m "docs: add DESIGN.md north star"
```

---

## Task 12: Write `VOREVAULT_MASTER_CONTEXT.md`

**Files:**
- Create: `/root/vorevault/VOREVAULT_MASTER_CONTEXT.md`

- [ ] **Step 1: Create file (fill in real values from Tasks 1-10 as you write it)**

```markdown
# VoreVault — Master Context (Living Ground Truth)

Update this file whenever reality changes. If it's out of date, fix it immediately.

## Current state
- **Version:** 0.1.0 (Plan 1 — infra foundation)
- **Last deploy:** 2026-04-15
- **Status:** Placeholder site live; no features yet.

## Infrastructure

### LXC 105 (VoreVault host)
- **VMID:** 105
- **Hostname:** `vorevault`
- **IP:** 192.168.2.105
- **OS:** Debian 12 (unprivileged LXC, nesting=1, keyctl=1)
- **Resources:** 2 CPU / 4 GB RAM / 20 GB root
- **Storage bind mount:** `<HOST_DATA_PATH>` → `/data` (ZFS dataset `<pool>/data/vorevault`)
- **App dir:** `/opt/stacks/vorevault`

### LXC 104 (Tdarr) — Plan 1 changes
- Added same `/data` bind mount (mount index `mpN` — record exact N used).

### LXC 250 (Cloudflared) — Plan 1 changes
- Added ingress rule: `vault.bullmoosefn.com` → `http://192.168.2.105:80`.

## Public endpoint
- **URL:** https://vault.bullmoosefn.com
- **DNS:** CNAME `vault` on `bullmoosefn.com` → Cloudflare tunnel
- **TLS:** terminated at Cloudflare edge

## Docker Compose services (LXC 105)
| Service  | Image            | Ports (internal) | Purpose                          |
|----------|------------------|------------------|----------------------------------|
| app      | built locally    | 3000             | Next.js UI + API routes          |
| postgres | postgres:16-alpine | 5432           | Primary DB                       |
| caddy    | caddy:2-alpine   | 80 (exposed)     | Reverse proxy, security headers  |

## Environment variables (`.env` at `/opt/stacks/vorevault/.env`)
See `.env.example` in repo for the full list with descriptions. Never commit real values.

## External IDs
- **GitHub repo:** `Bullmoose-Code/vorevault`
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

# Pull + rebuild
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && git pull && docker compose up -d --build'

# DB shell
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && docker compose exec postgres psql -U vorevault -d vorevault'

# Health
curl -s https://vault.bullmoosefn.com/api/health
```

## Backups
- *TBD in Plan 7 — Postgres nightly pg_dump + LXC 105 Proxmox backup job.*

## Known issues / workarounds
- *(none yet)*

## Adding a new friend
- *TBD in Plan 2 once auth is live — will be "add them to Bullmoose Discord + grant the VoreVault role".*
```

- [ ] **Step 2: Commit**

```bash
cd /root/vorevault && git add VOREVAULT_MASTER_CONTEXT.md
git commit -m "docs: add master context runbook"
```

---

## Task 13: Write `CLAUDE.md`

**Files:**
- Create: `/root/vorevault/CLAUDE.md`

- [ ] **Step 1: Create file**

```markdown
# CLAUDE.md — Agent Instructions for VoreVault

You are working on VoreVault, a Discord-gated file/clip sharing app for the Bullmoose group. Before doing anything non-trivial, **read `DESIGN.md` (principles) and `VOREVAULT_MASTER_CONTEXT.md` (current state)**. The design spec at `docs/superpowers/specs/2026-04-15-vorevault-design.md` is the source of truth for architecture.

## Project layout
```
vorevault/
├── app/                  # Next.js 15 (App Router), TypeScript strict
│   ├── src/app/          # Routes (UI + API)
│   ├── src/lib/          # Shared modules (db, auth, files, ...)
│   └── src/app/**/*.test.ts  # Colocated Vitest tests
├── db/init/              # Postgres init SQL (runs once on first start)
├── compose.yaml          # Docker Compose stack
├── Caddyfile             # Internal reverse proxy
├── DESIGN.md             # North star — changes need discussion
└── VOREVAULT_MASTER_CONTEXT.md  # Living ops/infra state — keep current
```

## Tech stack & conventions
- **Next.js 15 App Router** + TypeScript `strict: true`. No `any`. No `// @ts-ignore` without a written reason.
- **Postgres 16** via `pg` Pool (`@/lib/db`). DB layer decision (Drizzle vs. Kysely vs. raw SQL) is TBD — current code uses raw parameterized queries.
- **Validation:** use `zod` at trust boundaries (API inputs, env parsing).
- **Styling:** TBD per Plan 4 (frontend). Not yet decided — do not unilaterally pick Tailwind/CSS-in-JS without asking.
- **File size rule:** split files that grow past ~400 lines or develop more than one responsibility.

## Testing rules (non-negotiable)
- **TDD by default.** Write a failing test, then the code. Use superpowers:test-driven-development skill.
- **Do not mock the database in integration tests.** Use testcontainers (Postgres) so tests exercise real SQL.
- Unit tests may mock `@/lib/db` for pure logic checks (see `api/health/route.test.ts`).
- Vitest is the runner; tests are colocated with source (`foo.ts` + `foo.test.ts`) except cross-cutting e2e.

## Security rules (non-negotiable)
- No auth bypasses "for testing" — use fixtures instead.
- Never log secrets or session tokens.
- Never serve user-uploaded files as `text/html` or `image/svg+xml` with `inline` disposition.
- On-disk filenames are UUIDs, never the original name.
- Detect MIME with `file --mime-type` (or equivalent library) on upload finish; do not trust client Content-Type.

## Workflow
- Work on feature branches; open PRs against `main`. No direct pushes to `main` except for docs.
- Never `git push --force` to `main` (warn the user if asked).
- Never `--no-verify` or `--no-gpg-sign` unless user explicitly asks.
- Frequent, small commits. Conventional Commits style (`feat:`, `fix:`, `chore:`, `docs:`).
- Before claiming work is done: run `npm test`, `npm run build`, and hit `/api/health`. Use superpowers:verification-before-completion.

## Skills to reach for
- **superpowers:test-driven-development** — default for all feature work
- **superpowers:writing-plans / executing-plans / subagent-driven-development** — when kicking off multi-task work
- **superpowers:systematic-debugging** — on any bug, test failure, or "weird" behavior
- **superpowers:verification-before-completion** — before every commit/PR/deploy
- **frontend-design** — when building UI (Plans 2+) to avoid generic AI aesthetics
- **superpowers:using-git-worktrees** — for parallel/isolated feature work

## Forbidden without explicit approval
- Adding new major dependencies (frameworks, ORMs, UI libs)
- Refactoring unrelated to the current task
- Changing `DESIGN.md` principles
- Introducing S3, Redis, Kubernetes, or other infra the spec explicitly rejects
- Adding CI/CD (until user asks — MVP uses `git pull && docker compose up -d --build`)

## If you're unsure
Ask. Small clarifying questions beat big wrong PRs.
```

- [ ] **Step 2: Commit and push**

```bash
cd /root/vorevault && git add CLAUDE.md
git commit -m "docs: add CLAUDE.md agent instructions"
git push origin main
```

---

## Task 14: End-to-end verification

**Files:** none — verification only

- [ ] **Step 1: Pull latest on LXC 105 (picks up doc commits — optional but clean)**

```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && git pull'
```

- [ ] **Step 2: Verify stack is healthy**

```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && docker compose ps'
```
Expected: all three services `Up`/`healthy`.

- [ ] **Step 3: Verify public URL returns health JSON**

```bash
curl -sS https://vault.bullmoosefn.com/api/health | jq .
```
Expected: `{"status":"ok","db":"up"}`.

- [ ] **Step 4: Verify public URL returns landing page**

Open `https://vault.bullmoosefn.com/` in a browser. Expected: "VoreVault — Placeholder" page.

- [ ] **Step 5: Kill Postgres, confirm health reports degraded**

```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && docker compose stop postgres'
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" https://vault.bullmoosefn.com/api/health
```
Expected: `503`.

- [ ] **Step 6: Restart Postgres**

```bash
pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && docker compose start postgres'
sleep 5
curl -s https://vault.bullmoosefn.com/api/health | jq .
```
Expected: back to `{"status":"ok","db":"up"}`.

- [ ] **Step 7: Tag release**

```bash
cd /root/vorevault && git tag -a v0.1.0 -m "Plan 1 complete: infra foundation"
git push origin v0.1.0
```

---

## Completion criteria

✅ `https://vault.bullmoosefn.com/` returns a landing page
✅ `https://vault.bullmoosefn.com/api/health` returns `{"status":"ok","db":"up"}` when healthy and 503 when DB is down
✅ Repo `Bullmoose-Code/vorevault` contains `DESIGN.md`, `VOREVAULT_MASTER_CONTEXT.md`, `CLAUDE.md`, full compose stack, and Plan 1 + spec docs
✅ LXC 105 runs the stack; LXC 104 has `/data` mount; LXC 250 routes the hostname
✅ Vitest suite in `app/` passes (2 tests)
✅ Tag `v0.1.0` pushed

## Deferred to later plans
- Discord OAuth, role gating, sessions (Plan 2)
- tusd container, `files` table, upload UI (Plan 3)
- Grid, single-file view, streaming, delete (Plan 4)
- Public share links (Plan 5)
- Tdarr transcode integration + `NOTIFY` listener (Plan 6)
- Admin panel, rate limits, backups, Uptime Kuma wiring (Plan 7)
