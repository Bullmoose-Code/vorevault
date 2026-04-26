# Desktop Watcher — Sub-project A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundational layer of the desktop tray client: a Tauri app that signs in via Discord OAuth (vault-mediated localhost loopback), persists the session in the OS keychain, and reflects signed-in state in a system tray menu. Includes the small additive web-side endpoints needed to make the OAuth flow work without disrupting the existing browser flow.

**Architecture:** Two phases.
1. **Phase 1 — `vorevault` repo:** add a `parseDesktopState` helper (web-side), a `GET /api/auth/desktop-init` route, a single conditional branch in the existing `GET /api/auth/discord/callback`, and a small `GET /api/auth/me` route. Ships as one PR.
2. **Phase 2 — new `Bullmoose-Code/vorevault-desktop` repo:** Tauri 2.x scaffold + four Rust modules (`main.rs`, `tray.rs`, `auth.rs`, `keychain.rs`) + one static `success.html` + GitHub Actions CI matrix on Win + Mac. Tag `v0.1.0` when manual smoke test passes.

**Tech Stack:** Web side: Next.js 15, TypeScript strict, Vitest + testcontainers. Desktop side: Tauri 2.x, Rust 2021 edition, `keyring` 3, `tiny_http` 0.12, `reqwest` 0.12 (rustls-tls), `tauri-plugin-opener` 2.

---

## Spec

`docs/superpowers/specs/2026-04-25-desktop-watcher-subproject-a-design.md`. Read it for the full architecture rationale (OAuth flow detail, error matrix, scope decisions).

---

## File structure

### Phase 1 (in `vorevault` repo)

| Path | Status | Responsibility |
|---|---|---|
| `app/src/lib/desktop-state.ts` | **Create** | Pure helpers `formatDesktopState({port, csrf})` and `parseDesktopState(state)` |
| `app/src/lib/desktop-state.test.ts` | **Create** | Vitest unit tests for both helpers |
| `app/src/app/api/auth/desktop-init/route.ts` | **Create** | New OAuth init route for desktop clients |
| `app/src/app/api/auth/desktop-init/route.test.ts` | **Create** | Route tests for input validation + redirect shape |
| `app/src/app/api/auth/discord/callback/route.ts` | **Modify** | Add a single conditional branch for desktop state values |
| `app/src/app/api/auth/discord/callback/route.test.ts` | **Modify or create** | Add a desktop-branch test alongside existing browser-flow tests |
| `app/src/app/api/auth/me/route.ts` | **Create** | New endpoint that returns the current user or 401 |
| `app/src/app/api/auth/me/route.test.ts` | **Create** | Route tests |

### Phase 2 (new `Bullmoose-Code/vorevault-desktop` repo)

| Path | Status | Responsibility |
|---|---|---|
| `Cargo.toml` (workspace) | **Create** | Workspace root pointing at `src-tauri` |
| `src-tauri/Cargo.toml` | **Create** | Crate manifest + dependencies |
| `src-tauri/tauri.conf.json` | **Create** | Tauri bundle config: identifier, app name, no main window, tray plugin |
| `src-tauri/build.rs` | **Create** | Standard Tauri build script |
| `src-tauri/src/main.rs` | **Create** | Entry point — initializes tray, prevents exit on window close |
| `src-tauri/src/keychain.rs` | **Create** | `keyring` wrapper: `store`, `load`, `delete` |
| `src-tauri/src/auth.rs` | **Create** | `current_state`, `sign_in`, `sign_out` + URL building helper |
| `src-tauri/src/tray.rs` | **Create** | `install`, `refresh_menu`, worker-thread dispatch |
| `src-tauri/icons/tray.png` | **Create** | 22×22 black-on-transparent icon (template-mode for macOS) |
| `src-tauri/ui-callback/success.html` | **Create** | Static "you can close this tab" HTML, brand-styled inline |
| `.github/workflows/ci.yml` | **Create** | Build + test matrix on `windows-latest` and `macos-latest` |
| `README.md` | **Create** | Install / build / dev instructions |
| `LICENSE` | **Create** | MIT (same as `vorevault`'s implicit license — confirm with Ryan if different) |
| `.gitignore` | **Create** | `target/`, `.DS_Store`, etc. |

---

## Conventions to follow

### `vorevault` repo
- TypeScript strict, no `any`, no `@ts-ignore` without a written reason
- Vitest is the runner; tests are colocated (`foo.ts` + `foo.test.ts`)
- Route tests follow the pattern in `app/src/app/api/auth/discord/callback/route.test.ts` (if exists) or `app/src/app/api/health/route.test.ts` (mock `@/lib/db` and `@/lib/discord` for unit-style; testcontainers for integration)
- Conventional Commits (`feat:`, `test:`, `fix:`, `docs:`)
- Run `npm test` from `app/` before each commit
- Run `npm run build` from `app/` before opening the PR

### `vorevault-desktop` repo
- Rust 2021 edition, no `unsafe` unless documented why
- `cargo fmt` + `cargo clippy` clean before each commit
- Tests via `cargo test` (unit tests inline with `#[cfg(test)] mod tests {}`)
- Conventional Commits same as web repo
- Single workspace with one crate (`src-tauri/`); reserves room for a future helper crate if needed

---

# Phase 1: Web-side changes (in `vorevault` repo)

## Task 1: Branch + `parseDesktopState` helper + tests

**Files:**
- Create: `app/src/lib/desktop-state.ts`
- Create: `app/src/lib/desktop-state.test.ts`

- [ ] **Step 1: Create the feature branch**

```bash
cd /root/vorevault
git checkout main
git pull origin main
git checkout -b feat/desktop-auth-endpoints
```

- [ ] **Step 2: Create the helper stub**

Create `app/src/lib/desktop-state.ts`:

```ts
const PREFIX = "desktop:";

const PORT_RE = /^[0-9]+$/;
const CSRF_RE = /^[A-Za-z0-9_-]{20,64}$/;

export type DesktopState = { port: number; csrf: string };

export function formatDesktopState(s: DesktopState): string {
  return `${PREFIX}${s.port}:${s.csrf}`;
}

export function parseDesktopState(_state: string | null | undefined): DesktopState | null {
  // intentionally unimplemented — tests will drive the body
  throw new Error("not implemented");
}
```

- [ ] **Step 3: Write the failing tests**

Create `app/src/lib/desktop-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatDesktopState, parseDesktopState } from "./desktop-state";

const CSRF = "abcdef1234567890ABCDEF_-";

describe("formatDesktopState", () => {
  it("encodes port and csrf with the desktop: prefix", () => {
    expect(formatDesktopState({ port: 42876, csrf: CSRF })).toBe(`desktop:42876:${CSRF}`);
  });
});

describe("parseDesktopState", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseDesktopState(null)).toBeNull();
    expect(parseDesktopState(undefined)).toBeNull();
    expect(parseDesktopState("")).toBeNull();
  });

  it("returns null when prefix is wrong", () => {
    expect(parseDesktopState(`web:42876:${CSRF}`)).toBeNull();
    expect(parseDesktopState(`42876:${CSRF}`)).toBeNull();
  });

  it("returns null when there are not exactly 3 colon-separated segments", () => {
    expect(parseDesktopState("desktop:42876")).toBeNull();
    expect(parseDesktopState(`desktop:42876:${CSRF}:extra`)).toBeNull();
  });

  it("returns null when port is not an integer in [1024, 65535]", () => {
    expect(parseDesktopState(`desktop:abc:${CSRF}`)).toBeNull();
    expect(parseDesktopState(`desktop:1023:${CSRF}`)).toBeNull();
    expect(parseDesktopState(`desktop:65536:${CSRF}`)).toBeNull();
    expect(parseDesktopState(`desktop:0:${CSRF}`)).toBeNull();
    expect(parseDesktopState(`desktop:-1:${CSRF}`)).toBeNull();
    expect(parseDesktopState(`desktop:42876.5:${CSRF}`)).toBeNull();
  });

  it("returns null when csrf is too short, too long, or contains invalid characters", () => {
    expect(parseDesktopState("desktop:42876:short")).toBeNull(); // < 20 chars
    expect(parseDesktopState(`desktop:42876:${"a".repeat(65)}`)).toBeNull(); // > 64 chars
    expect(parseDesktopState("desktop:42876:has spaces 1234567890")).toBeNull();
    expect(parseDesktopState("desktop:42876:has=equals1234567890ab")).toBeNull();
  });

  it("returns the parsed state for valid input", () => {
    expect(parseDesktopState(`desktop:42876:${CSRF}`)).toEqual({
      port: 42876,
      csrf: CSRF,
    });
  });

  it("accepts port boundary values 1024 and 65535", () => {
    expect(parseDesktopState(`desktop:1024:${CSRF}`)).toEqual({ port: 1024, csrf: CSRF });
    expect(parseDesktopState(`desktop:65535:${CSRF}`)).toEqual({ port: 65535, csrf: CSRF });
  });
});
```

- [ ] **Step 4: Run the tests and confirm they fail**

```bash
cd /root/vorevault/app
npm test -- src/lib/desktop-state.test.ts
```

Expected: the `formatDesktopState` test passes (already implemented in the stub); the `parseDesktopState` tests all fail with `Error: not implemented`.

- [ ] **Step 5: Implement `parseDesktopState`**

Replace the stub function in `app/src/lib/desktop-state.ts`:

```ts
export function parseDesktopState(state: string | null | undefined): DesktopState | null {
  if (!state) return null;
  if (!state.startsWith(PREFIX)) return null;
  const rest = state.slice(PREFIX.length);
  const parts = rest.split(":");
  if (parts.length !== 2) return null;
  const [portStr, csrf] = parts;
  if (!PORT_RE.test(portStr)) return null;
  const port = parseInt(portStr, 10);
  if (port < 1024 || port > 65535) return null;
  if (!CSRF_RE.test(csrf)) return null;
  return { port, csrf };
}
```

- [ ] **Step 6: Run the tests and confirm all pass**

```bash
cd /root/vorevault/app
npm test -- src/lib/desktop-state.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
cd /root/vorevault
git add app/src/lib/desktop-state.ts app/src/lib/desktop-state.test.ts
git commit -m "feat(auth): desktop-state helper for OAuth flow encoding"
```

---

## Task 2: `GET /api/auth/desktop-init` route + tests

**Files:**
- Create: `app/src/app/api/auth/desktop-init/route.ts`
- Create: `app/src/app/api/auth/desktop-init/route.test.ts`

- [ ] **Step 1: Create the route file**

Create `app/src/app/api/auth/desktop-init/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/discord";
import { formatDesktopState, parseDesktopState } from "@/lib/desktop-state";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "vv_oauth_state";
const STATE_TTL_SEC = 600;

function badRequest(msg: string): NextResponse {
  return new NextResponse(msg, { status: 400 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const portStr = url.searchParams.get("port") ?? "";
  const csrf = url.searchParams.get("csrf") ?? "";

  // Reuse the same validation as parseDesktopState by formatting → parsing.
  // This guarantees desktop-init's accepted inputs are exactly what the
  // callback will later accept on the way back from Discord.
  const port = parseInt(portStr, 10);
  if (Number.isNaN(port)) return badRequest("invalid port");
  const candidate = formatDesktopState({ port, csrf });
  const parsed = parseDesktopState(candidate);
  if (!parsed) return badRequest("invalid port or csrf");

  const state = candidate;
  const res = NextResponse.redirect(buildAuthorizeUrl(state), { status: 307 });
  res.cookies.set({
    name: STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SEC,
  });
  return res;
}
```

- [ ] **Step 2: Create the test file**

Create `app/src/app/api/auth/desktop-init/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/discord", () => ({
  buildAuthorizeUrl: (state: string) =>
    `https://discord.com/oauth2/authorize?state=${encodeURIComponent(state)}`,
}));

beforeEach(() => {
  vi.resetModules();
});

const CSRF = "abcdef1234567890ABCDEF_-";

async function call(qs: string) {
  const { GET } = await import("./route");
  const req = new NextRequest(`https://vault.example.com/api/auth/desktop-init?${qs}`);
  return GET(req);
}

describe("GET /api/auth/desktop-init", () => {
  it("400s when port is missing", async () => {
    const r = await call(`csrf=${CSRF}`);
    expect(r.status).toBe(400);
  });

  it("400s when csrf is missing", async () => {
    const r = await call("port=42876");
    expect(r.status).toBe(400);
  });

  it("400s when port is below 1024", async () => {
    const r = await call(`port=1023&csrf=${CSRF}`);
    expect(r.status).toBe(400);
  });

  it("400s when port is above 65535", async () => {
    const r = await call(`port=65536&csrf=${CSRF}`);
    expect(r.status).toBe(400);
  });

  it("400s when csrf has invalid characters", async () => {
    const r = await call("port=42876&csrf=has spaces 1234567890");
    expect(r.status).toBe(400);
  });

  it("redirects to Discord with the desktop-formatted state", async () => {
    const r = await call(`port=42876&csrf=${CSRF}`);
    expect(r.status).toBe(307);
    const loc = r.headers.get("location") ?? "";
    expect(loc).toContain("https://discord.com/oauth2/authorize");
    expect(loc).toContain(encodeURIComponent(`desktop:42876:${CSRF}`));
  });

  it("sets the vv_oauth_state cookie to the desktop state", async () => {
    const r = await call(`port=42876&csrf=${CSRF}`);
    const cookie = r.cookies.get("vv_oauth_state");
    expect(cookie?.value).toBe(`desktop:42876:${CSRF}`);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.maxAge).toBe(600);
  });
});
```

- [ ] **Step 3: Run the tests and confirm all pass**

```bash
cd /root/vorevault/app
npm test -- src/app/api/auth/desktop-init/route.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 4: Run the full suite to confirm no regressions**

```bash
cd /root/vorevault/app
npm test
```

Expected: full suite green except the known testcontainers/Docker-unavailable skips and the pre-existing `thumbnails.test.ts` ffprobe failure.

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault
git add app/src/app/api/auth/desktop-init/route.ts app/src/app/api/auth/desktop-init/route.test.ts
git commit -m "feat(auth): GET /api/auth/desktop-init route for desktop OAuth"
```

---

## Task 3: Extend `discord/callback` with desktop branch

**Files:**
- Modify: `app/src/app/api/auth/discord/callback/route.ts`
- Create or modify: `app/src/app/api/auth/discord/callback/route.test.ts`

- [ ] **Step 1: Read the existing callback to confirm the insertion point**

The existing callback creates `const session = await createSession(user.id, userAgent)` near line 58, then sets up `const res = NextResponse.redirect(\`${env.APP_PUBLIC_URL}/\`, { status: 307 })`. The desktop branch is inserted immediately after `createSession` and before the redirect setup.

- [ ] **Step 2: Add the desktop import and branch**

Modify `app/src/app/api/auth/discord/callback/route.ts`. After the existing imports, add:

```ts
import { parseDesktopState } from "@/lib/desktop-state";
```

After `const session = await createSession(user.id, userAgent);` (line 58), add the desktop branch BEFORE the existing `const res = NextResponse.redirect(...)`:

```ts
  // Desktop OAuth branch: when state encodes a desktop port, redirect
  // the browser to the desktop's localhost listener with the session id
  // in the URL. The desktop client captures it and stores it in the OS
  // keychain. See docs/superpowers/specs/2026-04-25-desktop-watcher-subproject-a-design.md.
  const desktopState = parseDesktopState(stateInUrl);
  if (desktopState) {
    const localUrl = `http://127.0.0.1:${desktopState.port}/?session=${session.id}`;
    const desktopRes = NextResponse.redirect(localUrl, { status: 307 });
    desktopRes.cookies.set({
      name: SESSION_COOKIE,
      value: session.id,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SEC,
    });
    desktopRes.cookies.set({
      name: STATE_COOKIE,
      value: "",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return desktopRes;
  }

  // Browser flow (unchanged below)
  const res = NextResponse.redirect(`${env.APP_PUBLIC_URL}/`, { status: 307 });
```

The rest of the existing function (the `res.cookies.set` calls and `return res`) stays unchanged.

- [ ] **Step 3: Check for existing test file**

```bash
ls /root/vorevault/app/src/app/api/auth/discord/callback/route.test.ts 2>/dev/null
```

If the file does not exist, create it. If it exists, ADD the new desktop test alongside existing tests.

- [ ] **Step 4: Write/extend the callback test**

If creating from scratch, use this content. If extending, add the `describe("desktop branch", ...)` block to the existing file.

Create or extend `app/src/app/api/auth/discord/callback/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  loadEnv: () => ({
    DISCORD_CLIENT_ID: "test-client",
    DISCORD_REDIRECT_URI: "https://vault.example.com/api/auth/discord/callback",
    APP_PUBLIC_URL: "https://vault.example.com",
  }),
}));

vi.mock("@/lib/discord", () => ({
  exchangeCodeForToken: vi.fn(async () => "fake-access-token"),
  fetchGuildMember: vi.fn(async () => ({
    profile: { id: "discord-1", username: "alice", avatar: null, email: null },
    hasRequiredRole: true,
  })),
}));

vi.mock("@/lib/users", () => ({
  upsertUserFromDiscord: vi.fn(async () => ({
    id: "user-uuid-1",
    username: "alice",
  })),
}));

vi.mock("@/lib/sessions", () => ({
  createSession: vi.fn(async () => ({ id: "session-uuid-1" })),
  SESSION_TTL_SEC: 30 * 24 * 60 * 60,
}));

beforeEach(() => {
  vi.resetModules();
});

const CSRF = "abcdef1234567890ABCDEF_-";

async function callWithState(state: string, code: string = "fake-code") {
  const { GET } = await import("./route");
  const url = `https://vault.example.com/api/auth/discord/callback?code=${code}&state=${encodeURIComponent(state)}`;
  const req = new NextRequest(url, {
    headers: { cookie: `vv_oauth_state=${state}` },
  });
  return GET(req);
}

describe("GET /api/auth/discord/callback (browser branch — regression)", () => {
  it("redirects to APP_PUBLIC_URL when state is a regular browser state", async () => {
    const r = await callWithState("regular-browser-state-token-123");
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("https://vault.example.com/");
  });

  it("sets the session cookie on browser flow", async () => {
    const r = await callWithState("regular-browser-state-token-123");
    expect(r.cookies.get("vv_session")?.value).toBe("session-uuid-1");
  });
});

describe("GET /api/auth/discord/callback (desktop branch)", () => {
  it("redirects to localhost when state encodes a desktop port", async () => {
    const r = await callWithState(`desktop:42876:${CSRF}`);
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("http://127.0.0.1:42876/?session=session-uuid-1");
  });

  it("still sets the session cookie on the desktop redirect", async () => {
    const r = await callWithState(`desktop:42876:${CSRF}`);
    expect(r.cookies.get("vv_session")?.value).toBe("session-uuid-1");
  });

  it("clears the oauth state cookie", async () => {
    const r = await callWithState(`desktop:42876:${CSRF}`);
    expect(r.cookies.get("vv_oauth_state")?.value).toBe("");
    expect(r.cookies.get("vv_oauth_state")?.maxAge).toBe(0);
  });

  it("falls through to browser redirect when desktop state is malformed", async () => {
    // "desktop:" prefix but bad port → parseDesktopState returns null
    const r = await callWithState("desktop:99:short");
    // The state cookie was set to that malformed string by the test, but
    // since we treat parseDesktopState=null as "not a desktop request,"
    // we fall through to the browser redirect.
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("https://vault.example.com/");
  });
});
```

- [ ] **Step 5: Run the callback test**

```bash
cd /root/vorevault/app
npm test -- src/app/api/auth/discord/callback/route.test.ts
```

Expected: all tests pass (5 in the file: 2 browser-flow + 3 desktop-branch + 1 fallthrough).

- [ ] **Step 6: Run full suite**

```bash
cd /root/vorevault/app
npm test
```

Expected: full suite green except known environmental skips.

- [ ] **Step 7: Commit**

```bash
cd /root/vorevault
git add app/src/app/api/auth/discord/callback/route.ts app/src/app/api/auth/discord/callback/route.test.ts
git commit -m "feat(auth): callback redirects to localhost for desktop OAuth state"
```

---

## Task 4: `GET /api/auth/me` route + tests

**Files:**
- Create: `app/src/app/api/auth/me/route.ts`
- Create: `app/src/app/api/auth/me/route.test.ts`

- [ ] **Step 1: Create the route**

Create `app/src/app/api/auth/me/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      is_admin: user.is_admin,
    },
  });
}
```

- [ ] **Step 2: Create the test**

Create `app/src/app/api/auth/me/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
});

async function getRoute() {
  const route = await import("./route");
  const auth = await import("@/lib/auth");
  return { GET: route.GET, getCurrentUser: vi.mocked(auth.getCurrentUser) };
}

describe("GET /api/auth/me", () => {
  it("returns 401 with {user:null} when no session", async () => {
    const { GET, getCurrentUser } = await getRoute();
    getCurrentUser.mockResolvedValue(null);
    const r = await GET();
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body).toEqual({ user: null });
  });

  it("returns 200 with the user when authenticated", async () => {
    const { GET, getCurrentUser } = await getRoute();
    getCurrentUser.mockResolvedValue({
      id: "user-1",
      username: "alice",
      is_admin: false,
      // additional fields the type may have, ignored by the response shape
    } as never);
    const r = await GET();
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({
      user: { id: "user-1", username: "alice", is_admin: false },
    });
  });

  it("returns is_admin: true for admin users", async () => {
    const { GET, getCurrentUser } = await getRoute();
    getCurrentUser.mockResolvedValue({
      id: "admin-1",
      username: "ryan",
      is_admin: true,
    } as never);
    const r = await GET();
    const body = await r.json();
    expect(body.user.is_admin).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
cd /root/vorevault/app
npm test -- src/app/api/auth/me/route.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 4: Build to confirm no type errors**

```bash
cd /root/vorevault/app
npm run build
```

Expected: build succeeds; both new routes appear in the route table.

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault
git add app/src/app/api/auth/me/route.ts app/src/app/api/auth/me/route.test.ts
git commit -m "feat(auth): GET /api/auth/me returns the current user or 401"
```

---

## Task 5: Push branch + open PR + merge

**Files:** none modified.

- [ ] **Step 1: Push the branch**

```bash
cd /root/vorevault
git push -u origin feat/desktop-auth-endpoints
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat(auth): web-side endpoints for desktop OAuth" --body "$(cat <<'EOF'
## Summary
- New `app/src/lib/desktop-state.ts` with `formatDesktopState` / `parseDesktopState` helpers (8 unit tests).
- New `GET /api/auth/desktop-init` route that validates port + csrf inputs, sets the OAuth state cookie, and redirects to Discord OAuth using the existing `buildAuthorizeUrl` helper.
- Extended `GET /api/auth/discord/callback`: a single conditional branch that, when state matches the desktop-state shape, redirects the browser to `http://127.0.0.1:<port>/?session=<id>` (the desktop client's loopback listener) instead of the vault home page. Browser flow unchanged.
- New `GET /api/auth/me` that returns the current user or 401. Used by the desktop client to verify the keychain-stored session on launch; also incidentally useful for any future client-side "who am I" check.
- Tests for all new routes; existing browser-flow callback test added as a regression alongside the new desktop-branch tests.

## Why
Phase 1 of **Sub-project A** of **Theme 1.1** (cross-platform Tauri tray watcher app). These three additive endpoints are the cross-repo dependency the desktop client needs to complete OAuth via the system browser without changing the Discord OAuth app config. See `docs/superpowers/specs/2026-04-25-desktop-watcher-subproject-a-design.md` for the full architecture.

## Test plan
- [x] `desktop-state` unit tests (8)
- [x] `desktop-init` route tests (7)
- [x] Extended `discord/callback` tests (5: 2 browser-flow regression + 3 desktop-branch + 1 fallthrough)
- [x] `me` route tests (3)
- [x] `npm run build` clean
- [ ] Browser smoke test on production after deploy:
  - Sign in via the existing `/login` page → still redirects to `/` (browser flow unchanged)
  - Visit `https://vault.bullmoosefn.com/api/auth/me` while signed in → 200 with the current user
  - Visit it incognito → 401

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Wait for CI green and merge**

When `ci` is green:

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 4: Production smoke test (web side)**

After Watchtower deploys (~4 min after merge):

1. Visit `https://vault.bullmoosefn.com/login` and sign in → confirm landing on `/` (browser flow unchanged).
2. While signed in, visit `https://vault.bullmoosefn.com/api/auth/me` → expect a 200 JSON response with `{user: {...}}`.
3. Open a private window, visit `https://vault.bullmoosefn.com/api/auth/me` → expect 401 with `{user: null}`.

If any check fails, revert the merge and investigate. Phase 2 cannot proceed until Phase 1 is deployed and verified.

---

# Phase 2: Desktop scaffold (in new `vorevault-desktop` repo)

> **Prerequisite:** Phase 1 deployed to production. Confirm `https://vault.bullmoosefn.com/api/auth/me` responds before starting Phase 2.

## Task 6: Create new repo + Tauri scaffold + Cargo dependencies

**Files:** all new — Tauri project scaffolding.

- [ ] **Step 1: Create the GitHub repo**

```bash
gh repo create Bullmoose-Code/vorevault-desktop --private --description "Desktop tray client for VoreVault" --confirm
```

- [ ] **Step 2: Clone and bootstrap locally**

```bash
cd /root
gh repo clone Bullmoose-Code/vorevault-desktop
cd vorevault-desktop
git config user.email "noreply@bullmoosefn.com"  # adjust if needed
```

- [ ] **Step 3: Create the workspace Cargo.toml**

Create `Cargo.toml` (workspace root):

```toml
[workspace]
members = ["src-tauri"]
resolver = "2"

[workspace.package]
edition = "2021"
license = "MIT"
repository = "https://github.com/Bullmoose-Code/vorevault-desktop"
```

- [ ] **Step 4: Create the Tauri crate manifest**

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "vorevault"
version = "0.1.0"
description = "Desktop tray client for VoreVault"
edition.workspace = true
license.workspace = true
repository.workspace = true

[lib]
name = "vorevault_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-opener = "2"
keyring = "3"
tiny_http = "0.12"
url = "2"
base64 = "0.22"
rand = "0.8"
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls", "blocking"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
log = "0.4"
env_logger = "0.11"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

- [ ] **Step 5: Create the Tauri build script**

Create `src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 6: Create the Tauri config**

Create `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "VoreVault",
  "version": "0.1.0",
  "identifier": "fn.bullmoose.vorevault.desktop",
  "build": {
    "beforeBuildCommand": "",
    "beforeDevCommand": "",
    "frontendDist": "../ui-callback"
  },
  "app": {
    "windows": [],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "msi"],
    "icon": [
      "icons/tray.png"
    ],
    "category": "Utility",
    "shortDescription": "Auto-upload to VoreVault",
    "longDescription": "Watches a folder and uploads new files to your VoreVault instance."
  }
}
```

The `windows: []` array is intentional — we have no main window in v0.1A. The `frontendDist` points at `../ui-callback` which contains the static success.html that gets served by the localhost OAuth listener (not by Tauri's built-in webview, but Tauri requires a frontend dist path to exist).

- [ ] **Step 7: Create initial directories and placeholder files**

```bash
cd /root/vorevault-desktop
mkdir -p src-tauri/src src-tauri/icons ui-callback .github/workflows
```

Create `src-tauri/src/main.rs` (stub for now; Task 13 fills it in):

```rust
fn main() {
    println!("vorevault desktop");
}
```

- [ ] **Step 8: Create `.gitignore`**

Create `.gitignore`:

```
target/
.DS_Store
*.swp
*.bak
.idea/
.vscode/
```

- [ ] **Step 9: Create `LICENSE`**

Create `LICENSE` with standard MIT text. Use the year 2026 and copyright holder "Bullmoose Code" (matches the GitHub org name; substitute if Ryan prefers a personal name).

```
MIT License

Copyright (c) 2026 Bullmoose Code

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 10: Create initial README.md**

Create `README.md`:

```markdown
# vorevault-desktop

Desktop tray client for [VoreVault](https://github.com/Bullmoose-Code/vorevault). Watches a folder and uploads new files to your VoreVault instance via the existing tus endpoint.

## Status

v0.1.0 — Sub-project A: scaffold + Discord OAuth + OS keychain. **Does not yet upload anything**; that's Sub-project B.

## Build

Requires:
- Rust stable (`rustup default stable`)
- Tauri prerequisites for your OS: <https://tauri.app/start/prerequisites/>

```bash
cargo install tauri-cli --version "^2"
cargo tauri build
```

Built artifacts land in `src-tauri/target/release/bundle/`.

## Run in dev

```bash
cargo tauri dev
```

## Configuration

| Env var | Default | Description |
|---|---|---|
| `VAULT_URL` | `https://vault.bullmoosefn.com` | Override for testing against staging |

## License

MIT — see `LICENSE`.
```

- [ ] **Step 11: Verify the scaffold builds**

```bash
cd /root/vorevault-desktop
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: `cargo` downloads dependencies (this can take 5–15 minutes the first time) and produces `target/debug/vorevault`. The build will succeed because `main.rs` is just a `println!`. Don't run `cargo tauri build` yet — that requires platform-specific Tauri prerequisites you may not have on this Linux dev box. Just confirm `cargo build` works.

If `cargo build` fails because Tauri's build dependencies need system libraries (likely on a fresh Linux machine), install them per Tauri's docs or skip this step and rely on CI in Task 14 to verify.

- [ ] **Step 12: Initial commit**

```bash
cd /root/vorevault-desktop
git add Cargo.toml src-tauri/Cargo.toml src-tauri/build.rs src-tauri/tauri.conf.json src-tauri/src/main.rs .gitignore LICENSE README.md
git commit -m "chore: initial Tauri scaffold + workspace + dependencies"
git push -u origin main
```

---

## Task 7: `keychain.rs` wrapper + tests

**Files:**
- Create: `src-tauri/src/keychain.rs`

- [ ] **Step 1: Create the keychain module**

Create `src-tauri/src/keychain.rs`:

```rust
use keyring::Entry;

const SERVICE: &str = "fn.bullmoose.vorevault.desktop";
const ACCOUNT: &str = "session";

/// Store the session token in the OS keychain. Overwrites any existing value.
pub fn store(token: &str) -> keyring::Result<()> {
    Entry::new(SERVICE, ACCOUNT)?.set_password(token)
}

/// Load the session token from the OS keychain. Returns `Ok(None)` when no
/// entry exists (vs. `Err` for actual keychain access failures), so callers
/// can distinguish "user is signed out" from "couldn't reach the keychain."
pub fn load() -> keyring::Result<Option<String>> {
    match Entry::new(SERVICE, ACCOUNT)?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Delete the session token from the OS keychain. Idempotent — calling on a
/// missing entry succeeds silently.
pub fn delete() -> keyring::Result<()> {
    match Entry::new(SERVICE, ACCOUNT)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    // We don't run keychain tests in CI because GitHub-hosted runners don't
    // have a logged-in keychain session by default and asking for one would
    // require interactive setup. Manual smoke test on dev machine instead.
    //
    // Unit tests covered by `auth::sign_in` URL-building tests; integration
    // tested by the manual smoke test in Task 15.
}
```

- [ ] **Step 2: Add the module declaration**

Modify `src-tauri/src/main.rs`:

```rust
mod keychain;

fn main() {
    println!("vorevault desktop");
}
```

- [ ] **Step 3: Build to confirm it compiles**

```bash
cd /root/vorevault-desktop
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: clean build, no warnings about unused module (the `mod keychain;` declaration counts as usage).

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/keychain.rs src-tauri/src/main.rs
git commit -m "feat(keychain): add OS keychain wrapper with NoEntry handling"
```

---

## Task 8: `success.html` + tray icon

**Files:**
- Create: `ui-callback/success.html`
- Create: `src-tauri/icons/tray.png`

- [ ] **Step 1: Create the success page**

Create `ui-callback/success.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>VoreVault — Signed in</title>
  <style>
    html, body {
      margin: 0;
      height: 100%;
      font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
      background: #f5e9c8;
      color: #2a2520;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #fffaf0;
      border: 2.5px solid #2a2520;
      border-radius: 12px;
      box-shadow: 6px 6px 0 #2a2520;
      padding: 32px 40px;
      text-align: center;
      max-width: 420px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    p {
      margin: 0 0 20px;
      font-size: 15px;
      line-height: 1.5;
      color: #4a4035;
    }
    .link {
      display: inline-block;
      padding: 8px 20px;
      background: #2a2520;
      color: #fffaf0;
      text-decoration: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
    }
    .link:hover {
      background: #4a4035;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Signed in to VoreVault</h1>
    <p>You can close this tab. The VoreVault app is now signed in.</p>
    <a class="link" href="https://vault.bullmoosefn.com">Open VoreVault</a>
  </div>
</body>
</html>
```

- [ ] **Step 2: Create a placeholder tray icon**

For the placeholder, use a 22×22 PNG. The simplest path is to ask Ryan to drop in a real icon later, but we need *something* to compile.

Create `src-tauri/icons/tray.png` by writing 22×22 black-on-transparent pixels. Since this plan can't generate binary files inline, run:

```bash
cd /root/vorevault-desktop
# Generate a 22x22 black-on-transparent placeholder using ImageMagick.
# If ImageMagick isn't installed, use any other tool to create a 22x22
# PNG with a black square and transparent background.
convert -size 22x22 xc:transparent -fill "#000000" -draw "rectangle 4,4 18,18" src-tauri/icons/tray.png 2>/dev/null || {
  # Fallback: write a minimal valid 22x22 transparent PNG via Python.
  python3 -c "
import struct, zlib
def png(w, h, data):
    def chunk(t, d):
        cs = zlib.crc32(t + d)
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', cs)
    sig = b'\\x89PNG\\r\\n\\x1a\\n'
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    raw = b''.join(b'\\x00' + data[y*w*4:(y+1)*w*4] for y in range(h))
    idat = zlib.compress(raw)
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
import sys
w = h = 22
pixels = bytearray()
for y in range(h):
    for x in range(w):
        # Transparent everywhere except a small centered black square.
        if 4 <= x < 18 and 4 <= y < 18:
            pixels += bytes([0, 0, 0, 255])  # opaque black
        else:
            pixels += bytes([0, 0, 0, 0])    # transparent
sys.stdout.buffer.write(png(w, h, bytes(pixels)))
" > src-tauri/icons/tray.png
}

# Verify the file was created
ls -la src-tauri/icons/tray.png
file src-tauri/icons/tray.png
```

Expected: a small file (~100–500 bytes), `file` reports it as "PNG image data, 22 x 22, 8-bit/color RGBA, non-interlaced". Ryan can replace this with a proper hand-authored icon later — TODO note added to README.

- [ ] **Step 3: Note the icon TODO in the README**

Append to `README.md`:

```markdown

## TODO

- [ ] Replace `src-tauri/icons/tray.png` placeholder with a hand-authored 22×22 template-mode icon matching the VoreVault brand.
```

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add ui-callback/success.html src-tauri/icons/tray.png README.md
git commit -m "feat: add OAuth success page and placeholder tray icon"
```

---

## Task 9: `auth.rs` URL building + tests

**Files:**
- Create: `src-tauri/src/auth.rs`

This task only adds the URL-building helpers (testable, no I/O). The full `sign_in` / `sign_out` / `current_state` come in Tasks 10 and 11.

- [ ] **Step 1: Create the auth module with URL builder**

Create `src-tauri/src/auth.rs`:

```rust
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;

/// Default vault URL when `VAULT_URL` env var isn't set.
pub const DEFAULT_VAULT_URL: &str = "https://vault.bullmoosefn.com";

/// Read the vault URL from env, falling back to the default. Trailing slashes
/// are stripped so callers can do `format!("{vault}/api/...")` safely.
pub fn vault_url_from_env() -> String {
    let raw = std::env::var("VAULT_URL").unwrap_or_else(|_| DEFAULT_VAULT_URL.to_string());
    raw.trim_end_matches('/').to_string()
}

/// Generate a 32-byte cryptographically random CSRF value, base64url-encoded
/// without padding. Length is ~43 chars — fits in the 20–64 range the
/// web-side `parseDesktopState` accepts.
pub fn generate_csrf() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Build the URL the desktop app opens in the system browser to start the
/// OAuth flow. The vault server then sets a state cookie and redirects to
/// Discord OAuth.
pub fn build_init_url(vault_url: &str, port: u16, csrf: &str) -> String {
    format!(
        "{}/api/auth/desktop-init?port={}&csrf={}",
        vault_url.trim_end_matches('/'),
        port,
        urlencoding::encode(csrf),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_url_strips_trailing_slash() {
        std::env::set_var("VAULT_URL", "https://example.com/");
        assert_eq!(vault_url_from_env(), "https://example.com");
        std::env::remove_var("VAULT_URL");
    }

    #[test]
    fn vault_url_uses_default_when_unset() {
        std::env::remove_var("VAULT_URL");
        assert_eq!(vault_url_from_env(), DEFAULT_VAULT_URL);
    }

    #[test]
    fn csrf_is_base64url_no_pad_in_expected_length() {
        let c = generate_csrf();
        // 32 bytes encoded as base64 without padding = 43 chars.
        assert_eq!(c.len(), 43);
        // base64url alphabet only.
        assert!(c.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-'));
    }

    #[test]
    fn build_init_url_includes_port_and_csrf() {
        let url = build_init_url("https://vault.example.com", 42876, "abc123");
        assert_eq!(
            url,
            "https://vault.example.com/api/auth/desktop-init?port=42876&csrf=abc123"
        );
    }

    #[test]
    fn build_init_url_strips_trailing_slash_from_vault_url() {
        let url = build_init_url("https://vault.example.com/", 42876, "abc");
        assert_eq!(
            url,
            "https://vault.example.com/api/auth/desktop-init?port=42876&csrf=abc"
        );
    }

    #[test]
    fn build_init_url_url_encodes_csrf() {
        // base64url chars don't actually need encoding, but the helper
        // shouldn't break if a future format ever uses one that does.
        let url = build_init_url("https://v.example.com", 1024, "a/b");
        assert!(url.contains("port=1024"));
        assert!(url.contains("csrf=a%2Fb"));
    }
}
```

- [ ] **Step 2: Add the `urlencoding` dependency**

Modify `src-tauri/Cargo.toml` — add `urlencoding = "2"` to `[dependencies]`:

```toml
urlencoding = "2"
```

- [ ] **Step 3: Add the module declaration**

Modify `src-tauri/src/main.rs`:

```rust
mod auth;
mod keychain;

fn main() {
    println!("vorevault desktop");
}
```

- [ ] **Step 4: Run the tests**

```bash
cd /root/vorevault-desktop
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: 6 tests pass (in `auth::tests`).

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/Cargo.toml src-tauri/src/auth.rs src-tauri/src/main.rs
git commit -m "feat(auth): URL building helpers + CSRF generator with tests"
```

---

## Task 10: `auth.rs` — `sign_in` (localhost server, browser open)

**Files:**
- Modify: `src-tauri/src/auth.rs`

This task adds the `sign_in` function. It binds a localhost server, opens the system browser, blocks on receipt of the OAuth callback, stores the session in the keychain, then returns. ~120 LOC of new code.

- [ ] **Step 1: Add error type, success HTML, and `sign_in` to `auth.rs`**

Append to `src-tauri/src/auth.rs` (after the existing functions, before `#[cfg(test)] mod tests`):

```rust
use std::time::Duration;
use tiny_http::{Method, Response, Server};

/// Bundled at compile time so we have a self-contained binary.
const SUCCESS_HTML: &str = include_str!("../../ui-callback/success.html");

/// Errors that can occur during sign in. All variants imply the keychain is
/// not modified and the user is still effectively signed out.
#[derive(Debug)]
pub enum AuthError {
    BindFailed(std::io::Error),
    BrowserOpenFailed(String),
    Timeout,
    BadCallback(String),
    KeychainFailed(keyring::Error),
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthError::BindFailed(e) => write!(f, "couldn't bind localhost listener: {}", e),
            AuthError::BrowserOpenFailed(s) => write!(f, "couldn't open browser: {}", s),
            AuthError::Timeout => write!(f, "sign in timed out"),
            AuthError::BadCallback(s) => write!(f, "bad OAuth callback: {}", s),
            AuthError::KeychainFailed(e) => write!(f, "couldn't save credentials: {}", e),
        }
    }
}

impl std::error::Error for AuthError {}

/// Time to wait for the user to complete the OAuth flow in their browser.
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);

/// Bind a localhost listener on a free port and run the OAuth flow:
/// 1. Generate a CSRF token.
/// 2. Open the system browser to the vault's `desktop-init` route.
/// 3. Block until the browser is redirected to our listener with `?session=<id>`.
/// 4. Store the session id in the OS keychain.
/// 5. Return the session id (the caller may then call `current_state` to refresh).
///
/// On any failure, the keychain is not modified and an `AuthError` is returned.
pub fn sign_in<F>(vault_url: &str, open_browser: F) -> Result<String, AuthError>
where
    F: FnOnce(&str) -> Result<(), String>,
{
    let server = Server::http("127.0.0.1:0").map_err(|e| {
        AuthError::BindFailed(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
    })?;
    let port = server.server_addr().to_ip().map(|s| s.port()).ok_or_else(|| {
        AuthError::BindFailed(std::io::Error::new(
            std::io::ErrorKind::Other,
            "couldn't read bound port",
        ))
    })?;

    let csrf = generate_csrf();
    let url = build_init_url(vault_url, port, &csrf);

    open_browser(&url).map_err(AuthError::BrowserOpenFailed)?;

    // Block on a single request, then close the listener.
    let session_id = match server.recv_timeout(SIGN_IN_TIMEOUT) {
        Ok(Some(req)) => extract_session_from_request(req)?,
        Ok(None) => return Err(AuthError::Timeout),
        Err(e) => {
            return Err(AuthError::BadCallback(format!(
                "listener error: {}",
                e
            )))
        }
    };

    // server is dropped here, listener closes.
    drop(server);

    crate::keychain::store(&session_id).map_err(AuthError::KeychainFailed)?;
    Ok(session_id)
}

/// Pull `?session=<uuid>` from a callback request, respond with the success
/// HTML, and return the session id. Validates that the request is GET / with
/// a single `session` query param matching a UUIDv4 shape.
fn extract_session_from_request(req: tiny_http::Request) -> Result<String, AuthError> {
    if *req.method() != Method::Get {
        let _ = req.respond(Response::from_string("Method not allowed").with_status_code(405));
        return Err(AuthError::BadCallback("not a GET".to_string()));
    }

    // tiny_http gives us the path with query string. Parse it via `url`.
    let full = format!("http://127.0.0.1{}", req.url());
    let parsed = url::Url::parse(&full).map_err(|e| {
        let _ = req.respond(Response::from_string("Bad request").with_status_code(400));
        AuthError::BadCallback(format!("malformed callback url: {}", e))
    });
    let parsed = match parsed {
        Ok(u) => u,
        Err(e) => return Err(e),
    };

    let session = parsed
        .query_pairs()
        .find(|(k, _)| k == "session")
        .map(|(_, v)| v.into_owned());
    let Some(session) = session else {
        let _ = req.respond(Response::from_string("Missing session param").with_status_code(400));
        return Err(AuthError::BadCallback("missing session param".to_string()));
    };

    if !is_uuid_shape(&session) {
        let _ = req.respond(Response::from_string("Bad session value").with_status_code(400));
        return Err(AuthError::BadCallback("session is not a uuid".to_string()));
    }

    let response = Response::from_string(SUCCESS_HTML)
        .with_status_code(200)
        .with_header(
            "Content-Type: text/html; charset=utf-8"
                .parse::<tiny_http::Header>()
                .unwrap(),
        );
    let _ = req.respond(response);

    Ok(session)
}

/// Cheap validator for canonical UUIDs (8-4-4-4-12 hex). The web side issues
/// these via `randomUUID()`; we don't need to validate version/variant nibbles
/// here — the server will reject anything malformed on the next API call.
fn is_uuid_shape(s: &str) -> bool {
    if s.len() != 36 {
        return false;
    }
    let bytes = s.as_bytes();
    let dash_positions = [8usize, 13, 18, 23];
    for &p in &dash_positions {
        if bytes[p] != b'-' {
            return false;
        }
    }
    s.chars().enumerate().all(|(i, c)| {
        if dash_positions.contains(&i) {
            c == '-'
        } else {
            c.is_ascii_hexdigit()
        }
    })
}
```

Add the new tests to the existing `mod tests` block (don't replace, append):

```rust
    #[test]
    fn is_uuid_shape_accepts_canonical_uuid() {
        assert!(is_uuid_shape("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));
        assert!(is_uuid_shape("12345678-1234-1234-1234-123456789abc"));
    }

    #[test]
    fn is_uuid_shape_rejects_malformed() {
        assert!(!is_uuid_shape(""));
        assert!(!is_uuid_shape("not-a-uuid"));
        assert!(!is_uuid_shape("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa")); // 35 chars
        assert!(!is_uuid_shape("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaaa")); // 37 chars
        assert!(!is_uuid_shape("gggggggg-aaaa-aaaa-aaaa-aaaaaaaaaaaa")); // non-hex
        assert!(!is_uuid_shape("aaaaaaaaaaaa-aaaa-aaaa-aaaaaaaaaaaa")); // wrong dashes
    }
```

- [ ] **Step 2: Build to confirm it compiles**

```bash
cd /root/vorevault-desktop
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: clean build.

- [ ] **Step 3: Run the tests**

```bash
cd /root/vorevault-desktop
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: 8 tests pass (6 from Task 9 + 2 new uuid-shape tests).

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/auth.rs
git commit -m "feat(auth): sign_in via localhost OAuth callback listener"
```

---

## Task 11: `auth.rs` — `current_state` + `sign_out`

**Files:**
- Modify: `src-tauri/src/auth.rs`

- [ ] **Step 1: Add the AuthState struct and `current_state` / `sign_out` functions**

Append to `src-tauri/src/auth.rs` (after `extract_session_from_request`, before `#[cfg(test)] mod tests`):

```rust
use serde::Deserialize;

/// Snapshot of the desktop's auth state, derived from keychain + a server check.
#[derive(Debug, Clone)]
pub struct AuthState {
    pub username: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MeResponse {
    user: Option<MeUser>,
}

#[derive(Debug, Deserialize)]
struct MeUser {
    #[allow(dead_code)]
    id: String,
    username: String,
    #[allow(dead_code)]
    is_admin: bool,
}

/// Resolve the current auth state by checking the keychain, then asking the
/// server whether the stored session is still valid.
///
/// - No keychain entry → `{username: None}`
/// - Keychain entry, server returns 200 → `{username: Some(...)}`
/// - Keychain entry, server returns 401 → delete the keychain entry, `{username: None}`
/// - Keychain entry, server unreachable / non-401 error → preserve the
///   keychain entry and return `{username: None}` (transient state; we'll
///   recheck on the next launch). The caller can distinguish if needed by
///   inspecting `Result<AuthState>`; today we always return `Ok` and let the
///   tray menu reflect the simplified state.
pub fn current_state(vault_url: &str) -> AuthState {
    let token = match crate::keychain::load() {
        Ok(Some(t)) => t,
        Ok(None) => return AuthState { username: None },
        Err(e) => {
            log::warn!("keychain load failed: {}", e);
            return AuthState { username: None };
        }
    };

    let url = format!("{}/api/auth/me", vault_url.trim_end_matches('/'));
    let cookie = format!("vv_session={}", token);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build();
    let client = match client {
        Ok(c) => c,
        Err(e) => {
            log::warn!("reqwest client build failed: {}", e);
            return AuthState { username: None };
        }
    };

    let resp = client.get(&url).header("Cookie", cookie).send();
    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            // Network unreachable, DNS failure, etc. Don't delete the
            // keychain — we don't know the token is bad.
            log::warn!("/api/auth/me request failed: {}", e);
            return AuthState { username: None };
        }
    };

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        // Server says the session is no longer valid — clear the keychain.
        let _ = crate::keychain::delete();
        return AuthState { username: None };
    }

    if !resp.status().is_success() {
        log::warn!("/api/auth/me returned {}", resp.status());
        return AuthState { username: None };
    }

    match resp.json::<MeResponse>() {
        Ok(MeResponse { user: Some(u) }) => AuthState { username: Some(u.username) },
        Ok(MeResponse { user: None }) => AuthState { username: None },
        Err(e) => {
            log::warn!("failed to parse /api/auth/me response: {}", e);
            AuthState { username: None }
        }
    }
}

/// Sign out: best-effort POST to /api/auth/logout, then delete the keychain
/// entry regardless of whether the server call succeeded. Local sign-out
/// always works — the worst case is a stale session row that the server's
/// 30-day expiry will eventually GC.
pub fn sign_out(vault_url: &str) {
    if let Ok(Some(token)) = crate::keychain::load() {
        let url = format!("{}/api/auth/logout", vault_url.trim_end_matches('/'));
        let cookie = format!("vv_session={}", token);
        if let Ok(client) = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
        {
            let _ = client.post(&url).header("Cookie", cookie).send();
        }
    }
    let _ = crate::keychain::delete();
}
```

- [ ] **Step 2: Build**

```bash
cd /root/vorevault-desktop
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: clean build.

- [ ] **Step 3: Run the tests**

```bash
cd /root/vorevault-desktop
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: 8 tests still pass (no new tests in this task — `current_state` and `sign_out` need a real server or HTTP mock to test usefully; covered by manual smoke test in Task 15).

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/auth.rs
git commit -m "feat(auth): current_state via /api/auth/me + best-effort sign_out"
```

---

## Task 12: `tray.rs` — install + dynamic menu

**Files:**
- Create: `src-tauri/src/tray.rs`

- [ ] **Step 1: Create the tray module**

Create `src-tauri/src/tray.rs`:

```rust
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Manager, Wry,
};

const TRAY_ID: &str = "vorevault-tray";

/// Held while a sign-in/sign-out is in progress, so the tray doesn't dispatch
/// a second worker thread for the same operation.
static OP_IN_PROGRESS: Mutex<bool> = Mutex::new(false);

/// Install the tray icon at app startup. Called from `main.rs` `setup`.
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;

    // Initial menu reflects "loading" — refresh_menu replaces it with the
    // real signed-in/out state once we've checked the server.
    let loading = MenuItem::with_id(app, "loading", "Loading…", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit VoreVault", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&loading, &PredefinedMenuItem::separator(app)?, &quit])?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .on_menu_event(handle_menu_event)
        .build(app)?;

    Ok(())
}

/// Recompute the tray menu based on current keychain + server state. Call
/// this on app startup (after `install`) and whenever sign-in/out completes.
/// Does the network check on the calling thread — caller is responsible for
/// running this off the main thread if it might block on the network.
pub fn refresh_menu(app: &AppHandle, vault_url: &str) {
    let state = crate::auth::current_state(vault_url);

    let menu = build_menu(app, &state).expect("failed to build tray menu");
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn build_menu(app: &AppHandle, state: &crate::auth::AuthState) -> tauri::Result<Menu<Wry>> {
    let quit = MenuItem::with_id(app, "quit", "Quit VoreVault", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;

    match &state.username {
        Some(username) => {
            let label = MenuItem::with_id(app, "signed-in-label", format!("Signed in as @{}", username), false, None::<&str>)?;
            let signout = MenuItem::with_id(app, "sign-out", "Sign out", true, None::<&str>)?;
            Menu::with_items(app, &[&label, &sep, &signout, &quit])
        }
        None => {
            let signin = MenuItem::with_id(app, "sign-in", "Sign in", true, None::<&str>)?;
            Menu::with_items(app, &[&signin, &sep, &quit])
        }
    }
}

fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id.as_ref() {
        "sign-in" => spawn_sign_in(app.clone()),
        "sign-out" => spawn_sign_out(app.clone()),
        "quit" => app.exit(0),
        _ => {}
    }
}

fn spawn_sign_in(app: AppHandle) {
    if !try_acquire_lock() {
        log::info!("sign-in already in progress; ignoring click");
        return;
    }
    std::thread::spawn(move || {
        let vault_url = crate::auth::vault_url_from_env();
        let result = crate::auth::sign_in(&vault_url, |url| {
            tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
        });
        match result {
            Ok(_) => log::info!("sign-in succeeded"),
            Err(e) => log::warn!("sign-in failed: {}", e),
        }
        refresh_menu(&app, &vault_url);
        release_lock();
    });
}

fn spawn_sign_out(app: AppHandle) {
    if !try_acquire_lock() {
        log::info!("sign-out already in progress; ignoring click");
        return;
    }
    std::thread::spawn(move || {
        let vault_url = crate::auth::vault_url_from_env();
        crate::auth::sign_out(&vault_url);
        refresh_menu(&app, &vault_url);
        release_lock();
    });
}

fn try_acquire_lock() -> bool {
    let mut g = OP_IN_PROGRESS.lock().unwrap();
    if *g {
        false
    } else {
        *g = true;
        true
    }
}

fn release_lock() {
    *OP_IN_PROGRESS.lock().unwrap() = false;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_is_exclusive() {
        // Reset to known state in case prior test left it acquired.
        release_lock();
        assert!(try_acquire_lock());
        assert!(!try_acquire_lock(), "second acquire should fail");
        release_lock();
        assert!(try_acquire_lock(), "after release, can acquire again");
        release_lock();
    }
}
```

`Submenu` is imported but unused — included to make future expansion easier. If `cargo clippy` warns, drop it from the import list.

- [ ] **Step 2: Build**

```bash
cd /root/vorevault-desktop
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: clean build (warnings about unused imports may appear; address them by removing the unused names).

- [ ] **Step 3: Run the tests**

```bash
cd /root/vorevault-desktop
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: 9 tests pass (8 from auth + 1 lock-exclusivity test).

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/tray.rs
git commit -m "feat(tray): tray icon + dynamic menu + worker-thread dispatch"
```

---

## Task 13: `main.rs` — wire it together

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Replace the stub `main.rs` with the full entry point**

Replace `src-tauri/src/main.rs` entirely:

```rust
// Prevents an extra console window from showing up on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod keychain;
mod tray;

use tauri::Manager;

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tray::install(&handle)?;

            // Refresh the menu off the main thread so the network call to
            // /api/auth/me doesn't block UI. The "Loading…" placeholder
            // shows until this completes.
            std::thread::spawn(move || {
                let vault_url = auth::vault_url_from_env();
                tray::refresh_menu(&handle, &vault_url);
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, event| {
            // Tray-only app — closing windows (we have none) shouldn't quit;
            // explicit Quit menu item exits.
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
```

- [ ] **Step 2: Build**

```bash
cd /root/vorevault-desktop
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: clean build.

- [ ] **Step 3: Run the tests**

```bash
cd /root/vorevault-desktop
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: 9 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/main.rs
git commit -m "feat: wire tray + auth in main entry point"
```

---

## Task 14: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    name: Build & test (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest]

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - name: Cache cargo registry + build
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Install Tauri prerequisites (macOS)
        if: runner.os == 'macOS'
        run: echo "macOS prerequisites are pre-installed on GitHub runners"

      - name: Install Tauri prerequisites (Windows)
        if: runner.os == 'Windows'
        run: echo "Windows prerequisites are pre-installed on GitHub runners"

      - name: cargo fmt --check
        working-directory: src-tauri
        run: cargo fmt --all -- --check

      - name: cargo clippy
        working-directory: src-tauri
        run: cargo clippy --all-targets -- -D warnings

      - name: cargo test
        working-directory: src-tauri
        run: cargo test --all

      - name: cargo build (release)
        working-directory: src-tauri
        run: cargo build --release
```

Note: this workflow does NOT call `cargo tauri build` because that requires installing `tauri-cli` and produces full installer bundles which take much longer. Plain `cargo build --release` confirms the Rust code compiles on both OSes; the actual installer generation moves to Sub-project E with code signing.

- [ ] **Step 2: Run `cargo fmt` locally so CI doesn't fail on it**

```bash
cd /root/vorevault-desktop
cargo fmt --manifest-path src-tauri/Cargo.toml --all
```

Inspect any changes with `git diff` and ensure they're cosmetic.

- [ ] **Step 3: Run `cargo clippy` locally**

```bash
cd /root/vorevault-desktop
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

If clippy reports warnings, fix them (e.g., remove the unused `Submenu` import, drop unused `crate::tray::Wry` if it's still there). Re-run until clean.

- [ ] **Step 4: Commit any fmt/clippy fixes alongside the workflow**

```bash
cd /root/vorevault-desktop
git add .github/workflows/ci.yml src-tauri/
git commit -m "ci: cargo fmt + clippy + test + build matrix on Win + Mac"
git push origin main
```

- [ ] **Step 5: Verify CI passes**

```bash
gh run list --branch main --limit 1
```

Wait for the run to complete:

```bash
gh run watch
```

Expected: green on both `windows-latest` and `macos-latest`. If clippy fails on a specific platform, fix and push again.

---

## Task 15: Manual smoke test + tag v0.1.0

**Files:** none modified.

This is the manual end-to-end verification. Cannot be automated (no way to script Discord OAuth in CI without a real Discord account).

- [ ] **Step 1: Build a local binary**

On a Mac or Windows machine (Tauri can't currently build Win/Mac binaries from Linux without elaborate cross-toolchain setup):

```bash
cd vorevault-desktop  # wherever you cloned it
cargo install tauri-cli --version "^2"
cargo tauri build
```

Built artifacts land in:
- macOS: `src-tauri/target/release/bundle/dmg/VoreVault_0.1.0_aarch64.dmg` (or `_x64.dmg`)
- Windows: `src-tauri/target/release/bundle/msi/VoreVault_0.1.0_x64_en-US.msi`

- [ ] **Step 2: Install and launch**

Install the bundled artifact. The app should launch into the system tray with no main window. Tray menu shows "Loading…" briefly, then "Sign in / Quit VoreVault".

- [ ] **Step 3: Sign in flow**

Click "Sign in":

- System browser opens to `https://vault.bullmoosefn.com/api/auth/desktop-init?port=<random>&csrf=<base64>`
- Vault redirects to Discord OAuth
- User authenticates with Discord, approves the OAuth permission
- Discord redirects back to vault callback
- Vault detects desktop state, redirects to `http://127.0.0.1:<port>/?session=<uuid>`
- Browser shows the success page ("Signed in to VoreVault. You can close this tab.")
- Tray menu refreshes to "Signed in as @<your-discord-username> / Sign out / Quit VoreVault"

- [ ] **Step 4: Verify keychain persistence**

On macOS:

```bash
security find-generic-password -s "fn.bullmoose.vorevault.desktop"
```

Expected: a password entry exists.

On Windows: open Credential Manager → Windows Credentials → look for `fn.bullmoose.vorevault.desktop`.

Quit the app entirely (Quit menu item). Relaunch. The tray menu should immediately show "Signed in as @<username>" without requiring sign-in (after a brief "Loading…" while the `me` check completes).

- [ ] **Step 5: Sign out flow**

Click "Sign out". The tray menu should revert to "Sign in / Quit VoreVault". Verify the keychain entry is gone:

```bash
# macOS — should error with "could not be found"
security find-generic-password -s "fn.bullmoose.vorevault.desktop"
```

- [ ] **Step 6: Verify revoked-session handling**

1. Click "Sign in" again, complete the flow.
2. On the web side (logged in as the same user), visit the admin sessions UI (or directly delete the session from Postgres if no admin UI exists yet).
3. Quit and relaunch the desktop app. The tray should detect the 401 from `/api/auth/me`, delete the keychain, and show "Sign in".

- [ ] **Step 7: Tag v0.1.0**

If all smoke tests pass:

```bash
cd vorevault-desktop
git tag -a v0.1.0 -m "v0.1.0: Sub-project A — scaffold + auth + keychain"
git push origin v0.1.0
```

This is the first tagged release. Sub-project E will add a GitHub Releases workflow that auto-builds signed installers on tag push; for v0.1.0, the binary is built locally and not published.

- [ ] **Step 8: Update the master roadmap memory**

After tagging, the `vorevault-desktop` repo exists and Sub-project A is shipped. Update Ryan's roadmap memory note to reflect Theme 1.1 progress (Sub-project A complete, Sub-projects B-E remaining).

---

## What's NOT in this plan

| Item | Where it goes |
|---|---|
| Folder picker / file watcher / tus upload | Sub-project B (separate plan) |
| Native toast notifications on upload | Sub-project C (separate plan) |
| Settings window UI | Sub-project D (separate plan) |
| Code signing certificates, signed installers, GitHub Releases workflow | Sub-project E (separate plan) |
| Auto-updates (Tauri updater plugin) | Sub-project E or later |
| Multiple watched folders, per-folder routing | Roadmap item 1.2 (after 1.1 ships) |
| `vorevault://` deep-link protocol handler | Roadmap item 1.3 |
| Linux installers in CI | Code stays portable, Linux deferred |

When all of A → B → C → D → E ship, Theme 1.1 is complete and v1.0 of the desktop app is in users' hands.
