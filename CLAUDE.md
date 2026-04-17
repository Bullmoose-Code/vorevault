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
- **Postgres 16** via `pg` Pool exposed through `@/lib/db`'s lazy `pool` proxy. The proxy avoids module-load-time throws so `next build` works without `DATABASE_URL`.
- **Validation:** use `zod` at trust boundaries (API inputs, env parsing).
- **Styling:** TBD per Plan 4 (frontend). Not yet decided — do not unilaterally pick Tailwind/CSS-in-JS without asking.
- **File size rule:** split files that grow past ~400 lines or develop more than one responsibility.

## Testing rules (non-negotiable)
- **TDD by default.** Write a failing test, then the code. Use `superpowers:test-driven-development` skill.
- **Do not mock the database in integration tests.** Use testcontainers (Postgres) so tests exercise real SQL.
- Unit tests may mock `@/lib/db` for pure logic checks (see `app/src/app/api/health/route.test.ts` for the pattern).
- Vitest is the runner; tests are colocated with source (`foo.ts` + `foo.test.ts`) except cross-cutting e2e.
- Run `npm test` from `app/` before any commit.

## Security rules (non-negotiable)
- No auth bypasses "for testing" — use fixtures instead.
- Never log secrets or session tokens.
- Never serve user-uploaded files as `text/html` or `image/svg+xml` with `inline` disposition.
- On-disk filenames are UUIDs, never the original name.
- Detect MIME with `file --mime-type` (or equivalent library) on upload finish; do not trust client `Content-Type`.

## Workflow
- Work on feature branches; open PRs against `main`. No direct pushes to `main` except for docs.
- Never `git push --force` to `main` (warn the user if asked).
- Never `--no-verify` or `--no-gpg-sign` unless user explicitly asks.
- Frequent, small commits. Conventional Commits style (`feat:`, `fix:`, `chore:`, `docs:`).
- Before claiming work is done: run `npm test`, build the docker image, hit `/api/health`. Use `superpowers:verification-before-completion`.
- Deploy is automatic via GitHub Actions on merge to `main` — see `VOREVAULT_MASTER_CONTEXT.md` (CI/CD section). For manual override: `pct exec 105 -- bash -c 'cd /opt/stacks/vorevault && git pull && docker compose pull && docker compose up -d'`.

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

## If you're unsure
Ask. Small clarifying questions beat big wrong PRs.
